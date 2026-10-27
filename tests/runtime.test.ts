import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdir, readFile, realpath, unlink, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { type TestContext, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../src/runtime/pi-process.ts";
import { isRecord } from "../src/runtime/pi-rpc.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const piEntry = import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForFile(path: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assert.fail(`Timed out waiting for ${path}.`);
}

async function runtime(
  t: TestContext,
  resumeFile?: string,
  configureEnvironment?: (
    environment: Awaited<ReturnType<typeof createPiEnvironment>>,
  ) => void | Promise<void>,
) {
  const environment = await createPiEnvironment();
  try {
    await configureEnvironment?.(environment);
  } catch (error) {
    await environment.cleanup();
    throw error;
  }
  const options = {
    executable: process.env.DWELL_TEST_PI_EXECUTABLE ?? process.execPath,
    ...(process.env.DWELL_TEST_PI_EXECUTABLE
      ? process.env.DWELL_TEST_PI_ENTRY
        ? { entryPoint: process.env.DWELL_TEST_PI_ENTRY }
        : {}
      : { entryPoint: fileURLToPath(piEntry) }),
    cwd: environment.cwd,
    env: environment.env,
    sessionDirectory: environment.sessionDir,
    extensions: [environment.extensionPath],
    provider: "dwell-test",
    model: "dwell-test",
    ...(resumeFile ? { resumeFile } : {}),
  };
  let pi: PiProcess;
  try {
    pi = await PiProcess.start(options);
  } catch (error) {
    await environment.cleanup();
    throw error;
  }
  t.after(async () => {
    await pi.stop();
    await environment.cleanup();
  });
  return { pi, environment, options };
}

async function setProjectTrustDefault(
  environment: Awaited<ReturnType<typeof createPiEnvironment>>,
  defaultProjectTrust: "always" | "never",
  extra: Record<string, unknown> = {},
): Promise<void> {
  const settingsPath = join(environment.agentDir, "settings.json");
  const settings: unknown = JSON.parse(await readFile(settingsPath, "utf8"));
  assert.ok(isRecord(settings));
  await writeFile(
    settingsPath,
    `${JSON.stringify({ ...settings, ...extra, defaultProjectTrust }, null, 2)}\n`,
  );
}

function resourceExtensionSource(marker: string): string {
  return `import { appendFile } from "node:fs/promises";

export default function (pi) {
  pi.on("session_start", async () => {
    const path = process.env.DWELL_TEST_RESOURCE_LOG;
    if (path) await appendFile(path, "${marker}\\n", { mode: 0o600 });
  });
}
`;
}

function resourceSkillSource(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
}

function resourcePromptSource(description: string, body: string): string {
  return `---\ndescription: ${description}\n---\n\n${body}\n`;
}

async function writeFixtureFiles(files: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(files).map(async ([path, contents]) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }),
  );
}

