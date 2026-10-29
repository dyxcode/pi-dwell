# Pi Dwell

[English](../../../README.md)

**让 Pi 有一个持续驻留的地方。**

## 产品愿景

Pi Dwell 希望让 Pi 成为一个可以从不同设备随时回到的个人 agent。会话与后台工作驻留在你掌控的主机上，浏览器和终端都是连接它的入口。

在电脑前开始一段对话，用手机查看任务进展，再从平板上继续。每台设备连接同一个会话，共享它的上下文、进度与结果。

### 从任何地方继续

切换设备和界面，延续同一段对话。需要 Pi 时接入，回来时继续之前交给它的工作。

### 让工作有时间完成

你暂时离开时，由主机继续执行任务。回来后，查看哪些工作已经完成、哪些需要关注，再决定下一步。

### 建立自己的使用环境

选择 Pi 驻留的位置和使用的能力。将对话、定时工作和 Pi extensions 组合成适合自己的个人环境，随着需求逐步扩展。

## 文档

[完整文档](handbook/README.md)包含快速上手、功能指南、教程、示例、API 与错误参考、架构与源码详解，以及开发与测试说明。

[Implementation 实现手册](handbook/implementation/README.md)用文字解释 workflows 与 function behavior，并提供可点击的 source/test citations。

## 安装

准备 macOS 或使用 systemd 的 Linux、Node.js **22.19+**、npm、Git，以及 [Pi](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) **1.4.0**。先在 Pi 中配置 provider 和默认模型。

在你的项目目录中运行：

```sh
git clone https://github.com/dyxcode/pi-dwell.git
cd pi-dwell
npm ci --ignore-scripts
npm run dwell -- service install
npm run dwell -- service start
```

使用已安装 Pi 的二进制文件绝对路径配置 Dwell：

```sh
npm run dwell -- pi configure --executable /absolute/path/to/pi
```

如果 Pi 通过 npm 安装，改用 Node 和 Pi 入口文件配置：

```sh
npm run dwell -- pi configure \
  --executable "$(node -p 'process.execPath')" \
  --entry-point "$(npm root -g)/@earendil-works/pi-coding-agent/dist/bundle/cli.js"
```

生成浏览器配对码：

```sh
npm run dwell -- pair
```

在主机上打开 [http://127.0.0.1:8787](http://127.0.0.1:8787)，按原样输入八位配对码，再选择目录开始对话。配对码有效期为五分钟。关闭终端后，Dwell 继续在后台运行。

在 Linux 上启用开机启动，并允许退出登录后继续运行：

```sh
systemctl --user enable pi-dwell.service
sudo loginctl enable-linger "$(id -un)"
```

使用 `npm run dwell -- service status` 查看服务状态，使用 `npm run dwell -- service stop` 停止服务。在 macOS 上，用户服务在登录期间运行。

后台服务会读取主机用户 home 下 Pi 已保存的认证与配置。如果你通过环境变量配置 provider 凭据、自定义 Pi 目录或工具路径，请在用户服务管理器中设置这些变量，再运行 `npm run dwell -- service restart` 重启 Dwell。
