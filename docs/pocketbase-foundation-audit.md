# PocketBase 基座审计

更新时间：2026-10-02（运行底座盘点更新；原始审计 2026-06-25）

## 当前版本

已验证（2026-10-02）：

- Go 依赖：`github.com/pocketbase/pocketbase v0.40.4`（已按 2026-06-25 审计建议在 1.0.6 周期完成 0.39.4 → 0.40.4 升级，独立依赖提交）。
- Go DB helper：`github.com/pocketbase/dbx v1.12.0`（仍为最新）。
- 前端 SDK：`pocketbase ^0.28.1`（已从 0.27.0 随升级推进）。
- 运行形态：1.0.6 起以本地 Docker 容器为运行环境（`pulse-hub` 容器，`registry.example.com:443/infra/pulse-hub:1.0.6`，`unless-stopped`，8090 发布到局域网，挂载 `pulse_data` 数据目录与 `/pulse_backups` 备份目录）；FlyNAS 保持 1.0.6-beta.6 未动。

## 2026-10 运行底座现状盘点

本节是 2026-10-02 基座梳理第 1 步（运行底座）的盘点结论，作为后续各步的基线。

### 启动链路

- 入口 `internal/cmd/hub/hub.go`：`pocketbase.NewWithConfig` → `migratecmd.MustRegister` → `StartHub()`。
- 初始化统一走 `OnServe`（`internal/hub/hub.go:66` 有明确注释：`OnBootstrap` 早于 migrations，所以不用它）。该假设在 v0.40.4 上继续成立；升级 PocketBase 时仍必须第一个验证这里。
- 定时任务共 6 个（`registerCronJobs`）：原始记录清理（每小时第 8 分）、10 分钟聚合（每 10 分）、30 天保留清理（03:00）、网站监控（每分）、公网地址刷新、每日备份窗口检查（每 5 分）。与 02:00 备份执行窗口、03:00 保留清理错峰，无资源竞争设计。

### 健康检查（已识别短板）

- `/api/health` 使用 PocketBase 内置端点，语义是"进程存活"：不校验数据库可写、定时任务是否按时执行、磁盘空间和 Agent 连接状态。
- Hub 镜像自带 `pulse health --url` 子命令（`internal/cmd/hub/hub.go:91`），当前仅用于容器 host 网络等价检查。
- 后续改进方向（进入数据基座/运行保障步骤讨论）：深度健康检查（DB 写探针 + cron 心跳时间戳 + 磁盘水位），以及运行状态页展示各 cron 最近执行时间。

### 升级与演练策略（2026-10-02 第 6 步盘点）

- **本地部署升级与回滚手册已成文**：`docs/release-deployment-runbook.md` 新增"5b. 本地部署（开发机容器）升级与回滚"——升级前强制备份 + 镜像摘要锚点、`run-hub-local.ps1` 重建流程与验证清单、回滚必须"上一版本镜像 + 升级前备份恢复"（新版本运行后数据库迁移不可逆）、源码/容器双模式切换注意事项（共用 `pulse_data` 单实例、备份目录路径差异）、PocketBase 升级专项原则引用。
- **策略要点**：升级三前提（备份可恢复、回滚镜像可得、验证清单就绪）；PocketBase 升级永远独立提交；Agent 四端同版本同步。

### 资产中心权限核对（2026-10-03 第 3 步实测，模块梳理第 1 站）

- **服务端写拦截有效**：只读账号直接 POST 写 assets 集合被拒（实测 400，collection 规则 + API 中间件双层拦截）——"权限不是靠藏按钮"的原则成立。
- **发现权限模型缺口（PBL-023）**：assets/asset_interfaces/asset_relations/asset_maintenance/asset_locations 的读取规则是 `user = @request.auth.id`（每用户只看自己名下的资产），而存量资产全部归属管理员——新家庭成员账号**看到 0 条资产**，与"普通家庭账号默认可查看设备"的产品约定相悖。读规则需按 systems 的共享模式（owner 或 users 多关系或全局可见）调整；涉及数据模型设计，方案待用户确认（见 PBL-023）。
- 临时只读诊断账号 `readonly.diag@local.test`（密码 DiagRead!2026）保留用于后续权限验证，正式使用前删除。

### 运行保障（2026-10-02 第 5 步盘点）

