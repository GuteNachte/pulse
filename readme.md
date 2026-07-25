# Pulse

Pulse 是一个面向家庭场景的家庭资产管理与监控平台，用来统一管理家里的数码硬件、网络设备、智能设备、服务端点、监控状态、告警、操作审计和 Agent 版本发布。

这个项目的目标不是做一个只展示曲线的监控面板，而是先把家庭里的所有电子设备建成清晰、可信、可维护的资产主档；能采集的设备叠加 Agent、SNMP、网站监控或后续智能家居状态，不能采集的设备也能通过手动档案保持一目了然。Hub、Agent、Web 前端和 Android App 使用同一个显式版本号发布，避免线上组件版本错位。

## 核心能力

- 资产中心：统一维护家庭硬件、网络设备、智能设备、网页端点和自定义资产的长期主档。
- 客户端监控：展示在线、离线、暂停、待接入、Hub 同机 Agent 等真实状态。
- Agent 接入：支持 Windows 主机版、Linux / NAS / 飞牛容器版和 Unraid 安装模板。
- 硬件采集：CPU、内存、磁盘、网络、GPU、温度、电池、S.M.A.R.T.、虚拟化信息等。
- 容器监控：展示 Docker / Podman 容器状态、资源占用和可信 Compose 归组。
- 服务和软件监控：面向 Windows 服务、软件进程和自定义监控目标。
- 网站监控：支持内网 / 外网目标、IPv4 / IPv6、响应时间、检测历史和失败分类。
- 告警与通知：统一处理资源、容器、服务、软件、网站异常和通知失败记录。
- 操作审计：记录网站检测、容器操作、服务控制、备份、用户、Token 和 Agent 版本相关操作。
- 备份与恢复：管理本地数据备份，并对敏感数据做明确提示。
- 移动端支持：提供 Android App 和手机 / 平板优先的 Web 布局。

## 架构

Pulse 由两个主要组件组成：

- Hub：基于 PocketBase 的 Web 管理端，负责页面、API、告警、审计、设置、备份、Agent 版本和发布管理。
- Agent：运行在被监控机器上，负责采集系统指标、容器、服务、软件、硬件能力和网络详情，并主动连接 Hub。

常见部署方式是 Hub 和一台 Hub 同机 Agent 一起运行，其他机器再通过安装向导接入。

## 本地开发

Windows 日常开发直接双击项目根目录的 `Start-Pulse-Dev.cmd`。它会启动或复用 Hub 与 Vite，健康检查通过后自动打开 Web 页面；优先使用 PowerShell 7，未安装时兼容回退到 Windows PowerShell 5.1。

首次需要桌面入口时运行：

```powershell
pwsh -NoProfile -File supplemental\scripts\install-dev-shortcut.ps1
```

需要强制重启时仍使用标准维护命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-dev.ps1 -Restart
```

启动后访问：

- Web 前端：`http://localhost:5173`
- Hub API：`http://localhost:8090`

更多本地开发、Docker 测试和发布前验证流程见：

- `docs/local-dev-runbook.md`
- `docs/dev-startup-checklist.md`

## 部署

正式部署推荐使用 Linux / NAS / 飞牛上的 Docker Compose，Hub 和 Hub 同机 Agent 默认使用显式镜像版本号，不使用 `latest`。

部署和回滚手册见：

- `docs/agent-1.0-install.md`
- `docs/flynas-compose-checklist.md`
- `docs/release-deployment-runbook.md`

## 版本

当前固定版本为 `1.0.5`。

版本发布要求：

- Hub、Agent、Web 前端、Android App 使用同一个显式版本号。
- Docker 镜像、Compose 模板、安装脚本、发布脚本和 About 页记录保持一致。
- 发布前必须通过版本一致性校验和本地验证命令。

验证命令：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
go test -tags=testing -count=1 -timeout=240s ./...
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5
```

## 文档

- `docs/release-notes-1.0.5.md`：1.0.5 正式更新说明。
- `docs/release-notes-next.md`：当前版本之后的开发记录入口。
- `docs/production-readiness-checklist.md`：上线验收清单。
- `docs/production-acceptance-evidence.md`：上线验收证据。
- `docs/agent-capability-boundary.md`：Agent 能力边界说明。
- `docs/pulse-roadmap.md`：后续规划。

## 许可证

Pulse 包含自定义应用代码，同时保留上游开源项目的许可证义务。详见 [LICENSE](LICENSE)。
