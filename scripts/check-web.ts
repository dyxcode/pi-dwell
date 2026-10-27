import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { startHost } from "../src/server/http.ts";
import { createHttpsProxy, type HttpsProxyFixture } from "../tests/fixtures/https-proxy.ts";
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
    await this.call("Network.enable");
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
type BrowserMode = "http" | "https";
const ALTERNATE_MODEL = "dwell-test-alt";

async function assertComposerLayout(page: BrowserPage, viewport: string): Promise<void> {
  assert.equal(
    await page.evaluate(`(()=>{
      const context=document.querySelector("#composer-context");
      const directory=document.querySelector("#composer-directory");
      const choose=document.querySelector("#choose-model");
      const input=document.querySelector("#message");
      if(!(context instanceof HTMLElement)||!(directory instanceof HTMLElement)||!(choose instanceof HTMLElement)||!(input instanceof HTMLElement)) return false;
      const row=context.getBoundingClientRect();
      const path=directory.getBoundingClientRect();
      const button=choose.getBoundingClientRect();
      const field=input.getBoundingClientRect();
      const form=document.querySelector("#composer");
      return row.height<=44 &&
        Math.abs((path.top+path.bottom)/2-(button.top+button.bottom)/2)<=8 &&
        row.bottom<=field.top+1 && field.top-row.bottom<=18 &&
        row.left>=0 && row.right<=innerWidth+1 &&
        path.left>=row.left && path.right<=row.right+1 &&
        button.left>=row.left && button.right<=row.right+1 &&
        form instanceof HTMLElement && form.scrollWidth<=form.clientWidth+1 &&
        document.documentElement.scrollWidth<=innerWidth+1;
    })()`),
    true,
    `${viewport} composer context stays compact, on one line above the input, and within the viewport`,
  );
}

async function assertInputGrows(page: BrowserPage, viewport: string): Promise<void> {
  const before = Number(
    await page.evaluate('document.querySelector("#message").getBoundingClientRect().height'),
  );
  await page.type("#message", "One\nTwo\nThree");
  const after = Number(
    await page.evaluate('document.querySelector("#message").getBoundingClientRect().height'),
  );
  assert.ok(after > before + 30, `${viewport} composer input grows for multiline text`);
  await page.type("#message", "");
}

const args = process.argv.slice(2);
const browserExecutables = args.filter((argument) => !argument.startsWith("--"));
assert.ok(browserExecutables.length <= 1, "Provide at most one Chrome executable path.");
assert.ok(!(args.includes("--https") && args.includes("--http")), "Choose one browser mode flag.");
const executable =
  browserExecutables[0] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const modes: BrowserMode[] = args.includes("--https")
  ? ["https"]
  : args.includes("--http")
    ? ["http"]
    : ["http", "https"];

