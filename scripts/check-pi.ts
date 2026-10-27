import { spawn } from "node:child_process";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const [executable, entryPoint, ...extra] = process.argv.slice(2);
if (
  !executable ||
  !isAbsolute(executable) ||
  (entryPoint !== undefined && !isAbsolute(entryPoint)) ||
  extra.length > 0
) {
  console.error(
    "Usage: npm run check:pi -- /absolute/path/to/pi\n   or: npm run check:pi -- /absolute/path/to/node /absolute/path/to/pi-cli.js",
  );
  process.exitCode = 1;
} else {
  const test = fileURLToPath(new URL("../tests/runtime.test.ts", import.meta.url));
  // The installed binary suite starts Pi repeatedly; allow the file to finish while
  // keeping each test's explicit timeout in runtime.test.ts.
  const child = spawn(process.execPath, ["--test", "--test-timeout=60000", test], {
    stdio: "inherit",
    env: {
      ...process.env,
      DWELL_TEST_PI_EXECUTABLE: executable,
      DWELL_TEST_PI_ENTRY: entryPoint ?? "",
    },
    shell: false,
  });
  child.once("error", () => {
    console.error("Cannot start the Pi compatibility tests.");
    process.exitCode = 1;
  });
  const interrupt = () => {
    child.kill("SIGTERM");
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  child.once("exit", (code) => {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    process.exitCode = code ?? 1;
  });
}
