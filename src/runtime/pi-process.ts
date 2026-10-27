import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { mkdir, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute } from "node:path";
import { promisify } from "node:util";
import { validateDataDirectory } from "../local/paths.ts";
import {
  type RuntimeConfiguration,
  type SessionModelRequest,
  SESSION_ID,
} from "../shared/sessions.ts";
import { isThinkingLevel, type ThinkingLevel } from "../shared/thinking.ts";
import { isImageContentArray, type ImageContent } from "../shared/images.ts";
import { isRecord, PiRpc, type RpcRecord } from "./pi-rpc.ts";

const exec = promisify(execFile);
export const SUPPORTED_PI_VERSION = "1.4.0";
export type RuntimeState = "starting" | "ready" | "running" | "stopping" | "exited" | "failed";
export interface PiOptions {
  executable: string;
  /** Omit for an installed standalone pi executable; provide an absolute CLI path when using Node. */
  entryPoint?: string;
  cwd: string;
  /** Complete child environment. The owner decides whether personal Pi credentials are available. */
  env: NodeJS.ProcessEnv;
  sessionDirectory: string;
  resumeFile?: string;
  sessionId?: string;
  provider?: string;
  model?: string;
  extensions?: readonly string[];
  requestTimeoutMs?: number;
  shutdownTimeoutMs?: number;
}
export interface SessionState {
  sessionId: string;
  sessionFile?: string;
  isStreaming: boolean;
  isCompacting: boolean;
  messageCount: number;
  pendingMessageCount: number;
  thinkingLevel: ThinkingLevel;
  model?: { provider: string; id: string };
}
export interface RunResult {
  outcome: "completed" | "failed" | "aborted" | "handled";
  error?: string;
}
export type PiEntry = Record<string, unknown> & {
  id: string;
  type: string;
  parentId: string | null;
};
type Listener = (event: RpcRecord) => void | Promise<void>;
type StateListener = (state: RuntimeState) => void | Promise<void>;
interface Subscription {
  listener: Listener;
  interactive: boolean;
}
interface Run {
  resolve(result: RunResult): void;
  reject(error: Error): void;
  error?: string;
  aborted: boolean;
}
export type UiResponse = { id: string } & (
  | { cancelled: true }
  | { confirmed: boolean }
  | { value: string }
);

function sessionState(value: unknown): SessionState {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    (value.sessionFile !== undefined && typeof value.sessionFile !== "string") ||
    typeof value.isStreaming !== "boolean" ||
    typeof value.isCompacting !== "boolean" ||
    typeof value.messageCount !== "number" ||
    !Number.isSafeInteger(value.messageCount) ||
    value.messageCount < 0 ||
    typeof value.pendingMessageCount !== "number" ||
    !Number.isSafeInteger(value.pendingMessageCount) ||
    value.pendingMessageCount < 0 ||
    !isThinkingLevel(value.thinkingLevel)
  ) {
    throw new Error("Pi returned invalid session state.");
  }
  const model = value.model;
  if (model !== undefined && !isSelectedModel(model)) {
    throw new Error("Pi returned invalid session state.");
  }
  return {
    sessionId: value.sessionId,
    ...(typeof value.sessionFile === "string" ? { sessionFile: value.sessionFile } : {}),
    isStreaming: value.isStreaming,
    isCompacting: value.isCompacting,
    messageCount: value.messageCount,
    pendingMessageCount: value.pendingMessageCount,
    thinkingLevel: value.thinkingLevel,
    ...(model === undefined ? {} : { model }),
  };
}