for (const mode of modes) {
  const environment = await createPiEnvironment();
  const longPathParts = [
    `directory-${"a".repeat(58)}`,
    `nested-${"b".repeat(58)}`,
    `project-${"c".repeat(58)}`,
  ];
  let longDirectory = join(environment.root, ...longPathParts);
  let host: Awaited<ReturnType<typeof startHost>> | undefined;
  let chrome: ReturnType<typeof spawn> | undefined;
  let proxy: HttpsProxyFixture | undefined;
  const pages: BrowserPage[] = [];
  try {
    await mkdir(longDirectory, { recursive: true, mode: 0o700 });
    longDirectory = await realpath(longDirectory);
    const dataDir = join(environment.root, `host-${mode}`);
    if (mode === "https") {
      proxy = await createHttpsProxy(join(environment.root, "https-proxy"));
      await mkdir(dataDir, { mode: 0o700 });
      await writeFile(
        join(dataDir, "access.json"),
        JSON.stringify({ version: 1, browserOrigin: proxy.origin }),
        { mode: 0o600 },
      );
    }
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
              {
                id: ALTERNATE_MODEL,
                name: "Dwell alternate model",
                contextWindow: 8192,
                maxTokens: 1024,
              },
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
    proxy?.setUpstreamPort(Number(new URL(host.url).port));
    const browserOrigin = proxy?.origin ?? host.url;
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
    const profile = join(environment.root, `browser-${mode}`);
    chrome = spawn(
      executable,
      [
        "--headless=new",
        "--disable-gpu",
        "--disable-background-networking",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profile}`,
        ...(proxy ? [`--ignore-certificate-errors-spki-list=${proxy.certificateSpki}`] : []),
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
      await result.call("Page.navigate", { url: browserOrigin });
      return result;
    }
    const first = await page();
    await first.until(
      'document.querySelector("#gate-message")?.textContent === "Pair this browser to connect." && !document.querySelector("#pair-button").disabled',
    );
    const pairing = record(await request("/auth/pairings", {}));
    assert.match(String(pairing.code), /^[A-HJ-NP-Za-hj-np-z2-9]{8}$/);
    for (const [value, valid] of [
      ["AbCd2345", true],
      ["abcdefgh", true],
      ["ABCDEFGH", true],
      ["AbCd234", false],
      ["AbCd-2345", false],
      ["AbCd234O", false],
      ["AbCd234i", false],
    ] as const) {
      assert.equal(
        await first.evaluate(`(() => {
          const input = document.querySelector('#pair-code');
          input.value = ${JSON.stringify(value)};
          return input.checkValidity();
        })()`),
        valid,
      );
    }
    await first.type("#pair-code", "");
    await first.evaluate("document.querySelector('#pair-code').focus()");
    await first.call("Input.insertText", { text: ` ${String(pairing.code)} ` });
    assert.equal(await first.evaluate("document.querySelector('#pair-code').value"), pairing.code);
    await first.click("#pair-button");
    await first.until(
      '!document.querySelector("#app").hidden && !document.querySelector("#message").disabled',
    );
    console.log(`PASS ${mode} real browser pairing and session selection`);
    if (proxy) {
      const proxyOrigin = proxy.origin;
      const certificate = proxy.certificate;
      const localAuthority = new URL(host.url).host;
      const spoofed = await new Promise<number>((resolve, reject) => {
        const request = httpsRequest(
          `${proxyOrigin}/api/v1/auth/pairings`,
          {
            method: "POST",
            ca: certificate,
            headers: {
              Host: localAuthority,
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
          (response) => {
            response.resume();
            response.on("error", reject);
            response.on("end", () => resolve(response.statusCode ?? 0));
          },
        );
        request.on("error", reject);
        request.end("{}");
      });
      assert.equal(spoofed, 403, "proxy cannot select the local CLI lane with a forged Host");
      const cookieList = record(await first.call("Network.getAllCookies"));
      assert.ok(Array.isArray(cookieList.cookies));
      const browserCookie = cookieList.cookies
        .map(record)
        .find((cookie) => cookie.name === "__Host-dwell_browser_production");
      assert.ok(browserCookie);
      assert.equal(browserCookie.domain, "127.0.0.1");
      assert.equal(browserCookie.path, "/");
      assert.equal(browserCookie.secure, true);
      assert.equal(browserCookie.httpOnly, true);
      assert.equal(browserCookie.sameSite, "Strict");
      assert.equal(await first.evaluate("document.cookie"), "");
      assert.equal(
        await first.evaluate("fetch('/api/v1/sessions').then(response => response.status)"),
        401,
      );
      console.log("PASS HTTPS Secure cookie and missing browser binding rejection");
    }
    await first.click("#new-session");
    await first.until('document.querySelector("#new-dialog").open');
    assert.equal(
      await first.evaluate(
        'document.querySelector("#model") === null && document.querySelector("#session-name") === null',
      ),
      true,
      "new conversations use the native Pi default model and have no name field",
    );
    await first.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      window.__dwellCreateRequestBody=null;
      window.fetch=async(input,init)=>{
        const target=typeof input==="string"?input:input.url;
        if(new URL(target,location.href).pathname==="/api/v1/sessions"&&init?.method==="POST")
          window.__dwellCreateRequestBody=String(init.body);
        return original(input,init);
      };
    })()`);
    await first.type("#directory", longDirectory);
    await first.click("#create-button");
    await first.until(
      `!document.querySelector("#new-dialog").open && document.querySelector("#session-list .active")?.textContent.includes(${JSON.stringify(longPathParts.at(-1))})`,
    );
    const listed: unknown = await request("/sessions");
    assert.ok(Array.isArray(listed));
    const created = listed.map(record).find((item) => item.id !== session.id);
    assert.ok(created);
    session = created;
    const createBody = record(
      JSON.parse(String(await first.evaluate("window.__dwellCreateRequestBody"))),
    );
    assert.deepEqual(Object.keys(createBody).sort(), ["directory", "requestId"]);
    assert.equal(created.directory, longDirectory);
    assert.equal(created.provider, "dwell-test");
    assert.equal(created.model, "dwell-test");
    assert.equal(
      await first.evaluate('document.querySelector("#composer-directory").textContent.trim()'),
      longDirectory,
    );
    await assertComposerLayout(first, "desktop");
    await assertInputGrows(first, "desktop");
    console.log(`PASS ${mode} directory-only browser creation uses the native Pi default model`);
    await first.type("#message", "hello");
    await first.click("#send");
    await first.until(
      'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.") && document.querySelector("#send").getAttribute("aria-label")==="Send message"',
    );
    assert.equal(
      await first.evaluate('document.querySelectorAll("#conversation .assistant").length'),
      1,
    );
    console.log(`PASS ${mode} real Pi turn and history/live convergence`);
    await first.call("Page.reload");
    await first.until(
      'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
    );
    const second = await page();
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
    );
    await second.until('document.querySelector("#model-label").textContent.trim()==="dwell-test"');
    assert.equal(
      await second.evaluate('document.querySelector("#composer-directory").textContent.trim()'),
      longDirectory,
    );
    await first.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      let release=()=>{};
      const gate=new Promise(resolve=>{release=resolve;});
      window.__dwellModelRequestObserved=false;
      window.__dwellModelDiscoveryMethod=null;
      window.__dwellModelDiscoveryOrigin=null;
      window.__dwellModelChangeMethod=null;
      window.__dwellModelChangeOrigin=null;
      window.__releaseDwellModelRequest=()=>{release();window.fetch=original;};
      window.fetch=async(input,init)=>{
        const target=typeof input==="string"?input:input.url;
        const url=new URL(target,location.href);
        if(url.pathname==="/api/v1/models"){
          window.__dwellModelDiscoveryMethod=init?.method??"GET";
          window.__dwellModelDiscoveryOrigin=url.origin;
        }
        const response=await original(input,init);
        if(url.pathname==="/api/v1/sessions/${String(session.id)}/model"){
          window.__dwellModelChangeMethod=init?.method??"GET";
          window.__dwellModelChangeOrigin=url.origin;
          window.__dwellModelRequestObserved=true;
          await gate;
        }
        return response;
      };
    })()`);
    await first.type("#message", "Keep this draft while changing models");
    await first.click("#choose-model");
    await first.until(
      'document.querySelector("#model-dialog").open && document.querySelectorAll("#model-options .model-option").length>=2',
    );
    assert.equal(await first.evaluate("window.__dwellModelDiscoveryMethod"), "GET");
    assert.equal(
      await first.evaluate("window.__dwellModelDiscoveryOrigin"),
      await first.evaluate("location.origin"),
    );
    assert.equal(
      await first.evaluate(
        'document.querySelector("#model-search") instanceof HTMLInputElement && document.querySelector("#close-model") instanceof HTMLButtonElement && document.querySelector("#model-error") !== null',
      ),
      true,
      "model chooser exposes search, close, and feedback controls",
    );
    await first.type("#model-search", ALTERNATE_MODEL);
    await first.until(
      `document.querySelectorAll("#model-options .model-option").length===1 && document.querySelector("#model-options .model-option").textContent.includes(${JSON.stringify(ALTERNATE_MODEL)})`,
    );
    await first.click("#model-options .model-option");
    await first.until("window.__dwellModelRequestObserved===true");
    assert.equal(await first.evaluate("window.__dwellModelChangeMethod"), "POST");
    assert.equal(
      await first.evaluate("window.__dwellModelChangeOrigin"),
      await first.evaluate("location.origin"),
    );
    assert.equal(
      await first.evaluate('document.querySelector("#choose-model").disabled'),
      true,
      "model changes are disabled while the update request is pending",
    );
    await second.until(
      `document.querySelector("#model-label").textContent.trim()===${JSON.stringify(ALTERNATE_MODEL)}`,
    );
    await first.evaluate("window.__releaseDwellModelRequest()");
    await first.until(
      `!document.querySelector("#model-dialog").open && document.querySelector("#model-label").textContent.trim()===${JSON.stringify(ALTERNATE_MODEL)}`,
    );
    assert.equal(
      await first.evaluate('document.querySelector("#message").value'),
      "Keep this draft while changing models",
    );
    const changedSession = record(await request(`/sessions/${String(session.id)}`));
    assert.equal(changedSession.provider, "dwell-test");
    assert.equal(changedSession.model, ALTERNATE_MODEL);
    await first.call("Page.reload");
    await first.until(
      `document.querySelector("#model-label").textContent.trim()===${JSON.stringify(ALTERNATE_MODEL)}`,
    );
    console.log(
      `PASS ${mode} model switch uses same-origin SSE, pending guard, and refresh persistence`,
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
    assert.equal(
      await second.evaluate('document.querySelector("#choose-model").disabled'),
      true,
      "model changes are disabled while a Pi turn is active",
    );
    await second.click("#send");
    await second.until('document.querySelector("#session-list").textContent.includes("Stopped")');
    console.log(`PASS ${mode} two browsers, detach without cancellation, and explicit stop`);
    await first.call("Page.navigate", { url: browserOrigin });
    await first.until(
      `!document.querySelector("#app").hidden && document.querySelector("#session-list").textContent.includes(${JSON.stringify(longPathParts.at(-1))})`,
    );
    await first.type("#message", "draft survives page suspension");
    await first.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))",
    );
    await second.type("#message", "page lifecycle wake");
    await second.click("#send");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Received: page lifecycle wake")',
    );
    assert.equal(
      await first.evaluate('document.querySelector("#message").value'),
      "draft survives page suspension",
    );
    await first.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))",
    );
    await first.until(
      'document.querySelector("#conversation").textContent.includes("Received: page lifecycle wake")',
    );
    assert.equal(
      await first.evaluate('document.querySelector("#message").value'),
      "draft survives page suspension",
    );
    assert.equal(
      await first.evaluate(
        'Array.from(document.querySelectorAll("#conversation .assistant")).filter((entry) => entry.textContent.includes("Received: page lifecycle wake")).length',
      ),
      1,
    );
    console.log(`PASS ${mode} pagehide/pageshow resumes live history without a duplicate turn`);
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
    await assertComposerLayout(second, "mobile");
    await assertInputGrows(second, "mobile");
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
      "PASS " +
        mode +
        " safe text rendering, mobile drawer, top-right new action, and adaptive composer",
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
    proxy?.setUpstreamPort(hostPort);
    console.log(`PASS ${mode} host restart reconnects with saved history`);
    assert.equal(
      await second.evaluate('document.querySelector("#notice").hidden'),
      true,
      "successful reconnection clears the obsolete stream error",
    );
    await request("/auth/revoke", {});
    await second.until('!document.querySelector("#gate").hidden');
    console.log(`PASS ${mode} revocation closes the live browser session`);
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
    await proxy?.close();
    await environment.cleanup();
  }
}
