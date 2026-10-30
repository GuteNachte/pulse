# 当前开发盘点

更新时间：2026-09-30

## 当前阶段

Pulse 当前固定稳定版本为 `1.0.5`，公开预发布与 FlyNAS 试用部署版本为 `1.0.6-beta.6`。这个文档只记录当前仍有维护价值的开发约定、能力边界、部署口径和后续风险，不再保存已经过期的本机测试账号或临时验收日志。

当前保留的 Agent 形态：

- Windows Agent：Windows Service 主机版。
- Linux 通用 Agent：Docker 容器版，默认数据目录 `/opt/pulse-agent/data`。
- 飞牛 / NAS Agent：Docker 容器版，默认数据目录 `/vol1/1000/docker/pulse-agent/data`，可下载专用 Compose YAML。
- Unraid Agent：Docker 容器版，通过 Unraid 安装命令或模板接入。
- Hub 同机 Agent：随标准 Hub Compose 一起部署，使用 `Hub` 标签和删除保护标识。

macOS Agent 不纳入 `1.0.5`，后续版本单独规划。

本地开发库管理员账号必须按本机初始化流程重新生成，仓库不记录明文邮箱和密码；需要验证时以本机实际初始化结果为准，不要把这里的占位说明当成默认凭据。

Windows Agent 安装器工具：Wails CLI `v2.15.0` 位于 `C:\Users\Gute\go\bin\wails.exe`，Inno Setup 编译器 `6.7.3` 位于 `C:\Users\Gute\AppData\Local\Programs\Inno Setup 6\ISCC.exe`；两者均安装在项目目录之外。当前 Inno Setup 未安装简体中文语言包，安装向导暂使用英文，未获确认前不新增语言组件。

## 版本与发布口径

已确认：

- Hub / Agent / Web / Android App 使用同一个显式版本号；当前固定发布版本为 `1.0.5`，当前开发版本为 `1.0.6`（代码内各端版本号已对齐）。
- `1.0.6-beta.6` 已通过 GitHub Releases / GHCR 公开发布，并以同版本 Hub、Agent、Web 和 Android App 产物完成公开验收；正式稳定版仍为 `1.0.5`，不能把预发布误写成稳定版。
- `v1.0.6-beta.6` 固定指向公开仓库 `main` 合并提交 `6e283c36085ccf14146ee2bc4aacdc40730e41f9`，旧 beta 标签不得移动、删除或复用。
- `1.0.6-beta.6` Hub 镜像摘要为 `sha256:72e341710c2e4ea17aa8c2ca00eca7fbdb68bec0bae8731407f9504b34f9f755`，Agent 镜像摘要为 `sha256:b83a1694fa5a2aed1ddb49228fcb4dba7d4f0220bd1ed5e6a6d3f600b0773afb`；GHCR 与 Harbor 摘要一致。
- Harbor 默认镜像命名：
  - `registry.example.com/infra/pulse-hub:1.0.5`
  - `registry.example.com/infra/pulse-agent:1.0.5`
- 发布不使用 `latest` 标签。
- 新版本发布统一使用 `supplemental/scripts/publish-release-v1.ps1`，同一个版本号同步构建并推送 Hub、Linux / NAS Agent 镜像和 Windows Agent 安装包。
- 发布前必须运行版本一致性校验，参数使用本次要发布的显式版本号（当前开发为 `1.0.6`）：`supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6`。
- 发布后验证使用：`supplemental/scripts/verify-release-v1.ps1 -Version 1.0.5`；需要跳过 registry 时显式使用 `-SkipRegistry`。

## 部署口径

已确认：

