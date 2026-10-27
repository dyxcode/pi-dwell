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
      `Browser condition timed out: ${expression}; ${JSON.stringify(await this.evaluate('({notice:document.querySelector("#notice")?.textContent,chat:document.querySelector("#conversation")?.textContent,send:document.querySelector("#send")?.outerHTML,attach:document.querySelector("#attach-image")?.outerHTML,imageInput:document.querySelector("#image-files")?.outerHTML,composer:{disabled:document.querySelector("#message")?.disabled,readOnly:document.querySelector("#message")?.readOnly,value:document.querySelector("#message")?.value,model:document.querySelector("#model-label")?.textContent,thinking:document.querySelector("#thinking-label")?.textContent}})'))}; errors=${JSON.stringify(this.errors)}`,
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
    "13px",
  );
  assert.equal(
    await page.evaluate('getComputedStyle(document.querySelector(".tab-symbol")).width'),
    viewport === "desktop" ? "18px" : "14px",
  );
  assert.equal(
    await page.evaluate('getComputedStyle(document.querySelector("main>header")).height'),
    viewport === "desktop" ? "46px" : "44px",
    `${viewport} status bar stays compact`,
  );
  assert.equal(
    await page.evaluate('getComputedStyle(document.querySelector(".status-tab")).height'),
    viewport === "desktop" ? "36px" : "34px",
    `${viewport} status tabs stay compact and tappable`,
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
      const arrow=choose.querySelector("svg");
      const model=document.querySelector("#model-label");
      const thinking=document.querySelector("#thinking-label");
      if(!arrow || !model || !thinking) return false;
      const center=element=>{const rect=element.getBoundingClientRect();return (rect.top+rect.bottom)/2;};
      return row.height<=44 &&
        Math.abs(center(arrow)-center(model))<=1 &&
        Math.abs(center(arrow)-center(thinking))<=1 &&
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

async function assertSidebarLabel(
  page: BrowserPage,
  sessionId: string,
  workspace: string,
  model: string,
  thinkingLevel?: string,
): Promise<void> {
  const label = record(
    await page.evaluate(`(()=>{
      const row=[...document.querySelectorAll("#session-list .name-row")].find(item=>item.dataset.sessionId===${JSON.stringify(sessionId)});
      if(!(row instanceof HTMLButtonElement)) return {present:false};
      const title=row.querySelector(".session-title");
      if(!(title instanceof HTMLElement)) return {present:false};
      const style=getComputedStyle(title);
      const rect=title.getBoundingClientRect();
      const rail=document.querySelector("#rail");
      return {
        present:true,text:title.textContent??"",title:row.title,aria:row.getAttribute("aria-label"),
        whiteSpace:style.whiteSpace,overflow:style.overflowX,textOverflow:style.textOverflow,
        fontSize:style.fontSize,height:rect.height,scrollWidth:title.scrollWidth,clientWidth:title.clientWidth,
        railWidth:rail instanceof HTMLElement ? rail.getBoundingClientRect().width : 0,
        railRight:rail instanceof HTMLElement ? rail.getBoundingClientRect().right : 0,
        rowRight:row.getBoundingClientRect().right
      };
    })()`),
  );
  const expected = [workspace, model, thinkingLevel].filter(Boolean).join(" · ");
  assert.equal(label.present, true, "the sidebar keeps the session row");
  assert.equal(
    label.text,
    expected,
    "the sidebar label reflects workspace, model, and thinking level",
  );
  assert.equal(label.title, expected, "the native title retains the full label");
  assert.equal(label.aria, expected, "the accessible label retains the full label");
  assert.equal(label.whiteSpace, "nowrap", "the sidebar label never wraps");
  assert.equal(label.overflow, "hidden", "long sidebar labels stay clipped to their row");
  assert.equal(label.textOverflow, "ellipsis", "long sidebar labels use an ellipsis");
  assert.ok(Number(label.height) <= Number.parseFloat(String(label.fontSize)) * 1.6);
  assert.ok(
    Number(label.scrollWidth) > Number(label.clientWidth),
    `extreme labels are ellipsized: ${JSON.stringify(label)}`,
  );
  assert.ok(Number(label.rowRight) <= Number(label.railRight) + 1);
}

async function assertMobileDrawerWidth(page: BrowserPage): Promise<void> {
  const measure = async () =>
    record(
      await page.evaluate(`(()=>{
        const rect=document.querySelector("#rail").getBoundingClientRect();
        return {width:rect.width,right:rect.right,viewportWidth:innerWidth,documentWidth:document.documentElement.scrollWidth};
      })()`),
    );
  const assertWidth = (width: Record<string, unknown>, viewportWidth: number) => {
    assert.equal(width.viewportWidth, viewportWidth);
    const expected = Math.min(360, viewportWidth * 0.85);
    assert.ok(
      Math.abs(Number(width.width) - expected) < 0.5,
      `the mobile drawer follows min(360px, 85vw): ${JSON.stringify(width)}`,
    );
    assert.ok(Number(width.right) <= Number(width.viewportWidth));
    assert.ok(Number(width.documentWidth) <= Number(width.viewportWidth) + 1);
  };

  assertWidth(await measure(), 390);

  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 500,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assertWidth(await measure(), 500);

  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 320,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  assertWidth(await measure(), 320);
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
}

async function assertDesktopSidebarWidth(page: BrowserPage): Promise<void> {
  const assertWidth = async (viewportWidth: number) => {
    const width = record(
      await page.evaluate(`(()=>{
        const rect=document.querySelector("#rail").getBoundingClientRect();
        return {width:rect.width,viewportWidth:innerWidth};
      })()`),
    );
    assert.equal(width.viewportWidth, viewportWidth);
    const expected = Math.min(280, viewportWidth * 0.25);
    assert.ok(
      Math.abs(Number(width.width) - expected) < 0.5,
      `the desktop sidebar follows min(280px, 25vw): ${JSON.stringify(width)}`,
    );
  };

  await assertWidth(1280);
  await page.call("Emulation.setDeviceMetricsOverride", {
    width: 800,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  try {
    await assertWidth(800);
  } finally {
    await page.call("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }
}

async function assertNewSessionHeading(page: BrowserPage, viewport: string): Promise<void> {
  const presentation = record(
    await page.evaluate(`(()=>{
      const heading=document.querySelector("#new-title");
      const button=document.querySelector("#create-button");
      const label=button?.querySelector(".control-label");
      const icon=button?.querySelector("svg.action-icon");
      const rect=element=>{const value=element.getBoundingClientRect();return {x:value.x,y:value.y,width:value.width,height:value.height};};
      if(!(button instanceof HTMLElement)||!(label instanceof HTMLElement)||!(icon instanceof SVGElement)) return {present:false};
      const labelRect=rect(label),iconRect=rect(icon),buttonRect=rect(button);
      return {
        present:true,tag:heading?.tagName,text:heading?.textContent?.trim(),fontSize:heading?getComputedStyle(heading).fontSize:null,
        buttonText:label.textContent?.trim(),label:labelRect,icon:iconRect,button:buttonRect,
        iconSize:getComputedStyle(icon).width
      };
    })()`),
  );
  assert.equal(
    presentation.present,
    true,
    `${viewport} new-session action exposes its label and icon`,
  );
  assert.equal(presentation.tag, "H2", `${viewport} new-session title remains a heading`);
  assert.equal(presentation.text, "New session", `${viewport} new-session title is concise`);
  assert.equal(presentation.fontSize, "18px", `${viewport} new-session title uses 18px type`);
  assert.equal(presentation.buttonText, "Start session");
  assert.equal(presentation.iconSize, "12px");
  const label = record(presentation.label);
  const icon = record(presentation.icon);
  const button = record(presentation.button);
  assert.equal(icon.width, 12);
  assert.equal(icon.height, 12);
  assert.ok(
    Math.abs(
      Math.min(Number(label.x), Number(icon.x)) +
        (Math.max(Number(label.x) + Number(label.width), Number(icon.x) + Number(icon.width)) -
          Math.min(Number(label.x), Number(icon.x))) /
          2 -
        (Number(button.x) + Number(button.width) / 2),
    ) <= 1,
    `${viewport} new-session label and SVG are centered together`,
  );
  for (const item of [label, icon])
    assert.ok(
      Math.abs(
        Number(item.y) + Number(item.height) / 2 - (Number(button.y) + Number(button.height) / 2),
      ) <= 1,
      `${viewport} new-session SVG and label are vertically centered`,
    );
}

async function saveScreenshotIfRequested(page: BrowserPage, filename: string): Promise<void> {
  const directory = process.env.DWELL_WEB_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const result = record(await page.call("Page.captureScreenshot", { format: "png" }));
  await writeFile(join(directory, filename), Buffer.from(String(result.data), "base64"));
}

async function assertActionIconGeometry(page: BrowserPage, viewport: string): Promise<void> {
  const controls = record(
    await page.evaluate(`(()=>{
      const inspect=(id)=>{
        const button=document.querySelector(id);
        const label=button?.querySelector(".control-label");
        const icon=button?.querySelector("svg.action-icon");
        if(!(button instanceof HTMLElement)||!(label instanceof HTMLElement)||!(icon instanceof SVGElement)) return null;
        const rect=element=>{const value=element.getBoundingClientRect();return {x:value.x,y:value.y,width:value.width,height:value.height};};
        return {
          text:label.textContent?.trim(),fontSize:getComputedStyle(label).fontSize,
          label:rect(label),button:rect(button),icon:rect(icon),iconDisplay:getComputedStyle(icon).display
        };
      };
      return {send:inspect("#send"),image:inspect("#attach-image")};
    })()`),
  );
  for (const [name, text] of [
    ["send", "Send"],
    ["image", "Image"],
  ] as const) {
    const control = record(controls[name]);
    const label = record(control.label);
    const button = record(control.button);
    const icon = record(control.icon);
    assert.equal(control.text, text, `${viewport} ${name} action keeps its short label`);
    assert.equal(control.fontSize, "11px", `${viewport} ${name} action label stays 11px`);
    assert.equal(control.iconDisplay, "block");
    assert.equal(icon.width, 12);
    assert.equal(icon.height, 12);
    assert.ok(
      Math.abs(
        Number(label.y) + Number(label.height) / 2 - (Number(button.y) + Number(button.height) / 2),
      ) <= 1,
      `${viewport} ${name} label is vertically centered`,
    );
    assert.ok(
      Math.abs(
        Number(icon.y) + Number(icon.height) / 2 - (Number(button.y) + Number(button.height) / 2),
      ) <= 1,
      `${viewport} ${name} SVG is vertically centered`,
    );
  }
}

async function assertNoPartialOrRecoveryRow(page: BrowserPage, context: string): Promise<void> {
  assert.equal(
    await page.evaluate(
      'document.querySelector("#conversation").textContent.includes("Live preview is partial")',
    ),
    false,
    `${context} does not label an ordinary snapshot as partial`,
  );
  assert.equal(
    await page.evaluate('document.querySelector(".history-recovery") === null'),
    true,
    `${context} does not show a content-recovery failure row when history is available`,
  );
}

async function assertSavedRendererCacheAndImageGeneration(page: BrowserPage): Promise<void> {
  const result = record(
    await page.evaluate(`(async()=>{
      const [{SavedConversationRenderer},{reconcileChildren}]=await Promise.all([
        import('/conversation.js'),import('/dom.js')
      ]);
      const renderer=new SavedConversationRenderer();
      const fixture=document.createElement('div');
      fixture.hidden=true;
      document.body.append(fixture);
      const host=document.createElement('div');
      const imageHost=document.createElement('div');
      fixture.append(host,imageHost);
      const entries=[];
      const context=[{
        path:'/synthetic/AGENTS.md',
        content:'Context source restored after an empty history response.',
        truncated:false
      }];
      try {
        const render=sources=>renderer.render(entries,sources,false,()=>document.createElement('span'),[]);
        reconcileChildren(host,render(context));
        const initial=host.querySelector('.session-details');
        const initialText=initial?.querySelector('.context-content')?.textContent??'';
        reconcileChildren(host,render([]));
        const absent=host.querySelector('.session-details')===null;
        reconcileChildren(host,render(context));
        const restored=host.querySelector('.session-details');
        const restoredText=restored?.querySelector('.context-content')?.textContent??'';

        const oldButton=document.createElement('button');
        oldButton.dataset.key='saved-image:synthetic/entry/0';
        oldButton.dataset.preserve='session-1:retry-1';
        oldButton.textContent='Loading old image';
        imageHost.append(oldButton);
        if(!oldButton.isConnected) throw new Error('Initial image callback target is disconnected.');
        const oldCallback=()=>{if(oldButton.isConnected) oldButton.textContent='stale callback';};
        const replacement=document.createElement('button');
        replacement.dataset.key='saved-image:synthetic/entry/0';
        replacement.dataset.preserve='session-1:retry-2';
        replacement.textContent='Loading replacement image';
        const desired=document.createDocumentFragment();
        desired.append(replacement);
        reconcileChildren(imageHost,desired);
        const replacementConnected=replacement.isConnected;
        oldCallback();
        const newCallback=()=>{
          if(!replacement.isConnected) return;
          const image=document.createElement('img');
          image.alt='Replacement image';
          replacement.replaceChildren(image);
        };
        newCallback();
        return {
          firstSourcePresent:initialText.includes('Context source restored after an empty history response.'),
          removedWhenEmpty:absent,
          restoredSourcePresent:restoredText.includes('Context source restored after an empty history response.'),
          restoredDetailsNotEmpty:!!restored?.querySelector('.context-content p'),
          replacedImageButton:imageHost.firstElementChild===replacement,
          replacementConnected,
          oldCallbackTargetDetached:!oldButton.isConnected,
          oldCallbackIgnored:oldButton.textContent==='Loading old image',
          newCallbackTargetsReplacement:replacement.querySelector('img')?.alt==='Replacement image'
        };
      } finally {
        fixture.remove();
      }
    })()`),
  );
  assert.equal(result.firstSourcePresent, true, "initial cached context renders its source");
  assert.equal(result.removedWhenEmpty, true, "empty context removes the details node");
  assert.equal(result.restoredSourcePresent, true, "the same context renders again after empty");
  assert.equal(
    result.restoredDetailsNotEmpty,
    true,
    "restored context details contain rendered prose",
  );
  assert.equal(
    result.replacedImageButton,
    true,
    "a new preserve generation replaces the old image node",
  );
  assert.equal(
    result.replacementConnected,
    true,
    "replacement image callback target is connected before completion",
  );
  assert.equal(
    result.oldCallbackTargetDetached,
    true,
    "old image callbacks target a detached node",
  );
  assert.equal(
    result.oldCallbackIgnored,
    true,
    "a stale image callback cannot mutate the replacement",
  );
  assert.equal(
    result.newCallbackTargetsReplacement,
    true,
    "the new image callback updates the replacement node",
  );
}

async function assertOlderAssistantGroupScrollAnchor(
  page: BrowserPage,
  sessionId: string,
  latestTurnId: string | null,
  viewport: string,
): Promise<void> {
  const olderId = "synthetic-older-assistant";
  const firstId = "synthetic-first-assistant";
  const anchorId = "synthetic-anchor-assistant";
  const anchoredText = Array.from(
    { length: 16 },
    (_, index) =>
      `Assistant section ${index + 1}: ${"This saved assistant entry stays anchored while its older group is loaded. ".repeat(4)}`,
  ).join("\n\n");
  const entry = (id: string, parentId: string | null, text: string) => ({
    id,
    parentId,
    timestamp: "2026-10-27T00:00:00.000Z",
    type: "message",
    role: "assistant",
    blocks: [{ type: "text", text, callId: null, name: null }],
    toolCallId: null,
    toolName: null,
    targetId: null,
    truncated: false,
  });
  const pageBase = (entries: ReturnType<typeof entry>[], nextCursor: string | null) => ({
    sessionId,
    status: "available",
    revision: "a".repeat(64),
    leafId: anchorId,
    entries,
    nextCursor,
    incompleteTail: false,
    activeTurnId: null,
    latestTurnId,
    coveredTurnId: latestTurnId,
    contextSources: [],
    contextSourcesTruncated: false,
  });
  const firstPage = pageBase(
    [
      entry(firstId, olderId, "A prior assistant item in this response group."),
      entry(anchorId, firstId, anchoredText),
    ],
    "older.page",
  );
  const olderPage = pageBase(
    [entry(olderId, null, "Older assistant continuation before the stable anchor.")],
    null,
  );
  const historyPath = `/api/v1/sessions/${sessionId}/history`;
  const anchorSelector = `#conversation [data-scroll-anchor][data-entry-id=${JSON.stringify(anchorId)}]`;

  await page.evaluate(`(()=>{
    const original=window.fetch.bind(window);
    const historyPath=${JSON.stringify(historyPath)};
    const firstPage=${JSON.stringify(firstPage)};
    const olderPage=${JSON.stringify(olderPage)};
    window.__dwellOlderPageTwoCalls=0;
    window.__restoreDwellHistoryPages=()=>window.fetch=original;
    window.fetch=async(input,init)=>{
      const target=typeof input==="string"?input:input.url;
      const url=new URL(target,location.href);
      if(url.pathname===historyPath){
        if(url.searchParams.has("cursor")){
          window.__dwellOlderPageTwoCalls++;
          return new Response(JSON.stringify(olderPage),{status:200,headers:{"Content-Type":"application/json"}});
        }
        return new Response(JSON.stringify(firstPage),{status:200,headers:{"Content-Type":"application/json"}});
      }
      return original(input,init);
    };
  })()`);
  await page.evaluate(
    "window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))",
  );
  await page.evaluate(
    "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))",
  );
  await page.until(
    `!document.querySelector("#load-older").hidden && document.querySelector(${JSON.stringify(anchorSelector)}) && document.querySelector("#conversation").textContent.includes("Assistant section 1:")`,
  );

  const before = record(
    await page.evaluate(`(()=>{
      const scroll=document.querySelector("#scroll");
      const anchor=document.querySelector(${JSON.stringify(anchorSelector)});
      const group=anchor?.closest(".message.assistant");
      if(!(scroll instanceof HTMLElement)||!(anchor instanceof HTMLElement)||!(group instanceof HTMLElement)) return {present:false};
      const relativeTop=()=>anchor.getBoundingClientRect().top-scroll.getBoundingClientRect().top;
      scroll.scrollTop=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,scroll.scrollTop+relativeTop()));
      return {
        present:true,top:relativeTop(),groupId:group.dataset.entryId,
        clientHeight:scroll.clientHeight,gap:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop
      };
    })()`),
  );
  assert.equal(
    before.present,
    true,
    `${viewport} paginated assistant entry exposes a stable anchor`,
  );
  assert.equal(before.groupId, firstId, `${viewport} the loaded page starts this assistant group`);
  assert.ok(Math.abs(Number(before.top)) <= 2, `${viewport} reading starts at the anchored entry`);
  assert.ok(Number(before.gap) > 100, `${viewport} the anchored reader is away from the bottom`);

  await page.click("#load-older");
  await page.until(
    `window.__dwellOlderPageTwoCalls===1 && document.querySelector(${JSON.stringify(anchorSelector)}) && document.querySelector("#conversation").textContent.includes("Older assistant continuation")`,
  );
  const after = record(
    await page.evaluate(`(()=>{
      const scroll=document.querySelector("#scroll");
      const anchor=document.querySelector(${JSON.stringify(anchorSelector)});
      const group=anchor?.closest(".message.assistant");
      if(!(scroll instanceof HTMLElement)||!(anchor instanceof HTMLElement)||!(group instanceof HTMLElement)) return {present:false};
      const rect=anchor.getBoundingClientRect();
      return {
        present:true,top:rect.top-scroll.getBoundingClientRect().top,groupId:group.dataset.entryId,
        documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth
      };
    })()`),
  );
  assert.equal(after.present, true);
  assert.equal(
    after.groupId,
    olderId,
    `${viewport} older and newer entries now share one assistant group`,
  );
  assert.ok(
    Math.abs(Number(after.top) - Number(before.top)) <= 2,
    `${viewport} loading the older assistant entry preserves the inner reading anchor: ${JSON.stringify({ before: before.top, after: after.top })}`,
  );
  assert.ok(
    Number(after.documentWidth) <= Number(after.viewportWidth) + 1,
    `${viewport} older assistant content stays within the viewport width`,
  );
  await page.evaluate("window.__restoreDwellHistoryPages()");
}

async function assertStatusCloseGeometry(page: BrowserPage, viewport: string): Promise<void> {
  await page.until('document.querySelector("#status-list .status-tab.active .tab-symbol")');
  const before = record(
    await page.evaluate(`(()=>{
      const tab=document.querySelector("#status-list .status-tab.active");
      const select=tab?.querySelector(".tab-select");
      const number=tab?.querySelector(".tab-select>span:first-child");
      const icon=tab?.querySelector(".tab-select .tab-symbol");
      const rect=element=>{const value=element.getBoundingClientRect();return {x:value.x,y:value.y,width:value.width,height:value.height};};
      if(!(select instanceof HTMLElement)||!(number instanceof HTMLElement)||!(icon instanceof HTMLElement)) return {present:false};
      const style=getComputedStyle(select);
      return {present:true,number:rect(number),icon:rect(icon),gap:style.columnGap,columns:style.gridTemplateColumns};
    })()`),
  );
  assert.equal(before.present, true, `${viewport} selected tab shows its state icon`);
  assert.equal(before.gap, "6px", `${viewport} number and icon columns have a 6px gap`);
  assert.equal(before.columns, "20px 18px", `${viewport} number and icon use fixed columns`);

  await page.click("#status-list .status-tab.active .tab-select");
  await page.until(
    'document.querySelector("#status-list .status-tab.active.close-armed .tab-close .tab-symbol")',
  );
  const after = record(
    await page.evaluate(`(()=>{
      const tab=document.querySelector("#status-list .status-tab.active.close-armed");
      const number=tab?.querySelector(".tab-select>span:first-child");
      const icon=tab?.querySelector(".tab-close .tab-symbol");
      const rect=element=>{const value=element.getBoundingClientRect();return {x:value.x,y:value.y,width:value.width,height:value.height};};
      if(!(number instanceof HTMLElement)||!(icon instanceof HTMLElement)) return {present:false};
      return {present:true,number:rect(number),icon:rect(icon)};
    })()`),
  );
  assert.equal(after.present, true, `${viewport} armed tab keeps the number and close icon`);
  for (const part of ["number", "icon"] as const) {
    const first = record(before[part]);
    const second = record(after[part]);
    for (const coordinate of ["x", "y", "width", "height"] as const)
      assert.ok(
        Math.abs(Number(first[coordinate]) - Number(second[coordinate])) < 0.5,
        `${viewport} ${part} ${coordinate} stays fixed while close is armed`,
      );
  }
  await page.click("#status-list .status-tab.active .tab-select");
  await page.until('!document.querySelector("#status-list .status-tab.active.close-armed")');
}

async function assertQuietProcessPresentation(page: BrowserPage, viewport: string): Promise<void> {
  const multilineCommand =
    "\n  printf 'first line'\r\n    npm run check\r\n      echo done\r\nexit 0\r\n";
  const longCommand = `echo ${"x".repeat(320)}`;
  assert.equal(
    await page.evaluate(`(async()=>{
      const {renderSavedConversation}=await import("/conversation.js");
      const block=(type,text,callId=null,name=null)=>({type,text,callId,name});
      const entry=(id,role,type,blocks,extra={})=>({
        id,parentId:null,timestamp:"2026-10-27T00:00:00.000Z",type,role,blocks,
        toolCallId:null,toolName:null,targetId:null,truncated:false,...extra
      });
      const longTitle="L".repeat(73);
      const multilineCommand=${JSON.stringify(multilineCommand)};
      const longCommand=${JSON.stringify(longCommand)};
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
        ],{toolCallId:"quiet-error",toolName:"echo",error:true}),
        entry("quiet-command-call","assistant","message",[
          block("tool_call",JSON.stringify({command:multilineCommand}),"quiet-command","bash")
        ]),
        entry("quiet-command-result","toolResult","toolResult",[
          block("text","synthetic command output")
        ],{toolCallId:"quiet-command",toolName:"bash"}),
        entry("quiet-long-command-call","assistant","message",[
          block("tool_call",JSON.stringify({command:longCommand}),"quiet-long-command","bash")
        ]),
        entry("quiet-long-command-result","toolResult","toolResult",[
          block("text","synthetic long command output")
        ],{toolCallId:"quiet-long-command",toolName:"bash"})
      ];
      const fixture=document.createElement("div");
      fixture.id="quiet-process-test-fixture";
      const focusSource=document.createElement("button");
      focusSource.id="quiet-process-focus-source";
      focusSource.type="button";
      focusSource.textContent="Keyboard focus source";
      focusSource.style.cssText="position:fixed;width:1px;height:1px;left:0;top:0;opacity:.01";
      const rhythm=document.createElement("div");
      rhythm.id="quiet-rhythm-test-fixture";
      rhythm.append(renderSavedConversation([
        entry("rhythm-user","user","message",[block("text","A short question.")]),
        entry("rhythm-answer","assistant","message",[block("text","First paragraph.\\n\\nSecond paragraph.")]),
        entry("rhythm-followup","user","message",[block("text","A follow-up question.")]),
        entry("rhythm-followup-answer","assistant","message",[block("text","A short reply.")])
      ]));
      fixture.append(focusSource,renderSavedConversation(entries),rhythm);
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
        successStatusAccessible:success.querySelector(".tool-status").getAttribute("aria-label"),
        successStatusIcon:!!success.querySelector(".tool-status svg"),
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
    assert.equal(presentation.successStatus, "");
    assert.equal(presentation.successStatusAccessible, "Completed");
    assert.equal(presentation.successStatusIcon, true);
    assert.equal(presentation.errorStatus, "Error");
    assert.notEqual(presentation.successStatusColor, presentation.errorStatusColor);
    assert.equal(presentation.toolBackground, "rgba(0, 0, 0, 0)");
    assert.equal(presentation.toolErrorBackground, "rgba(0, 0, 0, 0)");
    assert.equal(presentation.toolTitleSize, "12px");
    assert.equal(presentation.toolOutputSize, "12px");
    assert.equal(presentation.markdownCodeBackground, "rgb(235, 230, 219)");
    assert.equal(presentation.markdownCodeSize, "12px");
    assert.equal(presentation.markdownCodeText, "const answer = 42;");

    const commands = record(
      await page.evaluate(`(async()=>{
        const root=document.querySelector("#quiet-process-test-fixture");
        const multiline=root.querySelector('.tool-run[data-entry-id="quiet-command-call"]');
        const longline=root.querySelector('.tool-run[data-entry-id="quiet-long-command-call"]');
        if(!(multiline instanceof HTMLDetailsElement)||!(longline instanceof HTMLDetailsElement)) return {present:false};
        const multilinePreview=multiline.querySelector(".tool-command-preview");
        const multilineCount=multiline.querySelector(".tool-command-lines");
        const full=multiline.querySelector(".tool-command-full");
        const longPreview=longline.querySelector(".tool-command-preview");
        if(!(multilinePreview instanceof HTMLElement)||!(multilineCount instanceof HTMLElement)||!(full instanceof HTMLElement)||!(longPreview instanceof HTMLElement)) return {present:false};
        const readPreview=(element)=>{
          const style=getComputedStyle(element);
          return {text:element.textContent,whiteSpace:style.whiteSpace,overflowX:style.overflowX,textOverflow:style.textOverflow,overflowWrap:style.overflowWrap,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,height:element.getBoundingClientRect().height};
        };
        const closed={
          multilineOpen:multiline.open,count:multilineCount.textContent,preview:readPreview(multilinePreview),
          fullText:full.textContent,fullVisible:full.checkVisibility({contentVisibilityAuto:true}),
          fullWhiteSpace:getComputedStyle(full).whiteSpace,fullBackground:getComputedStyle(full).backgroundColor,
          longOpen:longline.open,longPreview:readPreview(longPreview),
          toolBackground:getComputedStyle(multiline).backgroundColor,documentWidth:document.documentElement.scrollWidth
        };
        multiline.open=true;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const multilineOpen={fullVisible:full.checkVisibility({contentVisibilityAuto:true}),fullWhiteSpace:getComputedStyle(full).whiteSpace,fullBackground:getComputedStyle(full).backgroundColor};
        multiline.open=false;
        longline.open=true;
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const longOpen={preview:readPreview(longPreview),documentWidth:document.documentElement.scrollWidth};
        longline.open=false;
        return {present:true,closed,multilineOpen,longOpen,viewportWidth:innerWidth};
      })()`),
    );
    assert.equal(
      commands.present,
      true,
      `${viewport} saved shell commands use the production renderer`,
    );
    const closedCommands = record(commands.closed);
    const multilinePreview = record(closedCommands.preview);
    const longPreview = record(closedCommands.longPreview);
    assert.equal(closedCommands.multilineOpen, false);
    assert.equal(closedCommands.count, "5 lines");
    assert.equal(multilinePreview.text, "$ printf 'first line'");
    assert.equal(
      closedCommands.fullText,
      multilineCommand,
      "the full saved command preserves its leading and continuation indentation and line endings",
    );
    assert.equal(
      closedCommands.fullVisible,
      false,
      "full commands stay inside their collapsed disclosure",
    );
    assert.equal(multilinePreview.whiteSpace, "nowrap");
    assert.equal(closedCommands.toolBackground, "rgba(0, 0, 0, 0)");
    const multilineOpen = record(commands.multilineOpen);
    assert.equal(
      multilineOpen.fullVisible,
      true,
      "opening the saved tool reveals its full command",
    );
    assert.equal(multilineOpen.fullWhiteSpace, "pre-wrap");
    assert.equal(multilineOpen.fullBackground, "rgba(0, 0, 0, 0)");
    assert.equal(longPreview.text, `$ ${longCommand}`);
    assert.equal(longPreview.whiteSpace, "nowrap");
    assert.equal(longPreview.overflowX, "hidden");
    assert.equal(longPreview.textOverflow, "ellipsis");
    assert.ok(
      Number(longPreview.scrollWidth) > Number(longPreview.clientWidth),
      `${viewport} a long one-line command is clipped while collapsed`,
    );
    const longOpen = record(commands.longOpen);
    const longOpenPreview = record(longOpen.preview);
    assert.equal(longOpenPreview.whiteSpace, "pre-wrap");
    assert.equal(longOpenPreview.overflowWrap, "anywhere");
    assert.ok(
      Number(longOpenPreview.height) > Number(longPreview.height),
      `${viewport} a long one-line command wraps when expanded`,
    );
    assert.ok(
      Number(longOpen.documentWidth) <= Number(commands.viewportWidth) + 1,
      `${viewport} expanded command details do not create horizontal page overflow`,
    );

    const rhythm = record(
      await page.evaluate(`(()=>{
        const root=document.querySelector("#quiet-rhythm-test-fixture");
        const messages=[...root.querySelectorAll(".message")];
        const paragraphs=messages[1].querySelectorAll(".markdown p");
        const rect=element=>{const value=element.getBoundingClientRect();return {top:value.top,bottom:value.bottom};};
        const user=rect(messages[0]),answer=rect(messages[1]),followup=rect(messages[2]);
        const firstParagraph=rect(paragraphs[0]),secondParagraph=rect(paragraphs[1]);
        const thinking=[...document.querySelectorAll("#quiet-process-test-fixture .thinking-run")];
        const tools=[...document.querySelectorAll("#quiet-process-test-fixture .tool-run")];
        const lastThinking=rect(thinking[1]);
        const nextThinking=rect(thinking[2]);
        const firstTool=rect(tools[0]);
        const nextTool=rect(tools[1]);
        return {
          messageCount:messages.length,paragraphCount:paragraphs.length,
          userToAssistant:answer.top-user.bottom,assistantToUser:followup.top-answer.bottom,
          paragraphGap:secondParagraph.top-firstParagraph.bottom,
          thinkingGap:nextThinking.top-lastThinking.bottom,
          toolGap:nextTool.top-firstTool.bottom
        };
      })()`),
    );
    assert.equal(rhythm.messageCount, 4);
    assert.equal(rhythm.paragraphCount, 2);
    for (const [key, label, expected] of [
      ["userToAssistant", "user reply gap", 10],
      ["assistantToUser", "between-turn gap", 16],
      ["paragraphGap", "paragraph gap", 8],
      ["thinkingGap", "thinking detail gap", 4],
      ["toolGap", "tool detail gap", 6],
    ] as const) {
      const value = Number(rhythm[key]);
      assert.ok(
        Math.abs(value - expected) <= 0.5,
        `${viewport} ${label} measures ${value}px (expected ${expected}px)`,
      );
    }

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
        const leftRule=getComputedStyle(summary,"::before");
        const rightRule=getComputedStyle(summary,"::after");
        const titleRange=document.createRange();titleRange.selectNodeContents(summary);
        const titleRect=titleRange.getBoundingClientRect();
        const summaryRect=summary.getBoundingClientRect();
        const source=details.querySelector(".context-source");
        const sourceSummary=source?.querySelector(":scope>summary");
        const nestedClosed=sourceSummary ? getComputedStyle(sourceSummary,"::before").transform : "";
        const leftClosedTransform=leftRule.transform;
        const rightClosedTransform=rightRule.transform;
        if(source) source.open=true;
        const nestedOpen=sourceSummary ? getComputedStyle(sourceSummary,"::before").transform : "";
        if(source) source.open=false;
        details.open=true;
        const leftOpenTransform=getComputedStyle(summary,"::before").transform;
        const rightOpenTransform=getComputedStyle(summary,"::after").transform;
        const openLeft=titleLeft();
        details.open=false;
        return {
          present:true,closedLeft,openLeft,
          titleCenter:Math.abs((titleRect.left+titleRect.right)/2-(summaryRect.left+summaryRect.right)/2),
          leftRuleContent:leftRule.content,
          leftRuleGrow:leftRule.flexGrow,
          leftRuleColor:leftRule.backgroundColor,
          rightRuleGrow:rightRule.flexGrow,
          rightRuleColor:rightRule.backgroundColor,
          leftClosedTransform,rightClosedTransform,leftOpenTransform,rightOpenTransform,
          nestedClosed,nestedOpen,
          background:getComputedStyle(body).backgroundColor,
          divider:getComputedStyle(summary,"::after").backgroundColor
        };
      })()`),
    );
    assert.equal(context.present, true, "the existing saved Context remains present");
    assert.equal(context.background, "rgb(238, 232, 221)");
    assert.equal(context.divider, "rgb(221, 213, 200)");
    assert.equal(context.leftRuleContent, '""', "Context has no top-level disclosure arrow");
    assert.equal(context.leftRuleGrow, "1", "Context has a divider on the left of its label");
    assert.equal(context.rightRuleGrow, "1", "Context has a divider on the right of its label");
    assert.equal(context.leftRuleColor, context.divider);
    assert.equal(context.rightRuleColor, context.divider);
    assert.equal(context.leftClosedTransform, "none");
    assert.equal(context.rightClosedTransform, "none");
    assert.equal(context.leftOpenTransform, "none");
    assert.equal(context.rightOpenTransform, "none");
    assert.ok(Number(context.titleCenter) <= 1, "the Context label is visually centered");
    assert.notEqual(context.nestedClosed, context.nestedOpen, "nested source arrows still turn");
    assert.ok(Math.abs(Number(context.closedLeft) - Number(context.openLeft)) < 0.5);

    await page.evaluate('document.querySelector("#conversation .session-details>summary").focus()');
    assert.equal(
      await page.evaluate(
        'document.activeElement===document.querySelector("#conversation .session-details>summary")',
      ),
      true,
      `${viewport} Context summary remains keyboard-focusable`,
    );
    const space = { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 };
    await page.call("Input.dispatchKeyEvent", space);
    await page.call("Input.dispatchKeyEvent", { ...space, type: "keyUp" });
    assert.equal(
      await page.evaluate('document.querySelector("#conversation .session-details").open'),
      true,
      `${viewport} Context still opens through native Space activation`,
    );
    await page.call("Input.dispatchKeyEvent", space);
    await page.call("Input.dispatchKeyEvent", { ...space, type: "keyUp" });
    assert.equal(
      await page.evaluate('document.querySelector("#conversation .session-details").open'),
      false,
      `${viewport} Context still closes through native Space activation`,
    );

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

    const previewStyles = await readFile(
      new URL("../examples/web-preview/style.css", import.meta.url),
      "utf8",
    );
    const previewOverrides = previewStyles.replace(/^@import[^;]+;\s*/, "");
    const capturePresentation = `(()=>{
      const summary=document.querySelector("#conversation .session-details>summary");
      const details=summary.parentElement;
      const range=document.createRange();range.selectNodeContents(summary);
      const label=range.getBoundingClientRect();
      const row=summary.getBoundingClientRect();
      const left=getComputedStyle(summary,"::before");
      const right=getComputedStyle(summary,"::after");
      const source=details.querySelector(".context-source>summary");
      const nested=getComputedStyle(source,"::before");
      return {
        header:getComputedStyle(document.querySelector("main>header")).height,
        tab:getComputedStyle(document.querySelector(".status-tab")).height,
        icon:getComputedStyle(document.querySelector(".tab-symbol")).width,
        contextCenter:Math.abs((label.left+label.right)/2-(row.left+row.right)/2),
        leftContent:left.content,leftGrow:left.flexGrow,leftColor:left.backgroundColor,
        rightGrow:right.flexGrow,rightColor:right.backgroundColor,
        contextBackground:getComputedStyle(details.querySelector(".session-details-body")).backgroundColor,
        nestedWidth:nested.width,nestedTransform:nested.transform
      };
    })()`;
    const productionPresentation = record(await page.evaluate(capturePresentation));
    await page.evaluate(`(()=>{
      const style=document.createElement("style");
      style.id="preview-style-parity-test";
      style.textContent=${JSON.stringify(previewOverrides)};
      document.head.append(style);
      document.querySelector("#app").classList.add("with-distill");
    })()`);
    try {
      assert.deepEqual(
        record(await page.evaluate(capturePresentation)),
        productionPresentation,
        `${viewport} With Distill preview preserves production Context and status sizing`,
      );
    } finally {
      await page.evaluate(`(()=>{
        document.querySelector("#app").classList.remove("with-distill");
        document.querySelector("#preview-style-parity-test")?.remove();
      })()`);
    }
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
        if(new URL(target,location.href).pathname.endsWith("/model-capabilities")){
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
    await assertStatusCloseGeometry(first, "desktop");
    await assertSavedRendererCacheAndImageGeneration(first);
    console.log(`PASS ${mode} saved-context cache and image callback generations`);
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
    await assertNewSessionHeading(first, "desktop");
    await saveScreenshotIfRequested(first, `${mode}-desktop-new-session.png`);
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
    const initialThinking = String(
      await first.evaluate('document.querySelector("#thinking-label").textContent'),
    )
      .replace(/^·\s*/, "")
      .trim();
    await assertSidebarLabel(
      first,
      String(session.id),
      longPathParts.at(-1) ?? "",
      String(created.model),
      initialThinking || undefined,
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
    await assertDesktopSidebarWidth(first);
    await assertActionIconGeometry(first, "desktop");
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
    await first.evaluate(`(()=>{
      const row=document.querySelector('#session-list .name-row[data-session-id="${String(session.id)}"]');
      if(!(row instanceof HTMLButtonElement)) throw new Error('The active sidebar row is missing.');
      row.focus();
      window.__dwellSidebarRow=row;
      window.__dwellSessionListsParsed=0;
      const original=window.fetch.bind(window);
      window.__restoreDwellSessionFetch=()=>window.fetch=original;
      window.fetch=async(input,init)=>{
        const response=await original(input,init);
        if(new URL(typeof input==='string'?input:input.url,location.href).pathname==='/api/v1/sessions'){
          const json=response.json.bind(response);
          response.json=async()=>{
            const value=await json();
            window.__dwellSessionListsParsed++;
            return value;
          };
        }
        return response;
      };
    })()`);
    await first.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))",
    );
    await first.until("window.__dwellSessionListsParsed>0");
    await delay(50);
    const refreshedSidebar = record(
      await first.evaluate(`(()=>({
        sameNode:document.querySelector('#session-list .name-row[data-session-id="${String(session.id)}"]')===window.__dwellSidebarRow,
        connected:window.__dwellSidebarRow.isConnected,
        retainedFocus:document.activeElement===window.__dwellSidebarRow
      }))()`),
    );
    await first.evaluate("window.__restoreDwellSessionFetch()");
    assert.equal(
      refreshedSidebar.sameNode,
      true,
      "a session-list refresh retains the focused sidebar row node",
    );
    assert.equal(refreshedSidebar.connected, true);
    assert.equal(refreshedSidebar.retainedFocus, true);
    console.log(`PASS ${mode} sidebar refresh keeps the focused row`);
    await first.call("Page.reload");
    await first.until(
      'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
    );
    await assertNoPartialOrRecoveryRow(first, `${mode} ordinary reload`);
    const second = await page();
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
    );
    await assertNoPartialOrRecoveryRow(second, `${mode} ordinary browser snapshot`);
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
        if(url.pathname==="/api/v1/sessions/${String(session.id)}/models"){
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
    const alternateThinking = String(
      await first.evaluate('document.querySelector("#thinking-label").textContent'),
    )
      .replace(/^·\s*/, "")
      .trim();
    await assertSidebarLabel(
      first,
      String(session.id),
      longPathParts.at(-1) ?? "",
      ALTERNATE_MODEL,
      alternateThinking || undefined,
    );
    console.log(
      `PASS ${mode} model switch uses same-origin SSE, pending guard, and refresh persistence`,
    );
    await first.type("#message", "slow");
    await first.click("#send");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("dwell-slow-start")',
    );
    const slowRunId = String(record(await request(`/sessions/${String(session.id)}`)).activeTurnId);
    assert.match(slowRunId, /^[0-9a-f-]{36}$/i);
    await second.call("Page.reload");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("dwell-slow-start") && document.querySelector("#send").getAttribute("aria-label")==="Stop response"',
    );
    await assertNoPartialOrRecoveryRow(second, `${mode} active-turn snapshot`);
    await second.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))",
    );
    await second.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))",
    );
    await second.until(
      'document.querySelector("#connection-badge").textContent==="Connected" && document.querySelector("#conversation").textContent.includes("dwell-slow-start") && document.querySelector("#send").getAttribute("aria-label")==="Stop response"',
    );
    await assertNoPartialOrRecoveryRow(second, `${mode} same-run reconnect`);
    await second.until(
      'document.querySelector("#attach-image").getAttribute("aria-label")==="Images are not supported by this model"',
    );
    assert.equal(
      await second.evaluate(
        'document.querySelector("#conversation").textContent.split("dwell-slow-start").length-1',
      ),
      1,
      "same-run reconnect retains the existing live preview exactly once",
    );
    assert.equal(
      record(await request(`/sessions/${String(session.id)}`)).activeTurnId,
      slowRunId,
      "snapshot recovery preserves the existing active run",
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
    await first.until(
      'document.querySelector("#connection-badge").textContent==="Connected" && document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
    );
    await delay(100);
    await first.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      window.__dwellHistoryFailures=0;
      window.__dwellHistoryRequests=0;
      window.__dwellTurnSubmissions=0;
      window.__dwellFailHistory=false;
      window.__restoreDwellFetch=()=>window.fetch=original;
      window.fetch=async(input,init)=>{
        const target=typeof input==="string"?input:input.url;
        const url=new URL(target,location.href);
        if(url.pathname==="/api/v1/sessions/${String(session.id)}/history"){
          window.__dwellHistoryRequests++;
          if(window.__dwellFailHistory){
            window.__dwellHistoryFailures++;
            throw new Error("Synthetic history transport failure.");
          }
        }
        if(url.pathname.endsWith("/turns")&&init?.method==="POST")
          window.__dwellTurnSubmissions++;
        return original(input,init);
      };
      window.__dwellHistoryFailures=0;
      window.__dwellHistoryRequests=0;
      window.__dwellFailHistory=true;
    })()`);
    await first.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))",
    );
    await first.evaluate(
      "window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))",
    );
    await first.until(
      'document.querySelector(".history-recovery")?.textContent.includes("Some content couldn’t be loaded.") && document.querySelector(".history-retry")?.textContent.trim()==="Retry"',
    );
    await delay(100);
    assert.equal(await first.evaluate("window.__dwellHistoryFailures"), 2);
    assert.equal(await first.evaluate("window.__dwellHistoryRequests"), 2);
    assert.equal(await first.evaluate("window.__dwellTurnSubmissions"), 0);
    assert.equal(
      await first.evaluate(
        'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
      ),
      true,
      "failed history recovery keeps previously loaded conversation content",
    );
    await first.evaluate("window.__restoreDwellFetch()");
    await first.click(".history-retry");
    await first.until('document.querySelector(".history-recovery")===null');
    assert.equal(await first.evaluate("window.__dwellTurnSubmissions"), 0);
    assert.equal(
      await first.evaluate(
        'document.querySelector("#conversation").textContent.includes("Hello from the offline Pi fixture.")',
      ),
      true,
      "Retry refreshes saved content without sending a new turn",
    );
    console.log(`PASS ${mode} bounded history recovery and content-only Retry`);
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
    await assertStatusCloseGeometry(second, "mobile");
    await assertActionIconGeometry(second, "mobile");
    await assertInputGrows(second, "mobile");
    await assertQuietProcessPresentation(second, "mobile");
    await second.click("#open-nav");
    assert.ok(await second.evaluate('document.querySelector("#rail").classList.contains("open")'));
    const mobileSession = record(await request(`/sessions/${String(session.id)}`));
    const mobileThinking = String(
      await second.evaluate('document.querySelector("#thinking-label").textContent'),
    )
      .replace(/^·\s*/, "")
      .trim();
    await assertSidebarLabel(
      second,
      String(session.id),
      longPathParts.at(-1) ?? "",
      String(mobileSession.model),
      mobileThinking || undefined,
    );
    await assertMobileDrawerWidth(second);
    await second.click("#close-nav");
    assert.ok(
      await second.evaluate(
        'document.querySelector("#new-mobile").getClientRects().length>0 && document.querySelector("#new-session").getClientRects().length===0',
      ),
    );
    await second.click("#new-mobile");
    await second.until('document.querySelector("#new-dialog").open');
    await assertNewSessionHeading(second, "mobile");
    await saveScreenshotIfRequested(second, `${mode}-mobile-new-session.png`);
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
    const expandedTool = record(
      await second.evaluate(`(()=>{
        const tool=document.querySelector('#conversation .tool-run');
        const paragraph=[...document.querySelectorAll('#conversation .message.user .message-body p')]
          .find(value=>value.textContent==='hello');
        if(!(tool instanceof HTMLDetailsElement)||!(paragraph instanceof HTMLElement))
          return {present:false};
        tool.open=true;
        window.__dwellReconcileTool=tool;
        window.__dwellReconcileParagraph=paragraph;
        return {present:true,key:tool.dataset.key};
      })()`),
    );
    assert.equal(expandedTool.present, true, "saved tool disclosure and paragraph are available");
    const activeTab = record(
      await second.evaluate(`(()=>{
        const button=document.querySelector('#status-list .status-tab.active .tab-select');
        if(!(button instanceof HTMLButtonElement)) return {present:false};
        window.__dwellReconcileTab=button;
        return {present:true};
      })()`),
    );
    assert.equal(activeTab.present, true);
    await second.evaluate("window.__dwellReconcileTab.click()");
    await second.until('document.querySelector("#status-list .status-tab.active.close-armed")');
    assert.equal(
      await second.evaluate(
        'document.querySelector("#status-list .status-tab.active .tab-select")===window.__dwellReconcileTab',
      ),
      true,
      "arming a status tab retains the selected button node",
    );
    await second.evaluate("window.__dwellReconcileTab.click()");
    await second.until('!document.querySelector("#status-list .status-tab.active.close-armed")');
    assert.equal(
      await second.evaluate(
        'document.querySelector("#status-list .status-tab.active .tab-select")===window.__dwellReconcileTab',
      ),
      true,
      "retained buttons receive the fresh onclick handler after rendering",
    );

    await second.type("#message", "slow");
    await second.click("#send");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("dwell-slow-start") && document.querySelector("#send").getAttribute("aria-label")==="Stop response"',
    );
    const duringStream = record(
      await second.evaluate(`(()=>({
        toolSame:[...document.querySelectorAll('#conversation .tool-run')].find(value=>value.dataset.key===${JSON.stringify(String(expandedTool.key))})===window.__dwellReconcileTool,
        toolOpen:window.__dwellReconcileTool.open,
        paragraphSame:[...document.querySelectorAll('#conversation .message.user .message-body p')].find(value=>value.textContent==='hello')===window.__dwellReconcileParagraph
      }))()`),
    );
    assert.equal(duringStream.toolSame, true, "a streaming render retains the expanded tool node");
    assert.equal(duringStream.toolOpen, true, "a streaming render retains tool disclosure state");
    assert.equal(
      duringStream.paragraphSame,
      true,
      "a streaming render retains saved paragraph identity",
    );
    await second.evaluate(`(()=>{
      const paragraph=window.__dwellReconcileParagraph;
      const range=document.createRange();
      range.selectNodeContents(paragraph);
      const selection=window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      window.__dwellReconcileSelection=selection.toString();
    })()`);
    const activeTurn = record(await request(`/sessions/${String(session.id)}`)).activeTurnId;
    assert.equal(typeof activeTurn, "string");
    await request(`/sessions/${String(session.id)}/turns/${String(activeTurn)}/abort`, {});
    await second.until(
      'document.querySelector("#send").getAttribute("aria-label")==="Send message" && document.querySelector("#conversation").textContent.includes("slow")',
    );
    const afterAbort = record(
      await second.evaluate(`(()=>({
        toolSame:[...document.querySelectorAll('#conversation .tool-run')].find(value=>value.dataset.key===${JSON.stringify(String(expandedTool.key))})===window.__dwellReconcileTool,
        toolOpen:window.__dwellReconcileTool.open,
        paragraphSame:[...document.querySelectorAll('#conversation .message.user .message-body p')].find(value=>value.textContent==='hello')===window.__dwellReconcileParagraph,
        selectionInsideParagraph:window.__dwellReconcileParagraph.contains(window.getSelection()?.anchorNode),
        selection:window.getSelection()?.toString()
      }))()`),
    );
    assert.equal(afterAbort.toolSame, true, "terminal streaming refresh retains the tool node");
    assert.equal(afterAbort.toolOpen, true, "terminal streaming refresh keeps the tool expanded");
    assert.equal(
      afterAbort.paragraphSame,
      true,
      "terminal history refresh retains saved paragraph identity",
    );
    assert.equal(
      afterAbort.selectionInsideParagraph,
      true,
      "streaming history refresh keeps the text selection attached",
    );
    assert.equal(afterAbort.selection, "hello", "streaming history refresh retains selected text");
    console.log(
      `PASS ${mode} DOM reconciliation preserves focus, handlers, selection, and disclosures`,
    );
    const beforeModel = record(await request(`/sessions/${String(session.id)}`)).model;
    await second.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      let release;
      const gate=new Promise(resolve=>{release=resolve;});
      window.__registryPending=false;
      window.__releaseRegistry=()=>{release();window.fetch=original;};
      window.fetch=async(input,init)=>{
        const response=await original(input,init);
        const target=typeof input==='string'?input:input.url;
        if(new URL(target,location.href).pathname.endsWith('/models')){
          window.__registryPending=true;
          await gate;
        }
        return response;
      };
    })()`);
    await second.click("#choose-model");
    await second.until("window.__registryPending");
    await second.evaluate('window.dispatchEvent(new Event("online"))');
    assert.equal(
      await second.evaluate('document.querySelector("#model-dialog").open'),
      false,
      "resume invalidates the pending model picker",
    );
    await second.evaluate("window.__releaseRegistry()");
    await second.until('document.querySelector("#connection-badge").textContent==="Connected"');
    assert.equal(record(await request(`/sessions/${String(session.id)}`)).model, beforeModel);
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
    await assertSidebarLabel(
      second,
      String(session.id),
      longPathParts.at(-1) ?? "",
      "dwell-test-reasoning",
      "High",
    );
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
    const readingAnchor = record(
      await second.evaluate(`(()=>{
        const scroll=document.querySelector("#scroll");
        const anchors=[...document.querySelectorAll("#conversation .message.user[data-entry-id]")];
        if(!(scroll instanceof HTMLElement)||anchors.length===0) return {present:false};
        const anchor=anchors[0];
        const scrollRect=scroll.getBoundingClientRect();
        const anchorRect=anchor.getBoundingClientRect();
        const target=scroll.scrollTop+anchorRect.top-scrollRect.top-80;
        scroll.scrollTop=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,target));
        const rect=anchor.getBoundingClientRect();
        return {
          present:true,id:anchor.dataset.entryId,
          top:rect.top-scroll.getBoundingClientRect().top,
          clientHeight:scroll.clientHeight,
          gap:scroll.scrollHeight-scroll.clientHeight-scroll.scrollTop,
          contentHeight:scroll.scrollHeight
        };
      })()`),
    );
    assert.equal(readingAnchor.present, true);
    assert.ok(Number(readingAnchor.contentHeight) > Number(readingAnchor.clientHeight) + 100);
    assert.ok(Number(readingAnchor.top) >= 0 && Number(readingAnchor.top) < 160);
    assert.ok(Number(readingAnchor.gap) > 90, "the reader is away from the bottom anchor");
    await second.evaluate(`(()=>{
      const original=window.fetch.bind(window);
      window.__dwellHistoryRefreshResponses=0;
      window.__restoreDwellFetch=()=>window.fetch=original;
      window.fetch=async(input,init)=>{
        const target=typeof input==="string"?input:input.url;
        const url=new URL(target,location.href);
        const response=await original(input,init);
        if(url.pathname==="/api/v1/sessions/${String(session.id)}/history")
          window.__dwellHistoryRefreshResponses++;
        return response;
      };
    })()`);
    await first.type("#message", "history refresh anchor");
    await first.click("#send");
    await second.until(
      'document.querySelector("#conversation").textContent.includes("Received: history refresh anchor") && [...document.querySelectorAll("#conversation .message.assistant:not(.live)")].some(entry=>entry.textContent.includes("Received: history refresh anchor"))',
    );
    assert.ok(
      Number(await second.evaluate("window.__dwellHistoryRefreshResponses")) > 0,
      "the reader observed a successful saved-history refresh",
    );
    const refreshedAnchor = record(
      await second.evaluate(`(()=>{
        const scroll=document.querySelector("#scroll");
        const anchor=document.querySelector('#conversation [data-entry-id="${String(readingAnchor.id)}"]');
        if(!(scroll instanceof HTMLElement)||!(anchor instanceof HTMLElement)) return {present:false};
        const rect=anchor.getBoundingClientRect();
        return {
          present:true,top:rect.top-scroll.getBoundingClientRect().top,
          documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth
        };
      })()`),
    );
    assert.equal(refreshedAnchor.present, true);
    assert.ok(
      Math.abs(Number(refreshedAnchor.top) - Number(readingAnchor.top)) <= 2,
      `history refresh keeps the reading anchor at the same viewport position: ${JSON.stringify({ before: readingAnchor.top, after: refreshedAnchor.top })}`,
    );
    assert.ok(
      Number(refreshedAnchor.documentWidth) <= Number(refreshedAnchor.viewportWidth) + 1,
      "the refreshed mobile conversation stays within the viewport width",
    );
    await second.evaluate("window.__restoreDwellFetch()");
    const paginationSession = record(await request(`/sessions/${String(session.id)}`));
    const paginationTurnId =
      typeof paginationSession.latestTurnId === "string" ? paginationSession.latestTurnId : null;
    await assertOlderAssistantGroupScrollAnchor(
      second,
      String(session.id),
      paginationTurnId,
      `${mode} mobile`,
    );
    console.log(`PASS ${mode} history refresh preserves a reader's scroll anchor`);
    await second.call("Page.reload");
    await second.until(
      'document.querySelector(".sent-image img")?.naturalWidth===64 && document.querySelector("#thinking-label").textContent.includes("High")',
    );
    await assertNoPartialOrRecoveryRow(second, `${mode} image-history reload`);
    await assertSidebarLabel(
      second,
      String(session.id),
      longPathParts.at(-1) ?? "",
      "dwell-test-reasoning",
      "High",
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
    await saveScreenshotIfRequested(second, `${mode}-mobile.png`);
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
        if(new URL(target,location.href).pathname.endsWith("/model-capabilities")&&window.__dwellFailCapabilityOnce){
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
    await saveScreenshotIfRequested(second, `${mode}-desktop.png`);
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
