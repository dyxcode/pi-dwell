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
    throw new Error(
      `Browser condition timed out: ${expression}; ${JSON.stringify(await this.evaluate('({notice:document.querySelector("#notice")?.textContent,chat:document.querySelector("#conversation")?.textContent,send:document.querySelector("#send")?.outerHTML})'))}; errors=${JSON.stringify(this.errors)}`,
    );
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
  assert.equal(await page.evaluate("innerWidth > 760"), viewport === "desktop");
  assert.equal(
    await page.evaluate('getComputedStyle(document.querySelector("#message")).fontSize'),
    "15px",
  );
  assert.equal(
    await page.evaluate(
      'getComputedStyle(document.querySelector("#message"),"::placeholder").fontSize',
    ),
    "14px",
  );
  assert.equal(
    await page.evaluate('getComputedStyle(document.querySelector(".tab-symbol")).width'),
    viewport === "desktop" ? "20px" : "16px",
  );

  assert.equal(
    await page.evaluate(
      'getComputedStyle(document.querySelector("main>header")).display === "none"',
    ),
    false,
    "session status controls are visible on desktop and mobile",
  );
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

async function assertQuietProcessPresentation(page: BrowserPage, viewport: string): Promise<void> {
  assert.equal(
    await page.evaluate(`(async()=>{
      const {renderSavedConversation}=await import("/conversation.js");
      const block=(type,text,callId=null,name=null)=>({type,text,callId,name});
      const entry=(id,role,type,blocks,extra={})=>({
        id,parentId:null,timestamp:"2026-10-27T00:00:00.000Z",type,role,blocks,
        toolCallId:null,toolName:null,targetId:null,truncated:false,...extra
      });
      const longTitle="L".repeat(73);
      const entries=[
        entry("quiet-thinking","assistant","message",[
          block("thinking","# Planning the answer\\n\\nFirst reasoning sentence."),
          block("thinking","**Checking a boundary**\\n\\nSecond reasoning sentence."),
          block("thinking","Reasoning without a heading."),
          block("thinking","# "+longTitle+"\\n\\nLong heading body stays intact."),
          block("text","# Ordinary Markdown\\n\\n\`\`\`ts\\nconst answer = 42;\\n\`\`\`")
        ]),
        entry("quiet-success-call","assistant","message",[
          block("tool_call",'{"value":"safe"}',"quiet-success","echo")
        ]),
        entry("quiet-success-result","toolResult","toolResult",[
          block("text","synthetic success output")
        ],{toolCallId:"quiet-success",toolName:"echo"}),
        entry("quiet-error-call","assistant","message",[
          block("tool_call",'{"value":"error"}',"quiet-error","echo")
        ]),
        entry("quiet-error-result","toolResult","toolResult",[
          block("text","synthetic error output")
        ],{toolCallId:"quiet-error",toolName:"echo",error:true})
      ];
      const fixture=document.createElement("div");
      fixture.id="quiet-process-test-fixture";
      const focusSource=document.createElement("button");
      focusSource.id="quiet-process-focus-source";
      focusSource.type="button";
      focusSource.textContent="Keyboard focus source";
      focusSource.style.cssText="position:fixed;width:1px;height:1px;left:0;top:0;opacity:.01";
      fixture.append(focusSource,renderSavedConversation(entries));
      document.querySelector("#conversation").append(fixture);
      return true;
    })()`),
    true,
    `${viewport} imports and renders saved synthetic entries through the production conversation module`,
  );

  try {
    const rendered = await page.evaluate(`(()=>{
      const fixture=document.querySelector("#quiet-process-test-fixture");
      const thinking=[...fixture.querySelectorAll(".thinking-run")];
      const titles=thinking.map(details=>details.querySelector(":scope>summary").textContent);
      const bodies=thinking.map(details=>details.querySelector(".thinking-content").textContent);
      const tools=[...fixture.querySelectorAll(".tool-run")];
      const success=tools.find(details=>!details.classList.contains("error"));
      const error=tools.find(details=>details.classList.contains("error"));
      const code=fixture.querySelector(".markdown .code-block");
      return {
        titles,bodies,thinkingOpen:thinking.map(details=>details.open),
        successOpen:success.open,errorOpen:error.open,
        successStatus:success.querySelector(".tool-status").textContent,
        errorStatus:error.querySelector(".tool-status").textContent,
        thinkingTitleSize:getComputedStyle(thinking[0].querySelector(":scope>summary")).fontSize,
        thinkingBodySize:getComputedStyle(thinking[0].querySelector(".thinking-content")).fontSize,
        toolBackground:getComputedStyle(success).backgroundColor,
        toolErrorBackground:getComputedStyle(error).backgroundColor,
        toolTitleSize:getComputedStyle(success.querySelector(":scope>summary")).fontSize,
        toolOutputSize:getComputedStyle(success.querySelector(".tool-output")).fontSize,
        successStatusColor:getComputedStyle(success.querySelector(".tool-status")).color,
        errorStatusColor:getComputedStyle(error.querySelector(".tool-status")).color,
        markdownCodeBackground:getComputedStyle(code).backgroundColor,
        markdownCodeSize:getComputedStyle(code.querySelector("pre code")).fontSize,
        markdownCodeText:code.querySelector("pre code").textContent
      };
    })()`);
    const presentation = record(rendered);
    assert.ok(Array.isArray(presentation.bodies));
    const bodies = presentation.bodies;
    assert.deepEqual(presentation.titles, [
      "Planning the answer",
      "Checking a boundary",
      "Thinking",
      "Thinking",
    ]);
    assert.deepEqual(presentation.thinkingOpen, [false, false, false, false]);
    assert.ok(!String(bodies[0]).includes("Planning the answer"));
    assert.ok(!String(bodies[1]).includes("Checking a boundary"));
    assert.ok(String(bodies[0]).includes("First reasoning sentence."));
    assert.ok(String(bodies[1]).includes("Second reasoning sentence."));
    assert.ok(String(bodies[2]).includes("Reasoning without a heading."));
    assert.ok(String(bodies[3]).includes("L".repeat(73)));
    assert.ok(String(bodies[3]).includes("Long heading body stays intact."));
    assert.equal(presentation.thinkingTitleSize, "12px");
    assert.equal(presentation.thinkingBodySize, "13px");
    assert.equal(presentation.successOpen, false);
    assert.equal(presentation.errorOpen, true);
    assert.equal(presentation.successStatus, "✓");
    assert.equal(presentation.errorStatus, "Error");
    assert.notEqual(presentation.successStatusColor, presentation.errorStatusColor);
    assert.equal(presentation.toolBackground, "rgba(0, 0, 0, 0)");
    assert.equal(presentation.toolErrorBackground, "rgba(0, 0, 0, 0)");
    assert.equal(presentation.toolTitleSize, "12px");
    assert.equal(presentation.toolOutputSize, "12px");
    assert.equal(presentation.markdownCodeBackground, "rgb(235, 230, 219)");
    assert.equal(presentation.markdownCodeSize, "12px");
    assert.equal(presentation.markdownCodeText, "const answer = 42;");

    const context = record(
      await page.evaluate(`(()=>{
        const details=document.querySelector("#conversation .session-details");
        if(!details) return {present:false};
        const summary=details.querySelector(":scope>summary");
        const body=details.querySelector(".session-details-body");
        const titleLeft=()=>{
          const range=document.createRange();range.selectNodeContents(summary);
          return range.getBoundingClientRect().left;
        };
        const closedLeft=titleLeft();
        const marker=getComputedStyle(summary,"::before");
        details.open=true;
        const openLeft=titleLeft();
        details.open=false;
        return {
          present:true,closedLeft,openLeft,
          arrowWidth:marker.width,
          background:getComputedStyle(body).backgroundColor,
          divider:getComputedStyle(summary,"::after").backgroundColor
        };
      })()`),
    );
    assert.equal(context.present, true, "the existing saved Context remains present");
    assert.equal(context.background, "rgb(238, 232, 221)");
    assert.equal(context.divider, "rgb(221, 213, 200)");
    assert.equal(context.arrowWidth, "5px");
    assert.ok(Math.abs(Number(context.closedLeft) - Number(context.openLeft)) < 0.5);

    const arrow = record(
      await page.evaluate(`(()=>{
        const details=document.querySelector("#quiet-process-test-fixture .thinking-run");
        const summary=details.querySelector(":scope>summary");
        const geometry=()=>{
          const range=document.createRange();range.selectNodeContents(summary);
          const rect=range.getBoundingClientRect();
          const marker=getComputedStyle(summary,"::before");
          const summaryRect=summary.getBoundingClientRect();
          return {
            titleLeft:rect.left,titleTop:rect.top,summaryLeft:summaryRect.left,
            markerLeft:marker.left,markerTop:marker.top,markerWidth:marker.width,
            markerHeight:marker.height,markerX:summaryRect.left+Number.parseFloat(marker.left)
          };
        };
        const closed=geometry();
        details.open=true;
        const open=geometry();
        details.open=false;
        const scroll=document.querySelector("#scroll");
        return {
          closed,open,scrollLeft:scroll.getBoundingClientRect().left,
          scrollRight:scroll.getBoundingClientRect().right,
          scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth,
          documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth
        };
      })()`),
    );
    const openGeometry = record(arrow.open);
    const closedGeometry = record(arrow.closed);
    for (const key of [
      "titleLeft",
      "titleTop",
      "summaryLeft",
      "markerLeft",
      "markerTop",
      "markerWidth",
      "markerHeight",
    ])
      assert.equal(
        openGeometry[key],
        closedGeometry[key],
        `the ${key} of the left arrow/title stays fixed when toggled`,
      );
    assert.ok(Number(closedGeometry.markerX) >= Number(arrow.scrollLeft));
    assert.ok(Number(closedGeometry.markerX) < Number(arrow.scrollRight));
    assert.ok(Number(arrow.scrollWidth) <= Number(arrow.clientWidth) + 1);
    assert.ok(Number(arrow.documentWidth) <= Number(arrow.viewportWidth) + 1);

    await page.evaluate('document.querySelector("#quiet-process-focus-source").focus()');
    const tab = { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 };
    await page.call("Input.dispatchKeyEvent", tab);
    await page.call("Input.dispatchKeyEvent", { ...tab, type: "keyUp" });
    const focus = record(
      await page.evaluate(`(()=>{
        const summary=document.querySelector("#quiet-process-test-fixture .thinking-run>summary");
        const style=getComputedStyle(summary);
        return {active:document.activeElement===summary,outlineStyle:style.outlineStyle,outlineWidth:style.outlineWidth};
      })()`),
    );
    assert.equal(focus.active, true, "Tab moves keyboard focus to the thinking disclosure");
    assert.notEqual(focus.outlineStyle, "none", "keyboard focus has a visible outline");
    assert.notEqual(focus.outlineWidth, "0px", "keyboard focus outline has nonzero width");
  } finally {
    await page.evaluate('document.querySelector("#quiet-process-test-fixture")?.remove()');
  }
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

async function checkMobileKeyboard(page: BrowserPage): Promise<void> {
  await page.type("#message", "正在输入中文，保留光标");
  const before = record(
    await page.evaluate(`(()=>{
    const viewport=window.visualViewport;
    const original={height:viewport.height,offsetTop:viewport.offsetTop,scale:viewport.scale};
    const own=new Map(["height","offsetTop","scale"].map(key=>[key,Object.getOwnPropertyDescriptor(viewport,key)]));
    const metrics={...original};
    for(const key of own.keys()) Object.defineProperty(viewport,key,{configurable:true,get:()=>metrics[key]});
    window.__keyboardViewport=(height,offsetTop=0,scale=1)=>{
      Object.assign(metrics,{height,offsetTop,scale});
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    };
    window.__restoreKeyboardViewport=()=>{
      for(const [key,descriptor] of own) {
        if(descriptor) Object.defineProperty(viewport,key,descriptor);
        else delete viewport[key];
      }
      viewport.dispatchEvent(new Event("resize"));
    };
    const scroll=document.querySelector("#scroll"),input=document.querySelector("#message");
    input.focus({preventScroll:true});input.setSelectionRange(4,4);
    input.dispatchEvent(new CompositionEvent("compositionstart",{bubbles:true,data:"中文"}));
    scroll.scrollTop=scroll.scrollHeight;
    return {height:original.height,top:document.querySelector(".assistant:last-child").getBoundingClientRect().top,text:input.value,caret:input.selectionStart};
  })()`),
  );
  const settle = async () =>
    page.evaluate(
      "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
    );
  try {
    await page.evaluate(`window.__keyboardViewport(${Number(before.height) - 360},24)`);
    await settle();
    const opened = record(
      await page.evaluate(`(()=>{
      const scroll=document.querySelector("#scroll"),input=document.querySelector("#message");
      return {bottom:document.querySelector("footer").getBoundingClientRect().bottom,
        top:document.querySelector(".assistant:last-child").getBoundingClientRect().top,
        gap:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop,text:input.value,caret:input.selectionStart};
    })()`),
    );
    assert.ok(
      Number(opened.bottom) <= Number(before.height) - 360 + 24 + 1,
      "composer stays above the keyboard",
    );
    assert.ok(
      Math.abs(Number(opened.top) - Number(before.top) + 336) < 3,
      "messages move up with the keyboard, without shrinking their text",
    );
    assert.ok(Number(opened.gap) < 3, "latest response stays beside the composer");
    assert.equal(opened.text, before.text);
    assert.equal(opened.caret, before.caret);
    await page.evaluate(
      'document.querySelector("#message").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",isComposing:true,bubbles:true}))',
    );
    assert.equal(
      await page.evaluate('document.querySelector("#message").value'),
      before.text,
      "IME Enter does not submit the draft",
    );
    const bodyHeight = await page.evaluate("document.body.getBoundingClientRect().height");
    await page.evaluate(`window.__keyboardViewport(220,50,2)`);
    await settle();
    assert.equal(
      await page.evaluate("document.body.getBoundingClientRect().height"),
      bodyHeight,
      "pinch zoom does not masquerade as a keyboard resize",
    );
    await page.evaluate(`window.__keyboardViewport(${Number(before.height)},0)`);
    await settle();
    assert.ok(
      Math.abs(
        Number(
          await page.evaluate(
            'document.querySelector(".assistant:last-child").getBoundingClientRect().top',
          ),
        ) - Number(before.top),
      ) < 3,
      "closing the keyboard brings the conversation back down",
    );
    const reading = record(
      await page.evaluate(
        `(()=>{const s=document.querySelector("#scroll");s.scrollTop=Math.max(0,s.scrollHeight-s.clientHeight-250);return {top:s.scrollTop,gap:s.scrollHeight-s.clientHeight-s.scrollTop};})()`,
      ),
    );
    await page.evaluate(`window.__keyboardViewport(${Number(before.height) - 360},0)`);
    await settle();
    const shifted = record(
      await page.evaluate(
        `(()=>{const s=document.querySelector("#scroll");return {top:s.scrollTop,gap:s.scrollHeight-s.clientHeight-s.scrollTop};})()`,
      ),
    );
    assert.ok(
      Math.abs(Number(shifted.top) - Number(reading.top) - 360) < 3,
      "older messages move up with the keyboard too",
    );
    assert.ok(
      Math.abs(Number(shifted.gap) - Number(reading.gap)) < 3,
      "reading older messages never jumps to the latest response",
    );
  } finally {
    await page.evaluate(
      'window.__restoreKeyboardViewport();document.querySelector("#message").dispatchEvent(new CompositionEvent("compositionend",{bubbles:true,data:"中文"}))',
    );
    await settle();
    await page.type("#message", "");
    await page.evaluate(
      'document.querySelector("#scroll").scrollTop=document.querySelector("#scroll").scrollHeight',
    );
  }
  const nativeBefore = record(
    await page.evaluate(`(()=>{
    const scroll=document.querySelector('#scroll');
    scroll.scrollTop=Math.max(0,scroll.scrollHeight-scroll.clientHeight-250);
    scroll.dispatchEvent(new Event('scroll'));
    return {gap:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop,top:scroll.scrollTop};
  })()`),
  );
  try {
    for (const height of [664, 484, 664, 844]) {
      await page.evaluate(`(()=>{
        const original=window.requestAnimationFrame;
        const pending=[];
        window.requestAnimationFrame=callback=>{pending.push(callback);return 10000+pending.length};
        window.__releaseViewportFrames=()=>{window.requestAnimationFrame=original;for(const callback of pending)callback(performance.now());};
      })()`);
      await page.call("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height,
        deviceScaleFactor: 1,
        mobile: true,
      });
      assert.ok(
        Math.abs(
          Number(
            await page.evaluate('document.querySelector("footer").getBoundingClientRect().bottom'),
          ) - height,
        ) < 2,
        "native layout lifts and lowers the composer before JavaScript animation callbacks",
      );
      assert.equal(
        await page.evaluate("document.body.style.height"),
        "",
        "native keyboard resize never pins a stale pixel height",
      );
      await page.evaluate("window.__releaseViewportFrames()");
      await settle();
      const position = record(
        await page.evaluate(
          `(()=>{const s=document.querySelector('#scroll');return {gap:s.scrollHeight-s.clientHeight-s.scrollTop,top:s.scrollTop};})()`,
        ),
      );
      assert.ok(
        Math.abs(Number(position.gap) - Number(nativeBefore.gap)) < 3,
        "native animation preserves reading distance from latest",
      );
      assert.ok(
        Math.abs(Number(position.top) - Number(nativeBefore.top) - (844 - height)) < 3,
        "messages follow each native keyboard step",
      );
    }
  } finally {
    await page.evaluate("window.__releaseViewportFrames?.()");
    await page.call("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await settle();
  }
}

async function stagePngImages(page: BrowserPage, count: number, name: string): Promise<void> {
  await page.evaluate(`(()=>{
    const canvas=document.createElement("canvas");
    canvas.width=64;
    canvas.height=48;
    const context=canvas.getContext("2d");
    context.fillStyle="#3e8983";
    context.fillRect(0,0,64,48);
    const encoded=canvas.toDataURL("image/png").split(",")[1];
    const bytes=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
    const transfer=new DataTransfer();
    for(let index=0;index<${count};index++)
      transfer.items.add(new File([bytes],${JSON.stringify(name)}+"-"+(index+1)+".png",{type:"image/png"}));
    const input=document.querySelector("#image-files");
    input.files=transfer.files;
    input.dispatchEvent(new Event("change",{bubbles:true}));
  })()`);
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
    await writeFile(
      join(longDirectory, "AGENTS.md"),
      "# Project guidance\n\nKeep changes focused.\n",
      { mode: 0o600 },
    );
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
              {
                id: "dwell-test-image",
                name: "Dwell Image Fixture",
                input: ["text", "image"],
                reasoning: false,
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
                contextWindow: 8192,
                maxTokens: 1024,
              },
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
    const settingsPath = join(environment.agentDir, "settings.json");
    const settings = record(JSON.parse(await readFile(settingsPath, "utf8")));
    settings.defaultModel = "dwell-test-image";
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
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
    async function page(beforeNavigate?: string): Promise<BrowserPage> {
      const target = record(
        await (
          await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })
        ).json(),
      );
      assert.equal(typeof target.webSocketDebuggerUrl, "string");
      const result = new BrowserPage(String(target.webSocketDebuggerUrl));
      pages.push(result);
      await result.open();
      await result.call("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const injected = beforeNavigate
        ? record(
            await result.call("Page.addScriptToEvaluateOnNewDocument", {
              source: beforeNavigate,
            }),
          )
        : undefined;
      await result.call("Page.navigate", { url: browserOrigin });
      if (typeof injected?.identifier === "string")
        await result.call("Page.removeScriptToEvaluateOnNewDocument", {
          identifier: injected.identifier,
        });
      return result;
    }
    const first = await page(`(()=>{
      const original=window.fetch.bind(window);
      let release=()=>{};
      const gate=new Promise(resolve=>{release=resolve;});
      window.__dwellCapabilityPending=false;
      window.__releaseDwellCapability=()=>{release();window.fetch=original;};
      window.fetch=async(input,init)=>{
        const target=typeof input==="string"?input:input.url;
        if(new URL(target,location.href).pathname==="/api/v1/model-capabilities"){
          window.__dwellCapabilityPending=true;
          await gate;
        }
        return original(input,init);
      };
    })()`);
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
    await first.until(
      'window.__dwellCapabilityPending && document.querySelector("#attach-image").disabled && document.querySelector("#attach-image").title.includes("Checking")',
    );
    await first.evaluate("window.__releaseDwellCapability()");
    await first.until(
      'document.querySelector("#model-label").textContent.trim()==="dwell-test" && document.querySelector("#attach-image").disabled && document.querySelector("#attach-image").title.includes("Choose a model")',
    );
    assert.equal(
      record(await request("/model-capabilities", { provider: "dwell-test", model: "dwell-test" }))
        .supportsImages,
      false,
      "the existing default text model is reported as image-incompatible",
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
    await first.click("#new-mobile");
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
    assert.equal(
      await first.evaluate('document.querySelectorAll("#session-list .sidebar-state").length'),
      0,
      "sidebar names do not duplicate the top status controls",
    );
    assert.equal(
      await first.evaluate('document.querySelectorAll("#status-list .status-tab").length'),
      2,
      "only open sessions appear as status tabs",
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
    assert.equal(created.model, "dwell-test-image");
    assert.equal(
      await first.evaluate('document.querySelector("#composer-directory").textContent.trim()'),
      longDirectory,
    );
    await first.until(
      'document.querySelector("#model-label").textContent.trim()==="dwell-test-image" && !document.querySelector("#attach-image").disabled && document.querySelector("#attach-image").title==="Add images"',
    );
    assert.equal(
      record(
        await request("/model-capabilities", {
          provider: "dwell-test",
          model: "dwell-test-image",
        }),
      ).supportsImages,
      true,
      "a new session uses the configured image-capable Pi default",
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
    await second.until(
      'document.querySelector("#model-label").textContent.trim()==="dwell-test-image"',
    );
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
    await second.until(`document.querySelector('#status-list [aria-label*="Stopped"]') !== null`);
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
    await assertQuietProcessPresentation(second, "mobile");
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

    await second.until(
      'document.querySelector("#send").getAttribute("aria-label")==="Send message"',
    );
    await second.type("#message", "markdown");
    await second.click("#send");
    await second.until(
      'document.querySelector("#conversation .assistant table") !== null && document.querySelector("#send").getAttribute("aria-label")==="Send message"',
    );
    assert.equal(
      await second.evaluate(
        '!!document.querySelector(".assistant h1") && !!document.querySelector(".assistant ul ul") && !!document.querySelector(".assistant ol") && !!document.querySelector(".assistant blockquote") && !!document.querySelector(".assistant .task-item input:checked") && !!document.querySelector(".assistant hr") && !!document.querySelector(".assistant del")',
      ),
      true,
    );
    assert.equal(
      await second.evaluate('document.querySelector(".assistant pre code").textContent'),
      "project/\n  src/\n    client.ts",
    );
    assert.equal(
      await second.evaluate(
        'document.querySelector(".assistant table th:nth-child(2)")?.style.textAlign',
      ),
      "right",
      "Markdown tables retain right-aligned columns",
    );
    assert.equal(
      await second.evaluate(
        'document.querySelectorAll("#conversation img, #conversation script").length',
      ),
      0,
    );
    await second.until('document.querySelector(".session-details") !== null');
    assert.equal(await second.evaluate('document.querySelector(".session-details").open'), false);
    assert.equal(
      await second.evaluate(
        'document.querySelector("#conversation").textContent.includes("Unsupported saved message role")',
      ),
      false,
    );
    await second.click(".session-details>summary");
    await second.click(".context-source>summary");
    assert.equal(
      await second.evaluate(
        'document.querySelector(".context-content").textContent.includes("Keep changes focused.")',
      ),
      true,
    );
    await second.click(".session-details>summary");
    await second.type("#message", "tool");
    await second.click("#send");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Echo complete:") && document.querySelector("#send").getAttribute("aria-label")==="Send message"',
    );
    assert.equal(
      await second.evaluate(
        '[...document.querySelectorAll(".assistant")].some(e=>e.querySelector(".tool-run") && e.textContent.includes("Echo complete:"))',
      ),
      true,
    );
    assert.equal(
      await second.evaluate('document.querySelectorAll("#conversation .byline").length'),
      0,
    );
    const beforeModel = record(await request(`/sessions/${String(session.id)}`)).model;
    await second.type("#message", "Keep this image-review draft");
    await second.click("#choose-model");
    await second.until('document.querySelectorAll("#model-options .model-option").length>=4');
    await second.type("#model-search", "dwell-test-reasoning");
    await second.click("#model-options .model-option");
    await second.until('document.querySelectorAll(".thinking-choice").length===4');
    assert.deepEqual(
      await second.evaluate(
        '[...document.querySelectorAll(".thinking-choice")].map(e=>e.dataset.level)',
      ),
      ["low", "medium", "high", "xhigh"],
    );
    await second.click("#close-model");
    assert.equal(record(await request(`/sessions/${String(session.id)}`)).model, beforeModel);
    await second.click("#choose-model");
    await second.until('document.querySelectorAll("#model-options .model-option").length>=4');
    await second.type("#model-search", "dwell-test-reasoning");
    await second.click("#model-options .model-option");
    await second.until('document.querySelectorAll(".thinking-choice").length===4');
    await second.click("#back-models");
    assert.equal(await second.evaluate('document.querySelector("#model-search").hidden'), false);
    await second.click("#model-options .model-option");
    await second.until('document.querySelectorAll(".thinking-choice").length===4');
    await second.click('[data-level="high"]');
    await second.until(
      '!document.querySelector("#model-dialog").open && document.querySelector("#thinking-label").textContent.includes("High")',
    );
    assert.equal(record(await request(`/sessions/${String(session.id)}`)).thinkingLevel, "high");
    assert.equal(
      await second.evaluate('document.querySelector("#message").value'),
      "Keep this image-review draft",
    );
    await stagePngImages(second, 1, "remove-after-model-switch");
    await second.until('document.querySelectorAll(".image-attachment").length===1');
    await second.click("#choose-model");
    await second.until('document.querySelectorAll("#model-options .model-option").length>=4');
    await second.evaluate(`([...document.querySelectorAll("#model-options .model-option")]
      .find(button=>button.querySelector("strong")?.textContent==="dwell-test")?.click())`);
    await second.until(
      'document.querySelector("#model-label").textContent.trim()==="dwell-test" && document.querySelector("#attach-image").disabled',
    );
    assert.equal(
      await second.evaluate('document.querySelector(".image-chip-remove").disabled'),
      false,
      "an existing draft image remains removable after switching to a text-only model",
    );
    await second.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      window.__dwellTurnSubmissions=0;
      window.fetch=async(input,init)=>{
        const target=typeof input==="string"?input:input.url;
        if(new URL(target,location.href).pathname.endsWith("/turns")&&init?.method==="POST")
          window.__dwellTurnSubmissions++;
        return original(input,init);
      };
      window.__restoreDwellFetch=()=>window.fetch=original;
    })()`);
    await second.click("#send");
    await second.until(
      'document.querySelector("#notice").textContent.includes("Choose an image-capable model")',
    );
    assert.equal(await second.evaluate("window.__dwellTurnSubmissions"), 0);
    assert.equal(await second.evaluate('document.querySelectorAll(".image-attachment").length'), 1);
    await second.evaluate("window.__restoreDwellFetch()");
    await second.click(".image-chip-remove");
    await second.until('document.querySelectorAll(".image-attachment").length===0');
    await second.click("#choose-model");
    await second.until('document.querySelectorAll("#model-options .model-option").length>=4');
    await second.type("#model-search", "dwell-test-reasoning");
    await second.click("#model-options .model-option");
    await second.until('document.querySelectorAll(".thinking-choice").length===4');
    await second.click('[data-level="high"]');
    await second.until(
      'document.querySelector("#model-label").textContent.trim()==="dwell-test-reasoning" && document.querySelector("#thinking-label").textContent.includes("High")',
    );
    assert.equal(
      await second.evaluate('document.querySelector("#message").value'),
      "Keep this image-review draft",
    );
    await second.type("#message", "Review the attached image");
    await second.evaluate(
      `(()=>{const c=document.createElement('canvas');c.width=64;c.height=48;const x=c.getContext('2d');x.fillStyle='#3e8983';x.fillRect(0,0,64,48);window.__testImage=c.toDataURL('image/png');const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(window.__testImage.split(',')[1]),c=>c.charCodeAt(0))],'layout-reference.png',{type:'image/png'}));const input=document.querySelector('#image-files');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`,
    );
    await second.until(
      'document.querySelectorAll(".image-attachment").length===1 && !document.querySelector("#send").disabled',
    );
    assert.equal(
      await second.evaluate('document.querySelector(".image-chip-preview").textContent'),
      "layout-reference.png",
    );
    assert.equal(
      await second.evaluate('document.querySelectorAll("#image-attachments img").length'),
      0,
    );
    await second.click(".image-chip-preview");
    await second.until('document.querySelector("#preview-image").naturalWidth===64');
    await second.click("#close-image");
    await second.evaluate(
      `(()=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(window.__testImage.split(',')[1]),c=>c.charCodeAt(0))],'image.png',{type:'image/png'}));document.querySelector('#message').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))})()`,
    );
    await second.until(
      'document.querySelectorAll(".image-attachment").length===2 && !document.querySelector("#send").disabled',
    );
    assert.equal(
      await second.evaluate('document.querySelectorAll(".image-chip-preview")[1].textContent'),
      "Pasted image",
    );
    assert.equal(
      await second.evaluate('document.querySelector("#message").value'),
      "Review the attached image",
    );
    await second.click(".image-attachment:last-child .image-chip-remove");
    await second.click("#send");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Received 1 image(s): image/png") && document.querySelector("#send").getAttribute("aria-label")==="Send message"',
    );
    await second.until('document.querySelector(".sent-image img")?.naturalWidth===64');
    await second.call("Page.reload");
    await second.until(
      'document.querySelector(".sent-image img")?.naturalWidth===64 && document.querySelector("#thinking-label").textContent.includes("High")',
    );
    assert.equal(await second.evaluate('document.querySelectorAll(".image-attachment").length'), 0);
    assert.equal(
      await second.evaluate(
        'document.querySelector(".composer-actions").getBoundingClientRect().height===document.querySelector(".composer-context").getBoundingClientRect().height',
      ),
      true,
    );
    await second.type("#message", "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight");
    assert.equal(
      await second.evaluate('document.querySelector("#message").clientHeight<=130'),
      true,
    );
    assert.equal(await second.evaluate("document.documentElement.scrollWidth<=innerWidth"), true);
    await second.type("#message", "");
    await checkMobileKeyboard(second);
    console.log(
      `PASS ${mode} mobile keyboard lifts the composer and messages, restores on close, and preserves reading position and IME text`,
    );
    // Close/reopen through the real host, retaining native history and local drafts.
    const currentId = String(session.id);
    await second.type("#message", "Keep this draft while closing");
    await stagePngImages(second, 1, "close-draft");
    await second.until('document.querySelectorAll(".image-attachment").length === 1');
    const originalSlots = await second.evaluate(
      'Array.from(document.querySelectorAll(".status-tab"),e=>e.textContent)',
    );
    await second.click(".status-tab.active .tab-select");
    await second.until(
      'document.querySelector(".status-tab.active.close-armed .tab-close") !== null',
    );
    await second.click(".tab-close");
    await second.until('document.querySelector("#close-session-dialog").open');
    assert.equal(
      await second.evaluate('document.querySelector("#close-session-dialog").open'),
      true,
    );
    assert.equal(await second.evaluate("document.activeElement.id"), "cancel-session-close");
    await second.click("#cancel-session-close");
    await second.until(
      '!document.querySelector("#close-session-dialog").open && !document.querySelector(".tab-close")',
    );
    assert.equal(
      await second.evaluate('document.querySelector("#message").value'),
      "Keep this draft while closing",
    );
    assert.equal(await second.evaluate('document.querySelectorAll(".image-attachment").length'), 1);
    assert.deepEqual(
      await second.evaluate(
        'Array.from(document.querySelectorAll(".status-tab"),e=>e.textContent)',
      ),
      originalSlots,
    );
    await second.click(".status-tab.active .tab-select");
    await second.click(".tab-close");
    await second.until('document.querySelector("#close-session-dialog").open');
    await second.click("#confirm-session-close");
    await second.until(
      '!document.querySelector("#close-session-dialog").open && document.querySelectorAll(".status-tab").length === 1',
    );
    assert.equal(record(await request(`/sessions/${currentId}`)).runtimeState, "closed");
    assert.equal(
      await second.evaluate('document.querySelectorAll("#session-list .name-row").length'),
      2,
    );
    await first.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))",
    );
    await delay(250);
    assert.equal(
      record(await request(`/sessions/${currentId}`)).runtimeState,
      "closed",
      "another browser does not reopen a closed runtime",
    );
    await second.click(".status-tab.active .tab-select");
    await second.click(".tab-close");
    await second.until('document.querySelector("#close-session-dialog").open');
    await second.click("#confirm-session-close");
    await second.until(
      '!document.querySelector("#close-session-dialog").open && document.querySelectorAll(".status-tab").length === 0',
    );
    await second.call("Page.reload");
    await second.until(
      '!document.querySelector("#app").hidden && document.querySelectorAll("#session-list .name-row").length === 2',
    );
    assert.equal(
      await second.evaluate('document.querySelectorAll(".status-tab").length'),
      0,
      "reload does not open a historical session",
    );
    await second.click("#open-nav");
    await second.evaluate(
      `Array.from(document.querySelectorAll('#session-list .name-row')).find(e=>e.textContent.includes(${JSON.stringify(longPathParts.at(-1))})).click()`,
    );
    await second.until(
      'document.querySelector(".sent-image img")?.naturalWidth===64 && document.querySelectorAll(".status-tab").length === 1',
    );
    assert.equal(record(await request(`/sessions/${currentId}`)).runtimeState, "ready");
    // A confirmation for an old turn must never stop a newer turn.
    const previousTurn = record(
      await request(`/sessions/${currentId}/turns`, { requestId: randomUUID(), message: "slow" }),
    );
    await second.until(
      'document.querySelector("#send").getAttribute("aria-label")==="Stop response"',
    );
    await second.click(".status-tab.active .tab-select");
    await second.click(".tab-close");
    await second.until('document.querySelector("#close-session-dialog").open');
    assert.equal(
      await second.evaluate('document.querySelector("#close-session-title").textContent'),
      "Stop and close?",
    );
    await request(`/sessions/${currentId}/turns/${String(previousTurn.runId)}/abort`, {});
    for (let attempt = 0; attempt < 100; attempt++) {
      if (!record(await request(`/sessions/${currentId}`)).activeTurnId) break;
      await delay(50);
    }
    const newerTurn = record(
      await request(`/sessions/${currentId}/turns`, { requestId: randomUUID(), message: "slow" }),
    );
    await second.click("#confirm-session-close");
    await second.until('document.querySelector("#close-session-error").textContent.length > 0');
    assert.equal(record(await request(`/sessions/${currentId}`)).activeTurnId, newerTurn.runId);
    await second.click("#cancel-session-close");
    await second.until(
      '!document.querySelector("#close-session-dialog").open && !document.querySelector(".tab-close")',
    );
    await second.click(".status-tab.active .tab-select");
    await second.click(".tab-close");
    await second.until('document.querySelector("#close-session-dialog").open');
    await second.click("#confirm-session-close");
    await second.until(
      '!document.querySelector("#close-session-dialog").open && document.querySelectorAll(".status-tab").length === 0',
    );
    assert.equal(record(await request(`/sessions/${currentId}`)).runtimeState, "closed");
    assert.equal(
      record(await request(`/sessions/${currentId}/turns/${String(newerTurn.runId)}`))
        .cancellationRequested,
      true,
    );
    await second.click("#open-nav");
    await second.evaluate(
      `Array.from(document.querySelectorAll('#session-list .name-row')).find(e=>e.textContent.includes(${JSON.stringify(longPathParts.at(-1))})).click()`,
    );
    await second.until(
      'document.querySelector(".sent-image img")?.naturalWidth===64 && document.querySelectorAll(".status-tab").length === 1',
    );
    console.log(
      `PASS ${mode} close confirmation, abort ownership, closed history, all-closed refresh and explicit reopen`,
    );
    const shots = process.env.DWELL_WEB_SCREENSHOT_DIR;
    if (shots) {
      await mkdir(shots, { recursive: true });
      const result = record(await second.call("Page.captureScreenshot", { format: "png" }));
      await writeFile(
        join(shots, `${mode}-mobile.png`),
        Buffer.from(String(result.data), "base64"),
      );
    }
    await second.call("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await assertComposerLayout(second, "desktop");
    await assertQuietProcessPresentation(second, "desktop");
    await second.until(
      'document.querySelector("#attach-image").title==="Add images" && !document.querySelector("#attach-image").disabled',
    );
    await second.evaluate(`(()=>{
      const prototype=HTMLImageElement.prototype;
      const original=prototype.decode;
      let release=()=>{};
      const gate=new Promise(resolve=>{release=resolve;});
      window.__dwellImageDecodeStarted=false;
      window.__dwellImageDecodeFinished=false;
      window.__releaseDwellImageDecode=()=>{
        prototype.decode=original;
        release();
      };
      prototype.decode=function(){
        window.__dwellImageDecodeStarted=true;
        return gate.then(()=>original.call(this)).finally(()=>window.__dwellImageDecodeFinished=true);
      };
    })()`);
    await stagePngImages(second, 1, "disconnect-pending");
    await second.until("window.__dwellImageDecodeStarted===true");
    await second.evaluate(
      'window.dispatchEvent(new StorageEvent("storage",{key:"dwell.browser-binding.v1"}))',
    );
    await second.until('!document.querySelector("#gate").hidden');
    await second.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      window.__dwellFailCapabilityOnce=true;
      window.__dwellPickerClicked=false;
      document.querySelector("#image-files").click=()=>window.__dwellPickerClicked=true;
      window.fetch=async(input,init)=>{
        const target=typeof input==="string"?input:input.url;
        if(new URL(target,location.href).pathname==="/api/v1/model-capabilities"&&window.__dwellFailCapabilityOnce){
          window.__dwellFailCapabilityOnce=false;
          return new Response(JSON.stringify({error:{code:"fixture_retry",message:"Temporary capability failure."}}),{status:503,headers:{"Content-Type":"application/json"}});
        }
        return original(input,init);
      };
    })()`);
    await second.click("#retry-button");
    await second.until(
      'document.querySelector("#gate").hidden && !document.querySelector("#app").hidden && document.querySelector("#attach-image").getAttribute("aria-label")==="Retry image support check" && !document.querySelector("#attach-image").disabled',
    );
    assert.equal(
      await second.evaluate('document.querySelectorAll(".image-attachment").length'),
      0,
      "disconnect discards the attachment that was still decoding",
    );
    await second.click("#attach-image");
    await second.until("window.__dwellPickerClicked===true");
    await second.evaluate("window.__releaseDwellImageDecode()");
    await second.until("window.__dwellImageDecodeFinished===true");
    assert.equal(
      await second.evaluate('document.querySelectorAll(".image-attachment").length'),
      0,
      "a pre-disconnect decode cannot reappear after reconnect",
    );
    await second.until(
      'document.querySelector("#attach-image").getAttribute("aria-label")==="Add images" && !document.querySelector("#attach-image").disabled',
    );
    await stagePngImages(second, 4, "image-only");
    await second.until(
      'document.querySelectorAll(".image-attachment").length===4 && document.querySelector("#message").value==="" && !document.querySelector("#send").disabled',
    );
    await second.click("#send");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Received 4 image(s): image/png, image/png, image/png, image/png. Text:") && document.querySelector("#send").getAttribute("aria-label")==="Send message"',
    );
    await second.until(
      'document.querySelectorAll(".sent-image img").length===5 && [...document.querySelectorAll(".sent-image img")].every(image=>image.naturalWidth===64)',
    );
    await second.call("Page.reload");
    await second.until(
      'document.querySelectorAll(".sent-image img").length===5 && [...document.querySelectorAll(".sent-image img")].every(image=>image.naturalWidth===64)',
    );
    if (shots) {
      const result = record(await second.call("Page.captureScreenshot", { format: "png" }));
      await writeFile(
        join(shots, `${mode}-desktop.png`),
        Buffer.from(String(result.data), "base64"),
      );
    }
    assert.equal(
      await second.evaluate(
        '(()=>{const chat=document.querySelector("#scroll");return chat.scrollHeight-chat.clientHeight-chat.scrollTop<3})()',
      ),
      true,
      "saved image loading keeps a conversation at the latest response",
    );
    console.log(
      `PASS ${mode} capability retry, reconnect attachment binding, delayed decode invalidation, and four-image image-only history`,
    );
    console.log(
      `PASS ${mode} real Markdown, saved instruction context, grouped tools, exact Pi thinking levels, image upload/paste, and reload persistence`,
    );

    const hostPort = Number(new URL(host.url).port);
    await host.close();
    host = await startHost({
      port: hostPort,
      dataDir,
      sessions: { env: environment.env, extensions: [environment.extensionPath] },
    });
    await second.until(
      'document.querySelector("#connection-badge").textContent==="Connected" && document.querySelectorAll(".status-tab").length===0',
    );
    assert.equal(record(await request(`/sessions/${currentId}`)).runtimeState, "closed");
    await second.evaluate(
      `Array.from(document.querySelectorAll('#session-list .name-row')).find(e=>e.textContent.includes(${JSON.stringify(longPathParts.at(-1))})).click()`,
    );
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Received: <img") && document.querySelectorAll(".status-tab").length===1',
    );
    proxy?.setUpstreamPort(hostPort);
    console.log(`PASS ${mode} host restart preserves closed history for explicit reopen`);
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