- 正式部署推荐 Linux / NAS / 飞牛 Docker Compose。
- 正式 Hub 和容器版 Agent 默认 `network_mode: host`。
- 正式 FlyNAS 部署目录为 `/vol1/1000/docker/pulse`。
- 当前 FlyNAS Hub 地址为 `http://192.168.1.30:8090`；`192.168.1.10:8090` 保留为 Windows 源码开发 Hub，不能继续作为 FlyNAS Agent 的正式上联。
- 2026-07-30 升级前实际运行版本为 `1.0.6-beta.5`；当前 FlyNAS 运行 `registry.example.com:443/infra/pulse-hub:1.0.6-beta.6` 和 `registry.example.com:443/infra/pulse-agent:1.0.6-beta.6`，两个容器均为 `network_mode: host`、Compose 项目名均为 `pulse`，健康检查正常且重启次数为 `0`。
- Hub 数据目录为 `/vol1/1000/docker/pulse/pulse_data`；Agent 继续复用 `/vol1/1000/docker/pulse-agent/data` 保存设备身份和本地状态。
- `/vol1/1000/docker/docker-compose.yml` 是指向 `pulse/docker-compose.yml` 的兼容符号链接；正式维护统一进入 `/vol1/1000/docker/pulse` 执行。
- Hub 同机 Agent 使用 `.env` 中权限为 `600` 的 `PULSE_LOCAL_AGENT_TOKEN`，Hub 与 Agent 共享同一随机值；禁止把值写入仓库、文档或日志，也不要退回公开默认 Token。
- 迁移前完整实例备份存放在 `Z:\Pulse-Secrets\Instance-Backups\1.0.6-beta.4`，对应 NAS 路径为 `/vol1/1000/Pulse/Pulse-Secrets/Instance-Backups/1.0.6-beta.4`；`beta.6` 原位升级前的一致性回滚包位于 `Z:\Pulse-Secrets\Deployment-Backups\pre-beta6-20260730-193157`，对应 NAS 路径为 `/vol1/1000/Pulse/Pulse-Secrets/Deployment-Backups/pre-beta6-20260730-193157`，其中 Compose、`.env`、Hub 数据和 Agent 数据的 `SHA256SUMS` 已复核通过。
- 飞牛自动部署 SSH 用户固定为 `gutenacht`，专用私钥位于 `C:\Users\Nacht\.ssh\pulse-flynas-ed25519`，公钥备份位于 `Z:\Pulse-Secrets\FlyNAS\pulse-deploy.pub`，指纹为 `SHA256:EUAWA+zX2aYnGrJhZGQ4DkwYm/hB2mtjoguuon1YkwE`；文档只记录路径和指纹，禁止记录私钥内容或口令。
- Hub 同机 Agent 默认通过 `http://127.0.0.1:8090` 连接 Hub。
- Hub 同机 Agent 的连接通道与页面身份地址分开处理：WebSocket 继续走 `http://127.0.0.1:8090`，页面与 `systems.info.ip` 使用 Agent 真实物理网卡上报的 FlyNAS 局域网地址 `192.168.1.30`；不得显示 Docker 网桥 `172.17.0.1`，也不得为了显示 LAN 地址而放宽 loopback-only Token。该源码修复进入 `1.0.6-beta.4` 之后的下一统一版本。
- 当前 Windows 开发机 `UM-690` 的 Agent 已改为连接正式 FlyNAS Hub `http://192.168.1.30:8090`，复用迁移前系统 ID 与配对身份，并于 2026-07-30 升级到 `1.0.6-beta.6`；FlyNAS 同机 Agent 和 Windows Agent 均在线且没有新增重复机器，本地源码 Hub 不再接收这台机器的实时上报。
- `beta.6` 部署前后核心数据计数一致：资产 `18`、资产接口 `36`、资产关系 `15`、系统 `2`、网站监控 `0`、受监控服务 `0`、用户 `1`。
- 2026-07-31 完成智能家居资料同步后，FlyNAS 当前运行数据为资产 `18`、资产接口 `37`、资产关系 `15`；新增的是 UM690 科技网 Wi-Fi 6E 辅助接口，原 2.5GbE 主接口和 15 条关系未改变。完成后完整备份为 `Z:\Pulse-Secrets\Instance-Backups\post-smarthome-flynas-20260731-001126\pulse_backup_20260731_001126.zip`，SHA256 已校验。
- 给其他机器复制 Agent 安装命令时，Hub URL 必须使用该机器能访问的局域网地址：接入正式 FlyNAS Hub 使用 `http://192.168.1.30:8090`；只有明确接入 Windows 源码 Hub 时才使用 `http://192.168.1.10:8090`。外部 Agent 不能使用 `localhost`，FlyNAS 同机 Agent 则必须保留 `http://127.0.0.1:8090` 以满足本机 Token 和 Hub 身份规则。
- Docker socket 权限决定容器控制能力：只读或无权限只能监控，不能执行容器控制。

## Agent 能力边界

已确认：

- Windows Agent：基础指标、Windows 服务状态/控制、软件运行状态监控、容器监控/控制、Agent 更新、GPU 尝试采集、物理磁盘与存储健康（Windows Storage API，无 smartctl 时仍可采集）。
- Linux / 飞牛 / NAS / Unraid 容器 Agent：基础指标、容器监控/控制、Compose 堆栈控制、S.M.A.R.T.、可选 GPU、Agent 镜像更新。
- Agent 能力显示只认真实采集诊断和 `collection_results`，不能用前端猜测把未采集能力显示为可用。
- 硬件标签必须来自 Agent 上报或真实采集字段：CPU 厂商、GPU 核显/独显、内存 DDR、磁盘 SSD/HDD/NVMe、网卡速率、IP 获取方式都不能用占位数据。
- 网卡采集只保留真实物理网卡；虚拟网卡不作为主展示来源。

## 功能状态

