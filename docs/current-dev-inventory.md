# 当前开发盘点

更新时间：2026-06-24

## 当前阶段

Pulse 当前固定发布版本为 `1.0.5`。这个文档只记录当前仍有维护价值的开发约定、能力边界、部署口径和后续风险，不再保存已经过期的本机测试账号、旧镜像 digest、旧运行态版本或临时验收日志。

当前保留的 Agent 形态：

- Windows Agent：Windows Service 主机版。
- Linux 通用 Agent：Docker 容器版，默认数据目录 `/opt/pulse-agent/data`。
- 飞牛 / NAS Agent：Docker 容器版，默认数据目录 `/vol1/1000/docker/pulse-agent/data`，可下载专用 Compose YAML。
- Unraid Agent：Docker 容器版，通过 Unraid 安装命令或模板接入。
- Hub 同机 Agent：随标准 Hub Compose 一起部署，使用 `Hub` 标签和删除保护标识。

macOS Agent 不纳入 `1.0.5`，后续版本单独规划。

本地开发库管理员账号必须按本机初始化流程重新生成，仓库不记录明文邮箱和密码；需要验证时以本机实际初始化结果为准，不要把这里的占位说明当成默认凭据。

## 版本与发布口径

已确认：

- Hub / Agent / Web / Android App 使用同一个显式版本号 `1.0.5`。
- Harbor 默认镜像命名：
  - `registry.example.com/infra/pulse-hub:1.0.5`
  - `registry.example.com/infra/pulse-agent:1.0.5`
- 发布不使用 `latest` 标签。
- 新版本发布统一使用 `supplemental/scripts/publish-release-v1.ps1`，同一个版本号同步构建并推送 Hub、Linux / NAS Agent 镜像和 Windows Agent 安装包。
- 发布前必须运行版本一致性校验：`supplemental/scripts/check-version-consistency.ps1 -Version 1.0.5`。
- 发布后验证使用：`supplemental/scripts/verify-release-v1.ps1 -Version 1.0.5`；需要跳过 registry 时显式使用 `-SkipRegistry`。

## 部署口径

已确认：

- 正式部署推荐 Linux / NAS / 飞牛 Docker Compose。
- 正式 Hub 和容器版 Agent 默认 `network_mode: host`。
- 正式 FlyNAS 部署目录为 `/vol1/1000/docker/pulse`。
- Hub 同机 Agent 默认通过 `http://127.0.0.1:8090` 连接 Hub。
- 给其他机器复制 Agent 安装命令时，Hub URL 必须使用该机器能访问的局域网地址，例如 `http://192.168.1.10:8090`，不能使用浏览器里的 `localhost`。
- Docker socket 权限决定容器控制能力：只读或无权限只能监控，不能执行容器控制。

## Agent 能力边界

已确认：

- Windows Agent：基础指标、Windows 服务状态/控制、软件运行状态监控、容器监控/控制、Agent 更新、GPU 尝试采集。
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
- Agent Token 管理从日常接入中拆出，放入高级入口。
- 操作审计、系统日志、备份、用户管理、通知设置都使用前台管理页。
- 关于页版本历史按端记录 Web / Hub、Android App、Agent、部署 / 发布变化。

## 当前风险

1. 当前工作区有大量清理改动，最终提交前必须完整跑前端、Go、Android 和版本一致性验证。
2. `LICENSE` 保留原始版权来源信息；除非明确改变法律授权策略，不应为了“去旧项目名”随意改版权行。
3. Docker `network_mode: host` 和部分 Agent `privileged` / 设备映射是采集能力和 NAS 部署需要，不应按普通 Web 服务安全规则直接删除。
4. 发布文档里包含 Harbor、FlyNAS 和局域网部署默认值，这是当前私有部署口径；如果以后要公开到 GitHub，需要再决定是否把这些值改成示例变量。
5. macOS Agent 暂未纳入当前版本，后续版本需要单独设计安装、采集和签名策略。
6. Windows Agent 不提交内置 `smartctl.exe` 二进制；缺少内置文件时源码仍可编译，运行时会回退到系统安装路径。需要发布内置版本时必须显式下载并使用 `embedded_smartctl` build tag。

## 收口前验证清单

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
go vet -tags=testing ./...
go test -tags=testing -count=1 ./...
internal/site/android/gradlew.bat testDebugUnitTest
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5
```
