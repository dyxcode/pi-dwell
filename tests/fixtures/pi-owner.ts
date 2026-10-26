import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PiProcess } from "../../src/runtime/pi-process.ts";

const root = process.argv[2];
const executable = process.env.DWELL_TEST_PI_EXECUTABLE;
if (!root || !executable) throw new Error("Provide an isolated root and Pi executable.");
const entryPoint = process.env.DWELL_TEST_PI_ENTRY;
const pi = await PiProcess.start({
  executable,
  ...(entryPoint ? { entryPoint } : {}),
  cwd: join(root, "cwd"),
  env: process.env,
  sessionDirectory: join(root, "sessions"),
  provider: "dwell-test",
  model: "dwell-test",
  extensions: [fileURLToPath(new URL("./pi-extension.ts", import.meta.url))],
});
let announced = false;
pi.subscribe((event) => {
  if (!announced && event.type === "message_update") {
    announced = true;
    process.stdout.write(`${pi.pid}\n`);
  }
});
await pi.run("slow");
await pi.stop();
