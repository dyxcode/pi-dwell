# Examples

English | [简体中文](../i18n/zh-CN/handbook/examples.md)

[Documentation index](README.md) · [Full command reference](reference.md)

Run each recipe from a Dwell checkout on the host, replacing its placeholder paths. Each section lists a task and its command sequence.

## Run in the foreground

With the background service stopped:

```sh
npm start
```

Keep that terminal open and visit `http://127.0.0.1:8787` on the host. Ctrl-C stops the foreground host through its shutdown path.

## Use isolated development state

Stop any foreground production host and the production service before starting development; both modes use port 8787.

```sh
npm run dwell -- service stop
npm run dev
```

In a second terminal:

```sh
npm run dwell -- pi configure --executable /absolute/path/to/pi --dev
npm run dwell -- status --dev
```

Development credentials/catalog live under `~/.local/share/pi-dwell-dev`. The `--dev` suffix must match the running mode. Interactive development still runs Pi and may contact your provider; offline compatibility checks use synthetic fixtures.

## Check process availability

```sh
curl --fail http://127.0.0.1:8787/healthz
npm run dwell -- status
```

The first request returns process health without credentials. The second validates authenticated Dwell status. Neither proves a provider request will succeed.

## Restrict remote browser access

For private Tailscale Serve, restrict the Dwell host’s HTTPS port in your tailnet policy. Keep public Funnel off. The tailnet policy does not control direct loopback access on the host.

## Inspect service logs

Linux:

```sh
journalctl --user -u pi-dwell.service -n 100 --no-pager
```

macOS:

```sh
tail -n 100 "$HOME/Library/Logs/Pi Dwell/host.stderr.log"
```

Start with `npm run dwell -- service status` to distinguish a stopped service from a running process whose readiness check failed. Keep logs local because tool/provider errors may contain private context.

## Check a development change

```sh
node --test tests/turns-http.test.ts
npm run check
```

The targeted file helps diagnose a turn-route change; the full check runs lint, formatting checks, strict typechecking, and offline tests.

For package contents:

```sh
npm run check:package
```

For a specific installed Pi executable:

```sh
npm run check:pi -- /absolute/path/to/pi
```

The default test suite uses synthetic offline fixtures. Interactive development prompts may contact your provider.

## Understand an API request without exposing credentials

The browser submits a shape like this to `POST /api/v1/sessions/<session-id>/turns`:

```json
{
  "requestId": "629ed6e4-2c86-46a8-bc48-56966ee8822a",
  "message": "Reply with one short sentence."
}
```

A new request returns 202 and a durable turn record. Retrying the same request ID and payload returns the existing record with 200. Different content under the same identity conflicts. Use a fresh UUID for a genuinely new message.

This JSON shows the request body. The browser transport and local CLI use their respective admission requirements; [HTTP reference](http-auth.md#complete-route-map) lists the routes and admission rules.
