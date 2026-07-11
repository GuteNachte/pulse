# Pulse 模块化架构约束

> 从 `1.0.6` 起，Pulse 按“基础底座 + 可管理功能模块”的方向演进。这个文件是后续新增功能、拆分旧功能和设置页模块管理的硬约束。

Pulse 的项目定位是家庭资产管理与监控。所有模块都应围绕家庭资产主数据、可采集状态叠加和长期维护闭环设计；资产中心是主数据源，监控、拓扑、告警、通知和智能家居只消费或补充已确认的资产信息。

## 目标

- 项目后续可能持续变大，功能必须能独立维护、独立开关、独立观测。
- 所有业务功能都要有清晰模块边界，避免页面、Hub API、Agent 采集、数据库集合和设置入口互相缠在一起。
- 设置页需要能看到每个模块的只读说明、依赖和运行边界；模块启停不在当前页面提供操作入口。
- 关闭模块时不能破坏已有数据；只停止入口、采集、任务、通知、操作和展示。

## 模块分层与粒度

### 基础底座

基础底座负责系统能启动、能存储、能登录、能管理模块，本身不可关闭。它由三部分组成：

- PocketBase 基座：负责底层运行时、数据库、集合迁移、认证、权限、文件存储、realtime、基础 API 能力和管理后台入口。
- Pulse 内核：负责 Pulse 自己的模块注册表、模块状态、模块设置、模块健康检查、系统日志、操作审计和设置页模块说明。
- 资产中心：负责硬件、网络设备、虚拟机、网页端点和自定义资产的统一来源；后续监控、拓扑和告警都必须优先从资产中心选择对象。
- 资产智能识别与 AI 补全配置：负责全局大模型接入、资料补全 Agent、设备图片 Agent 和系统级密钥管理；联网检索、资料核对和结构化整理归入资料补全 Agent 的任务行为，设备图片优先收集官方 / 可追溯真实图片，图片模型只作为后续一致性整理预留；这些能力归属资产中心，不作为单独大模块。

基础底座包含：

- 用户、认证、权限和初始化。
- PocketBase / Hub 启动、数据库迁移和基础 API。
- 模块注册表、模块状态、模块设置和模块健康检查。
- 资产主数据、资产接口、资产关系和位置主数据。
- 设置页里的模块说明入口。
- 操作审计、系统日志和基础错误处理。

### 大模块清单

模块只按“可独立管理的大能力”定义，不按页面或小功能定义。下面是当前固定的大模块边界：

- `foundation`：PocketBase 基座、Pulse 内核、全局设置、关于页、模块说明、基础审计和启动运行能力。
- `asset-center`：资产中心，管理资产、资产接口、资产关系、位置主数据和后续各模块的对象来源；必需模块，不能关闭。
- `smarthome`：智能家居，基于资产中心查看家居网关、灯具、插座、传感器、门锁、扫地机器人和 IoT 设备档案；第一版只读总览，后续再接 Home Assistant / Matter / Zigbee 等采集来源。
- `client-monitoring`：客户端监控，包含原客户端列表、添加系统、机器详情、容器、S.M.A.R.T.、系统图表和 Agent 采集结果展示。
- `website-monitoring`：网站监控，包含网页端点、自定义网页监控、内外网检测、检测历史和网站状态汇总。
- `network-topology`：网络拓扑，基于资产中心维护家庭网络关系，并叠加 Agent 采集到的机器状态、网卡和流量。
- `alerts`：告警中心，包含告警规则、当前告警、历史告警和告警状态。
- `notifications`：通知模块，包含通知通道、发送诊断、失败记录和告警触达状态。
- `agent-management`：Agent 管理，包含安装模板、接入 Token、配对码、版本仓库和 Agent 更新。
- `account-access`：账号管理与权限，包含用户、角色、登录、MFA 和只读权限。
- `maintenance`：备份、日志与审计，包含备份恢复、系统日志、操作审计、高级维护和运行诊断。

下面这些不是独立模块，只能作为所属大模块里的页面或子能力：

- `system-detail`、`smart`、`containers` 属于 `client-monitoring`。
- `settings-general`、`settings-about`、`settings-modules` 属于 `foundation`。
- `settings-ai` 属于 `asset-center`。
- `settings-users` 属于 `account-access`。
- `settings-agent`、`settings-tokens` 属于 `agent-management`。
- `settings-notifications` 属于 `notifications`。
- `settings-backups`、`settings-logs`、`settings-audit`、`settings-advanced` 属于 `maintenance`。

后续新增功能必须先判断属于哪个大模块；只有达到独立产品能力级别，才允许新增大模块。

## 目录约束

新增功能默认按模块放置。除非是全局基础组件、通用工具或内核能力，不允许把业务代码散落在共享目录。

建议结构：

```text
internal/modules/<module-id>/
  module.go
  collections.go
  routes.go
  jobs.go
  permissions.go
  tests/

internal/site/src/modules/<module-id>/
  index.ts
  manifest.ts
  routes.tsx
  components/
  lib/
  hooks/
  tests/

agent/modules/<module-id>/
  module.go
  collector.go
  operations.go
  diagnostics.go
  tests/
```

现有代码不要求一次性大迁移，但以后每次改到某个功能时，应优先把它向模块目录收敛。

## 模块清单

每个模块必须有 manifest。manifest 至少包含：

