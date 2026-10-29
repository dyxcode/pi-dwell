# Quick Start

English | [简体中文](../i18n/zh-CN/handbook/quick-start.md)

[Documentation index](README.md) · Next: [Guide](guide.md)

Run a host, pair a browser, and send your first message. All terminal commands below run on the machine that will host Pi. A message uses your configured provider and may incur its normal usage costs.

## 1. Prepare Pi and Node

Use macOS (launchd), or Linux with systemd, plus Node.js 22.19 or newer, npm, Git, and an installed Pi **1.4.0**. Dwell checks that exact Pi version. Configure a provider and default model in Pi under the same OS user that will run Dwell.

```sh
node --version
pi --version
```

The `pi` command assumes your installation is on PATH. Dwell stores an absolute executable path so the background service does not depend on that shell lookup.

## 2. Install and start Dwell

From your projects directory:

```sh
git clone https://github.com/dyxcode/pi-dwell.git
cd pi-dwell
npm ci --ignore-scripts
npm run dwell -- service install
npm run dwell -- service start
```

`service start` waits for authenticated host readiness. Installing the service does not enable login or boot autostart. Keep the checkout at this location because the service registration points into it.

## 3. Connect the installed Pi

For a standalone Pi binary, substitute its absolute path:

```sh
npm run dwell -- pi configure --executable /absolute/path/to/pi
```

For a global npm installation:

```sh
npm run dwell -- pi configure \
  --executable "$(node -p 'process.execPath')" \
  --entry-point "$(npm root -g)/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
```

Configuration validates the executable before storing it. The service reads Pi's saved authentication/configuration from its host user's home. If your setup depends on environment variables, set them in the user service manager and restart Dwell; a background service does not inherit every variable from your current terminal.

## 4. Pair and send

```sh
npm run dwell -- pair
```

Open `http://127.0.0.1:8787` on the host. Enter the eight-character code exactly as shown; it is case-sensitive, single-use, and expires after five minutes.

Choose **New session**, select an existing host directory, and create the session. Send a small prompt such as “Reply with one sentence confirming you are ready.” The browser displays live output and then the saved conversation. Choosing a directory gives the Pi session that working directory and its applicable native resources/instructions.

## 5. Verify and return later

```sh
npm run dwell -- status
npm run dwell -- service status
```

Closing the terminal or browser leaves the background service running. To stop the whole host:

```sh
npm run dwell -- service stop
```

For persistent Linux boot startup and operation after logout:

```sh
systemctl --user enable pi-dwell.service
sudo loginctl enable-linger "$(id -un)"
```

These commands enable service startup and keep the user manager running after logout. macOS uses a user service during the login session. Read [Reference](reference.md) for foreground/development mode and [Errors](errors.md) if pairing, configuration, or readiness fails.

On another device, `127.0.0.1` refers to that device itself. Use an HTTPS proxy origin configured for cross-device access; see [the HTTPS reference](reference.md#optional-https-origin).
