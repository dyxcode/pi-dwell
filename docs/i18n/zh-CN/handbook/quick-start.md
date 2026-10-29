<a id="quick-start"></a>

# 快速上手

[English](../../../handbook/quick-start.md) | 简体中文

[文档目录](README.md) · 下一步：[使用指南](guide.md)

启动 host、配对 browser，然后发送第一条消息。下面所有 terminal 命令都在运行 Pi 的机器上执行。发送消息会使用你配置的 provider，并可能产生其正常使用费用。

<a id="1-prepare-pi-and-node"></a>

## 1. 准备 Pi 和 Node

准备 macOS（launchd）或带 systemd 的 Linux，以及 Node.js 22.19 或更新版本、npm、Git 和已安装的 Pi **1.4.0**。Dwell 会检查 Pi 的确切版本。在将要运行 Dwell 的同一个 OS user 下，为 Pi 配置 provider 和默认 model。

```sh
node --version
pi --version
```

这里的 `pi` 命令假定安装位置已加入 PATH。Dwell 保存 executable 的 absolute path，因此 background service 不依赖当前 shell 的 PATH 查找。

<a id="2-install-and-start-dwell"></a>

## 2. 安装并启动 Dwell

在你的项目目录中执行：

```sh
git clone https://github.com/dyxcode/pi-dwell.git
cd pi-dwell
npm ci --ignore-scripts
npm run dwell -- service install
npm run dwell -- service start
```

`service start` 会等待通过 authentication 的 host readiness 检查。安装 service 本身不会启用登录或开机 autostart。请保持 checkout 的位置不变，因为 service registration 指向其中的文件。

<a id="3-connect-the-installed-pi"></a>

## 3. 连接已安装的 Pi

如果使用 standalone Pi binary，请替换为它的 absolute path：

```sh
npm run dwell -- pi configure --executable /absolute/path/to/pi
```

如果 Pi 通过 npm 全局安装：

```sh
npm run dwell -- pi configure \
  --executable "$(node -p 'process.execPath')" \
  --entry-point "$(npm root -g)/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
```

配置会先验证 executable，再保存结果。Service 从 host user 的 home 读取 Pi 已保存的 authentication/configuration。如果配置依赖环境变量，请在 user service manager 中设置，并重启 Dwell；background service 不会继承当前 terminal 中的所有变量。

<a id="4-pair-and-send"></a>

## 4. 配对并发送消息

```sh
npm run dwell -- pair
```

在 host 上打开 `http://127.0.0.1:8787`。按原样输入八位 pairing code；它区分大小写，只能使用一次，五分钟后过期。

选择 **New session**，选择一个已存在的 host 目录，再创建 session。发送一个简单 prompt，例如 “Reply with one sentence confirming you are ready.”。Browser 会先显示 live output，再显示已保存的对话。选择目录会为 Pi session 设置 working directory，并应用该目录对应的 native resource/instruction。

<a id="5-verify-and-return-later"></a>

## 5. 检查状态，之后继续使用

```sh
npm run dwell -- status
npm run dwell -- service status
```

关闭 terminal 或 browser 后，background service 会继续运行。若要停止整个 host：

```sh
npm run dwell -- service stop
```

在 Linux 上启用持久的开机启动，并允许退出登录后继续运行：

```sh
systemctl --user enable pi-dwell.service
sudo loginctl enable-linger "$(id -un)"
```

这两条命令分别启用 service startup，并让 user manager 在退出登录后继续运行。macOS 在 login session 内使用 user service。Foreground/development mode 见[技术参考](reference.md)；pairing、configuration 或 readiness 失败时，查看[错误参考](errors.md)。

在另一台设备上，`127.0.0.1` 指向那台设备自身。跨设备访问需配置 HTTPS proxy origin，详见 [HTTPS 参考](reference.md#optional-https-origin)。
