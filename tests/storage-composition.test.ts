import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openDistill, type DistillStorage } from "../src/integrations/distill.ts";
import { startHost, type RunningHost } from "../src/server/http.ts";
import { isSessionInfo } from "../src/shared/sessions.ts";
import { isTurnInfo, type TurnInfo } from "../src/shared/turns.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const distillModule = process.env.DWELL_TEST_DISTILL_MODULE;
const currentModule = process.env.DWELL_TEST_CURRENT_MODULE;
const rpcEntryPoint = fileURLToPath(
  import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry"),
);

interface CurrentWriter {
  save(request: unknown): Promise<unknown>;
  close(): Promise<unknown>;
}

interface CurrentModule {
  contentLibraryApiVersion: 1;
  openContentLibrary(options: { root: string }): unknown;
}

interface CompositionCase {
  name: string;
  withDistill: boolean;
  withCurrent: boolean;
}

const cases: CompositionCase[] = [
  { name: "standalone", withDistill: false, withCurrent: false },
  { name: "Distill only", withDistill: true, withCurrent: false },
  { name: "Current only", withDistill: false, withCurrent: true },
  { name: "Distill and Current", withDistill: true, withCurrent: true },
];

for (const configuration of cases) {
  const missing =
    (configuration.withDistill && !distillModule) || (configuration.withCurrent && !currentModule);
  test(`storage composition: ${configuration.name} supports native sessions and restart`, {
    skip: missing
      ? `Set ${configuration.withDistill && !distillModule ? "DWELL_TEST_DISTILL_MODULE" : "DWELL_TEST_CURRENT_MODULE"} to the built integration module.`
      : false,
  }, async (t) => {
    const environment = await createPiEnvironment();
    const dataDir = join(environment.root, `dwell-${configuration.name.replaceAll(" ", "-")}`);
    const currentRoot = join(environment.root, "current-library");
    const distillDatabase = join(environment.root, "distill.sqlite");
    let writer: CurrentWriter | undefined;
    let inspector: DistillStorage | undefined;
    let host: RunningHost | undefined;

    t.after(async () => {
      try {
        await host?.close();
      } finally {
        try {
          inspector?.close();
        } finally {
          try {
            await writer?.close();
          } finally {
            await environment.cleanup();
          }
        }
      }
    });

    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    let exactReference: { binding: string; itemId: string; versionId: string } | undefined;
    if (configuration.withCurrent) {
      assert.ok(currentModule);
      const current: unknown = await import(pathToFileURL(currentModule).href);
      writer = openCurrentWriter(current, currentRoot);
      const original = await saveCurrentVersion(writer, "article-one", "Original exact version.");
      await saveCurrentVersion(writer, "article-one", "Newer current version.");
      exactReference = {
        binding: "composition-current",
        itemId: original.itemId,
        versionId: original.versionId,
      };
    }
    if (configuration.withDistill) {
      assert.ok(distillModule);
      inspector = await openDistill({ module: distillModule, database: distillDatabase });
    }

    const integrations = {
      version: 1,
      ...(configuration.withDistill
        ? { distill: { module: distillModule, database: distillDatabase } }
        : {}),
      ...(configuration.withCurrent
        ? {
            current: {
              module: currentModule,
              root: currentRoot,
              binding: "composition-current",
            },
          }
        : {}),
    };
    if (configuration.withDistill || configuration.withCurrent)
      await writeFile(join(dataDir, "integrations.json"), JSON.stringify(integrations), {
        mode: 0o600,
      });

    const options = {
      port: 0,
      dataDir,
      sessions: { env: environment.env, extensions: [environment.extensionPath] },
    };
    host = await startHost(options);
    const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
    const request = (path: string, body?: unknown) =>
      fetch(`${host?.url}/api/v1${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const configured = await request("/runtime", {
      executable: process.execPath,
      entryPoint: rpcEntryPoint,
    });
    assert.equal(configured.status, 200);
    const created = await request("/sessions", {
      requestId: randomUUID(),
      directory: environment.cwd,
      provider: "dwell-test",
      model: "dwell-test",
    });
    assert.equal(created.status, 201);
    const session: unknown = await created.json();
    assert.ok(isSessionInfo(session));

    if (exactReference) {
      const contextResponse = await request(`/sessions/${session.id}/context`);
      assert.equal(contextResponse.status, 200);
      const contextBefore: unknown = await contextResponse.json();
      const added = await request(`/sessions/${session.id}/library-references`, exactReference);
      assert.equal(added.status, 200);
      assert.deepEqual(await added.json(), { references: [exactReference] });
      const contextAfterResponse = await request(`/sessions/${session.id}/context`);
      assert.equal(contextAfterResponse.status, 200);
      assert.deepEqual(await contextAfterResponse.json(), contextBefore);
    }

    if (inspector) {
      const use = inspector
        .listPendingHostUses()
        .find((item) => item.sessionId === session.piSessionId);
      assert.ok(use);
      assert.equal(use.state, "attached");
      assert.ok(use.child);
    }

    const admitted = await request(`/sessions/${session.id}/turns`, {
      requestId: randomUUID(),
      message: "hello",
    });
    assert.equal(admitted.status, 202);
    const turn: unknown = await admitted.json();
    assert.ok(isTurnInfo(turn));
    const completed = await waitForTurn(request, session.id, turn.runId);
    assert.equal(completed.status, "completed");
    if (exactReference) {
      const piContext = await request(`/sessions/${session.id}/context`);
      assert.equal(piContext.status, 200);
      assert.ok(
        !(await piContext.text()).includes("Original exact version."),
        "saved Current text is not injected into Pi context",
      );
    }

    const history = await request(`/sessions/${session.id}/history`);
    assert.equal(history.status, 200);
    const historyValue: unknown = await history.json();
    assert.ok(isRecord(historyValue) && Array.isArray(historyValue.entries));
    assert.ok(historyValue.entries.length > 0);

    const renamed = await request(`/sessions/${session.id}/name`, {
      displayName: "Shared composition session",
      expectedRevision: 0,
    });
    assert.equal(renamed.status, 200);
    const renamedSession: unknown = await renamed.json();
    assert.ok(isSessionInfo(renamedSession));
    assert.equal(renamedSession.displayName, "Shared composition session");
    assert.equal(renamedSession.metadataRevision, 1);

    const closed = await request(`/sessions/${session.id}/close`, {});
    assert.equal(closed.status, 200);
    const closedSession: unknown = await closed.json();
    assert.ok(isSessionInfo(closedSession));
    assert.equal(closedSession.runtimeState, "closed");
    if (inspector) assert.deepEqual(inspector.listPendingHostUses(), []);

    await host.close();
    host = undefined;
    host = await startHost(options);
    const afterRestart = await request(`/sessions/${session.id}`);
    assert.equal(afterRestart.status, 200);
    const persisted: unknown = await afterRestart.json();
    assert.ok(isSessionInfo(persisted));
    assert.equal(persisted.displayName, "Shared composition session");
    assert.equal(persisted.metadataRevision, 1);
    assert.equal(persisted.runtimeState, "closed");

    const savedHistory = await request(`/sessions/${session.id}/history`);
    assert.equal(savedHistory.status, 200);
    const savedHistoryValue: unknown = await savedHistory.json();
    assert.ok(isRecord(savedHistoryValue) && Array.isArray(savedHistoryValue.entries));
    assert.ok(savedHistoryValue.entries.length > 0);

    if (exactReference) {
      const references = await request(`/sessions/${session.id}/library-references`);
      assert.equal(references.status, 200);
      assert.deepEqual(await references.json(), { references: [exactReference] });
      const exact = await request(
        `/library/${exactReference.binding}/items/${exactReference.itemId}/versions/${exactReference.versionId}`,
      );
      assert.equal(exact.status, 200);
      const exactView: unknown = await exact.json();
      assert.ok(isRecord(exactView));
      assert.equal(
        exactView.reference && isRecord(exactView.reference) && exactView.reference.versionId,
        exactReference.versionId,
      );
      assert.equal(exactView.text, "Original exact version.");
    }

    if (inspector) {
      const opened = await request(`/sessions/${session.id}/open`, {});
      assert.equal(opened.status, 200);
      const use = inspector
        .listPendingHostUses()
        .find((item) => item.sessionId === session.piSessionId);
      assert.ok(use?.child && use.sessionFile);
      const read = inspector.acquireSourceRead({
        sessionId: session.piSessionId,
        sessionFile: use.sessionFile,
        cwd: use.cwd,
        ...(use.sourceGeneration === null ? {} : { sourceGeneration: use.sourceGeneration }),
      });
      assert.ok(read, "a short source read can join the reopened session identity");
      read.release();
      const closedAgain = await request(`/sessions/${session.id}/close`, {});
      assert.equal(closedAgain.status, 200);
      assert.deepEqual(inspector.listPendingHostUses(), []);
    }
  });
}

async function waitForTurn(
  request: (path: string, body?: unknown) => Promise<Response>,
  sessionId: string,
  runId: string,
): Promise<TurnInfo> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await request(`/sessions/${sessionId}/turns/${runId}`);
    assert.equal(response.status, 200);
    const value: unknown = await response.json();
    assert.ok(isTurnInfo(value));
    if (["completed", "failed", "aborted", "interrupted"].includes(value.status)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Pi turn ${runId} did not finish before the deadline.`);
}

async function saveCurrentVersion(
  writer: CurrentWriter,
  externalId: string,
  text: string,
): Promise<{ itemId: string; versionId: string }> {
  const now = new Date().toISOString();
  const saved: unknown = await writer.save({
    batch: {
      id: randomUUID(),
      sourceId: "composition-test",
      collectedAt: now,
      items: [
        {
          sourceId: "composition-test",
          externalId,
          url: "https://example.test/composition-fixture",
          title: "Synthetic composition fixture",
          text,
          retrievedAt: now,
          discoveredAt: now,
          sourceCompleteness: "unknown",
          truncated: false,
        },
      ],
      failures: [],
      stopReason: "complete",
    },
    requestedCount: 1,
    startedAt: now,
  });
  if (!isRecord(saved) || !Array.isArray(saved.items))
    throw new Error("Current save returned an invalid library batch.");
  const item: unknown = saved.items[0];
  if (!isRecord(item) || typeof item.itemId !== "string" || typeof item.versionId !== "string")
    throw new Error("Current save returned an invalid library item.");
  return { itemId: item.itemId, versionId: item.versionId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCurrentModule(value: unknown): value is CurrentModule {
  return (
    isRecord(value) &&
    value.contentLibraryApiVersion === 1 &&
    typeof value.openContentLibrary === "function"
  );
}

function isCurrentWriter(value: unknown): value is CurrentWriter {
  return isRecord(value) && typeof value.save === "function" && typeof value.close === "function";
}

function openCurrentWriter(moduleValue: unknown, root: string): CurrentWriter {
  if (!isCurrentModule(moduleValue))
    throw new Error("Current module does not expose content library API v1.");
  const writer = moduleValue.openContentLibrary({ root });
  if (!isCurrentWriter(writer))
    throw new Error("Current library does not expose save and close operations.");
  return writer;
}
