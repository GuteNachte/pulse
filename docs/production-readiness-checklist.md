# Pulse 1.0.5 上线验收清单

> 这份清单用于防止上线级改造遗漏。每个模块实施完成后，在这里记录验证结果；正式发布前必须逐项检查。

## 使用规则

- `未开始`：还没有实施或验证。
- `实施中`：代码或文档正在改。
- `待验证`：已实现但还没跑完验收。
- `通过`：已有命令输出、页面截图、日志或人工验收结论。
- `阻塞`：发现问题，必须记录原因和下一步。
- 具体证据统一记录到 `docs/production-acceptance-evidence.md`；没有可复查证据的项目不能标记为通过。

## 总体前提

- [x] 测试环境允许清库并完整重跑初始化。
- [x] Web、Hub、Agent、Android App 使用同一个显式版本号。
- [x] 每个用户可见改动同步 `docs/release-notes-next.md`。
- [x] About 页 `1.0.5` 正式记录按端分类同步。
- [x] 不显示假数据、占位正常、猜测标签或旧品牌残留。

验证记录：

- 2026-06-17 / 2026-06-18 总体前提同步确认：隔离空库首次初始化、版本一致性校验、release notes、About 分端记录、旧品牌扫描、真实指标展示规则、移动端 / Android 运行态验收和本地构建检查均已有证据；正式发布前仍需按第 14 / 17 节补齐 Harbor、FlyNAS 和回滚运行态证据。

## 1. 初始化 / 登录 / 安全自检

- [x] 清库后进入首次安装向导。
- [x] 首个管理员创建成功。
- [x] 管理员创建后 `/api/pulse/create-user` 后端拒绝再次调用。
- [x] 普通登录成功。
- [x] MFA 开启时完整登录成功。
- [x] MFA 关闭时不出现 MFA 干扰。
- [x] Android 未配置 Hub 地址时先进入 Hub 配置。
- [x] Hub 地址错误时可以修改并重试。
- [x] 会话过期回登录页，不白屏、不死循环。
- [x] 安全自检识别 `AUTO_LOGIN`、`TRUSTED_AUTH_HEADER`、开发模式、版本不一致等风险。

验证记录：

- 2026-06-16 登录 / 初始化入口已改为状态化向导：入口会读取 `/api/pulse/first-run` 和 `/api/pulse/public-info`，显示 Hub 版本 / 构建类型，并按连接 Hub、创建管理员、二次验证、进入 Pulse 展示状态。浏览器验收中临时清空 `pocketbase_auth` 后刷新，普通登录页显示“用户名或邮箱 / 密码 / 登录”；恢复原登录态后回到 About 页。
- 2026-06-16 About 页验证 `1.0.5-dev` 记录包含“首次初始化入口改为状态化安装向导”和“登录错误统一归类为 Hub 不可达”等新增内容；本轮刷新未新增 console error。清库首次管理员创建和 Android Hub URL 错误路径在后续验收中单独补齐；真实 MFA 开关路径已于 2026-06-18 补齐。
- 2026-06-16 隔离清库验收通过：在 `127.0.0.1:18090` 启动临时空数据目录 Hub，首次页面显示初始化向导、Hub `1.0.5 / 生产构建`、创建管理员 / 二次验证 / 进入 Pulse 步骤；浏览器创建临时管理员后进入首页，`/api/pulse/first-run` 返回 `false`，再次 POST `/api/pulse/create-user` 返回 `403`，本轮隔离浏览器验收新增 console error 数量为 0。
- 2026-06-16 发现并修复生产静态路由问题：Hub 现在会优先返回嵌入产物中真实存在的静态文件，`/sw.js` 返回 `text/javascript`，不再 fallback 到 `index.html` 导致 Service Worker MIME 错误。
- 2026-06-16 MFA 登录 API 回归已覆盖：`TestPasswordLoginMFAPaths` 验证 MFA 关闭时密码登录直接返回 token，MFA 开启时密码登录返回 `mfaId` 且不返回 token，错误 OTP 被拒绝，正确 OTP 完成登录并清理 MFA 会话；About 页已验证包含新增 MFA 回归记录且无横向溢出 / 新增 console error；真实浏览器收验证码登录和真实邮件 / OTP 环境已于 2026-06-18 补齐端到端验收。
- 2026-06-18 MFA 真实浏览器端到端验收通过：隔离 Hub `127.0.0.1:18091` 关闭 MFA 时，`mfa-e2e@example.test` 密码登录直接进入首页，未出现 OTP 表单；同一数据目录在 `127.0.0.1:18092` 开启 MFA 后，密码登录进入“二次验证”，本地 SMTP `127.0.0.1:2525` 捕获真实邮件 OTP，输入邮件中的 6 位验证码后进入首页。两条路径均无横向溢出，浏览器 console warn / error 为空。

## 2. 机器添加 / Agent 接入

- [x] 添加机器使用安装向导，不直接预创建机器。
- [x] 未执行安装命令时客户端列表不出现新机器。
- [x] 非目标 IP 使用配对码失败。
- [x] 配对码过期后不可用。
- [x] 配对码只能使用一次。
- [x] Agent 配对成功但未上线时不能完成添加。
- [x] Agent 上线后进入身份确认。
- [x] 身份确认页显示 hostname、显示名、目标 IP、连接 IP、上报 IP、fingerprint 摘要。
- [x] NAS 勾选只显示 NAS 标签，不改变用途。
- [x] 加入告警默认关闭。
- [x] Windows、Compose、docker run 安装命令完整可复制。

验证记录：