function isSelectedModel(value: unknown): value is { provider: string; id: string } {
  return (
    isRecord(value) &&
    typeof value.provider === "string" &&
    value.provider.length > 0 &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function sessionEntries(value: unknown): { entries: PiEntry[]; leafId: string | null } {
  if (!isRecord(value) || !Array.isArray(value.entries))
    throw new Error("Pi returned invalid session entries.");
  const entries: PiEntry[] = [];
  const ids = new Set<string>();
  for (const candidate of value.entries) {
    if (!isRecord(candidate)) throw new Error("Pi returned invalid session entries.");
    const { id, type, parentId } = candidate;
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      typeof type !== "string" ||
      type.length === 0 ||
      (typeof parentId !== "string" && parentId !== null) ||
      (typeof parentId === "string" && parentId.length === 0) ||
      ids.has(id)
    )
      throw new Error("Pi returned invalid session entries.");
    ids.add(id);
    entries.push({ ...candidate, id, type, parentId });
  }
  let leafId: string | null;
  if (value.leafId === null) leafId = null;
  else if (typeof value.leafId === "string" && value.leafId.length > 0 && ids.has(value.leafId))
    leafId = value.leafId;
  else throw new Error("Pi returned invalid session entries.");
  return { entries, leafId };
}

export async function verifyPiConfiguration(
  configuration: RuntimeConfiguration,
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout = 15_000,
): Promise<RuntimeConfiguration> {
  for (const path of [
    configuration.executable,
    ...(configuration.entryPoint !== undefined ? [configuration.entryPoint] : []),
  ]) {
    if (
      !isAbsolute(path) ||
      [...path].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    )
      throw new Error(
        "Pi executable and entry point must be absolute paths without control characters.",
      );
  }
  let executable: string;
  let entryPoint: string | undefined;
  let version: string;
  try {
    executable = await realpath(configuration.executable);
    entryPoint = configuration.entryPoint ? await realpath(configuration.entryPoint) : undefined;
    const result = await exec(executable, [...(entryPoint ? [entryPoint] : []), "--version"], {
      cwd,
      env,
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 16 * 1024,
    });
    version = result.stdout.trim();
  } catch {
    throw new Error("Cannot read the configured Pi version. Check its executable and entry point.");
  }
  if (version !== SUPPORTED_PI_VERSION)
    throw new Error(
      `Unsupported Pi version ${version.slice(0, 80)}; expected ${SUPPORTED_PI_VERSION}.`,
    );
  return { executable, ...(entryPoint ? { entryPoint } : {}) };
}

/** Owns one Pi subprocess and one session. Observers never own execution. */
export class PiProcess {
  #state: RuntimeState = "starting";
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #rpc: PiRpc;
  readonly #listeners = new Set<Subscription>();
  readonly #stateListeners = new Set<StateListener>();
  readonly #dialogs = new Map<string, { method: string; timer: ReturnType<typeof setTimeout> }>();
  readonly #requestMs: number;
  readonly #shutdownMs: number;
  readonly #closed: Promise<void>;
  #stderr = "";
  #run: Run | undefined;
  #stopping: Promise<void> | undefined;
  #error: Error | undefined;

  private constructor(
    child: ChildProcessWithoutNullStreams,
    requestMs: number,
    shutdownMs: number,
  ) {
    this.#child = child;
    this.#requestMs = requestMs;
    this.#shutdownMs = shutdownMs;
    child.stderr.on("data", (chunk: Buffer) => {
      // Private diagnostics, never included automatically in errors or ordinary logs.
      this.#stderr = (this.#stderr + chunk.toString("utf8")).slice(-16 * 1024);
    });
    this.#rpc = new PiRpc(
      child.stdin,
      child.stdout,
      requestMs,
      (record) => this.#onRecord(record),
      (error) => this.#fail(error),
    );
    this.#closed = new Promise((resolve) => {
      child.once("error", () =>
        this.#fail(new Error("Cannot start the configured Pi executable.")),
      );
      child.once("close", (code, signal) => {
        if (this.#state !== "stopping" && this.#state !== "failed") {
          this.#fail(
            new Error(
              `Pi exited unexpectedly (code=${code}, signal=${signal}); execution outcome may be unknown.`,
            ),
          );
        }
        this.#rpc.close();
        this.#run?.reject(
          new Error("Pi stopped before the run settled; execution outcome may be unknown."),
        );
        this.#run = undefined;
        this.#clearDialogs();
        if (this.#state === "stopping") this.#setState("exited");
        resolve();
      });
    });
  }

  static async start(options: PiOptions): Promise<PiProcess> {
    if (
      options.sessionId !== undefined &&
      (!SESSION_ID.test(options.sessionId) || options.resumeFile !== undefined)
    )
      throw new Error("Provide one valid session ID or an existing session file.");
    for (const path of [
      options.executable,
      options.cwd,
      options.sessionDirectory,
      ...(options.entryPoint ? [options.entryPoint] : []),
      ...(options.extensions ?? []),
    ]) {
      if (!isAbsolute(path))
        throw new Error(
          "Pi executable, entry point, project, session and extension paths must be absolute.",
        );
    }
    const provider = options.provider;
    const model = options.model;
    const hasProvider = provider !== undefined;
    const hasModel = model !== undefined;
    if (
      hasProvider !== hasModel ||
      (provider !== undefined &&
        model !== undefined &&
        (provider.length === 0 ||
          model.length === 0 ||
          provider.length > 200 ||
          model.length > 300))
    )
      throw new Error("Provide both Pi provider and model, or omit both to use Pi defaults.");
    const requestMs = options.requestTimeoutMs ?? 15_000;
    const shutdownMs = options.shutdownTimeoutMs ?? 2_000;
    for (const duration of [requestMs, shutdownMs]) {
      if (!Number.isSafeInteger(duration) || duration < 1 || duration > 60_000)
        throw new Error("Pi deadlines must be between 1 and 60000 ms.");
    }
    const cwd = await realpath(options.cwd);
    if (!(await stat(cwd)).isDirectory()) throw new Error("Pi project must be a directory.");
    const sessionDirectory = await validateDataDirectory(options.sessionDirectory);
    let resumeFile: string | undefined;
    if (options.resumeFile !== undefined) {
      if (!isAbsolute(options.resumeFile)) throw new Error("Pi session path must be absolute.");
      resumeFile = await realpath(options.resumeFile);
      if (!(await stat(resumeFile)).isFile())
        throw new Error("Pi session must be an existing file.");
      await validateDataDirectory(dirname(resumeFile));
    }
    const prefix = options.entryPoint ? [options.entryPoint] : [];
    await verifyPiConfiguration(options, cwd, options.env, requestMs);
    await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
    const args = [
      ...prefix,
      "--mode",
      "rpc",
      "--session-dir",
      sessionDirectory,
      ...(provider !== undefined && model !== undefined
        ? ["--provider", provider, "--model", model]
        : []),
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-themes",
      "--no-mcp",
    ];
    if (resumeFile) args.push("--session", resumeFile);
    if (options.sessionId) args.push("--session-id", options.sessionId);
    for (const extension of options.extensions ?? []) args.push("--extension", extension);
    const child = spawn(options.executable, args, {
      cwd,
      env: options.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const runtime = new PiProcess(child, requestMs, shutdownMs);
    try {
      const state = await runtime.getState();
      if (state.isStreaming || state.isCompacting || state.pendingMessageCount !== 0)
        throw new Error("Pi did not start idle.");
      if (!state.model)
        throw new Error(
          "Pi did not select a model. Configure a Pi default before creating sessions.",
        );
      if (resumeFile && (!state.sessionFile || (await realpath(state.sessionFile)) !== resumeFile))
        throw new Error("Pi did not reopen the requested session.");
      if (options.sessionId && state.sessionId !== options.sessionId)
        throw new Error("Pi did not preserve the requested session identity.");
      if (
        provider !== undefined &&
        model !== undefined &&
        (state.model.provider !== provider || state.model.id !== model)
      )
        throw new Error("Pi did not use the requested provider and model.");
      if (runtime.#state !== "starting")
        throw runtime.#error ?? new Error("Pi stopped during startup.");
      runtime.#setState("ready");
      return runtime;
    } catch (error) {
      await runtime.stop();
      throw error;
    }
  }

  get state(): RuntimeState {
    return this.#state;
  }
  get pid(): number | undefined {
    return this.#child.pid;
  }
  get stderrTail(): string {
    return this.#stderr;
  }

  subscribe(listener: Listener, options: { interactive?: boolean } = {}): () => void {
    const subscription = { listener, interactive: options.interactive ?? true };
    this.#listeners.add(subscription);
    return () => {
      if (!this.#listeners.delete(subscription)) return;
      if (!this.#hasInteractiveObservers()) this.#cancelDialogs();
    };
  }

  subscribeState(listener: StateListener): () => void {
    this.#stateListeners.add(listener);
    this.#notifyStateListener(listener, this.#state);
    return () => this.#stateListeners.delete(listener);
  }

  async getState(): Promise<SessionState> {
    try {
      return sessionState(await this.#rpc.request("get_state"));
    } catch (error) {
      if (error instanceof Error && error.message === "Pi returned invalid session state.")
        this.#rpc.fail(error);
      throw error;
    }
  }

  async getAvailableThinkingLevels(): Promise<ThinkingLevel[]> {
    try {
      const response = await this.#rpc.request("get_available_thinking_levels");
      if (
        !isRecord(response) ||
        !Array.isArray(response.levels) ||
        response.levels.length === 0 ||
        response.levels.length > 7 ||
        !response.levels.every(isThinkingLevel) ||
        new Set(response.levels).size !== response.levels.length
      )
        throw new Error("Pi returned invalid available thinking levels.");
      return response.levels;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Pi returned invalid available thinking levels."
      )
        this.#rpc.fail(error);
      throw error;
    }
  }

  async setThinkingLevel(level: ThinkingLevel): Promise<ThinkingLevel> {
    if (!isThinkingLevel(level)) throw new Error("Select a valid Pi thinking level.");
    if (this.#state === "running" || this.#run) throw new Error("Pi session is busy.");
    if (this.#state !== "ready") throw this.#error ?? new Error("Pi runtime is not ready.");
    await this.#rpc.request("set_thinking_level", { level });
    const state = await this.getState();
    return state.thinkingLevel;
  }

  async setModel(provider: string, model: string): Promise<SessionModelRequest> {
    if (this.#state === "running" || this.#run) throw new Error("Pi session is busy.");
    if (this.#state !== "ready") throw this.#error ?? new Error("Pi runtime is not ready.");
    if (provider.length === 0 || provider.length > 200 || model.length === 0 || model.length > 300)
      throw new Error("Select a valid Pi provider and model.");
    let response: unknown;
    try {
      response = await this.#rpc.request("set_model", { provider, modelId: model });
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error("Pi rejected the model change.");
    }
    if (
      !isRecord(response) ||
      typeof response.provider !== "string" ||
      typeof response.id !== "string"
    ) {
      const error = new Error("Pi returned an invalid model selection.");
      this.#rpc.fail(error);
      throw error;
    }
    if (response.provider !== provider || response.id !== model) {
      const error = new Error("Pi selected a different provider or model.");
      this.#rpc.fail(error);
      throw error;
    }
    return { provider: response.provider, model: response.id };
  }

  async getMessages(): Promise<Record<string, unknown>[]> {
    const data = await this.#rpc.request("get_messages");
    if (
      !isRecord(data) ||
      !Array.isArray(data.messages) ||
      !data.messages.every(
        (message: unknown) => isRecord(message) && typeof message.role === "string",
      )
    ) {
      const error = new Error("Pi returned invalid messages.");
      this.#rpc.fail(error);
      throw error;
    }
    return data.messages.filter(isRecord);
  }

  async getEntries(): Promise<{ entries: PiEntry[]; leafId: string | null }> {
    try {
      return sessionEntries(await this.#rpc.request("get_entries"));
    } catch (error) {
      if (error instanceof Error && error.message === "Pi returned invalid session entries.")
        this.#rpc.fail(error);
      throw error;
    }
  }

  async supportsImages(): Promise<boolean> {
    if (this.#state === "running" || this.#run) throw new Error("Pi session is busy.");
    if (this.#state !== "ready") throw this.#error ?? new Error("Pi runtime is not ready.");
    try {
      const [state, response] = await Promise.all([
        this.getState(),
        this.#rpc.request("get_available_models"),
      ]);
      if (
        !isRecord(response) ||
        !Array.isArray(response.models) ||
        response.models.length > 10_000 ||
        !state.model
      ) {
        throw new Error("Pi returned invalid model capabilities.");
      }
      const model = response.models.find(
        (candidate: unknown) =>
          isRecord(candidate) &&
          candidate.provider === state.model?.provider &&
          candidate.id === state.model?.id,
      );
      if (
        !isRecord(model) ||
        !Array.isArray(model.input) ||
        !model.input.every((item) => typeof item === "string")
      )
        throw new Error("Pi returned invalid model capabilities.");
      return model.input.includes("image");
    } catch (error) {
      if (error instanceof Error && error.message === "Pi returned invalid model capabilities.")
        this.#rpc.fail(error);
      throw error;
    }
  }

  startRun(
    message: string,
    images: readonly ImageContent[] = [],
  ): {
    accepted: Promise<"started" | "handled">;
    settled: Promise<RunResult>;
  } {
    if (this.#state === "running" || this.#run) throw new Error("Pi session is busy.");
    if (this.#state !== "ready") throw this.#error ?? new Error("Pi runtime is not ready.");
    if (Buffer.byteLength(message) > 1024 * 1024) throw new Error("Pi prompt exceeds 1 MiB.");
    if (message.trim().length === 0 && images.length === 0)
      throw new Error("Pi prompt must not be empty.");
    if (!isImageContentArray(images)) throw new Error("Pi prompt images are invalid.");

    let resolveAccepted!: (disposition: "started" | "handled") => void;
    let rejectAccepted!: (error: Error) => void;
    const accepted = new Promise<"started" | "handled">((resolve, reject) => {
      resolveAccepted = resolve;
      rejectAccepted = reject;
    });
    let resolveSettled!: (result: RunResult) => void;
    let rejectSettled!: (error: Error) => void;
    const settled = new Promise<RunResult>((resolve, reject) => {
      resolveSettled = resolve;
      rejectSettled = reject;
    });
    // Callers may observe acceptance before settlement; keep either rejection handled meanwhile.
    void accepted.catch(() => {});
    void settled.catch(() => {});
    // Install run state before sending: Pi can emit events before its prompt response.
    const run: Run = { resolve: resolveSettled, reject: rejectSettled, aborted: false };
    this.#run = run;
    this.#setState("running");

    void this.#rpc.request("prompt", { message, ...(images.length ? { images } : {}) }).then(
      (data) => {
        if (!isRecord(data) || (data.disposition !== "started" && data.disposition !== "handled")) {
          const error = new Error("Pi returned an unexpected prompt disposition.");
          this.#rpc.fail(error);
          rejectAccepted(error);
          return;
        }
        resolveAccepted(data.disposition);
        if (data.disposition === "handled") this.#finish(run, { outcome: "handled" });
      },
      (error: unknown) => {
        const failure = error instanceof Error ? error : new Error("Pi rejected the prompt.");
        rejectAccepted(failure);
        if (this.#run === run) this.#rejectRun(run, failure);
      },
    );
    return { accepted, settled };
  }

  async run(message: string): Promise<RunResult> {
    const run = this.startRun(message);
    await run.accepted;
    return run.settled;
  }

  async abort(): Promise<void> {
    if (this.#state !== "running") return;
    await this.#rpc.request("abort");
  }

  async respondToUi(response: UiResponse): Promise<void> {
    if (
      "value" in response &&
      typeof response.value === "string" &&
      Buffer.byteLength(response.value) > 1024 * 1024
    )
      throw new Error("Pi interaction response exceeds 1 MiB.");
    const dialog = this.#dialogs.get(response.id);
    if (!dialog) throw new Error("Unknown or already answered Pi interaction.");
    if (
      !("cancelled" in response && response.cancelled === true) &&
      ((dialog.method === "confirm" &&
        !("confirmed" in response && typeof response.confirmed === "boolean")) ||
        (dialog.method !== "confirm" &&
          !("value" in response && typeof response.value === "string")))
    ) {
      throw new Error("Invalid response for the Pi interaction.");
    }
    clearTimeout(dialog.timer);
    this.#dialogs.delete(response.id);
    await this.#rpc.write({ ...response, type: "extension_ui_response" });
  }

  stop(): Promise<void> {
    this.#stopping ??= this.#stop();
    return this.#stopping;
  }

  async #stop(): Promise<void> {
    if (this.#child.exitCode !== null || this.#child.signalCode !== null) {
      await this.#closed;
      return;
    }
    if (this.#state !== "failed") this.#setState("stopping");
    this.#rpc.close(new Error("Pi runtime is stopping; execution outcome may be unknown."));
    this.#child.stdin.end();
    const terminate = setTimeout(() => this.#child.kill("SIGTERM"), this.#shutdownMs);
    const kill = setTimeout(() => this.#child.kill("SIGKILL"), this.#shutdownMs * 2);
    try {
      await this.#closed;
    } finally {
      clearTimeout(terminate);
      clearTimeout(kill);
    }
  }

  #finish(run: Run, result: RunResult): void {
    if (this.#run !== run) return;
    this.#run = undefined;
    this.#clearDialogs();
    if (this.#state === "running") this.#setState("ready");
    run.resolve(result);
  }

  #rejectRun(run: Run, error: Error): void {
    if (this.#run !== run) return;
    this.#run = undefined;
    this.#clearDialogs();
    if (this.#state === "running") this.#setState("ready");
    run.reject(error);
  }

  #fail(error: Error): void {
    if (this.#state === "failed" || this.#state === "exited") return;
    this.#error = error;
    this.#setState("failed");
    this.#rpc.close(error);
    this.#run?.reject(error);
    this.#run = undefined;
    this.#clearDialogs();
    void this.stop();
  }

  #onRecord(record: RpcRecord): void {
    const run = this.#run;
    if (record.type === "agent_settled") {
      if (typeof record.aborted !== "boolean" || !run) throw new Error("Unexpected Pi settlement.");
      this.#finish(run, {
        outcome: record.aborted || run.aborted ? "aborted" : run.error ? "failed" : "completed",
        ...(run.error ? { error: run.error } : {}),
      });
    } else if (record.type === "message_end") {
      if (!isRecord(record.message) || typeof record.message.role !== "string")
        throw new Error("Invalid Pi message event.");
      if (run && record.message.role === "assistant") {
        delete run.error;
        if (record.message.stopReason === "error")
          run.error =
            typeof record.message.errorMessage === "string"
              ? record.message.errorMessage
              : "Pi provider failed.";
        run.aborted = record.message.stopReason === "aborted";
      }
    } else if (record.type === "extension_ui_request") {
      this.#uiRequest(record);
    }
    for (const { listener } of [...this.#listeners]) {
      try {
        const result = listener(record);
        if (result) void result.catch(() => {});
      } catch {
        /* Observation failures must not stop Pi execution. */
      }
    }
  }

  #setState(state: RuntimeState): void {
    if (this.#state === state) return;
    this.#state = state;
    for (const listener of [...this.#stateListeners]) {
      this.#notifyStateListener(listener, state);
    }
  }

  #notifyStateListener(listener: StateListener, state: RuntimeState): void {
    try {
      const result = listener(state);
      if (result) void result.catch(() => {});
    } catch {
      /* State observation failures must not stop Pi execution. */
    }
  }

  #hasInteractiveObservers(): boolean {
    return [...this.#listeners].some((subscription) => subscription.interactive);
  }

  #cancelDialogs(): void {
    for (const id of this.#dialogs.keys())
      void this.respondToUi({ id, cancelled: true }).catch(() => {});
  }

  #uiRequest(record: RpcRecord): void {
    if (typeof record.id !== "string" || typeof record.method !== "string")
      throw new Error("Invalid Pi interaction.");
    if (["confirm", "select", "input", "editor"].includes(record.method)) {
      if (
        typeof record.title !== "string" ||
        this.#dialogs.has(record.id) ||
        this.#dialogs.size >= 32
      )
        throw new Error("Invalid Pi dialog.");
      if (record.method === "confirm" && typeof record.message !== "string")
        throw new Error("Invalid Pi confirmation.");
      if (
        record.method === "select" &&
        (!Array.isArray(record.options) ||
          !record.options.every((value: unknown) => typeof value === "string"))
      )
        throw new Error("Invalid Pi selection.");
      if (
        record.timeout !== undefined &&
        (typeof record.timeout !== "number" ||
          !Number.isFinite(record.timeout) ||
          record.timeout <= 0)
      )
        throw new Error("Invalid Pi dialog timeout.");
      const id = record.id;
      const timeout =
        typeof record.timeout === "number"
          ? Math.min(record.timeout, this.#requestMs)
          : this.#requestMs;
      const timer = setTimeout(() => {
        void this.respondToUi({ id, cancelled: true }).catch(() => {});
      }, timeout);
      this.#dialogs.set(id, { method: record.method, timer });
      if (!this.#hasInteractiveObservers()) this.#cancelDialogs();
    }
  }

  #clearDialogs(): void {
    for (const dialog of this.#dialogs.values()) clearTimeout(dialog.timer);
    this.#dialogs.clear();
  }
}
