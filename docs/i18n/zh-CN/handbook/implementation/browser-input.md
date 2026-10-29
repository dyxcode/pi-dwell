<a id="browser-input"></a>
# Browser input 与 attachments

[English](../../../../handbook/implementation/browser-input.md) | 简体中文

本章说明浏览器中短期存在的 input state：按 session 保存的 image drafts、异步文件接收、textarea/viewport 尺寸、scroll anchoring，以及受限的长按 Backspace。`Attachments` 只在当前 page 内持有图片 draft bytes 和 preview object URLs。提交时图片内容随 turn request 一起发送；已保存记录仍由 Pi native history 持有。发送与 model-capability 判断见 [Browser controller](browser-controller.md)，已保存图片的展示见 [Browser rendering](browser-rendering.md)。

<a id="attachment-ownership-callbacks"></a>
## Attachment ownership 与 callbacks

[`Attachment`](../../../../../src/clients/web/attachments.ts#L11) 保存一个本地 draft 的生成 ID、显示名称、object URL 和 JSON-safe `ImageContent`。 [`Attachments`](../../../../../src/clients/web/attachments.ts#L17) 按 session ID 保存这些 draft 数组，同时维护 pending-session 集合、当前 session、两个 disabled flags 和 generation counter。它持有 hidden file input、可见 tray 与 button 的 DOM references。`change` callback 更新控件状态，`error` callback 展示 intake failure，`preview` callback 打开选定的图片 draft。 [`Attachments.constructor`](../../../../../src/clients/web/attachments.ts#L30) 将 button 绑定到 file picker，将 input 的 change event 绑定到 `add`；随后立即清空原生 input value，因此再次选择同一个文件仍会触发 change。

[`Attachments.select`](../../../../../src/clients/web/attachments.ts#L50) 切换当前展示哪个 session 的 drafts，不会移动或删除其他 session 的图片。 [`Attachments.setDisabled`](../../../../../src/clients/web/attachments.ts#L54) 将一般交互/发送禁用与新 intake 禁用分开处理：add button 由后者控制，每个 remove button 则由前者控制。因此，即使当前 model 不接受新图片，用户仍可移除已有附件。 [`Attachments.busy`](../../../../../src/clients/web/attachments.ts#L61) 表示当前 session 是否正在接收图片；[`Attachments.count`](../../../../../src/clients/web/attachments.ts#L64) 返回该 session 的 draft 数。 [`Attachments.payload`](../../../../../src/clients/web/attachments.ts#L67) 以原顺序返回当前 session 的 image records，不包含 preview URLs。

[`Attachments.clear`](../../../../../src/clients/web/attachments.ts#L70) 撤销指定 session 所有 draft URLs 并删除列表；只有该 session 当前处于选中状态时才重绘 tray。 [`Attachments.dispose`](../../../../../src/clients/web/attachments.ts#L75) 增加 generation 以使尚未完成的解码失效，清除 pending markers，撤销所有 draft URLs，清空全部 session drafts，并取消当前 session。Client 在 authentication 丢失时调用它。 [`Attachments.paste`](../../../../../src/clients/web/attachments.ts#L82) 从 clipboard data 读取 files；如果有图片文件，就阻止浏览器默认 paste，并且只在 intake 可用时转交给 `add`。普通文本仍使用浏览器原生 paste 行为。

<a id="file-intake-preview-rendering"></a>
## 文件 intake 与 preview rendering

[`Attachments.add`](../../../../../src/clients/web/attachments.ts#L88) 首先捕获当前 session 和 generation。如果没有 session、intake 已禁用，或该 session 已经有 intake 在进行，就直接返回。随后逐个处理文件：校验 shared image count 上限和聚合 decoded-byte 上限，仅允许 PNG、JPEG、WebP、GIF MIME types。文件先读为 data URL，再提取 base64 payload，通过 shared `isImageContent` guard 检查 MIME、data encoding、image signature 和大小。之后创建临时 object URL，并等待浏览器成功解码图片，再放入 tray。整个 loop 位于同一个外层 `try/catch` 中：第一个 validation/read/decode failure 会中止剩余文件，并只调用一次 `error` callback；此前已加入 draft 的图片会保留。

每次异步读取/解码完成后，`add` 会再次确认 generation 与 session 仍有效、intake 仍启用。若用户已切换 session，或 intake 中途被禁用，函数会撤销 URL 并丢弃结果。Clipboard 文件若带有浏览器生成的通用名称，就显示为 “Pasted image”；否则保留原文件名，缺少文件名时使用 “Image”。成功项目获得随机 ID，添加到 session draft list，再重绘 tray。失败只会在 generation 仍有效时交给 `error` callback；`finally` 也只会在所属 generation 仍有效时清除 pending marker 并调用 `change`，避免 dispose 之后的迟到解码改写当前 UI。

私有 [`Attachments.#render`](../../../../../src/clients/web/attachments.ts#L154) 会用文本按钮重建当前 session 的 tray。多个通用 clipboard 图片会添加编号。Preview button 将当前 object URL 和标签交给 preview callback。一般发送工作进行时 remove button 会禁用；点击后按生成 ID 过滤项目、撤销 URL、重绘 tray，并通知 controller。图片 bytes 会留在 draft payload 中，直到 turn 成功或显式清空；编辑 draft 时不会单独上传。

Controller 在 [`client.ts`](../../../../../src/clients/web/client.ts#L191) 中创建 `Attachments`，传入 `change: () => navigation()`、`error: showError`、`preview: showImage`。它根据 authentication、runtime readiness、运行中的工作、model capability 检查和当前 model 的 `supportsImages` 决定是否允许 intake。Capability 未知或检查失败时不接收新图片；已有附件仍可移除。提交前如果已确认当前 model 不支持图片，controller 会再次拒绝发送。图片 picker 的固定 accept list 定义于 [`page.ts`](../../../../../src/clients/web/page.ts#L73)。

<a id="composer-sizing-and-viewport-adaptation"></a>
## Composer 尺寸与 viewport 适配

[`BackspaceHold`](../../../../../src/clients/web/input.ts#L3) 记录可信长按的开始时间、最近 repeat 时间和预期 caret。Module constants [`MAX_HEIGHT_PX`](../../../../../src/clients/web/input.ts#L9)、[`MIN_HEIGHT_PX`](../../../../../src/clients/web/input.ts#L10) 和 [`VIEWPORT_HEIGHT_RATIO`](../../../../../src/clients/web/input.ts#L11) 限制 textarea 增长后的高度。 [`setupComposer`](../../../../../src/clients/web/input.ts#L13) 在注册 listeners 前保存 textarea 原始 rows/inline sizing、body viewport styles、scroll 高度和 bottom gap。它返回明确的 `resize()` 与 `dispose()` 接口；client 会在文字或 session 变化后调用 `resize()`。

Nested [`setupComposer.restoreBodyViewport`](../../../../../src/clients/web/input.ts#L36) 恢复 body 原本的 inline height 和 top offset。 [`setupComposer.rememberScrollPosition`](../../../../../src/clients/web/input.ts#L41) 只有在 scroll container 的 client height 尚未改变时才记录距底部的距离，避免 keyboard resize 已改变布局、但 resize callback 尚未执行时覆盖最后一个有效 anchor。 [`setupComposer.resize`](../../../../../src/clients/web/input.ts#L48) 首先保留 bottom gap；移动端再检查 native `interactive-widget=resizes-content` 是否让 document 落在 `VisualViewport` 内。Pinch zoom 时不启用 fallback。若 active textarea 仍超出 visual viewport，函数会临时将 body 固定到 visual viewport 的 height/top；恢复正常时还原原来的 layout。之后把 textarea 临时收至零高度以测量内容，按 viewport 占比和设备上限取较小值（同时保留设备对应的最小高度），并在内容更高时开启内部滚动。最后恢复 conversation 原来的 bottom gap：跟随最新输出的读者保持在底部，查看旧消息的读者则保持原有相对位置。

Nested [`setupComposer.viewportChanged`](../../../../../src/clients/web/input.ts#L100) 将连续的 window/visual viewport changes 合并到一个 animation frame。`ResizeObserver` 观察 composer form，只在宽度变化时重新计算尺寸。`resize` 会检查 disposed flag，因此 teardown 时已排队的 callbacks 不会产生副作用。Shell 的 viewport metadata 首先要求浏览器原生适配键盘；只有 visual viewport 变化但 layout viewport 仍被遮挡时才启用该 fallback。

<a id="trusted-long-press-backspace"></a>
## 可信的长按 Backspace

Nested [`setupComposer.onInput`](../../../../../src/clients/web/input.ts#L112) 总会重新计算高度。它忽略由自定义 repeat loop 执行的编辑并记录编辑后的 caret；普通输入会清除 hold，除非 event 是非 composing、caret 折叠的原生向后删除。 [`setupComposer.supportsNativeDelete`](../../../../../src/clients/web/input.ts#L136) 通过受保护的兼容性检查探测 `document.execCommand("delete")`。如果 API 不存在或抛错，增强删除会关闭，浏览器仍保留原生按键重复行为。

Nested [`setupComposer.onKeyDown`](../../../../../src/clients/web/input.ts#L148) 只增强 trusted 且未被阻止的 Backspace：不能带 modifier、不能处于 IME composition、不能是 read-only/disabled，也不能有选区。首次非 repeat keydown 建立 hold。若两次 repeat 间隔超过一秒，或 caret 与记录位置不同，就取消加速。前 1.2 秒仍逐字删除，之后在 2.4 秒和 4 秒阈值分别增为每次 2、4、8 个字符。Caret 已在文本起点时不执行删除。它调用浏览器原生 delete command，以保留正常的 input/undo 行为。如果原生操作没有发出 input event，则补发一个 bubbling 的 synthetic `input` event；没有文本变化或执行出错时就清除 hold。

`setupComposer` 中这些具名 nested callbacks 各自处理一个浏览器信号：[`setupComposer.resetBackspace`](../../../../../src/clients/web/input.ts#L108) 清除 hold；[`setupComposer.onCompositionStart`](../../../../../src/clients/web/input.ts#L220) 和 [`setupComposer.onCompositionEnd`](../../../../../src/clients/web/input.ts#L225) 维护 IME 状态并清除 hold；[`setupComposer.onSelectionChange`](../../../../../src/clients/web/input.ts#L230) 在 caret 或 selection 改变时取消；[`setupComposer.onSelect`](../../../../../src/clients/web/input.ts#L239) 在出现非折叠选区时取消。Keyup、pointerdown、input blur、document/window blur、visibility change 和 dispose 也会阻止失焦后继续沿用旧 hold。Setup 会安装这些 listeners，并立即计算初始 composer 尺寸。

<a id="cleanup-current-test-boundary"></a>
## 清理与测试

返回的 [`setupComposer.dispose`](../../../../../src/clients/web/input.ts#L277) 会标记 setup 已 disposed，清除 hold，断开 observer，移除所有已注册 listeners，取消等待中的 viewport frame，并恢复 body 与 textarea 原始 inline styles。Page lifecycle 使用 `pagehide`/`pageshow` 暂停或恢复 network observation；每次唤醒时不会重建 document-level composer。Browser shell 和 asset exposure 见 [web tests](../../../../../tests/web.test.ts#L6)；shared image payload 限制见 [image tests](../../../../../tests/images.test.ts#L100)。