- 2026-06-16 机器接入后端规则回归通过：`TestPairingCodeCreationDoesNotCreateSystem` 验证生成配对会话只创建 pairing code，不提前创建 `systems` 半成品记录；`TestSystemsSummaryAPI` 验证同用户的待确认配对机器不会出现在 `/api/pulse/systems/summary` 客户端摘要列表；`TestApiRoutesAuthentication` 覆盖非目标 IP、过期配对码、已使用配对码和指纹冲突在创建机器前失败；About 页已验证新增记录可见且无横向溢出 / 新增 console error。真实 Windows / Linux / NAS 目标机执行完整安装命令仍待验收。
- 2026-06-16 添加机器安装命令浏览器验收通过：添加系统弹窗里 NAS 勾选后主要用途仍保持原值，加入告警默认未勾选；`public-info` 返回 `agent_hub_url=http://192.168.1.10:8090`；复制 Windows 命令得到 `irm http://192.168.1.10:8090/api/pulse/agent-install/windows.ps1?code=... | iex`，服务端脚本包含 `$AgentVersion = '1.0.5'`、配对码、Hub URL、`agent pair --url $HubUrl --code $PairingCode` 和 `1.0.5` 下载地址；Linux Compose 和 `docker run` 都包含 `pulse-agent:1.0.5`、Hub URL、配对码和 `/agent pair --url ... --code ...`；页面无横向溢出，稳定后无新增 console error。真实把命令拿到 Windows / Linux / NAS 机器执行并完成上线确认仍待验收。
- 2026-06-16 真实 Agent 配对 / 上线 / 身份确认验收通过：使用 `build\releases\agent\1.0.5\pulse-agent_windows_amd64.exe` 和临时数据目录执行一次性配对；未执行安装命令时客户端列表保持 `2 / 2`；配对成功但 Agent 未启动时仍保持 `2 / 2`，弹窗显示等待上线且无确认按钮；临时 Agent 连接 `192.168.1.10:8090` 后，检测安装显示真实身份字段并出现确认按钮；确认后临时机器进入客户端列表为 `3 / 3`，显示用户填写名称、目标 IP 和无 Hub 标签；验收后删除临时机器并恢复 `2 / 2`。

## 3. 机器身份 / Hub 同机 Agent

- [ ] Hub 同机 Agent 自动加入。
- [x] Hub 机器显示真实机器名，不显示“本机”。
- [x] Hub 机器只显示 `Hub` 标签。
- [x] 同一时间只有一台机器有 Hub 标签。
- [x] 普通机器不能手动获得 Hub 标签。
- [x] Hub 机器 API 删除失败。
- [x] Hub 机器暂停监控必须强确认。
- [x] Hub 机器隐藏首页后，客户端列表和详情页仍可见。
- [x] 详情页能看到显示名、真实 hostname、各类 IP 和 fingerprint 摘要。

验证记录：

- 2026-06-16 开发环境 Hub 标签误标修复通过：`updateLocalSystemMarkerFromInfo()` 不再因为 `PULSE_DEV_LOCAL_AGENT_AS_HUB=true` 和 loopback 来源把普通配对记录提升为 `is_local=true`；`repairLocalSystemMarkers()` 会清理 `is_local=true && pairing_confirmed=false` 的误标记录；真实临时配对 Agent 确认进入客户端后无 `Hub` 标签；相关回归通过 `Test(RepairLocalSystemMarkers|UpdateLocalSystemMarkerFromInfo|FindOrCreateLocalSystem|ApiRoutesAuthentication|SystemsSummaryAPI|PairingCodeCreationDoesNotCreateSystem)`。
- 2026-06-16 客户端页当前 UI 验证通过：`http://localhost:5173/clients?verify-hub-identity-current=1` 显示 `2 / 2 台机器`，页面无“本机”文本，Hub 机器以 `Hub` 相关标签展示，页面无横向溢出，刷新后新增 console error 数量为 0。
- 2026-06-16 Hub 身份保护后端回归通过：`Test(DeleteSystemRejectsLocalSystem|CollectionDeleteRejectsLocalSystem|CollectionUpdateRejectsProtectedSystemIdentityFields|CollectionUpdateAllowsHomeVisibilityForLocalSystem|FindOrCreateLocalSystem|RepairLocalSystemMarkers|UpdateLocalSystemMarkerFromInfo|InfoReadinessChecksDangerousConfig)` 覆盖 Hub 机器删除拒绝、`is_local` 和真实 hostname 防篡改、首页隐藏字段允许更新、重复 / 误标 Hub 修复和安全自检。
- 2026-06-16 客户端页 Hub 菜单验收通过：当前只有 1 个精确 `Hub` 标签；Hub 机器菜单不显示删除入口；点击暂停会出现“确认暂停 Hub 机器监控？”二次确认；点击首页隐藏会出现“确认从首页隐藏 Hub 机器？”二次确认；未执行暂停，首页隐藏验收后已恢复为首页显示。
- 2026-06-16 Hub 机器首页隐藏可逆验收通过：临时确认首页隐藏后，客户端列表仍显示 `UM-690` 和 `2 / 2 台机器`，详情页 `/system/75kygz8ntiwewqy` 仍可打开并显示 Hub / 身份信息；随后通过菜单恢复为首页显示，最终菜单显示“首页隐藏”动作，页面无横向溢出，新增 console error 数量为 0。
- 2026-06-16 Hub 机器详情身份面板验收通过：`/system/75kygz8ntiwewqy?verify-task3-identity=1` 展开身份详情后包含显示名称、真实主机名、目标 IP、连接 IP、Agent 上报 IP、指纹摘要、Agent Profile、首次发现和最近记录；页面无“本机”文本、无横向溢出，新增 console error 数量为 0。

## 4. 首页 / 客户端列表

- [x] 首页是运维总览，不复制完整客户端列表。
- [x] 首页优先展示当前异常和需要关注项。
- [x] 客户端页可搜索、筛选、排序。
- [x] 在线、离线、暂停、待接入、未采集状态区分清楚。
- [x] IP 展示来源明确。
- [x] 缺失指标不显示假 0% 或假正常。
- [x] 100 台机器列表不卡顿。
- [x] 移动端一屏能看到多台机器，无横向滚动。

验证记录：

- 2026-06-17 首页 / 客户端列表浏览器验收通过：使用 100 台临时压测机器加 2 台真实机器验证，桌面首页只展示运维摘要和 6 台需关注机器，不复制完整客户端列表；桌面客户端页显示 `102 / 102 台机器`，默认只渲染首批 60 台并显示 `加载更多 60/102`，搜索 `UM-690` 后变为 `1 / 2 台机器`；手机端 375px 显示排序入口、默认 50 台和 `加载更多 50/102`，点击名称排序后从 `压测机器 001` 开始，加载更多后显示 `加载更多 100/102`；桌面和手机视口均无横向溢出，CDP 本轮事件未出现 console warn / error 或网络加载失败。验收后已删除 100 台 `压测机器` 临时记录，客户端列表恢复 `2 / 2 台机器`。

## 5. 机器详情 / 硬件真实性

