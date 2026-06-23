# Agent 1.0 能力边界

当前只保留两种 Agent：

- Windows 主机版：本机 Windows Service。
- Linux / 飞牛 / NAS 容器版：Docker Compose 部署的容器 Agent。

Hub 同机 Agent 不是第三种安装形态；它仍然是 Linux / 飞牛 / NAS 容器版 Agent，只是由标准 Hub + Agent 同机 Compose 默认一起部署，并由 Hub 通过本机 Token、loopback 连接和指纹规则标记为 `Hub` 机器。

Linux systemd / 裸机 Linux Agent 当前不作为 1.0.5 支持入口展示。只有安装包、发布产物、更新链路、权限模型、能力诊断和验收流程完整后，才能重新加入默认添加机器流程。

## Profile 能力矩阵

| Profile | 安装形态 | 采集边界 | 操作边界 | 前端展示规则 |
| --- | --- | --- | --- | --- |
| `windows-host` | Windows Service | 基础指标、Windows 服务、手动软件、Docker Desktop / Docker Engine、GPU、网络详情、内存条等 Windows 可采集硬件信息 | Windows 服务控制、容器 / Compose 操作、Agent 手动更新 | 可以展示服务 / 软件入口；能力是否可用以 `collection_results` / `diagnostics` 为准 |
| `linux-container` | Linux / 飞牛 / NAS Docker 或 Podman 容器 | 基础指标、Docker / Podman 容器、Compose label、S.M.A.R.T.、GPU、虚拟化、网络详情；硬件能力取决于宿主机设备映射和容器权限 | 容器 / Compose 操作、Agent 容器自更新 | 不展示 Windows 服务 / 软件入口；S.M.A.R.T.、GPU 等只按真实采集结果展示 |
| Hub local Agent | Hub + Agent 同机 Compose 中的 `linux-container` | 与 `linux-container` 相同，额外由 Hub 标记 `Hub` 机器身份 | 与 `linux-container` 相同，但 Hub 机器删除和 Pulse 自身容器危险操作由后端保护 | 页面显示真实机器名和 `Hub` 标签，不显示“本机”，不能通过 UI 或 API 手工伪造 |

能力字段分工：

- `collection` / `operations` 只表示 Agent 声明“会尝试采集 / 支持操作”，不能直接显示为“可用”。
- `collection_results` / `diagnostics` 表示本轮或最近一次真实采集结果，是能力条展示“已采集 / 未发现 / 不支持 / 未知 / 失败 / 过期”的主要依据。
- 旧 Agent 或缺少 `collection_results` 的 Agent，在能力条中显示未知或升级提示，不按旧字段、容器列表、GPU 列表或 SMART 表记录推断为可用。
- 真实硬件详情仍由各模块自己的真实数据展示，例如 SMART 表、网络详情、GPU 图表；但能力条不再用这些模块数据反推“能力可用”。

## Windows 主机版

采集：

- CPU、内存、根磁盘、网络、运行时长等基础指标。
- 手动添加的 Windows 服务状态。
- 手动添加的软件运行状态。
- Docker Desktop / Docker Engine 容器状态。
- 核显型号和占用率；温度能采集则显示。

操作：

- 手动添加的 Windows 服务启动、停止、重启。
- 同机容器启动、停止、重启。
- 基于 Compose label 的同机堆栈启动、停止、重启。
- Agent 手动受控更新。

## Linux / 飞牛 / NAS 容器版

采集：

- CPU、内存、根磁盘、网络、运行时长等基础指标。
- Docker / Podman 容器状态。
- 虚拟化宿主机上的虚拟机清单，当前通过 `virsh`、Proxmox `qm` 或 `VBoxManage` 尽力识别；工具不可用时不显示清单。
- S.M.A.R.T.，取决于容器权限、宿主机设备暴露和工具可用性。
- Intel / AMD 核显型号和占用率，需要 `/dev/dri` 设备映射和足够的容器设备访问权限。

操作：

- 同机容器启动、停止、重启。
- 基于 Docker Compose labels 的同机堆栈启动、停止、重启。
- Agent 手动版本更新：通过设置页发起，Agent 使用 Docker / Podman socket 拉取目标镜像并重建自身容器。

升级：

- Windows 和 Linux / 飞牛 / NAS 容器版统一在设置页发起手动更新。
- Agent 会先比较当前版本和目标版本；如果已经是最新版，只回报“已是最新版”，不会重新安装或重建容器。
- 不再提供自动更新开关。

## 展示规则

- 设备详情页只展示当前 Agent profile 真实相关的能力，不再放单机 Agent 管理页。
- 机器属性为“虚拟化”时才展示虚拟化信息；如果 Agent 识别到宿主机虚拟机清单，则在详情页展示下属虚拟机名称、状态、CPU 和内存。
- Agent 版本更新统一收口到设置页的 Agent 管理。
- 不属于当前 profile 的能力不进入详情页能力展示。
- 已取消能力不进入 Agent 能力声明、Hub 操作动作、前端入口和安装说明。
