# Implementation 实现手册

[English](../../../../handbook/implementation/README.md) | 简体中文

[文档目录](../README.md)

<a id="features"></a>

## 按功能理解实现

每章沿一个功能解释用户操作、模块职责、数据归属、执行流程、内部机制、技术取舍和关键验证场景。可以从当前关心的功能直接开始阅读。

| 功能 | 内容 |
| --- | --- |
| [运行与管理 Host](host-service.md) | 后台服务、私有存储、配置与关闭 |
| [连接浏览器](browser-access.md) | 回环访问、私有 HTTPS 和 CLI 凭据 |
| [创建与继续会话](session-lifecycle.md) | 会话身份、Pi 进程、项目资源与重启恢复 |
| [会话名称元数据](session-names.md) | 会话标签、共享名称和版本同步 |
| [选择目录、模型与 thinking level](models.md) | 发现、能力检查、选择与配置保存 |
| [编写消息与添加图片](compose-message.md) | 草稿、附件、键盘输入与移动布局 |
| [发送消息与跟踪执行](send-message.md) | 接收、重试、持久化调度与结果 |
| [停止工作与关闭会话](stop-work.md) | 取消、原生执行、关闭与中断结果 |
| [重新连接正在进行的工作](reconnect.md) | 实时事件、快照、重放与已保存状态合并 |
| [阅读已保存的历史与上下文](saved-history.md) | Pi 文件、分支、分页、图片与并发读取 |
| [阅读与浏览对话](read-conversation.md) | Markdown、工具、thinking、导航与稳定渲染 |
| [搜索与阅读 Memory](memory.md) | Distill 记录、有界搜索、revision-aware 阅读与 Host 集成 |
| [阅读 Library 内容与关联引用](library.md) | Current 搜索、精确版本、绑定与离线引用 |
| [协调历史清理](history-retirement.md) | Distill 读取租约、运行保留、历史清理与恢复 |

<a id="reference"></a>

## 相关参考

[技术参考](../reference.md)提供准确接口与配置，[源码索引](../source-map.md)用于定位实现，[开发说明](../development.md)介绍构建和验证。