- [x] 首屏能确认这台机器是谁。
- [x] 显示名和真实 hostname 同时可见。
- [x] CPU 厂商来自真实采集。
- [x] 内存 DDR/LPDDR 来自真实采集，采不到不猜。
- [x] 磁盘 SSD/HDD/NVMe 来自真实采集，采不到不猜。
- [x] 网络链路速率、IPv4、IPv6、网关、DNS、DHCP/静态来自真实采集。
- [x] GPU 核显/独显标签来自真实采集。
- [x] 虚拟机不默认显示 SMART 可用。
- [x] 未发现模块点击只提示，不跳黑屏。
- [x] 桌面摘要卡高度统一，移动端无文字重叠。

验证记录：

- 2026-06-17 硬件真实性代码和记录链路验证通过：CPU 厂商标签只读取 Agent 上报的 `cpu_vendor`，GPU 核显 / 独显标签只读取 `gt`，磁盘 SSD / HDD / NVMe 标签只读取 SMART 写入的 `smart_devices.media_type`；`docs/release-notes-next.md` 和 About `1.0.5-dev` 均已包含对应记录。`go test -tags=testing -count=1 -timeout=180s ./agent ./internal/hub/systems -run "TestParseSmart|TestParseAmdData|TestParseWindowsGPU|TestUpdateWindowsGPU|TestSaveSmartDevices|TestRecordSmartFetchResult|TestShouldFetchSmart"`、`npm.cmd --prefix internal/site run check -- --max-diagnostics=200`、`npm.cmd --prefix internal/site run build` 已通过。
- 2026-06-17 机器详情浏览器验收通过：`/system/75kygz8ntiwewqy?verify-task5-hardware-truth=1` 首屏显示 `UM-690`、`Hub`、物理机、用途、状态、Windows 版本、CPU 型号、内存条摘要、网卡和 GPU；展开身份详情后可同时看到显示名称、真实主机名、目标 IP、连接 IP、Agent 上报 IP、指纹摘要和 Agent Profile，缺失字段显示“未采集”；页面无“本机”文案、无 `WebSocket` 文案、无横向溢出，刷新后新增 console error 数量为 0。
- 2026-06-17 当前开发机运行态硬件显示验收通过：内存卡显示 `DDR5`，网络卡显示 `2.50 Gbps` 和“负载 N%”，GPU 卡显示 `核显`，设备能力中 S.M.A.R.T. / GPU 在缺少新版采集结果确认时显示“未知”而不是“可用”；点击网络卡保持在详情页并显示网卡、链路速率、MAC 和带宽图；点击容器“未发现”卡保持在详情页并显示未采集 / 暂无数据提示，不跳空白页。只读查询 `pulse_data\data.db` 确认当前在线 Agent 实际版本为 `1.0.4`，`system_details.network_interfaces` 只有 name / display_name / MAC / link_speed / status，尚未上报 IPv4 / IPv6 / 网关 / DNS / DHCP；`smart_devices.media_type` 为空，前端没有按旧 `type=nvme` 猜测磁盘介质。网络来源字段和磁盘介质运行态仍需新版真实 Agent 或对应机器继续验收。
- 2026-06-17 虚拟机 SMART 真实性浏览器验收通过：`/system/nm04thq6ov5v4by?verify-task5-vm-smart=1` 显示 `虚拟机`、`KVM/QEMU`，设备能力里的 `S.M.A.R.T.` 为 `未知`，没有把虚拟机误标成 `可用`；页面无横向溢出、无空白跳转，刷新后新增 console error 数量为 0。
- 2026-06-17 补齐 Windows Agent 网卡详情回归测试：`TestMakeNetworkInterfaceDetailsPreservesAddressMetadata` 覆盖 IPv4、IPv6、默认网关、DNS、DHCP / 静态、MAC 和链路速率写入 `network_interfaces`；`go test -tags=testing -count=1 -timeout=180s ./agent -run "Test(MakeNetworkInterfaceDetailsPreservesAddressMetadata|NormalizeWindowsIPMethod|NormalizeStringList|FindWindowsAdapterForInterface|ParseLinuxLspciDeviceName)"`、`npm.cmd --prefix internal/site run check -- --max-diagnostics=200`、`npm.cmd --prefix internal/site run build` 通过；About 页已验证新增记录可见且无横向溢出 / 新增 console error。
- 2026-06-17 摘要卡和移动端布局验收通过：桌面端 `/system/75kygz8ntiwewqy?verify-task5-card-heights=1` 资源摘要卡测得同组按钮高度均为 64px，页面无横向溢出；375x812 手机和 768x1024 平板视口下机器详情显示 `UM-690`、移动端标题、CPU / 内存 / 磁盘 / 网络摘要和模块入口，页面级 `scrollWidth = clientWidth`、不黑屏。手机端模块入口采用横向滚动条，后续模块按钮在视口外属于预期滚动内容，不是页面撑屏。
- 2026-06-17 Windows Agent 网卡详情运行态验收通过：先复现 `PowerShell Gateways` 字段空对象 / 单字符串 / 数组导致 JSON 解析失败，以及网卡详情命令 5 秒超时导致降级；修复后重新构建并替换本机 `pulse-agent 1.0.5`，只读查询 `pulse_data\data.db` 确认 `network_interfaces` 包含 `192.168.1.10`、IPv6、`192.168.1.1 / fe80::1` 网关、DNS、`ip_method=dhcp`、`link_speed=2500000000` 和 MAC。浏览器 `/system/75kygz8ntiwewqy?verify-task5-agent105-network=1` 点击网络卡后显示 IPv4、IPv6、网关、DNS、DHCP、链路速率和 MAC，页面无横向溢出，刷新后新增 console warn / error 数量为 0；相关测试和构建通过。

## 6. Agent 采集边界

- [x] 能力声明和采集结果分开。
- [x] 支持但未采到不显示“可用”。
- [x] Windows、Linux Docker、NAS、Hub local Agent 能力边界不同且合理。
- [x] 旧 Agent 缺字段时显示 unknown 或提示升级。
- [x] 采集失败有原因。
- [x] 数据过期显示 stale。
- [x] 失败采集会退避。

验证记录：