- **日志规范（已定稿并清零落地）**：业务代码首选应用日志器（`h.Logger()`/`app.Logger()`，持久化进 PocketBase 日志、系统日志页可见）；无应用引用的底层包（records、users、hub/config）用 `log/slog`（进 stderr，容器日志可见）；stdlib `log` 仅保留在 `internal/cmd/` 入口。截至本日，`internal/hub`、`internal/alerts`、`internal/records`、`internal/users`、`internal/assetcatalog` 的 stdlib log 调用已清零，slog 与应用日志器双轨按上述分工并存。
- **运行状态可视化与统一设置封装（登记为候选项）**：深度健康检查（DB 写探针 + cron 最近执行心跳 + 磁盘水位）与 `system_settings`/`user_settings` 读写统一封装（杜绝首次保存缺陷类问题）登记为 PBL-021，需先出简短设计再实施。

### 模块与 API 边界（2026-10-02 第 4 步盘点）

- **路由权限矩阵（86 条 `/api/pulse` 路由全量核对）**：结构性强保证——所有已认证的写操作（POST/PUT/DELETE）100% 携带角色限制（`excludeReadOnlyRole`）或管理员限制（`requireAdminRole`），零例外；模块数据路由普遍挂对应模块门禁（asset-center/client-monitoring/maintenance/alerts/agent-management/notifications/website-monitoring）。
- **公开面（无登录路由）极小且已收紧**：`GET /first-run`（状态查询）、`GET /agent-connect`（Agent 专用 token+指纹校验）、`POST /create-user`（仅零用户时注册，且有临时 superuser 校验与端到端测试）、`POST /agent-pair`。
- **本次发现并修复**：`POST /agent-pair` 此前无暴力破解防护，6 位配对码可被内网高速尝试。已加按来源 IP 的配对限流（20 次失败 / 10 分钟窗口 / 锁定 10 分钟，阈值宽于登录限流以容忍合法重试；第 20 次失败请求本身返回业务错误、其后同 IP 请求得 429；不同 IP 互不影响），并附 API 级测试。收紧类改动，无行为放宽。
- **后端目录收敛节奏（维持既定原则）**：`internal/hub` 平铺（api.go 集中注册 86 条路由）与模块化目录约定并存；按"改到哪个模块就收敛到哪个模块"推进，不做一次性大拆。api.go 拆分（按模块分文件注册路由）列为后续候选项。

### 账号与安全（2026-10-02 第 3 步盘点）

- **已确认的良好面**：登录失败限流内建（5 次失败 / 10 分钟窗口 / 锁定 10 分钟，按账号+IP 绑定，`internal/hub/auth_security.go`）；MFA/OTP 能力内建（`MFA_OTP` 环境变量控制 users 或 superusers）；权限真实边界在 collection rules + `/api/pulse` 中间件；首个管理员初始化链路已有端到端测试（`internal/hub/first_run_test.go`：零用户状态注册路由、创建 admin 角色用户、替换临时 superuser、写操作审计、初始化后拒绝再创建）。
- **暴露面现状（本地部署形态）**：`/_/` PocketBase 管理后台随 8090 发布到局域网（实测可达）。该后台在 v0.39+ 带 SQL 控制台，掌握 superuser 密码即拥有完整数据库控制力；本地 superuser 密码自 2026-06-24 初始化以来未轮换。**待用户行动**：轮换 superuser 为强密码。
- **Docker 端口映射下的限制（如实记录）**：superuser IP/CIDR 白名单（v0.38+）依赖真实来源 IP，而 bridge 端口映射下容器内看到的来源地址是 Docker 网关地址而非真实设备 IP——**当前形态下配置 IP 白名单无效甚至锁死全部访问**，不做。若未来改为 host 网络或加反向代理，可重新评估。
- **MFA 前置条件**：superusers 层 MFA（`MFA_OTP=superusers`）依赖邮箱接收 OTP；需先完成真实 SMTP 邮箱配置，否则会把管理员锁在门外。排序：真实邮箱配置 → 启用 `MFA_OTP=superusers` → 验证登录链路。
- **日常管理边界原则（维持不变）**：日常管理一律走 Pulse 前台；`/_/` 仅作高级维护入口，文档与设置页不把它当作普通功能入口宣传。

### 数据基座（2026-10-02 第 2 步盘点）

