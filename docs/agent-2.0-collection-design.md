# Pulse Agent 2.0 采集内核设计方案（1.0.7 立项）

状态：已批准方向，2026-10-22 规划定稿。工程建议在 1.0.6 收尾后启动，分阶段独立验收。

## 一、要解决的问题

1. **采集节奏由 Hub 驱动**：现状是 Hub 每 60 秒向每台 Agent 发 `GetData` 拉取（`internal/hub/systems/system_manager.go` interval=60_000），Agent 被动应答、无自主调度；实时查看（1s 档）与全量采集共用一把全局锁（`agent/agent.go:24`），互相阻塞。
2. **Windows GPU 采集走 PowerShell 进程**：每 4 秒 spawn 2 个 `powershell.exe`（`Get-Counter`，`agent/gpu_windows_perf.go`），一天约 4.3 万次进程创建，是全系统最大的稳态开销。GPU 型号虽有 10 分钟 TTL 缓存，但占用率采样进程无法避免。
3. **已采集数据大量未利用**：每网卡流量 delta、磁盘 IO 六元组（读写时间%/util%/await）、CPU 细分与每核占用、GPU 引擎/功耗、全量温度、电池都已随 1m 包上报，但 Hub 端只暴露少量标量。
4. **无自观测**：Agent 自身 RSS/CPU/进程创建数没有任何量化记录，"占用低"无法回归验证（PBL-015 仅做过一次人工采样：私有工作集约 16.4MB）。

## 二、业界调研结论（2026-10-22 全网检索）

| 方案 | 优点 | 缺点 | 结论 |
|---|---|---|---|
| Agent 自调度推送（Zabbix Agent 2 active / Telegraf 模式） | 分层频率天然实现；无请求往返；断连可暂停采集 | 需新增推送消息；双端同版本升级 | ✅ 采用 |
| Windows PDH 原生采集（GPU Engine 计数器） | 零进程创建、业界标准（Splunk 同款）、任务管理器同源 | 约 200–300 行 Windows 专属 Go | ✅ 采用 |
| 现状保留 + GPU 降频 | 改动约 20 行 | 不解决进程开销 | 作为回退开关保留 |
| 嵌入 LibreHardwareMonitor | 传感器最全 | 需管理员+内核驱动、.NET 常驻、GPU 查询偏贵 | 保持可选（LHM=true），不默认 |
| OpenTelemetry Collector / Grafana Alloy | 业界事实标准、管线成熟 | 每 host 常驻大内存二进制、YAML 管线重、与配对/模块体系脱节 | 不替换运行时，**借鉴其管线架构**，预留 OTLP export 组件位 |
| 换整栈（node_exporter+Prometheus / Netdata / Datadog / Beszel 原版） | 现成 | 与资产管理+监控+拓扑一体化定位冲突 | 否 |
| eBPF / ETW | 内核级细粒度 | 平台局限、复杂度高 | 本期不做 |

主流共识出处：OTel Collector 为事实标准（CNCF 2026-02）、Grafana Agent 已 EOL 统一到 Alloy（2025-11）、主流 Agent 共同模式为「组件化采集器注册表 + 每组件独立调度 + 管线数据流 + 推送传输」。

## 三、目标架构

```
[采集器注册表]                  [调度器]               [快照存储]         [传输管线]
basic(30s, gopsutil)    ─┐
gpu(60s, PDH/NVML)       ├─→  每组件独立 ticker  ─→  快照 schema v2  ─→  PushStats 推送（新）
disk(60s, gopsutil)      │     互不阻塞                              GetData 拉取（保留，回退开关）
net(30s, gopsutil+Δ)     │                                           OTLP export（预留组件位，本期不实现）
temps(60s, hwmon/LHM)   ─┘
smart(5min, smartctl / Windows Storage API)  慢速档
```

