import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { openDistill } from "../src/integrations/distill.ts";
import { SessionService } from "../src/sessions/service.ts";
import { createPiEnvironment } from "./fixtures/pi-environment.ts";

const module = process.env.DWELL_TEST_DISTILL_MODULE;

test("configured Distill use follows fresh Pi startup, close and reopen", {
  skip: !module,
}, async (t) => {
  assert.ok(module);
  const env = await createPiEnvironment();
  const distill = await openDistill({ module, database: join(env.root, "memory.sqlite") });
  const options = {
    dataDir: join(env.root, "dwell"),
    env: env.env,
    extensions: [env.extensionPath],
    distill,
  };
  const service = await SessionService.create(options);
  t.after(async () => {
    await service.shutdown();
    distill.close();
    await env.cleanup();
  });
  await service.configure({
    executable: process.execPath,
    entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
  });
  const session = await service.createSession({
    requestId: randomUUID(),
    directory: env.cwd,
    provider: "dwell-test",
    model: "dwell-test",
  });
  assert.equal(session.runtimeState, "ready");
  const uses = distill.listPendingHostUses();
  assert.equal(uses.length, 1);
  assert.equal(uses[0]?.state, "attached");
  assert.equal(uses[0]?.sessionFile, null);
  const { turn } = await service.submitTurn(session.id, {
    requestId: randomUUID(),
    message: "hello",
  });
  const deadline = Date.now() + 10000;
  while (
    service.getTurn(session.id, turn.runId).status !== "completed" ||
    service.getSession(session.id).activeTurnId !== null
  ) {
    assert.ok(Date.now() < deadline, "Pi turn did not complete");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const history = await service.getHistory(session.id);
  assert.ok(history.entries.length > 0);
  const gate = distill.acquireSourceRead({
    sessionId: session.piSessionId,
    sessionFile: join(env.root, "another-source.jsonl"),
    cwd: env.cwd,
  });
  assert.ok(gate);
  try {
    const closed = await service.closeSession(session.id);
    assert.equal(closed.runtimeState, "closed");
    assert.deepEqual(distill.listPendingHostUses(), []);
  } finally {
    gate.release();
  }
  await service.openSession(session.id);
  assert.equal(distill.listPendingHostUses().length, 1);
  assert.ok(distill.listPendingHostUses()[0]?.sessionFile?.endsWith(".jsonl"));
  await service.shutdown();
  assert.deepEqual(distill.listPendingHostUses(), []);
});