- **迁移规范（已定并自动化）**：每个迁移文件只承载一个意图（一个 `m.Register`）；禁止出现逐字节相同的两个迁移文件（复制后未改意图的事故已发生过一次，见 PBL-020）；两者由 `internal/migrations/migrations_guard_test.go` 在每次测试时强制执行。历史文件名的 `0_`/`zzz` 前缀是既定执行顺序手段，新迁移继续沿用既有做法，不做一次性重命名。
- **备份恢复演练 V2（已首次执行）**：2026-10-02 用容器自动备份产物（`pulse_backup_20261001_132213`，30.2MB）完成首次真实恢复演练——解包 manifest 与内层 `pocketbase.zip` → `data.db` 通过 `PRAGMA quick_check` → 在系统临时目录 Bootstrap 独立实例 → 逐集合核对（users / assets 17 条 / systems / system_settings 3 条 / operation_audit 250 条等）全部通过；全程隔离 `%TEMP%`，未接触 `pulse_data`，演练后清理。每月演练沿用同一流程，自动化排程为候选项。
- **保留与清理**：30 天保留清理已随 1.0.6 上线（每天 03:00），首个容器内执行核对并入部署观察期。

### 配置面

- 环境变量约 14 个（`ENV`、`PULSE_DEV_LOCAL_AGENT_AS_HUB`、`PULSE_LOCAL_AGENT_TOKEN`、AI/识别相关 `PULSE_AGNES_*`/`PULSE_ASSET_ENRICHMENT_AI_*`/`PULSE_ASSET_VISUAL_AI_*` 等）；MFA、密码认证开关等 auth 配置走 `setCollectionAuthSettings` 的运行时设置而非环境变量。
- 业务配置三套存储并存且有明确分工：`system_settings`（全局）、`user_settings`（每用户）、`module_settings`（模块状态）；读写模式尚未有统一封装，各功能自行 FindFirst→New→Save（首次保存缺陷已修复，统一封装列为运行保障步骤的候选项）。

### 观察期基线（2026-10-01 部署）

- 容器连续运行无重启、健康检查 200、本机 Agent 保持连接。
- 02:00 自动备份与 03:00 保留清理的首个容器内执行核对于部署次日补充记录。

## 原始审计结论（2026-06-25，历史分析仍然有效）

Pulse 现在不是“顺手用了 PocketBase”，而是把 PocketBase 当成 Hub 的运行基座：

- 后端把 PocketBase 嵌入 Go 进程，`Hub` 直接包了一层 `core.App`。
- SQLite 数据库、collections、migrations、备份、认证、实时订阅、定时任务和静态前端服务都依赖 PocketBase。
- 前端通过 PocketBase JS SDK 同时访问标准 collection API 和 Pulse 自定义 `/api/pulse/*` API。
- Android / PWA 登录态也复用了 PocketBase auth store，只是换成了移动端安全存储适配。

所以 PocketBase 升级必须当成基础设施升级处理，不能只改 `go.mod` 和 `package.json`。

## 当前版本（2026-06-25 审计时，已被上方更新取代）

已验证：

- Go 依赖：`github.com/pocketbase/pocketbase v0.39.4`。
- Go DB helper：`github.com/pocketbase/dbx v1.12.0`。
- 前端 SDK：`pocketbase ^0.27.0`，lockfile 实际安装 `0.27.0`。
- Go 可见最新版本：`github.com/pocketbase/pocketbase v0.39.4`。
- 前端 SDK 最新版本：`pocketbase 0.27.0`。
- `dbx` 当前仍是最新 `v1.12.0`。

本轮升级结果：

