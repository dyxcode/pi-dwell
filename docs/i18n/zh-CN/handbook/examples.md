<a id="examples"></a>

# 示例

[English](../../../handbook/examples.md) | 简体中文

[文档目录](README.md) · [完整命令参考](reference.md)

在 host 上的 Dwell checkout 中执行各组命令，并替换其中的 placeholder path。每一节列出一项任务及其命令顺序。

<a id="run-in-the-foreground"></a>

## 在 foreground 运行

先停止 background service，再执行：

```sh
npm start
```

保持该 terminal 打开。在另一个 terminal 中进入 checkout，运行 `npm run dwell -- pair`。Ctrl-C 会通过 shutdown 路径停止 foreground host。

<a id="use-isolated-development-state"></a>

## 使用隔离的 development state

开始 development 前，停止 foreground production host 和 production service；两种 mode 都使用 port 8787。

```sh
npm run dwell -- service stop
npm run dev
```

在第二个 terminal 中执行：

```sh
npm run dwell -- pi configure --executable /absolute/path/to/pi --dev
npm run dwell -- pair --dev
npm run dwell -- status --dev
```

Development credential/catalog 位于 `~/.local/share/pi-dwell-dev`。`--dev` 必须与运行中的 mode 一致。Interactive development 仍会运行 Pi，并可能访问 provider；offline compatibility check 使用 synthetic fixture。

<a id="check-process-availability"></a>

## 检查 process 是否可用

```sh
curl --fail http://127.0.0.1:8787/healthz
npm run dwell -- status
```

第一个请求无需 credential，返回 process health。第二个请求验证经过 authentication 的 Dwell status。两者都不能证明 provider request 一定成功。

<a id="revoke-browser-access"></a>

## 撤销 browser access

```sh
npm run dwell -- auth revoke
npm run dwell -- pair
```

Revocation 会移除所选 mode 下的全部 browser session 和 pending code，并关闭失去 authorization 的 stream。只为希望重新连接的 browser 再次 pairing。Conversation history 会保留。

<a id="inspect-service-logs"></a>

## 查看 service 日志

Linux：

```sh
journalctl --user -u pi-dwell.service -n 100 --no-pager
```

macOS：

```sh
tail -n 100 "$HOME/Library/Logs/Pi Dwell/host.stderr.log"
```

先运行 `npm run dwell -- service status`，区分 service 已停止与 process 仍运行但 readiness 检查失败。日志应保留在本地，因为 tool/provider error 可能包含 private context。

<a id="check-a-development-change"></a>

## 验证一次开发修改

```sh
node --test tests/turns-http.test.ts
npm run check
```

针对性的 test file 用于诊断 turn-route 修改；完整 check 会运行 lint、format check、strict typecheck 和 offline test。

检查 package 内容：

```sh
npm run check:package
```

检查某个已安装的 Pi executable：

```sh
npm run check:pi -- /absolute/path/to/pi
```

默认 test suite 使用 synthetic offline fixture。Interactive development prompt 仍可能访问 provider。

<a id="understand-an-api-request-without-exposing-credentials"></a>

## 不暴露 credential 地理解 API request

Browser 向 `POST /api/v1/sessions/<session-id>/turns` 提交的 payload 类似下面这样：

```json
{
  "requestId": "629ed6e4-2c86-46a8-bc48-56966ee8822a",
  "message": "Reply with one short sentence."
}
```

新 request 返回 202 和 durable turn record。以相同 request ID 和 payload 重试时，返回已有 record，状态为 200。同一 identity 下的不同内容会产生 conflict。真正的新消息应使用新的 UUID。

这里展示的是 request body。Browser transport 与 local CLI 根据各自的要求添加 authentication；[HTTP 参考](http-auth.md#complete-route-map)列出了 route 和 admission 规则。
