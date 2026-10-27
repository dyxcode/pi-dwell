import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  discoverPiModelCapabilities,
  discoverPiModels,
  listHostDirectories,
} from "../src/server/session-discovery.ts";
import { SessionService } from "../src/sessions/service.ts";
import { isAvailableModelsResponse, isHostDirectoryListing } from "../src/shared/discovery.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), "dwell-discovery-test-"));
}

test("directory listing defaults to HOME and returns visible canonical directories", async (t) => {
  const root = await temporaryDirectory();
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const projects = join(home, "Projects");
  const hidden = join(home, ".private");
  await mkdir(projects, { recursive: true });
  await mkdir(hidden);
  await writeFile(join(home, "notes.txt"), "not a directory");
  await symlink(projects, join(home, "Projects link"), "dir");
  await symlink(join(home, "notes.txt"), join(home, "file link"), "file");

  const listing = await listHostDirectories(undefined, home);
  const canonicalHome = await realpath(home);
  const canonicalProjects = await realpath(projects);

  assert.deepEqual(listing, {
    path: canonicalHome,
    parent: dirname(canonicalHome),
    truncated: false,
    directories: [
      { name: "Projects", path: canonicalProjects },
      { name: "Projects link", path: canonicalProjects },
    ],
  });
  assert.ok(isHostDirectoryListing(listing));
});

test("directory listing rejects relative, missing, and non-directory paths", async (t) => {
  const root = await temporaryDirectory();
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, "file.txt");
  await writeFile(file, "text");

  await assert.rejects(listHostDirectories("relative", root), /absolute/i);
  await assert.rejects(listHostDirectories(join(root, "missing"), root), /existing/i);
  await assert.rejects(listHostDirectories(file, root), /directory/i);
});

test("Pi model discovery validates version and runs an offline isolated CLI", async (t) => {
  const root = await temporaryDirectory();
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const sourceAgentDir = join(home, ".pi", "agent");
  const project = join(root, "project");
  const report = join(root, "child.jsonl");
  const entryPoint = join(root, "fake-pi.mjs");
  await mkdir(sourceAgentDir, { recursive: true });
  await mkdir(project);
  await writeFile(join(sourceAgentDir, "auth.json"), JSON.stringify({ synthetic: "credential" }));
  await writeFile(join(sourceAgentDir, "models.json"), JSON.stringify({ providers: {} }));
  await writeFile(join(sourceAgentDir, "settings.json"), JSON.stringify({ theme: "synthetic" }));
  await writeFile(join(sourceAgentDir, "models-store.json"), JSON.stringify({}));
  await mkdir(join(sourceAgentDir, "extensions"));
  await writeFile(
    join(sourceAgentDir, "extensions", "must-not-load.mjs"),
    "throw new Error('loaded');",
  );
  await writeFile(
    entryPoint,
    `import { appendFileSync, readdirSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const agentDir = process.env.PI_CODING_AGENT_DIR;
const listing = args.includes("--list-models");
const record = {
  args,
  cwd: process.cwd(),
  agentDir,
  agentFiles: readdirSync(agentDir).sort(),
  copiedAuth: listing ? JSON.parse(readFileSync(agentDir + "/auth.json", "utf8")) : null,
  packageDir: process.env.PI_PACKAGE_DIR,
  managedInstallRoot: process.env.PI_MANAGED_INSTALL_ROOT,
  sessionDir: process.env.PI_CODING_AGENT_SESSION_DIR,
  offline: process.env.PI_OFFLINE,
};
appendFileSync(process.env.DISCOVERY_TEST_REPORT, JSON.stringify(record) + "\\n");
if (args.length === 1 && args[0] === "--version") {
  process.stdout.write("1.4.0\\n");
} else if (args.includes("--list-models")) {
  process.stdout.write("provider   model             context  max-out  thinking  images\\nanthropic  claude synthetic  200K     8K       yes       yes\\n");
} else {
  process.stderr.write("unexpected arguments");
  process.exitCode = 2;
}
`,
  );
  await chmod(entryPoint, 0o600);

  const models = await discoverPiModels(
    { executable: process.execPath, entryPoint },
    {
      HOME: home,
      PATH: process.env.PATH,
      DISCOVERY_TEST_REPORT: report,
      PI_CODING_AGENT_DIR: sourceAgentDir,
      PI_CODING_AGENT_SESSION_DIR: join(root, "outside-session-dir"),
      PI_PACKAGE_DIR: join(root, "real-package-dir"),
      PI_MANAGED_INSTALL_ROOT: join(root, "real-managed-install"),
    },
  );

  assert.deepEqual(models, [
    { provider: "anthropic", id: "claude synthetic", supportsImages: true },
  ]);
  const records = (await readFile(report, "utf8"))
    .trim()
    .split("\n")
    .map(
      (line) =>
        JSON.parse(line) as {
          args: string[];
          cwd: string;
          agentDir: string;
          agentFiles: string[];
          copiedAuth: Record<string, unknown> | null;
          packageDir: string;
          managedInstallRoot: string | undefined;
          sessionDir: string;
          offline: string;
        },
    );
  assert.equal(records.length, 2);
  const canonicalTempDirectory = await realpath(tmpdir());
  for (const record of records) {
    assert.notEqual(record.agentDir, sourceAgentDir);
    if (record.args.includes("--list-models"))
      assert.notEqual(record.packageDir, join(root, "real-package-dir"));
    else assert.equal(record.packageDir, join(root, "real-package-dir"));
    assert.equal(record.managedInstallRoot, undefined);
    assert.notEqual(record.sessionDir, join(root, "outside-session-dir"));
    assert.equal(record.offline, "1");
    assert.ok(record.cwd.startsWith(canonicalTempDirectory));
    assert.deepEqual(
      record.agentFiles,
      record.args.includes("--list-models")
        ? ["auth.json", "models-store.json", "models.json", "settings.json"]
        : [],
    );
    assert.deepEqual(
      record.copiedAuth,
      record.args.includes("--list-models") ? { synthetic: "credential" } : null,
    );
  }
  assert.deepEqual(records[0]?.args, ["--version"]);
  assert.ok(records[1]?.args.includes("--offline"));
  assert.ok(records[1]?.args.includes("--no-extensions"));
  assert.ok(records[1]?.args.includes("--no-mcp"));
  assert.ok(records[1]?.args.includes("--no-context-files"));
  assert.ok(records[1]?.args.includes("--list-models"));
  assert.ok(isAvailableModelsResponse({ models }));
  assert.equal(
    await readFile(join(sourceAgentDir, "auth.json"), "utf8"),
    JSON.stringify({ synthetic: "credential" }),
  );
});