- `id`：稳定模块 ID，例如 `network-topology`。
- `name`：中文显示名称。
- `description`：一句话说明模块负责什么。
- `version`：跟随当前 Pulse 版本。
- `category`：显示分组，例如 `监控`、`接入`、`设置`、`维护`。
- `defaultEnabled`：默认是否启用。
- `required`：是否内核必需；必需模块不能关闭。
- `dependencies`：依赖模块 ID。
- `routes`：前端路由入口。
- `collections`：使用的数据库集合。
- `jobs`：后台任务或定时任务。
- `agentCapabilities`：需要 Agent 哪些采集 / 操作能力。
- `healthChecks`：模块健康检查项。

## 开关语义

模块关闭必须满足：

- 前端入口隐藏或显示“模块已关闭”的中性空态。
- Hub API 对普通业务请求返回明确的模块关闭状态。
- 后台任务、定时检测、通知触发和 Agent 下发操作停止。
- 不删除数据库集合，不删除历史数据，不清理用户配置。
- 重新开启后能继续使用已有配置和历史数据。
- 必需模块不能关闭，包括 `foundation`、`asset-center`、`account-access`、`alerts`、`notifications`、`agent-management` 和 `maintenance`。

模块开启必须满足：

- 依赖模块已启用。
- 必需数据库集合和迁移已存在。
- 需要 Agent 能力时，设置页能显示能力缺失或未采集原因。
- 健康检查能说明模块当前是否可用、降级或异常。

## 设置页模块说明

设置页提供“模块说明”入口，页面只读展示：

- 模块名称、分类、版本、必需 / 可选标识。
- 必需模块 / 可选模块标识。
- 依赖关系。
- 最近健康检查时间、成功 / 失败状态和错误摘要（如果模块提供）。
- 关联路由、数据库集合、后台任务、Agent 能力。
- 只读展示模块说明、依赖、路由、集合、任务、Agent 能力和健康检查；不提供模块开启 / 关闭操作。

模块说明页面不直接替代各模块自己的设置页。它负责只读总览、依赖说明和健康检查；具体业务配置仍放在对应模块设置里。

## 开发验收规则

新增功能合并前必须回答：

- 这个功能属于哪个模块？
- 是否有 manifest？
- 是否有独立目录？
- 是否有独立路由 / API / 采集 / 任务边界？
- 关闭模块后 UI、API、后台任务、Agent 能力会发生什么？
- 设置页是否能看到模块状态？
- 是否更新 `docs/release-notes-next.md` 和 About 版本记录？

现有功能改造时优先顺序：

1. 先建立模块 manifest 和设置页可见状态。
2. 再把前端路由和组件迁入模块目录。
3. 再把 Hub API、集合、后台任务迁入模块目录。
4. 最后拆 Agent 采集和操作能力。

## 当前结论

- `1.0.6` 已落地第一版模块化底座：`module_settings` 保留用户级模块状态兼容数据，前端 `internal/site/src/modules` 保存大模块 manifest 和 registry，设置页“模块说明”负责模块只读总览、依赖状态和代码边界说明，不提供启停操作。
- 模块 registry 已从页面级小模块收敛为大模块，旧的 `system-detail`、`smart`、`settings-*` 不再作为独立模块出现。
- 资产中心已成为核心数据来源：新增 `assets`、`asset_interfaces`、`asset_relations` 和 `asset_locations`，并在 `systems`、`website_monitors` 上使用 `asset` 关联字段绑定资产主数据；公网入口也按 `internet` 资产维护，可支持多条宽带、运营商和上下行带宽信息；房间、区域、机柜和桌面等位置开始收敛为资产中心主数据。
- 资产中心新增 / 编辑入口按资产类型维护长期稳定参数：字段 schema 放在 `internal/site/src/modules/asset-center/asset-schema.ts`，页面只负责渲染和保存；固定 IP、MAC、管理 URL、端口速率、硬件规格、生命周期和公网带宽等数据进入资产主数据，主网卡 / 管理口 / 公网入口同步到 `asset_interfaces` 供网络拓扑复用。
- 资产详情页是资产中心第一阶段主数据承载面：`/assets/:id` 浏览态集中展示资产档案、设备图片和已确认硬件规格；接口、关系、维护、附件、监控绑定和长期变更统一由编辑工作台维护，避免浏览页混入操作与重复卡片。位置管理入口在资产中心维护 `asset_locations`，资产表单的位置字段复用这些主数据；购买、上线、维修、升级、保修、退役等长期事件进入 `asset_maintenance`，设备照片、发票、保修凭证、说明书和配置备份进入 `asset_attachments`；后续保修提醒、告警历史和采集差异仍归属资产中心数据模型，而不是分散到监控模块里。
- 客户端监控和网站监控已具备第一版资产关联骨架；网络拓扑只按 `assets`、`asset_interfaces` 和 `asset_relations` 构图，新增拓扑设备 / 端口 / 链路入口写入资产中心，前端不再读取旧 `network_devices`、`network_ports`、`network_links`，Hub 也拒绝这些旧主数据集合的 API 新增和更新；`network_layouts` 仅作为拓扑布局和节点显示配置保留。
- 智能家居模块已新增第一版 `/smarthome` 只读总览和 `smarthome` manifest，页面只读取资产中心里的智能家居资产，不做自动发现、不伪造实时控制状态；网关归属优先读取 `asset_relations` 中指向 `smarthome_gateway` 资产的真实关系，没有关系时才回退到 `metadata.gateway_name`，后续接 Home Assistant / Matter / Zigbee 时继续保持资产中心主数据来源。
- 后续新增大功能必须 module-first。
- 后续每次维护旧功能，都顺手减少跨模块耦合。