test("native Pi resource loading discovers trusted global and project resources and refreshes on reopen", async (t) => {
  const { pi, environment, options } = await runtime(t, undefined, async (env) => {
    await setProjectTrustDefault(env, "always", {
      extensions: ["-extensions/dwell-disabled-resource.ts"],
    });
    const resourceLog = join(env.root, "resource-starts.txt");
    const turnLog = join(env.root, "turns.txt");
    await writeFile(resourceLog, "", { mode: 0o600 });
    await writeFixtureFiles({
      [join(env.agentDir, "extensions", "dwell-global-resource.ts")]:
        resourceExtensionSource("global-resource-v1"),
      [join(env.agentDir, "extensions", "dwell-disabled-resource.ts")]:
        resourceExtensionSource("disabled-resource"),
      [join(env.cwd, ".pi/extensions/dwell-project-resource.ts")]:
        resourceExtensionSource("project-resource-v1"),
      [join(env.agentDir, "skills/dwell-global-resource/SKILL.md")]: resourceSkillSource(
        "dwell-global-resource",
        "global-resource-skill-description-v1",
        "global-resource-skill-body-v1",
      ),
      [join(env.cwd, ".pi/skills/dwell-project-resource/SKILL.md")]: resourceSkillSource(
        "dwell-project-resource",
        "project-resource-skill-description-v1",
        "project-resource-skill-body-v1",
      ),
      [join(env.agentDir, "prompts/global-resource.md")]: resourcePromptSource(
        "global-resource-prompt",
        "global-resource-prompt-body-v1",
      ),
      [join(env.cwd, ".pi/prompts/project-resource.md")]: resourcePromptSource(
        "project-resource-prompt",
        "project-resource-prompt-body-v1",
      ),
    });
    env.env.DWELL_TEST_RESOURCE_LOG = resourceLog;
    env.env.DWELL_TEST_TURN_LOG = turnLog;
  });

  assert.deepEqual(
    (await readFile(environment.env.DWELL_TEST_RESOURCE_LOG ?? "", "utf8"))
      .split("\n")
      .filter(Boolean)
      .sort(),
    ["global-resource-v1", "project-resource-v1"],
  );

  // The RPC fixture has no read/bash tool, so Pi omits skill summaries from its system prompt.
  for (const command of [
    "/skill:dwell-global-resource",
    "/skill:dwell-project-resource",
    "/global-resource",
    "/project-resource",
  ])
    assert.equal((await pi.run(command)).outcome, "completed");
  const initialTurns = await readFile(environment.env.DWELL_TEST_TURN_LOG ?? "", "utf8");
  for (const marker of [
    "global-resource-skill-body-v1",
    "project-resource-skill-body-v1",
    "global-resource-prompt-body-v1",
    "project-resource-prompt-body-v1",
  ])
    assert.ok(
      initialTurns.includes(marker),
      `${marker} must be sent to the offline fixture provider`,
    );

  const globalPrompt = join(environment.agentDir, "prompts", "global-resource.md");
  const globalSkill = join(environment.agentDir, "skills", "dwell-global-resource", "SKILL.md");
  const globalExtension = join(environment.agentDir, "extensions", "dwell-global-resource.ts");
  await Promise.all([
    writeFile(
      globalPrompt,
      resourcePromptSource("global-resource-prompt", "global-resource-prompt-body-v2"),
    ),
    writeFile(
      globalSkill,
      resourceSkillSource(
        "dwell-global-resource",
        "global-resource-skill-description-v2",
        "global-resource-skill-body-v2",
      ),
    ),
    writeFile(globalExtension, resourceExtensionSource("global-resource-v2")),
  ]);

  assert.equal((await pi.run("/global-resource")).outcome, "completed");
  const activeTurns = await readFile(environment.env.DWELL_TEST_TURN_LOG ?? "", "utf8");
  assert.ok(activeTurns.includes("global-resource-prompt-body-v1"));
  assert.ok(!activeTurns.includes("global-resource-prompt-body-v2"));
  assert.ok(!activeTurns.includes("global-resource-v2"));
  assert.ok(
    !(await readFile(environment.env.DWELL_TEST_RESOURCE_LOG ?? "", "utf8")).includes(
      "global-resource-v2",
    ),
  );

  const initialState = await pi.getState();
  assert.ok(initialState.sessionFile);
  await pi.stop();
  const reopened = await PiProcess.start({ ...options, resumeFile: initialState.sessionFile });
  t.after(() => reopened.stop());
  const reopenedResourceLog = await readFile(environment.env.DWELL_TEST_RESOURCE_LOG ?? "", "utf8");
  assert.ok(reopenedResourceLog.includes("global-resource-v2"));
  assert.ok(reopenedResourceLog.includes("project-resource-v1"));
  assert.equal((await reopened.run("/global-resource")).outcome, "completed");
  assert.equal((await reopened.run("/project-resource")).outcome, "completed");
  assert.equal((await reopened.run("/skill:dwell-global-resource")).outcome, "completed");
  const reopenedTurns = await readFile(environment.env.DWELL_TEST_TURN_LOG ?? "", "utf8");
  assert.ok(reopenedTurns.includes("global-resource-prompt-body-v2"));
  assert.ok(reopenedTurns.includes("project-resource-prompt-body-v1"));
  assert.ok(reopenedTurns.includes("global-resource-skill-body-v2"));
});

