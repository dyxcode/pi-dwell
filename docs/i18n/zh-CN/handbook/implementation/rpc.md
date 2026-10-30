<a id="pi-rpc-implementation"></a>

# Pi RPC transport

[English](../../../../handbook/implementation/rpc.md) | 简体中文

[实现文档索引](README.md) · [Pi process](runtime.md) · [系统流程](../system.md)

`PiRpc` 通过 Pi child process 的 stdin/stdout 传输 JSONL record。它关联 command response、转发 Pi 异步 record，并限制 read/write、pending request 和 deadline。[`PiProcess`](runtime.md#runtime-startup-and-session-handshake) 负责 child lifecycle，并结合这些 response 与 Pi event 判断 Dwell run 的结果。

<a id="rpc-errors-and-record-narrowing"></a>

## Command error 与 record shape

[`RpcCommandError`](../../../../../src/runtime/pi-rpc.ts#L6) 表示已关联到 request 的 `success: false` response。它保留 rejected command 和 Pi 返回的原因，使 `SessionService` 能区分确定的 prompt rejection 与执行结果不确定的 transport failure。[`isRecord`](../../../../../src/runtime/pi-rpc.ts#L19) 将 parse 后的值窄化为非 null、非 array object，再读取 envelope field。该层的 `RpcRecord` 只要求 string `type`；具体 owner 会根据自身用途校验其余字段。

<a id="rpc-construction-and-request-admission"></a>

## 构造与 request admission

[`PiRpc.constructor`](../../../../../src/runtime/pi-rpc.ts#L44) 接收 child stdin/stdout、request timeout、record callback 和 fatal-failure callback。它监听 input/output error，将 output chunk 交给 `#read` 解码；如果 output end 时还剩没有 newline 的 buffer，则作为不完整 JSONL record 处理。`StringDecoder` 会跨 chunk 保留拆开的 UTF-8 sequence。

[`PiRpc.request`](../../../../../src/runtime/pi-rpc.ts#L66) 在 transport 关闭后立即拒绝，并最多允许 32 个 correlated pending request。它递增分配 `dwell-N` ID、启动 timeout、保存预期 command 和 Promise handler，再将 JSONL command record 加入写队列。Timeout 会 fail 整条 transport；Dwell 无法区分 Pi 尚未处理、已处理但响应延迟，或 response 丢失。写入错误也走同一 fatal path。

[`PiRpc.write`](../../../../../src/runtime/pi-rpc.ts#L82) 将 record 序列化并追加 newline；单行超过 8 MiB，或队列总量超过 16 MiB 时拒绝。合法写入按 promise chain 串行，等待 Node write callback 后才发送下一行，因此保持顺序并服从 backpressure。Queued-byte count 在 `finally` 减少；queue tail 会捕获 rejection，避免一次失败永久污染后续队列。

<a id="rpc-close-and-failure"></a>

## Close 与 fatal failure

[`PiRpc.close`](../../../../../src/runtime/pi-rpc.ts#L107) 幂等地保存 terminal error，清除所有 pending timer、reject 全部未完成 command promise、清空 correlation map 和 partial-line buffer。[`PiRpc.fail`](../../../../../src/runtime/pi-rpc.ts#L118) 先 close，再通知 `PiProcess` owner；这样等待中的 caller 先看到已经 settle 的 transport，然后 process lifecycle 才开始 cleanup。预期 shutdown 也会调用 `close`，但不触发 fatal callback。

<a id="rpc-jsonl-decoding-and-response-correlation"></a>

## JSONL 解码与 response correlation

[`PiRpc.#read`](../../../../../src/runtime/pi-rpc.ts#L124) 追加已解码内容，并循环处理完整 newline-delimited record。它接受 newline 前的可选 CR，限制完整行和未完成 buffer 均不超过 8 MiB，解析 JSON 并要求 object 带 string `type`。`type: "response"` 交给 `#response`；其他 record 转发给 owner callback。Malformed JSON/envelope、callback exception、超长记录或不完整的 final line 都会 fail transport。因此合法异步 record 与 command promise settlement 彼此独立。

[`PiRpc.#response`](../../../../../src/runtime/pi-rpc.ts#L155) 要求 ID/command 为 string 且 success 为 boolean。它查找对应 pending request，并要求 ID 与预期 command 都匹配；未知或错配 response 会使 transport 按 protocol error 失败。Success 会移除 pending entry、清 timer，并用 `data` resolve。Failure 还要求 string `error`，随后以 `RpcCommandError` reject。`RpcCommandError` 表示明确的 Pi rejection；timeout 或 process loss 会让 execution outcome 保持未知。

Transport boundary 由 [runtime failure tests](../../../../../tests/runtime-failure.test.ts) 覆盖，包括 fragmented Unicode、response identity、pending-request cap、timeout 分类、malformed output 和 shutdown escalation。