### 3.1 采集器注册表与调度器
- 每个 collector 声明：名称、频率档（30s/60s/5min，对齐既定分层）、平台、成本档；调度器统一 tick，组件互不阻塞，替换全局锁串行。
- 基础层统一 gopsutil（CPU/内存/磁盘/网络/负载/电池），三平台同源（与 OTel hostmetrics receiver 同做法）。
- 平台原生层：Windows GPU 走 PDH 常驻句柄（`\GPU Engine(*)\Utilization Percentage`，任务管理器同源）；Windows 磁盘健康走 Windows Storage Management API（`MSFT_PhysicalDisk`，存储驱动暴露可靠性计数器时补温度/通电时间），没有 smartctl 也能工作；Linux 温度走 `/sys/class/hwmon`、容器走 cgroup v2 细化；SMART/服务/软件保持按需 + 慢速档。
- PowerShell 收口：启动时一次性详情 + 配置驱动的服务/软件（≤1 次/分钟）；**稳态零进程创建**。
- GPU 型号/显存保持 10 分钟 TTL 缓存。

### 3.2 传输层
- 新增 `PushStats` 上行消息（CBOR，复用现有 WebSocket 与鉴权）：Agent 按档位到点主动推快照，Hub 被动接收入库（复用 `system_stats` 1m 存储、聚合与 30 天保留）。
- `GetData` 拉取保留：实时查看（1s 档）与兼容期旧 Agent 使用；作为**回退开关**。
- Hub 断连时 Agent 暂停推送与重采集，重连后从当前状态继续（不补传，符合既定决策）。

### 3.3 快照 schema v2
一次性携带现有未利用维度：每网卡流量、磁盘 IO 六元组、CPU 细分/每核、GPU 引擎/功耗、全量温度、电池。前端按能力诊断如实展示，禁止占位（数据真实性红线）。

### 3.4 Agent 自观测
diagnostics 新增：Agent 进程 RSS、自身 CPU、goroutine 数、周期内进程创建数。建立可量化基线（目标：稳态 CPU <1%、零进程创建），后续回归有据可依。

### 3.5 OTLP 预留
管线末端预留 OTLP exporter 组件位（本期不实现），保留与任意 OTLP 后端互通的出口。

## 四、实施阶段与验收

| 阶段 | 内容 | 验收标准 |
|---|---|---|
| 一（纯 Agent） | 注册表+调度器重构；PDH GPU；Linux hwmon/cgroup；稳态零 PowerShell | 自观测：稳态 CPU<1%、零进程创建；Go 全量通过 |
| 二（协议+Hub） | PushStats + Hub 接收入库 + schema v2；拉取模式保留为回退开关；同版本发布 | 推送入库数据与拉取模式一致；回退开关演练通过 |
| 三（前端） | 温度/电池/每网卡/磁盘 IO 进详情卡；空值不显示 | 数据与 Agent 端实测同源核对；前端四件套通过 |
| 四（观察期） | 真机稳定性观察 48 小时（自首次部署 2026-10-22 起算；用户确认缩短） | 无掉线/无资源劣化；更新 roadmap 与 capability-boundary |

## 五、红线对齐（全部不动）

Windows 服务 + Linux 容器两形态；配对码/指纹；手动更新；30 天保留；告警两级分级；总采集量不升反降（去掉 4 秒 GPU 轮询）。本期不做：macOS Agent、SNMP、智能家居采集（既定边界外）。

## 六、调研来源

- CNCF：Collector vs Agent 选型（2026-02）；OpenObserve：2026 遥测 Agent 评述
- Grafana 官方：Agent EOL（2025-11）转 Alloy 公告；Alloy 为 OTel Collector 发行版
- Microsoft Learn：PDH 性能计数器官方文档；Microsoft Q&A：PDH 读 GPU Engine 用法
- Splunk：Windows 采集采用 PDH；SpecterOps：WMI 每查询成本分析
- LibreHardwareMonitor：嵌入实践与 GPU 温度开销 issue #1653
- 占用对比：node_exporter/Telegraf/Netdata/Datadog（leonallen22 基准文）；Beszel 约 10MB 级实测（dev.to）
- Push/Pull 选型：Alibaba Cloud 分析文、Nicole van der Hoeven 笔记