test("native Pi project trust excludes project resources when the global default is never", async (t) => {
  const { pi, environment } = await runtime(t, undefined, async (env) => {
    await setProjectTrustDefault(env, "never");
    const resourceLog = join(env.root, "resource-starts.txt");
    const turnLog = join(env.root, "turns.txt");
    await writeFile(resourceLog, "", { mode: 0o600 });
    await writeFixtureFiles({
      [join(env.agentDir, "extensions/dwell-global-resource.ts")]:
        resourceExtensionSource("global-resource"),
      [join(env.cwd, ".pi/extensions/dwell-project-resource.ts")]: resourceExtensionSource(
        "untrusted-project-resource",
      ),
      [join(env.cwd, ".pi/skills/dwell-untrusted-resource/SKILL.md")]: resourceSkillSource(
        "dwell-untrusted-resource",
        "untrusted-project-skill-description",
        "untrusted-project-skill-body",
      ),
      [join(env.cwd, ".pi/prompts/untrusted-resource.md")]: resourcePromptSource(
        "untrusted-project-prompt",
        "untrusted-project-prompt-body",
      ),
    });
    env.env.DWELL_TEST_RESOURCE_LOG = resourceLog;
    env.env.DWELL_TEST_TURN_LOG = turnLog;
  });

  assert.deepEqual(
    (await readFile(environment.env.DWELL_TEST_RESOURCE_LOG ?? "", "utf8"))
      .split("\n")
      .filter(Boolean),
    ["global-resource"],
  );
  assert.equal((await pi.run("/untrusted-resource")).outcome, "completed");
  assert.equal((await pi.run("/skill:dwell-untrusted-resource")).outcome, "completed");
  const turns = await readFile(environment.env.DWELL_TEST_TURN_LOG ?? "", "utf8");
  assert.ok(turns.includes("/untrusted-resource"));
  assert.ok(turns.includes("/skill:dwell-untrusted-resource"));
  assert.ok(!turns.includes("untrusted-project-prompt-body"));
});

test("native context loading includes global and ancestors across a Git root once, in order", async (t) => {
  const markers = [
    "DWELL_GLOBAL_CONTEXT",
    "DWELL_ANCESTOR_CONTEXT",
    "DWELL_HOME_CONTEXT",
    "DWELL_PROJECTS_CONTEXT",
    "DWELL_REPO_OVERRIDE_CONTEXT",
    "DWELL_SUBDIR_CLAUDE_CONTEXT",
  ];
  const excluded = ["DWELL_REPO_BASE_CONTEXT", "DWELL_SIBLING_CONTEXT", "DWELL_CHILD_CONTEXT"];
  const { pi, environment } = await runtime(t, undefined, async (env) => {
    const home = env.env.HOME;
    assert.ok(home);
    const projects = join(home, "Projects");
    const repo = join(projects, "example");
    env.cwd = join(repo, "src");
    const sibling = join(projects, "sibling");
    const child = join(env.cwd, "child");
    await Promise.all(
      [join(repo, ".git"), sibling, child].map((path) => mkdir(path, { recursive: true })),
    );
    await writeFile(join(repo, ".git", "HEAD"), "ref: refs/heads/main\n");
    const paths = [
      join(env.agentDir, "AGENTS.md"),
      join(env.root, "AGENTS.md"),
      join(home, "AGENTS.md"),
      join(projects, "AGENTS.md"),
      join(repo, "AGENTS.override.md"),
      join(env.cwd, "CLAUDE.md"),
      join(repo, "AGENTS.md"),
      join(sibling, "AGENTS.md"),
      join(child, "AGENTS.md"),
    ];
    const contents = [...markers, ...excluded];
    await Promise.all(
      paths.map((path, index) => {
        const content = contents[index];
        assert.ok(content);
        return writeFile(path, content);
      }),
    );
    env.env.DWELL_TEST_SYSTEM_PROMPT = join(env.root, "prompt.txt");
  });
  assert.equal((await pi.run("hello")).outcome, "completed");
  const prompt = await readFile(join(environment.root, "prompt.txt"), "utf8");
  let previous = -1;
  for (const marker of markers) {
    const position = prompt.indexOf(marker);
    assert.ok(position > previous, `${marker} must follow its parent context`);
    assert.equal(prompt.split(marker).length - 1, 1, `${marker} must appear once`);
    previous = position;
  }
  for (const marker of excluded) assert.ok(!prompt.includes(marker), `${marker} must be excluded`);
});

