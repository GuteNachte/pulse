# 当前定制盘点

更新时间：2026-06-10

## 当前阶段

项目已完成 1.0.4 镜像发布。当前只保留两种 Agent 形态：

- Windows Agent：本机 Windows Service 模式。
- Linux / 飞牛 / NAS Agent：Docker Compose 容器模式。

当前重点是继续观察真实设备闭环、统一整理提交边界，并进入下一个版本的开发记录。

本地开发库管理员账号：`admin` / `723859215@qq.com`，密码：`12345678`。该凭据只用于本机开发验证，不作为正式部署默认密码。

## 功能状态

### Agent 能力边界

已完成：

- Windows Agent 声明基础指标、手动添加的 Windows 服务状态/控制、软件运行状态监控、容器监控/控制、Agent 手动更新、GPU 尝试采集。
- Linux Docker Agent 声明基础指标、容器监控/控制、Compose 堆栈控制、SMART、可选 GPU、Agent 手动镜像更新。
- Agent 能力声明只上报当前 profile 相关能力。
- Hub 入库时会清洗旧 Agent 上报的过期能力字段。

- 新版 Linux Docker Agent 已发布到 Harbor，飞牛正式目录 `/vol1/1000/docker/pulse` 的 Compose 文件已改为 `1.0.4` 镜像；运行容器仍待具备 Docker 权限的用户执行重建。
- 本地开发环境已完成 Linux / NAS 容器版 Agent 手动更新闭环：`nacht` 从 `1.0.2` 通过设置页 Agent 管理拉取 `registry.example.com/infra/pulse-agent:1.0.3` 并重建为 `1.0.3`。
- Windows Agent 的核显型号和占用率采集稳定性。

### 容器监控与控制

已完成：

- Linux Docker Agent 通过 Docker socket 控制同机容器。
- Windows Agent 支持 Docker Desktop / Docker Engine 容器监控和控制。
- 支持容器启动、停止、重启。
- 支持基于 Docker Compose label 的堆栈启动、停止、重启。
- 受保护的 Pulse / Pulse 相关容器已从源头阻止通用容器操作：单容器的启动、停止、重启、更新镜像都会被后端拒绝；包含受保护容器的 Compose 编排会整组阻止批量操作，Agent 更新只走设置页 Agent 管理。
- 本地开发 Hub 已验证 `nacht` 容器页：10 个容器识别为 `agent` 和 `harbor` 两个 Compose 编排；`pulse-agent` 单容器和包含它的 `agent` 编排通用操作均被后端 403 拒绝，普通 `harbor` 编排仍保留可操作入口。
- 飞牛正式机器 SSH 验证：`pulse-hub` 与 `pulse-agent` 均为 Compose 管理、`network_mode=host`；Compose 文件当前已更新为 `registry.example.com/infra/pulse-hub:1.0.4` 和 `registry.example.com/infra/pulse-agent:1.0.4`，但当前 SSH 用户无 Docker socket 权限且 `sudo docker` 需要交互密码，运行容器仍返回 `v=1.0.3`。

待验证：

- 飞牛 Compose 部署的容器列表、堆栈识别、批量操作是否稳定。

### 软件与服务监控

已完成：

- 软件与服务监控只保留在每台机器详情页里，作为该机器的手动监控规则入口。
- 软件只做运行状态监控。
- Windows 服务可按白名单执行启动、停止、重启。
- 容器不再作为“重点监控”单独配置，采集到的容器默认进入容器监控页和告警体系。
- 本地开发环境已完成 Windows 主机版软件与服务监控只读闭环验证：`GuteNacht` 可搜索 Windows 服务和软件，添加 `explorer.exe` 软件规则与 `Windows Search` 服务规则后，Agent 下一轮采集会写入 `monitored_software` / `monitored_services`，详情页“软件与服务”区域显示 `软件 1`、`服务 1` 且状态为运行中。
- 受保护 Windows 服务控制边界已验证：`EventLog` 即使临时加入监控规则，`restart_monitored_service` 也会在 Hub 端返回 `403`，不会下发到 Agent。
- 规则删除/禁用后的状态清理已补强并通过测试：移除 `software_monitor_rules` / `service_control_rules` 时同步清理对应 `monitored_software` / `monitored_services`，避免底层状态表残留脏数据。
- Windows 服务真实控制闭环已验证：`GuteNacht` 临时添加 `Windows Search` 服务规则后，Hub 执行 `stop_monitored_service`、`start_monitored_service` 和 `restart_monitored_service` 均成功；停止后 Agent 搜索和状态表显示 stopped，启动/重启后恢复 running，`operation_actions` 与 `operation_audit` 均记录成功结果；验证后已删除临时规则并清理状态记录。
- 软件监控搜索与采集的容器运行时排除已补齐：本地开发 API 验证 `docker`、`containerd`、`podman` 搜索结果为空，`explorer` / `SearchIndexer` 等普通软件仍可搜索；Agent 采集匹配也会排除 Docker / containerd / Podman 进程，防止旧规则或手填规则继续写入容器运行时状态。

待验证：

- 软件监控在更多真实软件场景下的搜索可用性和命名体验。

### Agent 版本与发布

已完成：

