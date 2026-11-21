# 会话名称元数据

[English](../../../../handbook/implementation/session-names.md) | 简体中文

[Implementation handbook](README.md)

<a id="behavior"></a>

## 会话标签

Web 客户端以工作目录的末级名称标识会话，并显示当前模型和 thinking level。旧会话中已保存的自定义名称仍可显示。

<a id="ownership"></a>

## 数据归属

Dwell Catalog 保存自定义名称、名称版本和更新时间。Pi 管理原生会话历史。

<a id="execution"></a>

## 更新名称元数据

Host API 接收名称和客户端预期的名称版本。Host 查找会话并在 Catalog 事务内比较版本，保存变化后发布会话状态。传入空值可以恢复默认标签；名称与当前值相同则返回当前状态。名称去除首尾空白后须有 1 至 80 个 Unicode code points。

<a id="mechanisms"></a>

## 并发与同步

版本过期时，Host 会报告冲突，API 客户端可重新读取会话后再提交。浏览器按版本合并实时和刷新得到的数据。普通生命周期和历史更新保留名称及其版本。

<a id="technology"></a>

## 持久化

SQLite 在同一事务中比较版本并写入变化。实时会话事件将名称和版本传给订阅者。

<a id="verification"></a>

## 验证场景

检查并发请求能否拒绝旧版本，历史观察遇到名称更新时能否保留最新版本，以及重启后能否从 Catalog 恢复已保存名称。