test("native context loading deduplicates the agent directory when it is also an ancestor", async (t) => {
  const { pi, environment } = await runtime(t, undefined, async (env) => {
    // Pi deduplicates by path; use the same canonical path as the runtime cwd.
    env.agentDir = await realpath(env.agentDir);
    env.env.PI_CODING_AGENT_DIR = env.agentDir;
    env.cwd = join(env.agentDir, "project");
    await mkdir(env.cwd);
    await writeFile(join(env.agentDir, "AGENTS.override.md"), "DWELL_GLOBAL_OVERRIDE_CONTEXT");
    await writeFile(join(env.agentDir, "AGENTS.md"), "DWELL_GLOBAL_SHADOWED_CONTEXT");
    env.env.DWELL_TEST_SYSTEM_PROMPT = join(env.root, "prompt.txt");
  });
  assert.equal((await pi.run("hello")).outcome, "completed");
  const prompt = await readFile(join(environment.root, "prompt.txt"), "utf8");
  assert.equal(prompt.split("DWELL_GLOBAL_OVERRIDE_CONTEXT").length - 1, 1);
  assert.ok(!prompt.includes("DWELL_GLOBAL_SHADOWED_CONTEXT"));
});

test("sessions without context files retain Pi's default prompt and complete turns", async (t) => {
  const { pi, environment } = await runtime(t, undefined, (env) => {
    env.env.DWELL_TEST_SYSTEM_PROMPT = join(env.root, "prompt.txt");
  });
  assert.equal((await pi.run("hello")).outcome, "completed");
  const prompt = await readFile(join(environment.root, "prompt.txt"), "utf8");
  assert.match(prompt, /You are an expert coding assistant operating inside pi/);
});

test("native context remains additive to global SYSTEM and APPEND_SYSTEM customization", async (t) => {
  const { pi, environment } = await runtime(t, undefined, async (env) => {
    await writeFile(join(env.agentDir, "SYSTEM.md"), "DWELL_CUSTOM_SYSTEM");
    await writeFile(join(env.agentDir, "APPEND_SYSTEM.md"), "DWELL_APPEND_SYSTEM");
    await writeFile(join(env.cwd, "AGENTS.md"), "DWELL_CUSTOM_PROJECT_CONTEXT");
    env.env.DWELL_TEST_SYSTEM_PROMPT = join(env.root, "prompt.txt");
  });
  assert.equal((await pi.run("hello")).outcome, "completed");
  const prompt = await readFile(join(environment.root, "prompt.txt"), "utf8");
  for (const marker of [
    "DWELL_CUSTOM_SYSTEM",
    "DWELL_APPEND_SYSTEM",
    "DWELL_CUSTOM_PROJECT_CONTEXT",
  ])
    assert.equal(prompt.split(marker).length - 1, 1);
  assert.ok(!prompt.includes("You are an expert coding assistant operating inside pi"));
});

test("native defaults and model changes work without changing global Pi settings", async (t) => {
  const { pi, environment, options } = await runtime(t);
  await pi.stop();
  const { provider, model, ...nativeOptions } = options;
  const before = await readFile(join(environment.agentDir, "settings.json"), "utf8");
  const native = await PiProcess.start(nativeOptions);
  t.after(() => native.stop());
  const initial = await native.getState();
  assert.equal(initial.model?.provider, provider);
  assert.equal(initial.model?.id, model);
  await native.setModel(provider, "dwell-test-alt");
  const changed = await native.getState();
  assert.equal(changed.model?.provider, provider);
  assert.equal(changed.model?.id, "dwell-test-alt");
  assert.equal(await readFile(join(environment.agentDir, "settings.json"), "utf8"), before);
  await native.stop();
});