- `go.mod` / `go.sum` 已升级到 PocketBase `v0.39.4`，并随新版 PocketBase 更新 `golang.org/x/*`、`modernc.org/sqlite`、`fsnotify` 等间接依赖。
- `internal/site/package.json` / `package-lock.json` 已升级到 PocketBase JS SDK `0.27.0`，同时把前端依赖更新到当前 npm 可见最新版本；`npm outdated --long` 当前无输出，`npm audit --omit=dev` 当前为 0 漏洞。
- Vite 8 开发链路已经针对 PocketBase JS SDK 0.27.0 做了兼容：`pocketbase` 预构建被排除，原始 SDK ESM 包会在转换前把 `async import(...)` 重写为等价的 `async ["import"](...)`，避免 import analysis 误注入导致浏览器解析失败；Lingui macro 改由 `@rolldown/plugin-babel` + `linguiTransformerBabelPreset()` 处理，避免弃用的 SWC 组合与 React Refresh 冲突。
- Go 当前源码和测试实际包依赖图已核对：`go.mod` 里写入的 direct / indirect 依赖均无可升级项，`go list -deps -test -f '{{with .Module}}{{.Path}}{{end}}' ./...` 中实际使用的模块也没有命中 `go list -m -u all` 的可升级项；`go list -m -u all` 仍能看到少量上游旧模块图里的 legacy transitive update，但这些模块不在当前 package deps 中，不应为了清空提示强行保留显式 `require` 或 `replace`。
- PocketBase `v0.39.x` 的测试生命周期变化已处理：测试 API helper 复用每个 `TestApp` 的 serve mux，避免重复绑定新版 Admin UI 扩展路由；告警虚拟时间测试把 PocketBase `TestApp` 和系统 updater 放到 `synctest` 外，避免后台 watcher / logger / DB goroutine 让测试挂起。
- Hub 运行态版本口径已修正：`agent_target_version` 不再被本地旧 `agent_releases` 数据压低到低于当前 Hub 版本，避免 1.0.6 开发环境因为仍保留 1.0.5 Agent 安装包而在 About 页显示错误目标版本。

官方来源：

- PocketBase Go releases：https://github.com/pocketbase/pocketbase/releases
- PocketBase JS SDK releases：https://github.com/pocketbase/js-sdk/releases
- PocketBase Go 文档：https://pocketbase.io/docs/go-overview/
- PocketBase JS SDK 文档：https://github.com/pocketbase/js-sdk

## Pulse 里 PocketBase 承担什么

### 1. 应用入口

位置：

- `internal/cmd/hub/hub.go`
- `internal/hub/hub.go`

当前做法：

- `pocketbase.NewWithConfig` 创建基础 app。
- 默认数据目录是 `pulse_data`。
- `ENV=dev` 时开启 PocketBase dev 模式。
- `migratecmd.MustRegister` 注册迁移命令，dev 下允许 Admin UI 自动生成 migration。
- `Hub` 嵌入 `core.App`，并挂载 alerts、records、users、systems 等业务 manager。
- `StartHub()` 在 `OnServe` 中注册中间件、自定义 API、静态前端、cron、Agent release 同步和系统管理器。

风险：

- `OnServe`、`core.ServeEvent`、`core.RequestEvent`、`core.App` 是升级最敏感的 API。
- 当前 `onAfterBootstrapAndMigrations` 是为 PocketBase 启动顺序做的适配：`OnBootstrap` 早于 migrations，所以项目用 `OnServe` 做初始化。升级时必须验证这个假设是否仍成立。

更好的维护方式：

- 保留 `onAfterBootstrapAndMigrations` 这一层，但给它加专门测试，验证干净数据目录和测试 app 都会执行 `initialize`。
- 不要在业务代码里到处直接假设 PocketBase 启动顺序，统一通过这个适配点处理。

### 2. 数据模型和迁移

位置：

- `internal/migrations`
- `internal/hub/collections.go`

当前做法：

- 共有 62 个 Go migration。
- `0_collections_snapshot_0_19_0_dev_1.go` 是早期 collection 快照。
- 后续业务表通过单独 migration 增量追加，例如 Agent 配对、操作审计、网站监控、SMART、系统身份字段等。
- `initial-settings.go` 会写入 Pulse 应用设置，并创建临时 superuser。
- `setCollectionAuthSettings()` 在启动后统一设置 collection auth、MFA、OTP 和访问规则。

风险：

- Collection schema 和 rule 字段是 PocketBase 最容易随版本变化的区域。
- Pulse 的权限规则不是只靠 Admin UI 配的，而是运行时由代码重写。
- 如果升级后 collection 字段结构、rule 表达式、auth collection 设置字段变化，可能导致登录、列表、编辑、删除、realtime 订阅出现隐性问题。

更好的维护方式：

- 把 `collections.go` 视为权限源头，不允许只在 Admin UI 临时改规则。
- 升级后必须跑 `internal/hub/collections_test.go`，再做浏览器端权限回归。
- 对新增 collection，必须同时补 migration、collection rule、审计规则和前端访问路径。