- 2026-06-16 `docs/agent-capability-boundary.md` 已补齐 Windows 主机版、Linux / NAS 容器版、Hub 同机 Agent 的 Profile 能力矩阵，并明确 Linux systemd / 裸机 Linux Agent 在 1.0.5 不作为默认支持入口展示。
- 2026-06-16 系统详情设备能力条改为只认 `collection_results` / `diagnostics` 状态；旧 Agent 或缺少采集结果字段时显示未知 / 升级提示，不再用 `collection` 声明、容器列表、GPU 列表或 SMART 记录反推“已采集 / 可用”。浏览器验证 `http://localhost:5173/system/75kygz8ntiwewqy?verify-capability-truth=1` 中设备能力显示“未知”，无 `WebSocket` 文案、无横向溢出、无新增 console error。
- 2026-06-16 `go test -tags=testing -count=1 -timeout=180s ./agent ./internal/hub/systems -run "Test(BuildCapabilities|UpdateCapability|SanitizeSystemInfo|Smart|SMART|Capability|Profile|Backoff|Collection)"` 通过，覆盖 Agent 能力声明和采集结果分离、Hub profile 能力清洗、Linux 容器版禁用 Windows 服务 / 软件入口，以及 SMART 失败退避记录 / 跳过 / 重置。
- 2026-06-16 Hub 保存 Agent 能力状态前会根据真实 `checked_at` 标记过期：普通心跳能力超过 5 分钟未刷新显示 stale，S.M.A.R.T. 按 Agent 上报采集间隔加宽限判断；`go test -tags=testing -count=1 -timeout=180s ./agent ./internal/hub/systems -run "Test(BuildCapabilities|UpdateCapability|SanitizeSystemInfo|Smart|SMART|Capability|Profile|Backoff|Collection|MarkStale)"`、`npm.cmd --prefix internal/site run check -- --max-diagnostics=200`、`npm.cmd --prefix internal/site run build` 通过。浏览器验证 About 页包含本轮 stale 记录，系统详情设备能力卡正常显示、无 `WebSocket` 文案、无横向溢出、无新增 console error。

## 7. 容器监控 / 操作保护

- [x] Compose 归组只基于可信 Docker Compose label。
- [x] `pulse-agent` 不被归入业务 Compose。
- [x] Pulse 保护容器危险操作后端拒绝。
- [x] 独立容器为空只显示“无”。
- [x] Compose 头部不重复显示机器名和容器数。
- [x] 危险操作必须二次确认。
- [x] 操作执行中有真实阶段进度。
- [x] 操作结果可跳转操作记录。
- [x] 移动端容器页无宽表格。

验证记录：

- 2026-06-17 容器监控 / 操作保护后端回归通过：`go test -tags=testing -count=1 -timeout=180s ./agent ./internal/hub ./internal/hub/systems -run "Test(ComposeStackInfoFromLabels|SystemCreateRecordsIgnoresUntrustedPartialContainerStackLabels|SystemCreateRecordsClearsPulseContainerStackLabels|FindStackOperationContainersExcludesProtectedForAllActions|IsProtectedContainer|ValidateOperationCapability|OperationAuditLinksActionAndCanBeQueriedByOperation|OperationPreflightAuditDoesNotClaimOperationRecord|ContainerListAPI|ContainerStatusForOperation|TimeoutForOperation)"` 覆盖可信 Compose 归组、残缺 stack label 拒绝、Pulse 容器保护、操作能力校验、审计关联和容器列表接口。
- 2026-06-17 当前开发库只读核对通过：`pulse-agent` 是 `nacht` 上的独立容器，未归入 `harbor`；`harbor` 编排只有 9 个 Harbor 业务容器；当前容器表共 10 条。
- 2026-06-17 桌面容器页验收通过：`/containers?verify-task7-containers=1` 无横向溢出，`harbor` 显示 `9 运行 / 0 停止`，`pulse-agent` 在独立容器区域；编排头部不再重复机器名和容器数，独立容器为空表格文案未出现。点击 `harbor` 停止只打开“确认停止堆栈”二次确认弹窗，未执行最终停止。
- 2026-06-17 手机端容器页验收通过：375x812 视口 `/containers?verify-task7-mobile-containers=1` 页面级 `scrollWidth = clientWidth = 360`，没有可见宽表格，底部导航存在，`harbor` 编排和 `pulse-agent` 独立容器可见。
- 2026-06-17 系统详情容器摘要源头修复通过：详情页容器摘要优先读取 `/api/pulse/containers?system=...&limit=1` 当前机器汇总，`/system/nm04thq6ov5v4by?verify-task7-container-count=1` 显示 `容器 10 个 Docker 版本 29.1.3 正常`，不再因历史容器图表缺点位误显示 `容器 0 个`。
- 2026-06-17 系统详情容器模块浏览器验收通过：点击 `nacht` 详情页容器摘要后显示“容器监控”，`harbor` 编排区只显示 `harbor 9 运行 0 停止` 和操作按钮，`pulse-agent` 显示在独立容器区；页面无横向溢出，刷新后新增 console warn / error 数量为 0。
- 2026-06-17 操作记录入口验收通过：容器操作 toast 会跳转 `/system/{id}?tab=history`；`/system/nm04thq6ov5v4by?tab=history&verify-task7-history=1` 可见设备操作记录、阶段、耗时、审计和容器相关历史记录，无横向溢出。
- 2026-06-17 前端质量闸门通过：`npm.cmd --prefix internal/site run check -- --max-diagnostics=200` 和 `npm.cmd --prefix internal/site run build` 均通过。

## 8. 网站监控

- [x] 正常、异常、待检测状态明确。
- [x] 异常显示 DNS、TCP、TLS、HTTP、超时等原因。
- [x] 内网 IPv4、外网 IPv4、IPv6 状态分开且对齐。
- [x] 未检测不显示正常。
- [x] 检测历史默认折叠，详情按需加载。
- [x] 立即检测有检测中状态。
- [x] 立即检测完成只刷新目标网站。
- [x] 移动端无横向滚动。

验证记录：

- 2026-06-17 网站监控后端回归通过：`go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(WebsiteMonitor|ClassifyWebsiteMonitor|WebsiteMonitorPagedList|WebsiteMonitorCheckWritesOperationAudit|DeleteSystemRelatedDataRemovesWebsiteMonitors)"` 覆盖 DNS / TLS / TCP / 网络不可达 / 重定向 / 超时等失败分类、内容校验、检测历史清理、分页 / 搜索 / 状态 / 过期 / 机器筛选和操作审计。
- 2026-06-17 前端质量闸门通过：`npm.cmd --prefix internal/site run check -- --max-diagnostics=200` 和 `npm.cmd --prefix internal/site run build` 均通过。
- 2026-06-17 桌面网站页验收通过：`/websites?verify-task8-websites=1` 显示当前真实 Harbor 监控为正常状态，列表和详情展示内网 IPv4、最近检测、检测状态条和响应趋势；点击立即检测只打开“确认立即检测”弹窗，未执行真实检测；页面无横向溢出。
- 2026-06-17 三地址待检测布局验收通过：临时创建并删除 `临时验收-三地址布局` 监控，未写入检测结果；桌面列表显示 `3 个地址`、`尚未检测`、`内网 IPv4`、`外网 IPv4`、`内网 IPv6`，未检测状态没有被显示为正常，页面无横向溢出。
- 2026-06-17 手机端网站页验收通过：375x812 视口显示 `1 正常 / 1 待检测 / 2 总数`、底部导航、Harbor 真实监控和临时三地址待检测监控；打开详情 Sheet 后三地址逐条显示待检测、响应时间 `--`、检测时间 `--` 和暂无检测记录；立即检测确认弹窗可打开，Sheet 可关闭，页面 `scrollWidth = clientWidth = 360`，本轮新增 console warn / error 数量为 0。验收后已删除临时监控，页面恢复 1 条真实 Harbor 监控。