test("Pi thinking capabilities are model-specific, clamped, and restored from the session transcript", async (t) => {
  const { pi, environment, options } = await runtime(t);
  const settings = await readFile(join(environment.agentDir, "settings.json"), "utf8");
  await pi.setModel("dwell-test", "dwell-test-reasoning");
  const levels = await pi.getAvailableThinkingLevels();
  assert.deepEqual(levels, ["low", "medium", "high", "xhigh"]);
  assert.equal(await pi.setThinkingLevel("high"), "high");
  assert.equal(await pi.setThinkingLevel("max"), "xhigh");
  assert.equal(await readFile(join(environment.agentDir, "settings.json"), "utf8"), settings);
  assert.equal((await pi.run("hello")).outcome, "completed");

  const state = await pi.getState();
  assert.ok(state.sessionFile);
  await pi.stop();
  const reopened = await PiProcess.start({
    ...options,
    provider: "dwell-test",
    model: "dwell-test-reasoning",
    resumeFile: state.sessionFile,
  });
  t.after(() => reopened.stop());
  assert.equal((await reopened.getState()).thinkingLevel, "xhigh");
  assert.deepEqual(await reopened.getAvailableThinkingLevels(), levels);
  assert.equal(await readFile(join(environment.agentDir, "settings.json"), "utf8"), settings);
});

test("real Pi performs a tool turn, saves history, and reopens the same session", async (t) => {
  const { pi, options } = await runtime(t);
  const initial = await pi.getState();
  assert.equal(pi.state, "ready");
  assert.equal(initial.messageCount, 0);
  assert.ok(initial.sessionFile);
  const initialEntries = await pi.getEntries();
  assert.ok(initialEntries.entries.length > 0);
  assert.equal(initialEntries.leafId, initialEntries.entries.at(-1)?.id);
  await assert.rejects(access(initial.sessionFile));
  const events: string[] = [];
  pi.subscribe((event) => {
    events.push(event.type);
  });
  const result = await pi.run("tool");
  assert.equal(result.outcome, "completed");
  assert.ok(events.includes("tool_execution_end"));
  assert.equal(events.at(-1), "agent_settled");
  const before = await pi.getMessages();
  assert.ok(before.some((message) => message.role === "toolResult"));
  const history = await pi.getEntries();
  assert.ok(history.entries.length > 0);
  assert.ok(history.entries.length > initialEntries.entries.length);
  assert.deepEqual(history.entries.slice(0, initialEntries.entries.length), initialEntries.entries);
  assert.ok(history.entries.every((entry) => entry.id.length > 0 && entry.type.length > 0));
  assert.equal(history.leafId, history.entries.at(-1)?.id);
  await pi.stop();
  assert.equal(pi.state, "exited");
  const reopened = await PiProcess.start({ ...options, resumeFile: initial.sessionFile });
  t.after(() => reopened.stop());
  assert.equal((await reopened.getState()).sessionId, initial.sessionId);
  assert.deepEqual(await reopened.getMessages(), before);
  assert.deepEqual(await reopened.getEntries(), history);
  await reopened.stop();
  await unlink(initial.sessionFile);
  await assert.rejects(
    PiProcess.start({ ...options, resumeFile: initial.sessionFile }),
    /session|ENOENT/i,
  );
});

test("startRun exposes prompt acceptance separately from settled outcome", async (t) => {
  const { pi } = await runtime(t);
  let streaming!: () => void;
  const started = new Promise<void>((resolve) => {
    streaming = resolve;
  });
  const unsubscribe = pi.subscribe((event) => {
    if (event.type === "message_update") streaming();
  });

  const run = pi.startRun("slow");
  assert.equal(pi.state, "running");
  await started;
  assert.equal(await run.accepted, "started");
  assert.equal(pi.state, "running");
  unsubscribe();
  await pi.abort();
  assert.equal((await run.settled).outcome, "aborted");
});

