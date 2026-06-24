# Pulse 定制路线图

## 产品定位

Pulse 是内网自用的轻量监控控制台，重点是稳定监控、真实硬件与网络采集、手动添加的软件/服务状态、容器管理、网站监控和可维护的 Agent 发布方式。

1.0.5 固定版本保留以下 Agent 形态：

- Windows 主机版：Windows Service 安装。
- Linux 通用 Docker 容器版：默认使用 `/opt/pulse-agent/data`。
- 飞牛 / NAS Docker 容器版：默认使用 `/vol1/1000/docker/pulse-agent/data`，支持下载专用 Compose YAML。
- Unraid Docker 容器版：通过 Unraid 安装命令或模板接入。
- Hub 同机 Agent：随标准 Hub Compose 部署，用 `Hub` 标签标识并受删除保护。

## 1.0 范围

### Windows 主机版

采集：

- 基础系统指标。
- 手动添加的 Windows 服务状态。
- 指定软件运行状态。
- Docker Desktop / Docker Engine 容器状态。
- 核显型号和占用率；温度能采集则显示。

操作：

- 白名单内 Windows 服务启动、停止、重启。
- 同机容器启动、停止、重启。
- Compose 堆栈启动、停止、重启。
- Agent 手动版本更新。

### Linux / 飞牛 / NAS Docker 容器版

采集：

- 基础系统指标。
- Docker / Podman 容器状态。
- 虚拟化宿主机上的虚拟机清单，当前通过 `virsh`、Proxmox `qm`、`VBoxManage` 尽力采集。
- SMART，取决于容器权限和宿主机设备挂载。
- Intel / AMD 核显指标，取决于 `/dev/dri` 设备映射、容器权限和容器内工具。

操作：

- 同机容器启动、停止、重启。
- 基于 Docker Compose label 的堆栈启动、停止、重启。
- Agent 手动版本更新。

升级：

- 通过设置页 Agent 管理统一发起；Agent 先按版本号判断，已是最新版时只回报状态，不重新安装。

### Unraid Docker 容器版

采集与 Linux / 飞牛 / NAS 容器版保持同一能力边界，安装入口按 Unraid 使用习惯生成命令或模板。

### Hub 同机 Agent

- 标准 Hub Compose 默认同时部署 Hub 同机 Agent。
- Hub 同机 Agent 使用 loopback-only Hub 同机 Token 接入。
- 页面显示真实机器名和 `Hub` 标签，不再使用“本机”作为设备身份。
- Hub 机器记录受删除保护。

## 页面规划

- 首页：设备总览和关键状态。
- 设备详情页：基础指标卡片、侧边栏图表详情、容器、SMART、GPU、操作记录。
- 容器页：全部容器监控和控制，包含 Compose 堆栈操作。
- Windows 设备详情页的软件与服务监控：手动添加的软件、Windows 服务；Linux / NAS / 容器版不显示该入口，容器由容器页默认监控和控制。
- 设置页：常规设置、Agent 设置、通知设置、用户、日志、备份、高级入口；Agent 更新只保留在设置页。
- 高级入口：保留 PocketBase 后台入口和 Agent 接入 Token 管理入口。

## 发布策略

- Hub 镜像：`registry.example.com/infra/pulse-hub:<version>`。
- Agent 镜像：`registry.example.com/infra/pulse-agent:<version>`。
- 第一版稳定版本固定为 `1.0.0`；当前固定发布版本为 `1.0.5`，后续开发继续使用显式版本号同步推进 Hub、Agent、Web 和 Android App。
- 不使用 `latest` 作为部署标签。
- 后续版本仓库只保留最近两个版本，包括正在使用的版本。

## 后续优先级

1. 为后续版本单独规划 macOS Agent 的安装、采集、签名和更新链路。
2. 继续收口公开仓库表面：README、模板、示例配置、文档和脚本保持中文 Pulse 口径。
3. 做一轮完整回归：初始化、登录保持、首页、客户端、详情页、容器页、网站监控、告警、设置页、备份 / 日志 / 用户 / 高级入口。
4. 发布前完整执行前端、Go、Android、版本一致性和发布验证脚本。