test("model capability discovery uses Pi RPC in a private offline session", {
  timeout: 30_000,
}, async (t) => {
  const environment = await createPiEnvironment();
  t.after(() => environment.cleanup());
  const settingsPath = join(environment.agentDir, "settings.json");
  const settingsBefore = await readFile(settingsPath, "utf8");
  await writeFile(
    join(environment.agentDir, "models.json"),
    JSON.stringify({
      providers: {
        "dwell-test": {
          name: "Dwell Offline Fixture",
          baseUrl: "http://127.0.0.1",
          api: "openai-completions",
          apiKey: "fixture-only-no-secret",
          models: [
            {
              id: "dwell-test-image",
              name: "Dwell Image Fixture",
              input: ["text", "image"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 8192,
              maxTokens: 1024,
            },
            {
              id: "dwell-test-reasoning",
              name: "Dwell Thinking Fixture",
              input: ["text", "image"],
              reasoning: true,
              thinkingLevelMap: {
                off: null,
                minimal: null,
                low: "low",
                medium: "medium",
                high: "high",
                xhigh: "xhigh",
              },
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 8192,
              maxTokens: 1024,
            },
          ],
        },
      },
    }),
    { mode: 0o600 },
  );
  const configuration = {
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  };

  const image = await discoverPiModelCapabilities(configuration, environment.env, {
    provider: "dwell-test",
    model: "dwell-test-image",
  });
  assert.deepEqual(image, {
    provider: "dwell-test",
    model: "dwell-test-image",
    thinkingLevels: ["off"],
    supportsImages: true,
  });
  const reasoning = await discoverPiModelCapabilities(configuration, environment.env, {
    provider: "dwell-test",
    model: "dwell-test-reasoning",
  });
  assert.deepEqual(reasoning, {
    provider: "dwell-test",
    model: "dwell-test-reasoning",
    thinkingLevels: ["low", "medium", "high", "xhigh"],
    supportsImages: true,
  });
  assert.equal(await readFile(settingsPath, "utf8"), settingsBefore);
});

test("Pi discovery recognizes an empty model list and sanitizes process failures", async (t) => {
  const root = await temporaryDirectory();
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const sourceAgentDir = join(home, ".pi", "agent");
  const report = join(root, "child.jsonl");
  const entryPoint = join(root, "fake-pi.mjs");
  await mkdir(sourceAgentDir, { recursive: true });
  await writeFile(
    entryPoint,
    `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.DISCOVERY_TEST_REPORT, JSON.stringify(args) + "\\n");
if (args.includes("--version")) process.stdout.write("1.4.0\\n");
else if (args.includes("--list-models")) process.stdout.write("No models available.\\n");
else { process.stderr.write("synthetic-secret-from-stderr"); process.exitCode = 1; }
`,
  );
  await chmod(entryPoint, 0o600);

  const configuration = { executable: process.execPath, entryPoint };
  const env = { HOME: home, PATH: process.env.PATH, DISCOVERY_TEST_REPORT: report };
  assert.deepEqual(await discoverPiModels(configuration, env), []);

  await writeFile(
    entryPoint,
    `const args = process.argv.slice(2);
if (args.includes("--version")) process.stdout.write("1.4.0\\n");
else { process.stderr.write("synthetic-secret-from-stderr"); process.exitCode = 1; }
`,
  );
  await assert.rejects(discoverPiModels(configuration, env), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.doesNotMatch(error.message, /synthetic-secret/);
    return true;
  });
});