test("real Pi observers detach without stopping work, busy runs reject, and abort settles", async (t) => {
  const { pi } = await runtime(t);
  let started!: () => void;
  const streaming = new Promise<void>((resolve) => {
    started = resolve;
  });
  const unsubscribe = pi.subscribe((event) => {
    if (event.type === "message_update") started();
  });
  const run = pi.run("slow");
  await streaming;
  unsubscribe();
  assert.equal(pi.state, "running");
  assert.equal((await pi.getState()).isStreaming, true);
  await assert.rejects(pi.run("hello"), /busy/i);
  pi.subscribe(() => {
    throw new Error("observer failure");
  });
  pi.subscribe(async () => {
    throw new Error("async observer failure");
  });
  await pi.abort();
  assert.equal((await run).outcome, "aborted");
  assert.equal(pi.state, "ready");
  assert.equal((await pi.run("hello")).outcome, "completed");
});

test("runtime state subscribers receive initial state and child lifecycle transitions", async (t) => {
  const { pi } = await runtime(t);
  const states: string[] = [];
  const unsubscribe = pi.subscribeState((state) => {
    states.push(state);
  });
  pi.subscribeState(async (state) => {
    if (state === "running") throw new Error("async state observer failure");
  });
  assert.deepEqual(states, ["ready"]);

  const run = pi.startRun("hello");
  assert.deepEqual(states, ["ready", "running"]);
  assert.equal(await run.accepted, "started");
  assert.equal((await run.settled).outcome, "completed");
  assert.deepEqual(states, ["ready", "running", "ready"]);

  await pi.stop();
  assert.deepEqual(states, ["ready", "running", "ready", "stopping", "exited"]);
  unsubscribe();
});

test("runtime state subscribers observe an unexpected real Pi child exit", async (t) => {
  const { pi } = await runtime(t);
  const failed = deferred<void>();
  const unsubscribe = pi.subscribeState((state) => {
    if (state === "failed") failed.resolve();
  });
  const pid = pi.pid;
  assert.ok(pid);
  process.kill(pid, "SIGKILL");
  await failed.promise;
  assert.equal(pi.state, "failed");
  await pi.stop();
  unsubscribe();
});

test("passive Pi observers do not keep dialogs open without an interactive observer", async (t) => {
  const { pi } = await runtime(t);
  const passiveCancelled = deferred<number>();
  const requestStarted = { at: 0, id: "" };
  const passive = pi.subscribe(
    (event) => {
      if (event.type !== "extension_ui_request") return;
      if (event.method === "confirm") {
        requestStarted.at = performance.now();
        requestStarted.id = String(event.id);
      }
      if (event.method === "notify" && event.message === "dwell-confirm: cancelled")
        passiveCancelled.resolve(performance.now() - requestStarted.at);
    },
    { interactive: false },
  );

  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  const passiveDelay = await passiveCancelled.promise;
  assert.ok(passiveDelay < 500, `passive-only confirmation took ${passiveDelay}ms`);
  await assert.rejects(
    pi.respondToUi({ id: requestStarted.id, confirmed: true }),
    /Unknown or already answered/,
  );
  passive();

  const activeRequest = deferred<void>();
  const passiveActiveRequest = deferred<void>();
  const confirmedNotice = deferred<void>();
  const active = pi.subscribe((event) => {
    if (event.type !== "extension_ui_request") return;
    if (event.method === "confirm") {
      activeRequest.resolve();
      void pi.respondToUi({ id: String(event.id), confirmed: true }).catch(() => {});
    }
    if (event.method === "notify" && event.message === "dwell-confirm: confirmed")
      confirmedNotice.resolve();
  });
  const observingPassive = pi.subscribe(
    (event) => {
      if (event.type === "extension_ui_request" && event.method === "confirm")
        passiveActiveRequest.resolve();
    },
    { interactive: false },
  );
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  await Promise.all([activeRequest.promise, passiveActiveRequest.promise, confirmedNotice.promise]);
  active();
  observingPassive();

  const detachingRequest = deferred<void>();
  const detachedNotice = deferred<number>();
  let detachedRequestId = "";
  let unsubscribeLastInteractive = () => {};
  unsubscribeLastInteractive = pi.subscribe((event) => {
    if (event.type === "extension_ui_request" && event.method === "confirm") {
      unsubscribeLastInteractive();
      detachingRequest.resolve();
    }
  });
  const remainingPassive = pi.subscribe(
    (event) => {
      if (event.type !== "extension_ui_request") return;
      if (event.method === "confirm") {
        detachedRequestId = String(event.id);
        requestStarted.at = performance.now();
      }
      if (event.method === "notify" && event.message === "dwell-confirm: cancelled")
        detachedNotice.resolve(performance.now() - requestStarted.at);
    },
    { interactive: false },
  );
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  await detachingRequest.promise;
  const detachedDelay = await detachedNotice.promise;
  assert.ok(detachedDelay < 500, `last-interactive removal took ${detachedDelay}ms`);
  await assert.rejects(
    pi.respondToUi({ id: detachedRequestId, confirmed: true }),
    /Unknown or already answered/,
  );
  remainingPassive();
});

