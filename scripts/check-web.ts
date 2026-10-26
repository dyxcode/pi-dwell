import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { startHost } from "../src/server/http.ts";
import { createPiEnvironment } from "../tests/fixtures/pi-environment.ts";

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return Object.fromEntries(Object.entries(value));
}
class BrowserPage {
  readonly socket: WebSocket;
  readonly errors: string[] = [];
  #id = 0;
  #requests = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      const value = record(JSON.parse(String(event.data)));
      if (typeof value.id === "number") {
        const pending = this.#requests.get(value.id);
        this.#requests.delete(value.id);
        if (value.error) pending?.reject(new Error(JSON.stringify(value.error)));
        else pending?.resolve(value.result);
      } else if (value.method === "Runtime.exceptionThrown")
        this.errors.push(JSON.stringify(value.params));
    });
  }
  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener("open", () => resolve(), { once: true });
      this.socket.addEventListener("error", () => reject(new Error("Browser connection failed.")), {
        once: true,
      });
    });
    await this.call("Page.enable");
    await this.call("Runtime.enable");
  }
  call(method: string, params: unknown = {}): Promise<unknown> {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requests.delete(id);
        reject(new Error(`Browser command timed out: ${method}`));
      }, 15_000);
      this.#requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression: string): Promise<unknown> {
    const value = record(
      await this.call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }),
    );
    if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails));
    return record(value.result).value;
  }
  async until(expression: string): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(`Browser condition timed out: ${expression}`);
  }
  async click(selector: string): Promise<void> {
    await this.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
  async type(selector: string, text: string): Promise<void> {
    await this.evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
  }
}
const environment = await createPiEnvironment();
let host: Awaited<ReturnType<typeof startHost>> | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
const pages: BrowserPage[] = [];
try {
  const dataDir = join(environment.root, "host");
  await writeFile(
    join(environment.agentDir, "models.json"),
    JSON.stringify({
      providers: {
        "dwell-test": {
          baseUrl: "http://127.0.0.1:1/v1",
          apiKey: "synthetic-key",
          api: "openai-completions",
          models: [
            { id: "dwell-test", name: "Dwell test model", contextWindow: 8192, maxTokens: 1024 },
          ],
        },
      },
    }),
    { mode: 0o600 },
  );
  host = await startHost({
    port: 0,
    dataDir,
    sessions: { env: environment.env, extensions: [environment.extensionPath] },
  });
  const token = (await readFile(join(dataDir, "auth-token"), "utf8")).trim();
  const request = async (path: string, body?: unknown) => {
    const response = await fetch(`${host?.url}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.ok(response.ok, `${path}: ${response.status}`);
    return response.json();
  };
  await request("/runtime", {
    executable: process.execPath,
    entryPoint: fileURLToPath(
      new URL("./cli.js", import.meta.resolve("@earendil-works/pi-coding-agent/rpc-entry")),
    ),
  });
  let session = record(
    await request("/sessions", {
      requestId: randomUUID(),
      directory: environment.cwd,
      provider: "dwell-test",
      model: "dwell-test",
    }),
  );
  assert.equal(typeof session.id, "string");
  const executable =
    process.argv[2] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const profile = join(environment.root, "browser");
  chrome = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  chrome.on("error", (error) => {
    process.stderr.write(`Chrome: ${error.message}\n`);
  });
  let port = "";
  for (let i = 0; i < 100; i++) {
    try {
      port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0] ?? "";
      if (port) break;
    } catch {
      /* wait for Chrome */
    }
    await delay(100);
  }
  assert.match(port, /^\d+$/);
  async function page(): Promise<BrowserPage> {
    const target = record(
      await (
        await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
      ).json(),
    );
    assert.equal(typeof target.webSocketDebuggerUrl, "string");
    const result = new BrowserPage(String(target.webSocketDebuggerUrl));
    pages.push(result);
    await result.open();
    await result.call("Page.navigate", { url: host?.url });
    return result;
  }
  const first = await page();
  await first.until(
    '!document.querySelector("#gate").hidden && !document.querySelector("#pair-button").disabled',
  );
  const pairing = record(await request("/auth/pairings", {}));
  await first.type("#pair-code", String(pairing.code));
  await first.click("#pair-button");
  await first.until(
    '!document.querySelector("#app").hidden && !document.querySelector("#message").disabled',
  );
  console.log("PASS real browser pairing and session selection");
  await first.click("#new-session");
  await first.until(
    'document.querySelector("#model").options.length>0 && !document.querySelector("#create-button").disabled',
  );
  await first.type("#directory", environment.cwd);
  await first.type("#session-name", "Browser conversation");
  await first.click("#create-button");
  await first.until(
    '!document.querySelector("#new-dialog").open && document.querySelector("#session-list .active").textContent.includes("Browser conversation")',
  );
  const listed: unknown = await request("/sessions");
  assert.ok(Array.isArray(listed));
  const created = listed.map(record).find((item) => item.id !== session.id);
  assert.ok(created);
  session = created;
  console.log("PASS real directory/model discovery and browser-created Pi session");
  await first.type("#message", "hello");
  await first.click("#send");
  await first.until(
    'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.") && document.querySelector("#send").getAttribute("aria-label")==="Send message"',
  );
  assert.equal(
    await first.evaluate('document.querySelectorAll("#conversation .assistant").length'),
    1,
  );
  console.log("PASS real Pi turn and history/live convergence");
  await first.call("Page.reload");
  await first.until(
    'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
  );
  const second = await page();
  await second.until(
    'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
  );
  await first.type("#message", "slow");
  await first.click("#send");
  await second.until(
    'document.querySelector("#conversation").textContent.includes("dwell-slow-start")',
  );
  await first.call("Page.navigate", { url: "about:blank" });
  assert.ok(record(await request(`/sessions/${String(session.id)}`)).activeTurnId);
  await second.until(
    'document.querySelector("#send").getAttribute("aria-label")==="Stop response"',
  );
  await second.click("#send");
  await second.until('document.querySelector("#session-list").textContent.includes("Stopped")');
  console.log("PASS two browsers, detach without cancellation, and explicit stop");
  await second.type("#message", '<img src=x onerror="window.__unsafe=1">');
  await second.click("#send");
  await second.until(
    'document.querySelector("#conversation").textContent.includes("Received: <img")',
  );
  assert.equal(await second.evaluate('document.querySelectorAll("#conversation img").length'), 0);
  await second.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assert.ok(
    await second.evaluate('document.querySelector("#composer").getBoundingClientRect().height<=58'),
  );
  await second.type("#message", "One\nTwo\nThree");
  assert.ok(
    await second.evaluate('document.querySelector("#composer").getBoundingClientRect().height>85'),
  );
  await second.type("#message", "");
  await second.click("#open-nav");
  assert.ok(await second.evaluate('document.querySelector("#rail").classList.contains("open")'));
  await second.click("#close-nav");
  assert.ok(
    await second.evaluate(
      'document.querySelector("#new-mobile").getClientRects().length>0 && document.querySelector("#new-session").getClientRects().length===0',
    ),
  );
  await second.click("#new-mobile");
  await second.until('document.querySelector("#new-dialog").open');
  await second.click("#close-new");
  console.log(
    "PASS safe text rendering, mobile drawer, top-right new action, and adaptive composer",
  );
  const hostPort = Number(new URL(host.url).port);
  await host.close();
  host = await startHost({
    port: hostPort,
    dataDir,
    sessions: { env: environment.env, extensions: [environment.extensionPath] },
  });
  await second.until(
    'document.querySelector("#connection-badge").textContent==="Connected" && document.querySelector("#conversation").textContent.includes("Received: <img")',
  );
  console.log("PASS host restart reconnects with saved history");
  await request("/auth/revoke", {});
  await second.until('!document.querySelector("#gate").hidden');
  console.log("PASS revocation closes the live browser session");
  for (const browser of pages) assert.deepEqual(browser.errors, []);
} finally {
  for (const browser of pages) browser.socket.close();
  if (chrome && chrome.exitCode === null) {
    const exited = new Promise<void>((resolve) => chrome?.once("exit", () => resolve()));
    chrome.kill("SIGTERM");
    await Promise.race([exited, delay(3000)]);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
  }
  await host?.close();
  await environment.cleanup();
}
