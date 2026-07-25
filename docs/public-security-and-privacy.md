# 公开测试安全与隐私边界

本文说明 Pulse 公开测试版本默认保存哪些数据、什么时候会产生外部连接，以及公开反馈时必须避开的信息。它不是正式隐私政策或安全审计证明。

## 本地数据

Pulse 默认把账号、资产、拓扑、监控记录、设置、附件索引和 PocketBase 数据保存在部署时配置的 `pulse_data` 目录。设备图片也可能保存在管理员指定的外置目录。迁移包、完整备份、日志和导出文件可能包含账号、Token、通知配置、家庭网络地址及资产资料，必须按敏感数据保管。

项目仓库和公开演示只允许使用独立虚拟数据。示例地址使用 `192.0.2.0/24`、`198.51.100.0/24` 或 `203.0.113.0/24` 等保留网段，不提交真实数据库、备份、日志、凭据、家庭图片或私有部署地址。

## 遥测与外部连接

Telemetry is disabled by default. Pulse 默认不发送产品使用分析、崩溃报告或家庭资产清单。

以下由用户主动配置或触发的功能会产生必要的外部连接，但不属于默认遥测：

- 网站监控和公网地址检测访问用户指定的目标；
- 通知通道向用户配置的服务发送告警内容；
- AI 资料补全把当前任务所需内容发送给用户选择的模型提供方；
- Agent 连接用户配置的 Hub，版本检查或更新访问配置的发布源；
- 镜像拉取、软件更新和浏览器访问遵循对应工具及服务的网络行为。

启用这些功能前，应检查目标服务的隐私条款、传输内容和凭据权限。Pulse 不替代第三方服务自己的隐私承诺。

## 部署责任

- 不要把开发端口直接暴露到公网；远程访问应使用经过验证的反向代理、TLS、认证和访问控制。
- 为 `pulse_data`、外置图片目录和备份设置最小权限，并对备份传输及长期归档加密。
- 分享日志、截图、迁移包或问题复现前，删除 Token、Cookie、账号、MAC、真实 IP、域名、资产编号和可识别图片。
- Agent 可能读取宿主机硬件、服务、容器和网络状态；只在自己拥有或获授权的机器上安装。

## 安全问题

发现疑似漏洞时，请按 [安全策略](../SECURITY.md) 使用 GitHub Private Vulnerability Reporting，不要把可利用细节写入公开 issue。

## English Summary

Pulse stores application data in the configured `pulse_data` directory and does not send usage analytics, crash reports, or asset inventories by default. User-configured monitoring, notification, AI, Agent, update, and registry features may contact their selected external services. Public reports and demos must use synthetic data and reserved example networks. Report vulnerabilities through GitHub Private Vulnerability Reporting as described in [SECURITY.md](../SECURITY.md).
