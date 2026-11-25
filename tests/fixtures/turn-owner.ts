import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { openDistill } from "../../src/integrations/distill.ts";
import { SessionService } from "../../src/sessions/service.ts";

const [dataDir, directory, extensionPath, target, requestId] = process.argv.slice(2);
if (!dataDir || !directory || !extensionPath || !target || !requestId)
  throw new Error("Missing fixture arguments.");
const distillModule = process.env.DWELL_TEST_DISTILL_MODULE;
const database = process.env.DWELL_TEST_DISTILL_DATABASE;
const distillExtension = process.env.DWELL_TEST_DISTILL_EXTENSION;
const distill =
  distillModule && database ? await openDistill({ module: distillModule, database }) : undefined;
const service = await SessionService.create({
  dataDir,
  env: process.env,
  extensions: [extensionPath, ...(distillExtension ? [distillExtension] : [])],
  ...(distill ? { distill } : {}),
  turnCheckpoint: async (point, turn) => {
    if (point !== target) return;
    process.stdout.write(`${JSON.stringify({ point, turn })}\n`);
    await new Promise<void>(() => {});
  },
});
await service.configure({
  executable: process.execPath,
  entryPoint: fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
});
const session = await service.createSession({
  requestId: randomUUID(),
  directory,
  provider: "dwell-test",
  model: "dwell-test",
});
await service.submitTurn(session.id, {
  requestId,
  message: target === "running" ? "slow" : "hello",
});