### 3. 认证和用户模型

位置：

- `internal/users/users.go`
- `internal/hub/auth_security.go`
- `internal/hub/admin.go`
- `internal/site/src/components/login/auth-form.tsx`

当前做法：

- Pulse 有业务用户表 `users`，同时仍保留 PocketBase `superusers`。
- 首次初始化时，Pulse 自己创建第一个 `users` 管理员和同邮箱 `superusers`，然后删除临时 superuser。
- 普通登录走 `users` collection。
- `MFA_OTP=true` 时普通用户和 superusers 都启用 OTP / MFA。
- `MFA_OTP=superusers` 时只给 superusers 启用 MFA。
- `DISABLE_PASSWORD_AUTH=true` 可关闭普通用户密码认证。
- 登录失败次数限制通过 `OnRecordAuthWithPasswordRequest` 自定义实现。
- 设置页用户管理使用自定义 `/api/pulse/users`，而不是直接暴露 PocketBase superuser 管理。

风险：

- 首个管理员逻辑明确模拟了 PocketBase `<0.23.0` 的旧行为，这块和新版 PocketBase 默认安全模型不完全一致。
- `users` 与 `superusers` 的双用户体系必须保持同步认知：业务权限看 `users.role`，后台维护看 `superusers`。
- 登录失败限制依赖 auth hook，升级后必须确认事件触发顺序和错误处理语义。

更好的维护方式：

- 明确产品原则：日常管理只用 Pulse 前台 `users`；PocketBase Admin UI 只作为高级维护入口。
- 升级 PocketBase 前后必须验证：
  - 首次初始化创建管理员。
  - 普通账号登录。
  - 管理员用户增删改。
  - 只读用户不能写。
  - MFA 开关路径。
  - 登录失败限流。

### 4. 自定义 API 层

位置：

- `internal/hub/api.go`
- `internal/hub/admin.go`
- `internal/hub/operations.go`
- `internal/hub/agent_connect.go`
- `internal/hub/website_monitors.go`

当前做法：

- Pulse 标准业务 API 统一挂在 `/api/pulse`。
- 需要登录的路由使用 `apis.RequireAuth()`。
- 只读限制和管理员限制用自定义 middleware 判断 `e.Auth.role`。
- Agent 接入、Agent release 下载、安装脚本下载、首个用户创建、公开信息和健康检查保留为无前台登录路由。
- Agent WebSocket 使用 `/api/pulse/agent-connect`，通过 `X-Token` 和 `X-Pulse` header 校验。
- 备份功能调用 PocketBase 的 `CreateBackup`、`RestoreBackup`、`NewBackupsFilesystem`。

风险：

- 自定义路由层依赖 PocketBase Router、middleware、RequestEvent 的 API。
- 备份和恢复是高风险操作，不能只靠 UI 提示，后端权限和文件名校验必须保留。
- Agent 无登录路由必须继续只接受受控 token / pairing code，不能被 PocketBase 升级带来的路由变化绕过。

更好的维护方式：

- `/api/pulse/*` 应继续作为 Pulse 的业务 API 边界。
- 新增 API 必须明确：是否登录、是否只读可用、是否管理员、是否需要操作审计。
- 升级后优先验证 `/api/pulse/info`、`/api/pulse/first-run`、`/api/pulse/agent-connect`、`/api/pulse/backups`。

### 5. 实时订阅和前端 SDK

位置：

- `internal/site/src/lib/api.ts`
- `internal/site/src/lib/systemsManager.ts`
- `internal/site/src/lib/alerts.ts`
- 多个 settings / system / websites 页面

当前做法：

- 前端创建单例 `pb`。
- Web/PWA 默认 base URL 来自当前站点；Android 会要求配置 Hub URL。
- 使用 `AsyncAuthStore`，Android 下改写为安全存储。
- `pb.beforeSend` 拦截离线只读模式下的写请求。
- `verifyAuth()` 用 `users.authRefresh()` 保持登录态，401/403 时清空登录态。
- `logOut()` 会清理 store 并执行 `pb.realtime.unsubscribe()`。
- 前端同时使用：
  - `pb.collection(...).getList/getFullList/getOne/update/delete`
  - `pb.collection(...).subscribe(...)`
  - `pb.send("/api/pulse/...")`
  - `pb.createBatch()`

