import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SessionService } from "../../src/sessions/service.ts";

const [dataDir, directory, extensionPath, target, requestId] = process.argv.slice(2);
if (!dataDir || !directory || !extensionPath || !target || !requestId)
  throw new Error("Missing fixture arguments.");
const service = await SessionService.create({
  dataDir,
  env: process.env,
  extensions: [extensionPath],
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