- 当前已发布稳定版为 `1.0.4`；`1.0.0` 是首个正式基线版本。
- Hub 当前镜像：`registry.example.com/infra/pulse-hub:1.0.4`，digest `sha256:c2e3c9c948ccf0cfceff484a4d61c37cdb004ca2bb842d4553a73c66e67d8215`。
- Agent 当前镜像：`registry.example.com/infra/pulse-agent:1.0.4`，digest `sha256:85e743aa353f74bcce0c97e076c4b257455a6edf624208c50293fd5187125280`。
- Linux 安装入口只提供 Compose。
- Hub 标准 Compose 部署默认同时包含本机 Linux Docker Agent，Hub 所在机器会一起纳入监控。
- Hub 同机 Agent 记录使用 `is_local` 标记做删除保护，页面显示真实机器名并通过 `Hub` 标签标识，不再显示“本机”或括号后缀；Hub 启动时会清理旧 token / 旧 fingerprint 导致的历史误标。
- Hub 和 Linux Docker Agent 的标准 Compose 部署都默认使用 `network_mode: host`。
- Windows Docker Desktop 本机开发固定使用 `pulse-local-ipv6 + 8090:8090`，避免 host 网络下 Windows 侧无法访问 `127.0.0.1:8090`，同时保留网站 IPv6 检测能力。
- Windows 和 Linux Docker Agent 的版本更新统一收口到设置页 Agent 管理；Agent 先比较版本号，已是最新版时只回报状态，不重新安装。
- Agent 设置页版本状态展示已验证并修正：当前 Windows `GuteNacht` 与 Linux `nacht` 都是 `1.0.3` 时，顶部显示“有更新 0 / 已最新 2 / 阻塞 0 / 跳过 0”，两行均显示“已是最新版”，按钮禁用为“无需更新”，不会再把最新版重复计入“跳过”或允许误点更新。
- Agent 版本仓库保留策略已收敛为最新 2 个版本：Hub 入库会按平台/架构裁剪旧记录，本地 `pulse_data/agent-releases` 会清理旧目录，发布与本地开发脚本也会同步清理 `build/releases/agent`，避免旧 Agent 包进入 Hub 镜像。
- Hub 镜像发布新增固定脚本 `supplemental/scripts/publish-hub-v1.ps1`，构建前清理 Agent release 源目录，构建后清理本机 Hub 镜像旧 tag，只保留最新 2 个；远端 Harbor 暂不自动删除旧 tag，避免误删线上回滚点。
- 新版本发布固定使用 `supplemental/scripts/publish-release-v1.ps1` 作为统一入口，同一个版本号同步构建并推送 Hub、Linux Agent 镜像和 Windows Agent 安装包，避免只更新 Hub 导致 Agent 端改动遗漏。
- 本次因本地 Docker Desktop 访问 Docker Hub token 接口超时，已使用 Harbor VM 远程 Docker builder 完成 `1.0.4` Hub / Agent 镜像构建和推送；远程构建临时使用 legacy builder 兼容补丁和 `GOPROXY=https://goproxy.cn,direct`。

### 网站监控

已完成：

- `/websites` 作为网站监控入口。
- 支持一个服务配置多个地址，并区分内网/外网、IPv4/IPv6。
- 检测记录按地址独立展示状态条和响应趋势图。
- 后端按地址类型使用 IPv4/IPv6 网络发起检测。
- 标准 Compose 改为 host 网络，网站监控的外网 IPv6 检测直接使用宿主机 IPv6 网络栈。

待验证：

- 飞牛/NAS 上 host 网络部署后，外网 IPv6 网站检测是否稳定。

- FlyNAS 临时 host 网络验证已完成：`1.0.2` Hub + `1.0.2` Agent 在 `18090` 临时端口可自动注册为“本机”，`is_local=true`，状态为 `up`，且删除接口会拒绝删除本机记录；临时环境已清理。
- 飞牛 `192.168.1.30` 正式目录统一为 `/vol1/1000/docker/pulse`，Compose 文件已更新为 `1.0.4` 镜像；当前运行中的 Hub 仍返回 `v=1.0.3`，需要 Docker 权限执行 `docker compose pull && docker compose up -d --force-recreate` 后再完成运行态验收。
- Windows Agent 手动更新闭环：下载、校验、替换、重启、回报结果。
- 真实设备上的 Windows Agent 手动更新闭环仍需继续观察；Linux / NAS 容器版 Agent 的本地开发更新闭环已通过 `nacht` 验证；版本仓库“最多 2 个版本”的代码与脚本清理已通过本地测试覆盖。

### 设置与管理页面

已完成：

- 常用设置迁入前台设置页。
- PocketBase 后台保留为高级入口。
- 通知设置放回设置页。
- 报警中心作为独立页面。
- 系统设置入口按当前导航要求保留。
- 中文目录缺失翻译已归零。

待验证：

- 用户、日志、备份页面是否满足当前项目管理需求。
- 中文文本是否还有乱码或英文残留。

## 当前风险

1. 工作区改动很多，后续应按 Agent、Hub、前端、部署文档分批整理提交。
2. Windows Service 控制和 Windows Agent 手动更新必须在真实 Windows 设备上验证，单靠构建不能证明可用。
3. 飞牛/NAS 的 Docker socket 权限会直接影响容器控制能力；只读挂载只能监控，不能控制。
4. 网站监控的 IPv6 成功率取决于运行 Hub 的网络命名空间是否真实可达；飞牛 / Linux / NAS Compose 默认 host 网络，本机 Docker Desktop 使用带 IPv6 的 `pulse-local-ipv6` bridge 网络。
5. 本机 Docker Desktop 的 host 网络不能作为正式部署判断依据；本机开发用 `supplemental/scripts/run-hub-local.ps1`，正式部署用 `network_mode: host`。

## 建议下一步

1. 打开飞牛设备详情页，确认 Linux Docker Agent 能力只展示基础指标、容器、SMART、GPU 等真实可用项。
2. 在 `/containers` 和设备详情容器区域验证单容器和 Compose 堆栈操作。
3. 整理提交范围，优先提交 Agent 能力边界、容器发布、Agent 更新状态、软件与服务监控清理逻辑和安装文档。