风险：

- JS SDK 0.27.0 新增 SQL console 相关 handler 和 v0.37+ collection meta handler，虽然当前 Pulse 可能不用，但 SDK 内部类型和行为仍要验证。
- `AsyncAuthStore`、`beforeSend`、`realtime.unsubscribe()`、`subscribe` 返回值这几处是升级回归重点。
- Android 登录态存储由自定义 adapter 接管，不能只在浏览器验证。

已验证的前端链路修正：

- `pocketbase` 不再参与 Vite dev 预构建，避免 SDK ESM 被二次转换后出现解析错误。
- PocketBase SDK ESM 中的 `async import(...)` 方法名已在 Vite pre-transform 中改写为 `async ["import"](...)`，语义保持不变。
- Lingui macro 现在通过 `@rolldown/plugin-babel` 和 `linguiTransformerBabelPreset()` 处理，不再依赖旧的 SWC 组合。
- 前端未再使用 `authStore.isAdmin`、`authStore.isAuthRecord`、`authStore.model`、`buildUrl`、`getFileUrl`、`getUrl` 等旧 API。

更好的维护方式：

- PocketBase JS SDK 升级必须和前端 `check`、`build`、浏览器登录回归、Android 登录态保持一起做。
- 不要在页面里重复创建 PocketBase client，继续保持 `lib/api.ts` 单例。
- 高频列表继续优先用 `/api/pulse/*` 轻量汇总接口，避免直接拉大 collection。
- 前端依赖升级后要优先用浏览器实际渲染结果验证，不要只看 `npm run build`；Vite dev、PocketBase SDK 和 Lingui macro 这条链路必须一起验。

### 6. Admin UI 和高级维护入口

位置：

- `internal/site/src/components/routes/settings/advanced.tsx`
- PocketBase 默认 `/_/`

当前做法：

- Pulse 前台把 PocketBase Admin UI 放在“高级维护”入口。
- 日常用户、备份、日志、审计、通知、Agent Token 等都已有前台页面。

风险：

- PocketBase v0.37.0 重写了 Admin UI。
- PocketBase v0.38.0 增加 superuser IP/CIDR 白名单。
- PocketBase v0.39.0 增加 SQL console。这个能力很强，也很危险：能直接执行 SQL，不应当被当成普通设置页能力。

更好的维护方式：

- Admin UI 应继续定位为“高级维护 / 破坏性能力入口”，不要重新变成日常管理主入口。
- 升级到 v0.39.x 后，要明确评估 SQL console 是否需要通过反向代理、内网访问、superuser IP 白名单等方式进一步限制。
- 对公开部署文档，要说明 `/_/` 不是普通用户入口。

## 0.36.8 到 0.39.4 的重点变化

已验证官方 release：

- v0.37.0：Admin UI 从头重写，并更新 SQLite 依赖。
- v0.38.0：新增 superuser IP/CIDR 白名单，新增 rate limit 排除 IP/CIDR，增加多进程状态同步 watcher。
- v0.39.0：新增 SQL console，更新 SQLite 到 v1.51.0，优化日志和 records 列表。
- v0.39.4：修复 OAuth2 code exchange、relation 排序、UI 小问题，并更新 goja 和 `golang.org/x/*` 依赖。
- JS SDK v0.27.0：增加 SQL console handler，并补齐 v0.37+ collection meta endpoint handler。

对 Pulse 的影响判断：

- 对日常前台 UI：影响较小，因为 Pulse 前台主要走自定义 React UI。
- 对后台维护：影响较大，因为 `/_/` UI 和 SQL console 能力变化明显。
- 对安全边界：影响中高，尤其是 superuser IP 白名单、SQL console、auth hook 和 rate limit 相关。
- 对测试链路：影响中高，因为项目测试依赖 PocketBase `tests.TestApp`、hooks、migrations 和 collection schema。
- 对性能：新版 records/logs/Admin UI 有优化，但 Pulse 运行态性能主要取决于自定义 `/api/pulse/*` 汇总接口、Agent 心跳和前端渲染策略，不应把升级当成主要性能优化手段。

## 升级策略

推荐进入 `1.0.6`，但分阶段做。

### 阶段 1：只做基座理解和测试护栏