test("Pi 1.4.0 lists a synthetic configured model without provider access", async (t) => {
  const root = await temporaryDirectory();
  t.after(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const agentDirectory = join(home, ".pi", "agent");
  await mkdir(agentDirectory, { recursive: true });
  await writeFile(
    join(agentDirectory, "models.json"),
    JSON.stringify({
      providers: {
        "dwell-test": {
          baseUrl: "http://127.0.0.1:1/v1",
          apiKey: "synthetic-key",
          api: "openai-completions",
          models: [
            {
              id: "dwell-test",
              name: "Synthetic Dwell model",
              contextWindow: 8192,
              maxTokens: 1024,
            },
          ],
        },
      },
    }),
  );
  const packageEntry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const cliEntryPoint = join(dirname(packageEntry), "cli.js");
  const rpcEntryPoint = fileURLToPath(
    import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"),
  );

  const env = {
    HOME: home,
    PATH: process.env.PATH,
    PI_CODING_AGENT_DIR: agentDirectory,
  };
  const cliModels = await discoverPiModels(
    { executable: process.execPath, entryPoint: cliEntryPoint },
    env,
  );
  const rpcModels = await discoverPiModels(
    { executable: process.execPath, entryPoint: rpcEntryPoint },
    env,
  );

  assert.deepEqual(cliModels, [
    { provider: "dwell-test", id: "dwell-test", supportsImages: false },
  ]);
  assert.deepEqual(rpcModels, cliModels);
  assert.ok(isAvailableModelsResponse({ models: cliModels }));

  const service = await SessionService.create({
    dataDir: join(root, "dwell-service"),
    env,
  });
  t.after(() => service.shutdown());
  await service.configure({ executable: process.execPath, entryPoint: rpcEntryPoint });
  const capabilityDiscovery = service.getModelCapabilities({
    provider: "dwell-test",
    model: "dwell-test",
  });
  const serviceShutdown = service.shutdown();
  assert.deepEqual(await capabilityDiscovery, {
    provider: "dwell-test",
    model: "dwell-test",
    thinkingLevels: ["off"],
    supportsImages: false,
  });
  await serviceShutdown;
});

test("session discovery coalesces model scans and drains one before shutdown", async (t) => {
  const environment = await createPiEnvironment();
  const entryPoint = join(environment.root, "fake-pi.mjs");
  const report = join(environment.root, "model-list-count.txt");
  await writeFile(
    entryPoint,
    `import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
if (args.includes("--version")) process.stdout.write("1.4.0\\n");
else if (args.includes("--list-models")) {
  appendFileSync(${JSON.stringify(report)}, "listed\\n");
  await new Promise((resolve) => setTimeout(resolve, 100));
  process.stdout.write("provider    model       context  max-out  thinking  images\\ndwell-test  dwell-test  8K       1K       no        no\\n");
} else process.exitCode = 2;
`,
  );
  const service = await SessionService.create({
    dataDir: join(environment.root, "dwell-service"),
    env: environment.env,
  });
  t.after(async () => {
    await service.shutdown();
    await environment.cleanup();
  });
  await service.configure({ executable: process.execPath, entryPoint });
  const listing = await service.listDirectories(environment.root);
  assert.equal(listing.path, await realpath(environment.root));

  const firstDiscovery = service.listAvailableModels();
  const secondDiscovery = service.listAvailableModels();
  const shutdown = service.shutdown();
  const [first, second] = await Promise.all([firstDiscovery, secondDiscovery]);
  await shutdown;

  assert.deepEqual(first, [{ provider: "dwell-test", id: "dwell-test", supportsImages: false }]);
  assert.deepEqual(second, first);
  assert.equal((await readFile(report, "utf8")).trim().split("\n").length, 1);
});