test("real Pi stream fixture waits for a release barrier and aborts while waiting", async (t) => {
  let releasePath = "";
  let startedPath = "";
  const { pi } = await runtime(t, undefined, (value) => {
    releasePath = join(value.root, "stream-release");
    startedPath = join(value.root, "stream-started");
    value.env.DWELL_TEST_STREAM_RELEASE = releasePath;
    value.env.DWELL_TEST_STREAM_STARTED = startedPath;
  });
  const deltas: string[] = [];
  const firstChunk = deferred<void>();
  const unsubscribe = pi.subscribe((event) => {
    if (event.type !== "message_update" || !isRecord(event.assistantMessageEvent)) return;
    const update = event.assistantMessageEvent;
    if (update.type !== "text_delta" || typeof update.delta !== "string") return;
    deltas.push(update.delta);
    if (update.delta === "stream-first-") firstChunk.resolve();
  });

  const run = pi.startRun("stream");
  await firstChunk.promise;
  assert.equal(await run.accepted, "started");
  assert.equal(deltas.includes("stream-second"), false);
  await waitForFile(startedPath);
  await writeFile(releasePath, "release\n", { mode: 0o600 });
  assert.equal((await run.settled).outcome, "completed");
  assert.ok(deltas.includes("stream-second"));

  await unlink(releasePath);
  await unlink(startedPath);
  const secondFirstChunk = deferred<void>();
  const unsubscribeAbortObserver = pi.subscribe((event) => {
    if (
      event.type === "message_update" &&
      isRecord(event.assistantMessageEvent) &&
      event.assistantMessageEvent.type === "text_delta" &&
      event.assistantMessageEvent.delta === "stream-first-"
    )
      secondFirstChunk.resolve();
  });
  const abortingRun = pi.startRun("stream");
  await secondFirstChunk.promise;
  await abortingRun.accepted;
  await pi.abort();
  assert.equal((await abortingRun.settled).outcome, "aborted");
  unsubscribeAbortObserver();
  unsubscribe();
});

test("real Pi burst fixture streams large tool updates with a bounded final message", async (t) => {
  const { pi } = await runtime(t);
  let updateBytes = 0;
  let updateCount = 0;
  const unsubscribe = pi.subscribe((event) => {
    if (event.type !== "tool_execution_update" || !isRecord(event.partialResult)) return;
    const content = event.partialResult.content;
    if (!Array.isArray(content)) return;
    for (const item of content) {
      if (isRecord(item) && item.type === "text" && typeof item.text === "string") {
        updateBytes += Buffer.byteLength(item.text);
        updateCount += 1;
      }
    }
  });

  const result = await pi.run("burst");
  assert.equal(result.outcome, "completed");
  assert.equal(updateCount, 128);
  assert.ok(updateBytes > 2 * 1024 * 1024);
  const messages = await pi.getMessages();
  const latestAssistant = messages
    .slice()
    .reverse()
    .find((message) => message.role === "assistant");
  assert.ok(latestAssistant);
  assert.ok(Buffer.byteLength(JSON.stringify(latestAssistant)) < 1024);
  unsubscribe();
});