### 机器接入

已完成：

- 添加机器采用配对流程：先填写目标信息并复制安装命令，Agent 真实连上 Hub 后才能确认添加成功。
- Windows、Linux 通用、飞牛 / NAS、Unraid 的安装入口已拆分。
- Windows 安装支持一行命令和完整 PowerShell 脚本预览。
- Linux / 飞牛 / Unraid 安装模板默认开启全部已支持采集能力。
- 关闭手动复制命令弹窗不会连带关闭添加系统弹窗。

### 客户端与系统详情

已完成：

- 客户端卡片优先显示真实 CPU、内存、磁盘、GPU、上行/下行网络速率和运行时间。
- 温度和电池不在客户端卡片堆叠展示，改到对应详情页硬件或传感器区域。
- 系统详情身份详情改为顶部按钮和弹窗展示。
- CPU、内存、网络、磁盘、GPU 等详情页按模块收敛，避免在 CPU 页面重复展示无关带宽和内存图表。
- 图表底部留出安全间距，避免图例贴边。

### 容器监控与控制

已完成：

- Linux Docker Agent 通过 Docker socket 控制同机容器。
- Windows Agent 支持 Docker Desktop / Docker Engine 容器监控和控制。
- 支持容器启动、停止、重启。
- 支持基于 Docker Compose label 的堆栈启动、停止、重启。
- Pulse / Hub / Agent 相关受保护容器不能通过通用容器操作误停或误更新。

### 软件与服务监控

已完成：

- 软件与服务监控只保留在每台机器详情页。
- 软件只做运行状态监控。
- Windows 服务按白名单执行启动、停止、重启。
- Docker / containerd / Podman 等容器运行时不会被软件监控误纳入普通软件规则。

### 网站监控

已完成：

- `/websites` 作为网站监控入口。
- 支持同一服务配置内网 / 外网、IPv4 / IPv6 多地址。
- 检测记录按地址独立展示状态、响应时间和趋势。
- 未配置外网地址时默认展示“未配置”，不伪造检测结果。

### 设置与管理

已完成：

- 常用设置迁入前台设置页。
- PocketBase 后台保留为高级维护入口。
- 人工 Agent Token 管理已移除；日常接入统一使用资产级 6 位长期配对码，配对后的机器连接凭据由 Hub 自动生成并由 Agent 保存。
- 操作审计、系统日志、备份、用户管理、通知设置都使用前台管理页。
- 关于页版本历史按端记录 Web / Hub、Android App、Agent、部署 / 发布变化。

## 当前风险

1. 清理类改动最终提交前必须完整跑前端、Go、Android 和版本一致性验证（2026-09-30 起工作区已干净；当日已把配对码相关测试基线修复回全绿）。
2. `LICENSE` 保留原始版权来源信息；除非明确改变法律授权策略，不应为了“去旧项目名”随意改版权行。
3. Docker `network_mode: host` 和部分 Agent `privileged` / 设备映射是采集能力和 NAS 部署需要，不应按普通 Web 服务安全规则直接删除。
4. 发布文档里包含 Harbor、FlyNAS 和局域网部署默认值，这是当前私有部署口径；如果以后要公开到 GitHub，需要再决定是否把这些值改成示例变量。
5. macOS Agent 暂未纳入当前版本，后续版本需要单独设计安装、采集和签名策略。
6. Windows Agent 不提交内置 `smartctl.exe` 二进制；缺少内置文件时源码仍可编译，运行时会回退到系统安装路径。需要发布内置版本时必须显式下载并使用 `embedded_smartctl` build tag。没有 smartctl 时，Windows 采集器改用 Windows Storage Management API 上报物理磁盘清单与健康状态，温度/通电时间等仅在存储驱动提供可靠性计数器时显示，不用默认值补齐。
7. Docker Compose 管理已有容器前必须先读取 `com.docker.compose.project` 标签；旧 FlyNAS Agent 的项目名是 `agent`，遗漏 `-p agent` 会出现“Compose 显示无容器、同名容器却仍存在”的假象。
8. 已发布的 `1.0.6-beta.6` Hub 仍会警告项目解析到 `modernc.org/sqlite v1.53.0`，而 PocketBase `v0.39.4` 明确测试的是 `v1.52.0`；下一版本源码已恢复 `sqlite v1.52.0` / `libc v1.72.3` 并加入依赖、备份完整性和临时恢复契约，待完整回归和下一统一版本部署后再补真实运行态证据，不能在线修改现有容器。

## 收口前验证清单

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
go vet -tags=testing ./...
go test -tags=testing -count=1 ./...
# Android 暂停开发期间（PBL-008）跳过下面这行，恢复开发后再执行：
# internal/site/android/gradlew.bat testDebugUnitTest
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5
```