目标：

- 先固定当前 PocketBase 认知和风险清单。
- 再按独立改动升级依赖，避免和 UI / Agent 业务改动混在一起。
- 补齐必须回归的测试清单。

应做：

- 保留本文档。
- PocketBase 升级已进入 `1.0.6` 开发记录。
- 后续继续保持原则：PocketBase 升级独立提交，不和视觉、Agent 或业务功能改动混在一起。

### 阶段 2：Go 侧升级

目标：

- `github.com/pocketbase/pocketbase v0.36.8` 升到当前最新稳定版本。
- `dbx` 当前无需升级。

命令：

```powershell
go get github.com/pocketbase/pocketbase@v0.39.4
go mod tidy
```

优先修复：

- `core.App` / hooks / router API 编译错误。
- collection auth / MFA / OTP 字段变化。
- migration API 或测试 harness 变化。
- Admin UI 静态资源、`/_/` 路由和生产静态前端服务冲突。

### 阶段 3：前端 SDK 升级

目标：

- `pocketbase 0.26.2` 升到 `0.27.0`。

命令：

```powershell
npm.cmd --prefix internal/site install pocketbase@0.27.0
```

优先验证：

- `AsyncAuthStore`。
- `pb.beforeSend`。
- `pb.authStore.clear()`。
- `pb.realtime.unsubscribe()`。
- `collection.subscribe()`。
- `pb.createBatch()`。

### 阶段 4：端到端回归

必须验证：

```powershell
go test -tags=testing -count=1 ./internal/hub ./internal/users ./internal/alerts ./internal/records
go test -tags=testing -count=1 ./...
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

浏览器必须验证：

- 干净数据目录首次初始化。
- 普通登录、登录态刷新、登出。
- MFA 开启和关闭。
- 用户管理增删改和只读用户权限。
- 客户端列表、系统详情、网站监控、告警中心。
- `/settings/advanced` 的 PocketBase 高级维护入口。
- `/_/` 是否能正常打开，且不和 React 前端路由冲突。
- 备份创建、下载、删除；恢复功能只在测试数据目录执行。

Android / PWA 必须验证：

- 首次 Hub 地址配置。
- 登录态保存和重启后恢复。
- Hub 地址变更。
- 离线只读模式下写请求被拦截。

Agent 必须验证：

- 一次性配对。
- WebSocket 连接。
- Hub 同机 Agent 的 `Hub` 标签和删除保护。
- 已有 Agent token 继续可用。

## 安全审计结论

### P1：Admin UI 和 SQL console 需要明确边界

PocketBase v0.39.0 新增 SQL console。Pulse 如果升级到 v0.39.x，`/_/` 的破坏能力会更强。

建议：

- `/_/` 继续只放在高级维护入口。
- 生产部署文档明确要求限制 Admin UI 暴露面。
- 可评估启用 superuser IP/CIDR 白名单。

### P1：首个管理员链路必须回归

Pulse 自己创建 `users` 和 `superusers`，这是基础认证链路。

建议：

- 升级后先跑首个用户初始化测试。
- 干净数据目录浏览器初始化必须作为上线前验收项。

### P2：collection rules 是真实权限边界

Pulse 当前权限不是靠前端隐藏按钮，而是 collection rules + 自定义 API middleware。

建议：

- 升级后检查 `users.role`、`@request.auth.role`、relation rule 是否仍按预期生效。
- 对只读用户做浏览器和 API 双重验证。

### P2：备份恢复入口要继续后端强校验

备份创建、下载、删除、恢复都走 PocketBase 文件系统能力。

建议：

- 继续保持管理员限制。
- 恢复动作只在测试数据目录和明确确认场景验证，避免误覆盖正式数据。

## 后续原则

- PocketBase 是 Pulse 的基础层，不再当作普通依赖随手升级。
- 每次 PocketBase 升级必须单独成提交，不能和视觉、Agent、业务功能混合。
- 升级前先读官方 release notes，升级后跑 Go、前端、浏览器、Android 和 Agent 接入回归。
- Admin UI 只作为高级维护入口，Pulse 的日常管理能力继续沉到前台页面和 `/api/pulse/*`。
- 如果某个功能能用 PocketBase 标准能力解决，但会把产品体验暴露到 Admin UI，优先做 Pulse 前台封装。