test("real Pi reports provider failures rather than successful settlement", async (t) => {
  const { pi } = await runtime(t);
  const result = await pi.run("fail");
  assert.equal(result.outcome, "failed");
  assert.match(result.error ?? "", /scripted|synthetic|failure/i);
  assert.equal(pi.state, "ready");
});

test("real Pi extension commands handle confirmation, cancellation, timeout and notification", async (t) => {
  const { pi } = await runtime(t);
  const notices: string[] = [];
  let answer = true;
  const unsubscribe = pi.subscribe((event) => {
    if (event.type !== "extension_ui_request") return;
    if (event.method === "notify" && typeof event.message === "string") notices.push(event.message);
    if (event.method === "confirm") {
      void pi.respondToUi({ id: String(event.id), confirmed: answer }).catch(() => {});
    }
  });
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  assert.ok(notices.some((message) => /confirmed/i.test(message)));
  answer = false;
  await pi.run("/dwell-confirm");
  assert.ok(notices.some((message) => /cancelled/i.test(message)));
  unsubscribe();
  const timeoutNotices: string[] = [];
  const silent = pi.subscribe((event) => {
    if (event.type === "extension_ui_request" && typeof event.message === "string")
      timeoutNotices.push(event.message);
  });
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  assert.ok(timeoutNotices.includes("dwell-confirm: cancelled"));
  silent();
  assert.equal((await pi.run("/dwell-confirm")).outcome, "handled");
  await assert.rejects(pi.respondToUi({ id: "missing", confirmed: true }), /Unknown/);
  const custom = pi.subscribe((event) => {
    if (event.type === "extension_ui_request" && typeof event.message === "string")
      timeoutNotices.push(event.message);
  });
  await pi.run("/dwell-custom");
  assert.ok(timeoutNotices.includes("dwell-custom: unavailable"));
  custom();
  assert.equal((await pi.run("/dwell-notify")).outcome, "handled");
});

test("real Pi closes after its owner disappears and receives stdin EOF", {
  timeout: 15_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  t.after(() => environment.cleanup());
  const owner = spawn(
    process.execPath,
    [fileURLToPath(new URL("./fixtures/pi-owner.ts", import.meta.url)), environment.root],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...environment.env,
        DWELL_TEST_PI_EXECUTABLE: process.env.DWELL_TEST_PI_EXECUTABLE ?? process.execPath,
        DWELL_TEST_PI_ENTRY: process.env.DWELL_TEST_PI_EXECUTABLE
          ? (process.env.DWELL_TEST_PI_ENTRY ?? "")
          : fileURLToPath(piEntry),
      },
    },
  );
  let piPid: number | undefined;
  t.after(() => {
    owner.kill("SIGKILL");
    if (piPid) {
      try {
        process.kill(piPid, "SIGKILL");
      } catch {}
    }
  });
  const lines = createInterface({ input: owner.stdout });
  const ownerExit = once(owner, "exit");
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  const readiness = new Promise<never>((_resolve, reject) => {
    readyTimer = setTimeout(() => reject(new Error("Pi owner readiness timed out.")), 5000);
  });
  let line: unknown;
  try {
    [line] = await Promise.race([
      once(lines, "line"),
      ownerExit.then(() => {
        throw new Error("Pi owner exited before readiness.");
      }),
      readiness,
    ]);
  } finally {
    clearTimeout(readyTimer);
    lines.close();
  }
  assert.equal(typeof line, "string");
  piPid = Number(line);
  assert.ok(Number.isSafeInteger(piPid) && piPid > 0);
  owner.kill("SIGKILL");
  await ownerExit;
  // Poll the OS exit state with a deadline; no timing assumption about Pi cleanup.
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(piPid, 0);
    } catch (error) {
      assert.ok(error instanceof Error && "code" in error && error.code === "ESRCH");
      piPid = undefined;
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail("Pi remained alive after its owner disappeared.");
});
