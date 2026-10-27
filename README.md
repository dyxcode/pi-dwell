# Pi Dwell

[简体中文](docs/i18n/README.zh-CN.md)

**A persistent home for Pi.**

## Product vision

Pi Dwell aims to make Pi a personal agent you can return to from any device. Conversations and background work live on a host you control, with web and terminal clients as your ways in.

Start a conversation at your desk, check on a task from your phone, and continue from your tablet. Each device connects to the same session, with its context, progress, and results.

### Continue from anywhere

Move between devices and interfaces while keeping the same conversation. Connect when you need Pi, and return to the work you left with it.

### Give work time to finish

Let the host carry on with tasks while you step away. Come back to see what finished, what needs attention, and what to do next.

### Make it your own

Choose where Pi lives and which capabilities it uses. Bring conversations, scheduled work, and Pi extensions into a personal environment that grows with your needs.

## Installation

Use macOS or Linux with systemd, Node.js **22.19+**, npm, Git, and [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) **1.4.0**. Configure your provider and default model in Pi first.

From your projects directory:

```sh
git clone https://github.com/dyxcode/pi-dwell.git
cd pi-dwell
npm ci --ignore-scripts
npm run dwell -- service install
npm run dwell -- service start
```

Connect Dwell to your installed Pi using the absolute path to its binary:

```sh
npm run dwell -- pi configure --executable /absolute/path/to/pi
```

For npm-installed Pi, configure Node and Pi's entry point instead:

```sh
npm run dwell -- pi configure \
  --executable "$(node -p 'process.execPath')" \
  --entry-point "$(npm root -g)/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
```

Generate a browser pairing code:

```sh
npm run dwell -- pair
```

Open [http://127.0.0.1:8787](http://127.0.0.1:8787) on the host, enter the eight-character code exactly as shown, and select a directory to start a conversation. The code expires after five minutes. Dwell runs in the background after you close the terminal.

On Linux, enable startup at boot and keep the service running after logout:

```sh
systemctl --user enable pi-dwell.service
sudo loginctl enable-linger "$(id -un)"
```

Use `npm run dwell -- service status` to check the service and `npm run dwell -- service stop` to stop it. On macOS, the user service runs while you are logged in.

The service reads Pi’s saved authentication and configuration from its host user’s home. If you use environment variables for provider credentials, a custom Pi directory, or tool paths, configure them in your user service manager and restart Dwell with `npm run dwell -- service restart`.