## 9. 告警 / 通知

- [x] 告警页默认显示当前未恢复问题。
- [x] 历史告警分页查看。
- [x] 告警包含来源、等级、原因、状态。
- [x] 新机器默认不加入离线告警。
- [x] 告警恢复后状态正确。
- [x] 用户能确认或静音告警。
- [x] 通知通道测试显示具体失败原因。
- [x] Android 通知权限状态可见。
- [x] 设置页说明 App 被杀后不保证通知。
- [x] 同一问题不会短时间重复刷屏。

验证记录：

- 2026-06-17 第 9 节告警 / 通知后端与页面验收完成：`go test -tags=testing -count=1 -timeout=180s ./internal/alerts ./internal/hub ./internal/hub/systems -run "Test(UserAlertsApi|GlobalAlertPoliciesApi|AlertHistoryActionsApi|SendTestNotification|NotificationFailureRecordedAndCleared|SilencedAlertNotificationIsSkipped|AlertsHistoryStatus|AlertHistoryPagedList|WebsiteMonitorAlertHistory|SystemCreateRecordsSyncsContainerAlertHistory|CreateRecordsSyncsMonitored(Service|Software)AlertHistory|PairingCodeCreationDoesNotCreateSystem)"` 通过；`npm.cmd --prefix internal/site run check -- --max-diagnostics=200` 通过；`npm.cmd --prefix internal/site run build` 通过。
- 2026-06-17 浏览器验证通过：桌面 `/alerts?verify-task9-alerts=1` 默认展示当前未恢复，详情 Sheet 可见来源、等级、状态、触发值、触发 / 恢复时间和静默信息；手机 `/settings/notifications?verify-task9-mobile-notifications=1` 可见通知权限状态、通道健康、重复冷却和“App 被系统完全结束后不承诺收到通知”；手机 `/alerts?verify-task9-mobile-alerts=1` 无横向溢出。
- 2026-06-17 临时告警记录 `task9tmpalert01` 已创建、确认、静默、恢复并清理，清理前后分别为 `before=1` 和 `after=0`，未留下验收脏数据。
- 2026-06-17 添加系统页 `/clients?verify-task9-add-system-alert-default=1` 验证通过，“加入告警”默认未勾选。

## 10. 操作记录 / 审计

- [x] 所有状态变更操作进入统一操作记录。
- [x] 容器、Compose、服务、Agent 更新、网站检测、通知测试都有状态。
- [x] 机器离线时操作明确失败。
- [x] 保护规则拒绝原因清楚。
- [x] 操作记录显示发起人、目标、状态、耗时、结果。
- [x] 没有真实百分比时不显示假百分比。
- [x] 移动端危险操作不会误触。
- [x] 操作完成后只刷新相关页面。

验证记录：

- 2026-06-16 已补齐绕过 UI 的直接 collection API 审计覆盖：`alerts`、`alert_policies`、`agent_pairing_codes`、`notification_channel_health`、`alert_notification_states` 和 `script_templates` 等用户可写集合会通过统一 hook 写入 `operation_audit`；通知类审计目标只保留 `scheme://host`，不保存 webhook 路径。
- 2026-06-16 `agent_pairing_codes` 直接删除规则改为排除 readonly，避免只读用户删除接入会话；`go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(UserWritableCollectionRequestsWriteOperationAudit|CollectionRulesDefault|CollectionRulesShareAllSystems|ApiCollectionsAuthRules)"` 已覆盖。
- 2026-06-17 操作记录 / 审计回归覆盖：操作动作记录包含发起人、目标、状态、阶段、耗时、超时、结果和失败码；离线 / Agent 未连接返回 `agent_disconnected`，保护规则返回 `protected`；`download_backup` 会独立写入下载审计，下载失败不会误记成功；按 `operation` 查询审计会返回分页对象并重新校验机器权限。
- 2026-06-17 操作记录和操作审计页面补齐追踪入口：系统详情操作记录可跳转关联审计、系统日志搜索和告警历史搜索；设置页操作审计详情也可跳机器操作记录、关联审计、系统日志和告警历史；系统日志、告警历史和操作审计支持 URL 参数初始化筛选，便于从审计记录反查上下文。

## 11. 设置 / 日志 / 用户 / Token / 备份 / Agent 管理

- [x] 设置页分组清楚。
- [x] 日志列表一行只显示重点。
- [x] 日志详情完整显示并可复制。
- [x] 操作记录不混在系统日志里。
- [x] 备份恢复有确认、进度、审计。
- [x] 用户角色说明清楚。
- [x] Agent 管理显示目标版本和实际版本差异。
- [x] Token 不在普通添加机器主流程暴露。
- [x] 高级危险设置有明确提示。
- [x] About 页无旧品牌，更新记录按端分类。

验证记录：

- 2026-06-17 设置 / 日志 / 用户 / Token / 备份 / Agent 管理浏览器验收通过：设置入口按常规、告警与通知、Agent 与接入、用户与权限、数据与记录、系统维护分组，并提供设置搜索；系统日志和操作审计分离；系统日志列表显示事件、重点和详情，日志详情可查看重点信息、原始消息、可读字段、原始数据并可复制；备份管理提示用户、Agent Token、配对凭据、通知配置、网站监控地址和操作审计等敏感数据，并保留还原 / 删除强确认；用户管理显示管理员、普通用户、只读用户角色说明；Agent 管理显示实际版本、目标版本和版本仓库；Agent 接入 Token 页只显示摘要，未发现 48 位以上完整 Token 泄露；高级设置显示危险维护入口和 Agent 接入 Token 入口；About 页显示 Pulse、`1.0.5-dev`、Web / Hub、移动端 / Android、Agent、部署 / 发布、版本规则等分端记录，页面无旧品牌文本。所有抽查页面无横向溢出。

