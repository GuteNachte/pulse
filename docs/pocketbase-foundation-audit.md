# PocketBase 基座审计

更新时间：2026-06-25

## 结论

Pulse 现在不是“顺手用了 PocketBase”，而是把 PocketBase 当成 Hub 的运行基座：

- 后端把 PocketBase 嵌入 Go 进程，`Hub` 直接包了一层 `core.App`。
- SQLite 数据库、collections、migrations、备份、认证、实时订阅、定时任务和静态前端服务都依赖 PocketBase。
- 前端通过 PocketBase JS SDK 同时访问标准 collection API 和 Pulse 自定义 `/api/pulse/*` API。
- Android / PWA 登录态也复用了 PocketBase auth store，只是换成了移动端安全存储适配。

所以 PocketBase 升级必须当成基础设施升级处理，不能只改 `go.mod` 和 `package.json`。

## 当前版本

已验证：

- Go 依赖：`github.com/pocketbase/pocketbase v0.36.8`。
- Go DB helper：`github.com/pocketbase/dbx v1.12.0`。
- 前端 SDK：`pocketbase ^0.26.2`，lockfile 实际安装 `0.26.2`。
- Go 可见最新版本：`github.com/pocketbase/pocketbase v0.39.4`。
- 前端 SDK 最新版本：`pocketbase 0.27.0`。
- `dbx` 当前仍是最新 `v1.12.0`。

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

更好的维护方式：

- PocketBase JS SDK 升级必须和前端 `check`、`build`、浏览器登录回归、Android 登录态保持一起做。
- 不要在页面里重复创建 PocketBase client，继续保持 `lib/api.ts` 单例。
- 高频列表继续优先用 `/api/pulse/*` 轻量汇总接口，避免直接拉大 collection。

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

- 不升级依赖。
- 固定当前 PocketBase 认知。
- 补齐必须回归的测试清单。

应做：

- 保留本文档。
- 把 PocketBase 升级列入 `1.0.6` 开发记录。
- 如果后续要动手升级，先开独立提交，不和 UI 改动混在一起。

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
