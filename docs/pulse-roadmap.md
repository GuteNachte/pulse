# Pulse 定制路线图

## 产品定位

Pulse 是内网自用的轻量监控控制台，重点是稳定监控、手动添加的软件/服务状态、容器管理和可维护的 Agent 发布方式。

1.0 版本只保留两种 Agent：

- Windows 主机版：本机 Windows Service 安装。
- Linux / 飞牛 / NAS Docker 容器版：Docker Compose 安装。

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

## 页面规划

- 首页：设备总览和关键状态。
- 设备详情页：基础指标卡片、侧边栏图表详情、容器、SMART、GPU、操作记录。
- 容器页：全部容器监控和控制，包含 Compose 堆栈操作。
- Windows 设备详情页的软件与服务监控：手动添加的软件、Windows 服务；Linux / NAS / 容器版不显示该入口，容器由容器页默认监控和控制。
- 设置页：常规设置、Agent 设置、通知设置、用户、日志、备份、高级入口；Agent 更新只保留在设置页。
- 高级入口：只保留 PocketBase 后台入口。

## 发布策略

- Hub 镜像：`registry.example.com/infra/pulse-hub:<version>`。
- Agent 镜像：`registry.example.com/infra/pulse-agent:<version>`。
- 第一版稳定版本固定为 `1.0.0`；当前已发布稳定版为 `1.0.4`，后续开发继续使用显式版本号同步推进 Hub 和 Agent。
- 不使用 `latest` 作为部署标签。
- 后续版本仓库只保留最近两个版本，包括正在使用的版本。

## 后续优先级

1. 验证 Windows Agent 服务控制和手动更新闭环。
2. 验证 Linux Docker Agent 在飞牛 / NAS 上的容器控制、Compose 堆栈控制和手动镜像更新闭环。
3. 收口 Agent 设置页，删除没有实际功能的模块。
4. 做一轮完整回归：登录保持、首页、详情页、容器页、设置页、备份/日志/用户、高级入口。