## 12. 移动端 / Android / 平板

- [x] 手机底部导航只有首页、机器、告警、网站、容器。
- [x] 设置和关于在更多入口。
- [x] 首页不是桌面大屏压缩版。
- [x] 机器详情一次只展示一个模块。
- [x] 网站和容器不用宽表格。
- [x] 离线只读快照显示数据时间。
- [x] 离线时所有操作禁用。
- [x] Android Hub 地址错误有明确提示。
- [x] Android 登录态重启后保持。
- [x] MuMu 模拟器可完成核心流程。

验证记录：

- 2026-06-17 浏览器多视口移动端 / 平板布局验收通过：在 `375x812`、`390x844`、`430x932`、`768x1024` 四组视口抽查首页、机器列表、机器详情、告警、网站、容器、设置、关于页。所有页面 `scrollWidth <= clientWidth`，未出现页面级横向溢出或空白页；手机 / 平板均显示底部导航 `首页 / 机器 / 告警 / 网站 / 容器`；设置和关于进入 `更多` 设置入口；首页显示今日状态、机器、告警、网站、服务概览和近期机器，不是桌面大屏压缩版；机器详情显示“功能模块 / 一次只看一类内容”；网站和容器页面在这些视口没有可见宽表格。
- 2026-06-17 MuMu Android 运行态验收通过：清空 App 数据后首次启动进入 Hub 配置页，默认 `http://localhost:8090` 保存失败时显示 `Hub 地址不可用` 和无法连接说明；改填 `http://10.0.2.2:8090` 后进入登录页并显示当前 Hub；临时账号登录后进入移动首页，force-stop 后重启仍保持登录态。MuMu WebView 核心页面 `/`、`/clients`、`/alerts`、`/websites`、`/containers`、`/settings/about` 均 `scrollWidth = clientWidth = 360`，底部导航可见，About 页显示 Web / Hub、移动端 / Android、Agent、部署 / 发布分端记录。CDP 离线模拟下显示 `当前为离线只读模式`、客户端 / 告警摘要和 `缓存 2026/6/17 07:39:51`，网站立即检测确认 Sheet 的最终按钮为 disabled 的 `离线不可操作`。临时 QA 用户、机器和网站记录验收后已删除并二次确认 `not found`。
- 2026-06-17 网站监控小屏溢出回归通过：`monitor-card.tsx` 的头部操作区在小屏改为自然换行，MuMu 网站页、Browser 360px 网站页和桌面 1365px 网站页均无页面级横向溢出；MuMu 网站页按钮越界列表为空。

## 13. 版本 / About / 发布说明

- [x] Web、Hub、Agent、Android App 显示同一版本号。
- [x] About 页显示各端版本、构建时间、commit、部署环境。
- [x] Agent 目标版本和实际版本关系可见。
- [x] release notes 与 About 页记录一致。
- [x] 浏览器 favicon、PWA 图标、Android 图标都是 Pulse。
- [x] 无旧上游品牌残留。
- [x] 发布镜像使用显式版本号。

## 14. 部署 / Harbor / FlyNAS / 回滚

- [x] 发布前版本检查通过。
- [x] 发布前测试通过。
- [ ] Harbor 存在目标 Hub 和 Agent 镜像。
- [ ] FlyNAS 实际运行目标版本。
- [ ] Hub 同机 Agent 在线。
- [ ] 发布前备份成功。
- [ ] 回滚到上一版本可执行。
- [ ] 回滚后健康检查和 About 页正常。

验证记录：

- 2026-06-16 本地发布前验证通过：`npm.cmd --prefix internal/site run check -- --max-diagnostics=200`、`npm.cmd --prefix internal/site run build`、`npm.cmd --prefix internal/site run android:sync`、Android `assembleDebug`、`go test -tags=testing -count=1 -timeout=240s ./...`、`check-version-consistency.ps1 -Version 1.0.5`、`verify-release-v1.ps1 -Version 1.0.5 -SkipRegistry`。
- 2026-06-16 生成产物扫描通过：`internal/site/dist`、Android WebView assets 和 public 静态资源中未发现旧 `1.0.4` 图标参数、`/system/static`、`/settings/static` 或旧上游品牌。
- Harbor 镜像存在性、FlyNAS 拉取重建、正式数据备份和回滚健康检查仍需在正式发布时执行后再勾选。
- 2026-06-18 部署预检未通过：`docker manifest inspect registry.example.com/infra/pulse-hub:1.0.5` 和 `pulse-agent:1.0.5` 均返回 artifact not found，说明 Harbor 尚未发布目标镜像；`ssh flynas "test -d /vol1/1000/docker/pulse"` 返回 `pulse-dir-missing`，当前 SSH 别名未指向预期正式部署目录或该目录尚未准备好。因此第 14 节和第 17 节 FlyNAS / 回滚项保持未勾选，不能执行正式部署验收。

## 15. 性能 / 数据保留 / Realtime

- [x] 首页首屏加载快。
- [x] 客户端列表不拉完整详情 JSON。
- [x] 100 台机器列表不卡顿。
- [x] 1000 条日志分页不卡顿。
- [x] 大量容器和网站列表不卡顿。
- [x] 图表不会因点位过多卡死。
- [x] Realtime 高频更新不导致整页闪动。
- [x] Android 冷启动可接受。
- [x] 数据库不会无限增长。
- [x] 清理任务可执行并有日志。

验证记录：

