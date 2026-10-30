# Agent 稳定性与 PocketBase SQLite 依赖收口设计

日期：2026-07-31

## 背景

Pulse `1.0.6-beta.6` 已在 FlyNAS 试用运行，当前有三项应在继续开发新功能前收口的稳定性问题：

- Hub 同机 Agent 必须继续通过 `127.0.0.1` 和 loopback-only Token 连接 Hub，但页面身份地址应显示宿主机真实局域网地址，不能显示 `127.0.0.1` 或 Docker 网桥地址。
- Windows Agent 首轮完整采集可能超过统一的 5 秒请求期限，连接仍正常时会被 Hub 短暂误判离线。
- 项目当前直接解析到 `modernc.org/sqlite v1.53.0` 与 `modernc.org/libc v1.73.4`，偏离 PocketBase `v0.39.4` 明确测试的 `sqlite v1.52.0` 与 `libc v1.72.3` 组合。

## 目标

本轮形成一个可独立验证的稳定性收口批次：

1. 保持 Hub 同机 Agent 的 loopback 安全连接语义，同时让系统身份使用真实物理网卡局域网 IPv4。
2. 为完整系统采集提供与实际采集耗时匹配的请求期限，不扩大其他 WebSocket 操作的等待时间。
3. 将 SQLite 运行依赖恢复到当前 PocketBase 版本的官方测试组合，并验证数据库备份、恢复与完整性。
4. 同步开发记录、About 版本记录和部署维护口径。

## 模块归属

- Agent 物理网卡地址采集属于 `agent-management` 的采集能力。
- Hub WebSocket 请求期限和系统身份保存属于基础接入链路，由现有 Hub 系统与 WebSocket 组件维护。
- PocketBase 与 SQLite 依赖对齐属于 `foundation` 基座维护。
- 本轮不新增模块、路由、集合、后台任务或设置项，也不改变模块开关语义。

## 方案

### 1. Hub 同机 Agent 身份地址

Linux Agent 在现有真实物理网卡筛选结果上补充 IPv4 和 IPv6 地址。Hub 仍以 WebSocket 观察到的地址判断连接来源和本机 Token 权限；只有观察地址为 loopback 时，才从 Agent 上报的物理网卡中选择页面身份 IPv4。

候选地址必须排除 loopback、未指定、多播、链路本地地址，以及 Docker、Veth、网桥、CNI、隧道等虚拟接口。选择时优先使用状态为 `up`、存在网关且属于私有网段的地址；如果本轮静态详情没有再次上报，则保留该 Hub 本机系统上一次已确认的非 loopback 地址。

外部 Agent 不使用这一替换逻辑，继续以 Hub 实际观察到的连接地址作为身份地址，防止远端 Agent 伪造来源。

### 2. WebSocket 采集请求期限

请求管理器按动作提供默认期限：

- `GetData` 完整系统采集：30 秒。
- 容器信息及其他普通动作：继续保持 5 秒。
- 调用方显式提供 deadline 时：始终尊重调用方 deadline，不追加更长的默认期限。

超时后沿用现有错误和状态处理，不通过吞掉错误、伪造在线状态或无限重试掩盖真实断连。

### 3. SQLite 依赖对齐

保持 `github.com/pocketbase/pocketbase v0.39.4` 不变，将项目依赖图对齐到该版本声明并测试的：

- `modernc.org/sqlite v1.52.0`
- `modernc.org/libc v1.72.3`

使用 Go 模块工具更新 `go.mod` 与 `go.sum`，然后确认 `go list -m all` 和 `go mod graph` 的最终解析结果。若其他直接依赖强制要求更高版本，停止机械降级并重新评估依赖来源；不得用 `replace` 强行制造未经验证的组合。

## 数据流与失败处理

Agent 完整采集时，物理网卡地址随 `Details.NetworkInterfaces` 上报。Hub 先保留连接观察地址用于认证和本机身份判断，再计算用于页面与系统记录的身份地址，最后保存系统信息。两类地址用途分离，避免为了显示 LAN 地址削弱 loopback-only Token。

依赖对齐不执行数据库迁移，也不直接修改现有 `data.db`。验证恢复必须使用临时数据目录和备份副本；任何恢复失败都不得指向或覆盖本地开发数据和 FlyNAS 正式数据。FlyNAS 继续运行不可变的 `1.0.6-beta.6`，直到下一统一版本按发布流程构建、备份和部署。

## 测试与验收

### 定向测试

- Linux 物理网卡地址解析只返回指定接口的有效 IPv4 / IPv6。
- loopback 同机连接选择物理 LAN IPv4，并排除 Docker 与隧道接口。
- 外部 Agent 保留 Hub 观察到的远端地址。
- 后续采集缺少静态网卡详情时保留已确认的 Hub 本机 LAN 地址。
- `GetData` 默认 30 秒，其他动作默认 5 秒，显式 deadline 不被覆盖。

### 完整回归

- `go vet -tags=testing ./...`
- `go test -tags=testing -count=1 ./...`
- 前端检查与构建。
- Android 单元测试。
- 版本一致性检查。
- 在临时数据目录创建备份、恢复备份并检查 SQLite 完整性与核心集合可读性。
- 检查最终依赖图只解析到 PocketBase 测试的 SQLite / libc 组合。

### 发布后验收

下一统一版本部署到 FlyNAS 后，确认：

- Hub 与 Agent 使用同一显式版本。
- 同机 Agent WebSocket 仍连接 `127.0.0.1:8090`，系统身份显示 `192.168.1.30`。
- `is_local`、`Hub` 标签、删除保护和 loopback-only Token 保持有效。
- Windows Agent 连续跨过多个完整采集周期保持在线。
- Hub 启动日志不再出现 PocketBase SQLite 版本偏离警告。
- 核心数据计数、备份创建和恢复预检正常。

## 不在本轮范围

- 不升级 PocketBase。
- 不发布或部署新版本。
- 不修改 FlyNAS 当前容器、数据或 Token。
- 不新增 UI 功能、Agent profile 或 macOS Agent。
- 不借机重构无关模块。

## 风险控制

- 地址选择错误可能把多网卡设备显示成错误 LAN 地址，因此选择规则必须确定性排序并保留外部 Agent 的观察地址优先级。
- 放宽所有 WebSocket 动作会延迟真实故障反馈，因此只放宽 `GetData`。
- 依赖降级可能改变间接依赖图，因此必须完整运行 Go、备份与恢复回归，不能只看编译成功。
- 当前工作区包含已有未提交改动，实施和提交时必须按文件核对，禁止覆盖或遗漏用户现有工作。
