# Pulse

![Version](https://img.shields.io/badge/version-1.0.9-3B82F6) ![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20Android-2E9E8F) ![Backend](https://img.shields.io/badge/backend-PocketBase%20%2B%20Go-6D5AA8) ![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite%20%2B%20Tailwind-A8743E)

**Pulse** 是一个面向家庭场景的自托管资产管理与监控平台：把家里的数码硬件、网络设备、智能设备、服务端点统一建成清晰的资产主档，能采集的设备叠加 Agent / SNMP / 网站监控，不能采集的设备也保持一目了然；在此之上提供网络拓扑设备地图、真实在线探测、容器与网站监控、告警与操作审计。

🌐 **在线演示（只读，虚构数据）**：<https://pulse-demo-gute-nacht.vercel.app> —— 无需登录，不连接任何真实设备。

## 功能亮点

- 🗺️ **网络拓扑设备地图**：React Flow 交互拓扑，设备卡片带类型身份色与真实三态在线状态（Agent 心跳优先于网络探测），编辑页支持拖拽布局与连线管理。
- 📡 **设备在线探测**：Hub 每分钟对登记 IP 的资产做 ping 探测，连续失败防抖判定离线，与 Agent 心跳合并出可信在线结论。
- 🗂️ **资产主档**：9 大类编号体系、按类型组织的硬件档案、内存 / 存储插槽表、自定义参数分组，支持粘贴批量录入与 AI 辅助取参。
- 🖥️ **主机监控**：CPU / 内存 / 磁盘 / 网络 / GPU / 温度 / 电池 / S.M.A.R.T.（含中文属性映射）全量采集，Windows 免 smartctl 采集物理盘健康。
- 🐳 **容器监控**：Docker / Podman 容器状态、资源占用与 Compose 归组。
- 🌐 **网站监控**：内外网目标、IPv4 / IPv6、响应时间、失败分类与检测历史。
- 🔔 **告警与通知**：资源 / 容器 / 服务 / 网站异常统一告警，分级通知与操作审计。
- 💾 **备份恢复**：本地完整备份与恢复校验。
- 📱 **Android App**：与 Web 同版本发布。

## 架构

- **Hub**：PocketBase 单二进制，承载页面、API、告警、审计、备份、Agent 版本仓库与发布管理。
- **Agent**：Windows 服务版 / Linux（NAS、飞牛、UNRAID）容器版，采集系统指标、容器、服务、硬件能力与网络详情。
- **模块化底座**：功能以模块组织（资产中心、设备在线探测、通知、AI 能力……），可在设置页按需开关；Hub、Agent、Web、Android 四端使用同一显式版本号发布。

## 快速开始（Docker）

如果你只想先把 Pulse 跑起来看看，用公开镜像一条命令即可：

```bash
mkdir -p ~/pulse && cd ~/pulse
curl -fsSLO https://raw.githubusercontent.com/GuteNachte/pulse/main/supplemental/docker/same-system/docker-compose.yml
docker compose up -d
```

然后打开 `http://<主机局域网IP>:8090`。完整说明（端口、数据目录、自建镜像、升级、排错）见 [docs/docker-quickstart.md](docs/docker-quickstart.md)。

## 发布流程

项目自身的发版用 `supplemental/scripts/release.ps1` 向导一条命令完成（版本改写→验证→审计→构建→镜像→离线包→GitHub Release），流程详见 [docs/release-process.md](docs/release-process.md)。

## 本地开发

Windows 日常开发直接双击项目根目录的 `Start-Pulse-Dev.cmd`：它会启动或复用 Hub 与 Vite，健康检查通过后自动打开 Web 页面；优先使用 PowerShell 7，未安装时兼容回退到 Windows PowerShell 5.1。

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

当前正式版本为 `1.0.9`（2026-10-29 发布）。

版本发布要求：

- Hub、Agent、Web 前端、Android App 使用同一个显式版本号。
- Docker 镜像、Compose 模板、安装脚本、发布脚本和 About 页记录保持一致。
- 发布前必须通过版本一致性校验和本地验证命令。

验证命令：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
go test -tags=testing -count=1 -timeout=240s ./...
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.9
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