- 2026-06-16 已补齐自动增长数据保留边界：指标统计按现有分辨率保留，告警历史按用户保留数量上限，网站检测历史按监控保留最近 500 条且最多 30 天，操作记录按机器保留最近 300 条且最多 90 天，操作审计按用户保留最近 1000 条且最多 180 天，系统日志保留最近 5000 条且最多 30 天。
- Agent 采集诊断为机器信息里的最新状态覆盖字段，不单独追加历史表。
- 2026-06-16 已新增 `/api/pulse/systems/summary` 轻量摘要接口，首页、客户端列表和手机端机器列表不再默认拉取完整 `systems.info`；机器详情页仍按需读取完整采集诊断和结果字段。
- 2026-06-16 systems realtime 已改为轻量字段订阅和节流摘要刷新，覆盖 Agent 心跳导致全局机器列表频繁重绘的问题；其他 realtime-heavy 页面仍待继续验收。
- 2026-06-16 已新增 `/api/pulse/dashboard/summary` 首页聚合摘要接口，容器和网站监控统计由 Hub 聚合返回，首页首屏不再拉完整 `containers` 和 `website_monitors` 列表到浏览器端计数。
- 2026-06-16 网站监控页机器筛选改用全局轻量机器摘要，不再为了下拉和搜索重复拉完整 `systems` 详情 JSON。
- 2026-06-16 设置页操作审计改为后端分页、筛选和搜索，默认只加载当前页记录，不再一次性拉取全部 `operation_audit` 后在浏览器端分页。
- 2026-06-16 设置页系统日志改为 `/api/pulse/logs?page=...&perPage=...` 后端分页、级别筛选和搜索，桌面端和手机端都只加载当前页；已补充 API 回归测试覆盖分页、筛选和搜索。
- 2026-06-16 设置页告警历史改为 `/api/pulse/alerts-history?page=...&perPage=...` 后端分页、状态筛选、来源筛选和搜索；已补充 API 回归测试覆盖分页、用户隔离、状态筛选、来源筛选和搜索。
- 2026-06-16 网站监控列表改为 `/api/pulse/website-monitors?page=...&perPage=...` 后端分页、搜索、状态筛选和机器筛选，桌面端和手机端都只渲染当前页；realtime 事件改为节流刷新当前页；已补充 API 回归测试覆盖分页、搜索、状态筛选、过期筛选、机器筛选和用户隔离。
- 2026-06-16 容器监控列表改为 `/api/pulse/containers` 后端机器汇总 + 当前机器明细加载；机器卡不再依赖全量容器明细，切换机器后只加载该机器容器，systems realtime 触发时也只节流刷新当前机器；已补充 API 回归测试覆盖未登录拒绝、默认机器、按机器加载、空机器和用户隔离。
- 2026-06-16 系统详情图表新增前端点位上限和渲染前降采样：实时 / 历史数据按时间范围限制缓存长度，Area / Line 图表绘制前保留首尾和断线点后再采样；`npm.cmd --prefix internal/site run check -- --max-diagnostics=200`、`npm.cmd --prefix internal/site run build` 通过，浏览器验证系统详情 1 小时和 24 小时图表不空白、无横向溢出、无 console error。真实 100 台机器压测仍由单独条目继续验收。
- 2026-06-16 清理任务新增成功摘要日志：每小时 `DeleteOldRecords` 在真实删除旧数据时会记录 `deleted_total` 和各表删除数量，空跑不刷屏；`go test -tags=testing -count=1 -timeout=120s ./internal/records` 已覆盖清理执行和摘要日志输出。
- 2026-06-16 告警中心 realtime 改为合并刷新：桌面告警中心收到多条 `alerts_history` 事件时只做安静后台刷新，手机端告警列表会批量应用短时间事件；设置页系统日志确认无 realtime 订阅，继续按服务端分页手动刷新。
- 2026-06-18 告警中心 realtime 风暴浏览器验收通过：在 `http://127.0.0.1:5173/alerts?verify-task15-realtime=1781722574561` 下，通过浏览器会话真实登录态创建临时告警记录并在同一条告警上快速触发 / 恢复 14 轮；页面始终停留在 `/alerts`，`scrollWidth = clientWidth = 2453`，`loadingSamples = 0`，`loginSamples = 0`，`errorBoundarySamples = 0`，`newWarnErrorLogs = 0`，`historyCount = 14`，临时历史和告警记录已清理为 `remainingHistoryCount = 0`。说明 realtime 高频更新不会把整页打回 loading、不会闪白、不会横向撑屏，也不会产出新的控制台告警。
- 2026-06-16 移动端离线快照新增缓存上限：只保留最近少量机器摘要，序列化后超过 4KB 会压缩，7 天以上快照会清理，写入失败时不会影响在线使用；真实 Android 离线回放已在第 12 节 MuMu 验收中补齐。
- 2026-06-16 Agent SMART 采集新增设备级失败退避：同一设备连续失败后按 15 分钟、30 分钟、1 小时逐步延后重试，最多 6 小时，成功采集后清除退避；`go test -tags=testing -count=1 -timeout=180s ./agent` 已覆盖退避记录、跳过和重置。
- 2026-06-16 补齐大数据接口回归：`TestSystemsSummaryHandlesLargeInventory` 验证 100 台已确认机器只通过 `/api/pulse/systems/summary` 返回轻量摘要，剔除大字段和 diagnostics；`TestSystemLogsPagedListHandles1000Rows` 验证 1000 条 Hub 日志时 `/api/pulse/logs?page=1&perPage=50` 只返回 50 条当前页和 `hasMore=true`，第 20 页返回最后 50 条且 `hasMore=false`。
- 2026-06-17 真实浏览器 100 台机器列表渲染验收通过：桌面客户端默认渲染首批 60 台并显示加载更多，手机端默认渲染首批 50 台并显示加载更多；搜索、排序和加载更多交互可用，验收后临时压测机器已删除。
- 2026-06-18 首页首屏性能浏览器采样通过：Browser / CDP 对 `http://127.0.0.1:5173/` 连续刷新 5 次，均进入首页而非登录页，页面 `scrollWidth = clientWidth = 2453`，新增 console warn / error 数量为 0；`DomContentLoaded - NavigationStart` 最大 155ms，`FirstMeaningfulPaint - NavigationStart` 最大 454ms，CDP `TaskDuration` 最大 191ms，节点数最大 2164，JS heap 最大 45.36 MB。
- 2026-06-18 Android 冷启动验收预检一度阻塞：`adb devices` 未列出设备，`adb connect 127.0.0.1:16384` 返回目标计算机拒绝连接 `10061`；后续定位为 MuMu 实例未处于可控状态且 `.nemu` 中的 `ginstance` 已过期。
- 2026-06-18 Android 冷启动验收通过：读取 `D:\Program Files\Netease\MuMu Player 12\vms\MuMuPlayer-12.0-0\configs\vm_config.json` 当前 `ginstance1400101743819653200` 后，`NemuShell.exe mumu-0 ginstance1400101743819653200 "getprop ro.product.model"` 返回 `PHY110`，`adb connect 127.0.0.1:16384` 恢复为 `device`；Pulse Android `versionName=1.0.5`、`versionCode=10005`。执行 5 次 `adb shell am force-stop site.gutenacht.pulse` + `adb shell am start -W -n site.gutenacht.pulse/.MainActivity`，`TotalTime` 为 652ms、783ms、706ms、751ms、1041ms，最大 1041ms，平均 786.6ms；每次 UI tree 都命中 Pulse 登录 / 首页相关文本，crash buffer 未出现 `site.gutenacht.pulse` 崩溃，截图已保存到 `.codex-artifacts\mumu-coldstart.png`。

## 16. 安全 / 权限 / 密钥

- [x] 只读用户不能执行任何写操作。
- [x] 后端拒绝 Hub 机器删除。
- [x] 后端拒绝保护容器危险操作。
- [x] 普通添加机器不暴露 universal token。
- [x] Token 在 UI 默认脱敏。
- [x] 日志不出现完整 Token、密码、Authorization。
- [x] `AUTO_LOGIN`、`TRUSTED_AUTH_HEADER`、开发模式进入安全自检。
- [x] MFA 登录流程完整。
- [x] 登录失败多次触发限速。
- [x] Android 不明文保存敏感登录信息。

验证记录：

- 2026-06-16 已扫描 Hub 自定义 POST/PATCH/DELETE 路由，写接口均绑定 `excludeReadOnlyRole` 或 `requireAdminRole`；本轮补齐 `/api/pulse/test-notification` 和 `/api/pulse/user-alerts` 的只读拦截。
- 2026-06-16 已收紧 PocketBase collection 写规则：`alerts`、`alerts_history`、`notification_failures`、`notification_channel_health`、`alert_notification_states` 和 `user_settings` 不再允许 readonly 直接写入；`go test -tags=testing -count=1 -timeout=180s ./internal/hub ./internal/alerts` 通过。
- 2026-06-16 `agent_pairing_codes` 直接删除规则也已收紧为非 readonly 才能执行；测试覆盖 readonly 用户无法删除接入会话，避免只读角色还能修改接入状态。
- 2026-06-16 已确认生产安全自检链路：`TestInfoReadinessChecksDangerousConfig` 覆盖 `AUTO_LOGIN`、`TRUSTED_AUTH_HEADER`、`PULSE_DEV_LOCAL_AGENT_AS_HUB`、`DISABLE_PASSWORD_AUTH`、`MFA_OTP=superusers` 和默认本地 Agent token；`/api/pulse/public-info` 不暴露 readiness；About 页已在浏览器验证可以显示 `1.0.5-dev` 安全更新记录。
- 2026-06-16 已补齐密钥脱敏和 Token 生命周期：Agent Token 管理页桌面 / 手机默认只显示摘要，完整 Token 只在复制 YAML / 环境变量时显式读取；`fingerprints.token` 和 `universal_tokens.token` 已从普通 collection API 响应中隐藏；`fingerprints` 直接写入已关闭，轮换和解绑统一走 Hub 接口并写入审计。
- 2026-06-16 已补齐登录限速和敏感日志脱敏：同一登录身份和来源 IP 连续失败后真实 PocketBase 登录接口返回 429；operation_audit、通知测试审计、通知失败记录和通知通道健康记录写入前会脱敏 token / secret / password / API key / Authorization Bearer / webhook userinfo。
- 2026-06-16 已补齐首次初始化后的 MFA 代码路径：创建首个管理员后如果 PocketBase 要求 MFA，会请求 OTP 并进入 6 位验证码验证流程；真实 MFA 开关环境的完整登录验收已于 2026-06-18 补齐。
- 2026-06-16 已补齐 MFA 登录 API 回归测试：`TestPasswordLoginMFAPaths` 覆盖 MFA 关闭、MFA 开启、OTP 错误和 OTP 正确四条后端路径，防止 UI 流程存在但后端登录挑战链路回归；About 页已验证新增记录可见；真实浏览器收验证码登录已于 2026-06-18 标记为完整通过。
- 2026-06-16 已接入前端启动登录态刷新：旧 Token 遇到 401 / 403 会清空登录态并回到登录页；强制失效 Token 的浏览器验收仍需保留待验证。
- 2026-06-16 浏览器已验证会话过期路径：临时写入格式有效但服务端无效的 `pocketbase_auth` 后刷新，页面回到登录页，本地 auth 被清空，未出现新 console error；随后已恢复原登录态。
- 2026-06-18 MFA 登录流程完整验收通过：临时 SMTP 捕获到真实 OTP 邮件，MFA 开启页面先停留在二次验证，输入邮件验证码后才进入首页；MFA 关闭环境不出现二次验证干扰。该项覆盖真实浏览器输入、真实邮件收取和最终首页登录态。
- 2026-06-16 已补齐备份敏感数据提示：备份管理桌面端、手机端和还原 / 删除确认文案都提示备份包含用户、Token、通知配置、网站地址和操作审计；`go test -tags=testing -count=1 -timeout=180s ./internal/common ./internal/hub ./internal/alerts`、`npm.cmd --prefix internal/site run check -- --max-diagnostics=200`、`npm.cmd --prefix internal/site run build` 通过。
- 2026-06-16 已确认绕过 UI 的后端危险保护：`DELETE /api/pulse/systems/{id}` 和直接 `DELETE /api/collections/systems/records/{id}` 都拒绝 Hub 机器删除，`POST /api/pulse/operations` 会以 `failure_code=protected` 拒绝受保护 Pulse 容器和受保护 Windows 服务；`go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(DeleteSystemRejectsLocalSystem|CollectionDeleteRejectsLocalSystem|OperationsAPI|Operation|Collection|AgentToken|Fingerprint|InfoReadiness|Protected)"`、`go test -tags=testing -count=1 -timeout=180s ./internal/common ./internal/hub ./internal/alerts` 通过。

## 17. 固定验证命令

- [x] `npm.cmd --prefix internal/site run check`
- [x] `npm.cmd --prefix internal/site run build`
- [x] `npm.cmd --prefix internal/site run android:sync`
- [x] `go test -tags=testing -count=1 -timeout=240s ./...`
- [x] `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5`
- [x] `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.5 -SkipRegistry`
- [x] 桌面和移动多视口浏览器检查。
- [x] MuMu Android 检查。
- [ ] FlyNAS 部署和回滚检查。
- 2026-06-17 Task 17 多视口 / Android 固定验收补齐：浏览器 `375x812`、`390x844`、`430x932`、`768x1024` 覆盖首页、机器列表、机器详情、告警、网站、容器、设置和关于页；MuMu Android `127.0.0.1:16384` 覆盖 Hub 地址错误提示、登录、重启登录态保持、核心页面、离线只读快照和离线操作禁用。详细证据见 `docs/production-acceptance-evidence.md` 的 2026-06-17 移动端 / Android / 平板验收记录。
