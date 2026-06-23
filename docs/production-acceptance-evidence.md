# Pulse 1.0.5 生产上线验收证据

> 这份文件用于正式发布前记录验收证据。`docs/production-readiness-checklist.md` 负责总览勾选；本文件负责说明每一项为什么能通过、证据在哪里、阻塞是什么。

## 验收原则

- 没有证据不勾选通过。证据可以是命令输出、浏览器页面检查、Android / MuMu 截图、FlyNAS 日志、Hub API 响应、操作审计记录或明确的人工验收结论。
- 监控数据必须来自真实采集。CPU、内存、磁盘、网络、GPU、S.M.A.R.T.、容器、网站、告警、Agent 能力不能用占位值、猜测标签或前端假正常代替。
- 后端保护必须能抵抗绕过 UI 的请求。Hub 机器删除、Pulse 容器操作、只读权限、Token 生命周期、备份和用户管理不能只靠隐藏按钮。
- Web、Hub、Agent、Android App 必须使用同一个显式版本号。任一端改动也要同步版本、发布说明和关于页记录。
- 发布前必须确认回滚路径。没有备份、没有上一版本镜像、没有回滚验证命令时不能认为可以上线。

## 状态定义

| 状态 | 含义 |
| --- | --- |
| 未开始 | 尚未实施或尚未设计验收方式。 |
| 实施中 | 正在改代码、文档或流程。 |
| 待验证 | 功能已实现，但还没有足够证据。 |
| 通过 | 已记录可复查证据。 |
| 阻塞 | 发现必须修复的问题，发布前不能放行。 |
| 例外接受 | 已知问题被明确接受，需要写清楚影响、风险和后续处理。 |

## 证据格式

每条证据都按下面格式记录，避免后续只剩“我记得可以”：

```text
日期：
验收项：
状态：
环境：
执行人：
证据：
结果：
后续：
```

推荐证据粒度：

- 命令验证：记录完整命令、退出码、关键输出。
- 浏览器验证：记录 URL、视口、页面状态、控制台是否有新错误。
- Android 验证：记录设备 / 模拟器、APK 版本、关键页面截图或 logcat 结论。
- FlyNAS 验证：记录 SSH 主机、目录、Compose 镜像 tag、健康检查和容器日志结论。
- 后端安全验证：记录 API、预期状态码、失败码、测试名。

## 发布阻断项

以下项目任何一项未通过，不能发布 `1.0.5`：

- 清库初始化和首个管理员创建流程可用。
- 登录、会话过期、MFA 开关状态不白屏、不死循环。
- 新机器必须通过配对、上线、身份确认后才进入客户端列表。
- Hub 同机 Agent 显示真实机器名，只带 `Hub` 标签，且后端不能删除。
- 硬件和能力标签只来自真实采集或明确诊断结果。
- 保护容器和保护服务的危险操作在后端拒绝。
- 网站、告警、通知、操作审计能看到真实状态和失败原因。
- Token、备份、日志、审计不泄露完整密钥。
- 固定验证命令全部通过。
- Harbor 存在目标版本 Hub / Agent 镜像。
- FlyNAS 运行目标版本，并且备份和回滚路径可执行。

## 1.0.5 固定版本说明

`1.0.5` 已在 2026-06-23 固定为本地交付版本。Web / Hub / Agent / Android App 的版本源、About 页正式记录、发布说明和本地验证命令以固定点后的文件为准。

本文件中 2026-06-23 之前出现的 `1.0.5-dev` 属于当时开发阶段的历史证据，不再代表当前发布口径。Harbor 推送、FlyNAS 正式部署、生产数据备份和回滚演练需要由部署执行人完成后继续补充运行态证据；这些证据未补齐前，不把“已部署到生产”作为已完成结论。

## 当前证据索引

| 模块 | 当前状态 | 证据位置 |
| --- | --- | --- |
| 初始化 / 登录 / 安全自检 | 通过 | `docs/production-readiness-checklist.md` 第 1 节 |
| 机器添加 / Agent 接入 | 通过 | `docs/production-readiness-checklist.md` 第 2 节 |
| 机器身份 / Hub 同机 Agent | 待验证 | `docs/production-readiness-checklist.md` 第 3 节 |
| 首页 / 客户端列表 | 通过 | `docs/production-readiness-checklist.md` 第 4 节 |
| 机器详情 / 硬件真实性 | 通过 | `docs/production-readiness-checklist.md` 第 5 节 |
| Agent 采集边界 | 通过 | `docs/production-readiness-checklist.md` 第 6 节 |
| 容器监控 / 操作保护 | 通过 | `docs/production-readiness-checklist.md` 第 7 节 |
| 网站监控 | 通过 | `docs/production-readiness-checklist.md` 第 8 节 |
| 告警 / 通知 | 通过 | `docs/production-readiness-checklist.md` 第 9 节 |
| 操作记录 / 审计 | 通过 | `docs/production-readiness-checklist.md` 第 10 节 |
| 设置 / 日志 / 用户 / Token / 备份 / Agent 管理 | 通过 | `docs/production-readiness-checklist.md` 第 11 节 |
| 移动端 / Android / 平板 | 通过 | `docs/production-readiness-checklist.md` 第 12 节 |
| 版本 / About / 发布说明 | 通过 | `docs/production-readiness-checklist.md` 第 13 节 |
| 部署 / Harbor / FlyNAS / 回滚 | 待验证 | `docs/production-readiness-checklist.md` 第 14 节 |
| 性能 / 数据保留 / Realtime | 通过 | `docs/production-readiness-checklist.md` 第 15 节 |
| 安全 / 权限 / 密钥 | 通过 | `docs/production-readiness-checklist.md` 第 16 节 |
| 固定验证命令 | 待验证 | `docs/production-readiness-checklist.md` 第 17 节 |

## 已记录证据

### 2026-06-23 1.0.5 固定版本本地验证

日期：2026-06-23  
验收项：版本 / About / 发布说明、固定验证命令  
状态：通过  
环境：Windows 本地开发环境，Vite `http://127.0.0.1:5173`  
执行人：Codex  
证据：

```powershell
npm.cmd run check -- --max-diagnostics=200
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5
npm.cmd run build
```

关键输出：

```text
Biome: Checked 201 files. No fixes applied.
Version consistency check passed for 1.0.5. Android versionCode: 10005
Vite: built successfully.
```

浏览器验证：

```text
URL: http://127.0.0.1:5173/settings/about?verify-freeze-105=1
页面标题：设置 / Pulse
页面包含：Pulse 1.0.5、Pulse 1.0.5 正式发布、正式版
页面不包含：1.0.5-dev、开发中
console errors: 0
console warnings: 0
scrollWidth <= clientWidth
```

结果：本地交付口径已固定为 `1.0.5`。About 页、发布记录、版本一致性脚本和前端构建均通过当前验证。Harbor 推送、FlyNAS 正式部署、生产备份和回滚演练仍需部署执行人完成后补充证据。  
后续：固定点之后的新改动进入下一版本记录，不再回填到 `1.0.5`。

### 2026-06-17 移动端 / Android / 平板验收

日期：2026-06-17  
验收项：移动端 / Android / 平板  
状态：通过  
环境：Windows 本地开发环境，Hub `http://127.0.0.1:8090`，Vite `http://127.0.0.1:5173`，MuMu Android `127.0.0.1:16384`，设备 `PHY110` / Android 12 / CSS 宽度 `360`  
执行人：Codex  
证据：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run android:sync
internal\site\android\gradlew.bat -p internal\site\android assembleDebug --console=plain
adb -s 127.0.0.1:16384 install -r internal\site\android\app\build\outputs\apk\debug\app-debug.apk
adb -s 127.0.0.1:16384 shell dumpsys package site.gutenacht.pulse
```

关键输出：

```text
Android APK metadata:
- versionName=1.0.5
- versionCode=10005

MuMu device:
- Physical size: 2160x3840
- Physical density: 960
- Android: 12
- Model: PHY110
- WebView CSS width: 360
```

运行态：

```text
首次启动 / Hub 地址：
- 清空 App 数据后首次启动进入 `Pulse Mobile / 连接 Hub`。
- 默认 Hub 地址为 `http://localhost:8090`。
- 点击保存后显示 `Hub 地址不可用`，并提示无法连接到 Hub。
- 改填 `http://10.0.2.2:8090` 后进入登录页，页面显示 `当前 Hub：http://10.0.2.2:8090`。

登录 / 登录态保持：
- 临时用户 `android-qa@example.test` 登录成功后进入移动首页。
- 首页显示 `今日状态`、底部导航 `首页 / 机器 / 告警 / 网站 / 容器` 和临时机器 `Android 离线验收机`。
- 执行 `adb shell am force-stop site.gutenacht.pulse` 后重新启动 App，仍停留在首页，不回到登录页。

核心页面：
- `/`、`/clients`、`/alerts`、`/websites`、`/containers`、`/settings/about` 均通过 CDP 读取。
- 每个页面 `scrollWidth = clientWidth = 360`。
- 每个页面都有有效正文，不是空白页。
- About 页显示 Web / Hub、移动端 / Android、Agent、部署 / 发布分端记录，且 Android App 版本为 `1.0.5`。

离线只读：
- CDP 模拟 offline 后页面显示 `当前为离线只读模式`。
- 快照显示 `客户端 1/1`、`告警 0`、`缓存 2026/6/17 07:39:51`。
- 打开网站详情并点击立即检测后，确认 Sheet 显示离线说明。
- 最终确认按钮显示 `离线不可操作` 且 `disabled=true`。

网站卡片小屏溢出回归：
- 修复 `monitor-card.tsx` 后，MuMu 网站页 `scrollWidth = clientWidth = 360`。
- 检测按钮越界列表为空。
- Browser 插件在 `360x640` 视口验证 `http://127.0.0.1:5173/websites?verify-task12-browser-websites=1`，`scrollWidth = clientWidth = 345`，无越界按钮。
- Browser 插件在 `1365x768` 视口验证桌面网站页，`scrollWidth = clientWidth = 1350`，Harbor 详情和响应趋势正常显示。

临时数据清理：
- 临时网站 `androidqaweb0001`、临时机器 `androidqa0000001`、临时用户 `android-qa@example.test` 验收后已删除。
- 重复执行删除脚本返回 `not found`，确认未留下临时 QA 记录。
```

截图：

```text
.codex-artifacts\mumu-task12-fresh-hub-config.png
.codex-artifacts\mumu-task12-websites-fixed.png
.codex-artifacts\mumu-task12-offline-action-disabled.png
```

结果：第 12 节移动端 / Android / 平板验收通过。手机底部导航、设置 / 关于入口、移动首页、核心页面无横向溢出、Android Hub 地址错误提示、登录态重启保持、离线只读快照显示数据时间、离线危险操作禁用和 MuMu 核心流程均有运行态证据。  
后续：Android 冷启动性能仍归入第 15 节性能验收；正式生产通知和远程推送能力不在 1.0.5 第一版承诺范围内。

### 2026-06-17 网站监控验收

日期：2026-06-17  
验收项：网站监控  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(WebsiteMonitor|ClassifyWebsiteMonitor|WebsiteMonitorPagedList|WebsiteMonitorCheckWritesOperationAudit|DeleteSystemRelatedDataRemovesWebsiteMonitors)"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

浏览器：

```text
桌面网站页：
- URL: http://localhost:5173/websites?verify-task8-websites=1
- 当前真实 Harbor 监控显示正常状态、内网 IPv4、最近检测、检测状态条和响应趋势。
- 立即检测按钮打开“确认立即检测”弹窗，弹窗显示目标摘要和“开始检测”；未点击最终开始检测。
- 页面 `scrollWidth = clientWidth = 1350`，无横向溢出。

临时三地址待检测布局：
- 临时创建 `临时验收-三地址布局`，`enabled=false`，`last_status=unknown`，不写入检测结果，验收后删除。
- 桌面列表显示 `3 个地址`、`尚未检测`、`内网 IPv4`、`外网 IPv4`、`内网 IPv6`。
- 未检测状态没有被显示为正常。
- 页面 `scrollWidth = clientWidth = 1350`，无横向溢出。

手机端 375x812：
- URL: http://localhost:5173/websites?verify-task8-mobile-websites=1
- 页面显示 `1 正常 / 1 待检测 / 2 总数`、底部导航、Harbor 真实监控和临时三地址待检测监控。
- 移动详情 Sheet 显示 `临时验收-三地址布局`、`待检测`、`3 个` 监控地址、内网 IPv4 / 外网 IPv4 / 内网 IPv6、响应时间 `--`、检测时间 `--`、暂无检测记录。
- 移动详情里的立即检测会打开确认弹窗，未执行最终检测。
- 详情 Sheet 可关闭，关闭后页面仍无横向溢出。
- 页面 `scrollWidth = clientWidth = 360`。
- 本轮手机验收新增 console warn / error 数量为 0。

清理：
- 临时监控删除结果：`deleted checks=0 monitors=1`。
- 清理后网站页恢复为 1 条真实 Harbor 监控，页面不再包含 `临时验收-三地址布局`。
```

结果：网站监控的正常、异常分类、待检测、分地址展示、按需检测历史、立即检测确认 / 执行中入口、目标级刷新和移动端无横向滚动均完成本地验收；失败分类由后端回归测试覆盖，页面只展示真实或临时明确标记的待检测数据，没有伪造正常 / 异常结果。  
后续：正式发布前如有外网 IPv6、证书错误、DNS 失败或内容校验失败的真实生产目标，可以继续补充运行态截图 / 日志作为额外证据；当前第 8 节不再阻塞 1.0.5 本地上线验收。

### 2026-06-17 容器监控 / 操作保护验收

日期：2026-06-17  
验收项：容器监控 / 操作保护  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./agent ./internal/hub ./internal/hub/systems -run "Test(ComposeStackInfoFromLabels|SystemCreateRecordsIgnoresUntrustedPartialContainerStackLabels|SystemCreateRecordsClearsPulseContainerStackLabels|FindStackOperationContainersExcludesProtectedForAllActions|IsProtectedContainer|ValidateOperationCapability|OperationAuditLinksActionAndCanBeQueriedByOperation|OperationPreflightAuditDoesNotClaimOperationRecord|ContainerListAPI|ContainerStatusForOperation|TimeoutForOperation)"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

浏览器和数据核对：

```text
当前开发库只读核对：
- `pulse-agent` 是 `nacht` 上的独立容器，未归入 `harbor`。
- `harbor` 编排只有 9 个 Harbor 业务容器。
- 当前容器表共 10 条。

桌面容器页：
- URL: http://localhost:5173/containers?verify-task7-containers=1
- `harbor` 编排显示 9 运行 / 0 停止。
- `pulse-agent` 显示在独立容器区域。
- 编排头部不重复机器名和容器数。
- 独立容器为空表格文案未出现。
- 点击 `harbor` 停止只打开“确认停止堆栈”二次确认弹窗，没有执行最终停止。
- 无横向溢出。

手机端容器页：
- URL: http://localhost:5173/containers?verify-task7-mobile-containers=1
- 375x812 视口下 `scrollWidth = clientWidth = 360`。
- 没有可见宽表格。
- 底部导航存在。
- `harbor` 编排和 `pulse-agent` 独立容器可见。

系统详情容器摘要：
- URL: http://localhost:5173/system/nm04thq6ov5v4by?verify-task7-container-count=1
- 摘要显示 `容器 10 个 Docker 版本 29.1.3 正常`。
- 不再显示 `容器 0 个`。

系统详情容器模块：
- URL: http://localhost:5173/system/nm04thq6ov5v4by?verify-task7-container-detail-final=1
- 点击容器摘要后显示“容器监控”。
- `harbor` 编排区只显示 `harbor 9 运行 0 停止` 和操作按钮。
- `pulse-agent` 显示在独立容器区。
- 页面无横向溢出。
- 刷新后新增 console warn / error 数量为 0。

操作记录：
- URL: http://localhost:5173/system/nm04thq6ov5v4by?tab=history&verify-task7-history=1
- 可见设备操作记录、刷新记录、阶段、耗时、审计和容器相关历史记录。
- 容器操作 toast 的“查看记录”入口指向 `/system/{id}?tab=history`。
- 无横向溢出。
```

结果：容器归组、Pulse 保护容器拒绝、危险操作二次确认、执行阶段 / 耗时记录、操作记录跳转、桌面和手机端容器页布局均完成本地验收；系统详情容器摘要已改用当前容器清单汇总，避免历史图表缺点位时误显示 0 个。  
后续：正式发布前仍需在 FlyNAS / Linux 宿主上用目标版本镜像重新验证同机 Hub + Agent 容器保护和 Compose 操作确认弹窗；不要在生产 Harbor 业务编排上执行真实停止 / 重启，除非有明确维护窗口。

### 2026-06-17 告警 / 通知验收

日期：2026-06-17  
验收项：告警 / 通知  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/alerts ./internal/hub ./internal/hub/systems -run "Test(UserAlertsApi|GlobalAlertPoliciesApi|AlertHistoryActionsApi|SendTestNotification|NotificationFailureRecordedAndCleared|SilencedAlertNotificationIsSkipped|AlertsHistoryStatus|AlertHistoryPagedList|WebsiteMonitorAlertHistory|SystemCreateRecordsSyncsContainerAlertHistory|CreateRecordsSyncsMonitored(Service|Software)AlertHistory|PairingCodeCreationDoesNotCreateSystem)"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

浏览器：

```text
桌面告警页：
- URL: http://localhost:5173/alerts?verify-task9-alerts=1
- 页面默认显示当前未恢复问题。
- 详情 Sheet 可查看来源、等级、状态、触发值、触发 / 恢复时间和静默信息。
- 临时告警完成确认、静默、恢复后已清理，页面恢复为真实状态。

手机通知设置：
- URL: http://localhost:5173/settings/notifications?verify-task9-mobile-notifications=1
- 可见通知权限状态、通道健康、重复冷却和“不承诺被系统完全结束后的通知”说明。
- 页面 `scrollWidth = clientWidth = 360`，无横向溢出。

手机告警页：
- URL: http://localhost:5173/alerts?verify-task9-mobile-alerts=1
- 单列布局，无横向溢出。
- 可见真实告警记录，未出现假数据或空表格遮盖真实状态。

添加系统：
- URL: http://localhost:5173/clients?verify-task9-add-system-alert-default=1
- “加入告警”默认未勾选。
```

结果：告警确认、静默、恢复、通知通道失败原因、重复告警冷却、Android / PWA 通知说明和新机器默认不加入离线告警均已完成验收；临时验收数据已清理。  
后续：如果后续接入真实外部通知通道，再补一条真实发送 / 失败的现场证据即可，但这不再阻塞当前第 9 节通过。

### 2026-06-16 固定本地验证命令

日期：2026-06-16  
验收项：本地发布前基础质量闸门和 Task 17 本地固定验证命令  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`  
执行人：Codex  
证据：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run android:sync
go test -tags=testing -count=1 -timeout=240s ./...
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.5 -SkipRegistry
```

结果：本轮重新执行通过；已在 `docs/production-readiness-checklist.md` 第 14 节和第 17 节记录通过。  
后续：正式发布时必须重新执行不带 `-SkipRegistry` 的发布验证，并补充 Harbor / FlyNAS 运行态证据。

### 2026-06-17 Task 17 多视口 / Android 固定验收补充

日期：2026-06-17  
验收项：Task 17 桌面和移动多视口浏览器检查、MuMu Android 检查  
状态：通过  
环境：Windows 本地开发环境，Vite `http://127.0.0.1:5173`，Hub `http://127.0.0.1:8090`，MuMu Android `127.0.0.1:16384`  
执行人：Codex  
证据：

```text
- 浏览器多视口：375x812、390x844、430x932、768x1024。
- 覆盖页面：首页、机器列表、机器详情、告警、网站、容器、设置、关于页。
- MuMu Android：首次 Hub 地址配置、错误地址提示、登录、force-stop 后登录态保持、首页、机器列表、告警、网站、容器、关于页和离线只读操作禁用。
- 网站监控小屏溢出回归：MuMu 网站页 scrollWidth = clientWidth = 360，Browser 360px 网站页 scrollWidth = clientWidth = 345，桌面 1365px 网站页 scrollWidth = clientWidth = 1350。
```

结果：Task 17 中“桌面和移动多视口浏览器检查”和“MuMu Android 检查”可以勾选通过；详细运行态证据见本文件 2026-06-17 移动端 / Android / 平板验收记录。  
后续：Task 17 的 FlyNAS 部署和回滚检查仍未完成，不能在发布前跳过。

### 2026-06-18 Harbor / FlyNAS 部署预检

日期：2026-06-18  
验收项：Harbor 目标镜像存在性、FlyNAS 正式目录可达性  
状态：阻塞  
环境：Windows 本地开发环境，Harbor `registry.example.com/infra`，SSH 别名 `flynas`  
执行人：Codex  
证据：

```powershell
docker manifest inspect registry.example.com/infra/pulse-hub:1.0.5
docker manifest inspect registry.example.com/infra/pulse-agent:1.0.5
ssh -o BatchMode=yes -o ConnectTimeout=8 flynas "hostname; pwd; test -d /vol1/1000/docker/pulse && echo pulse-dir-ok || echo pulse-dir-missing"
```

关键输出：

```text
unknown: artifact infra/pulse-hub:1.0.5 not found
unknown: artifact infra/pulse-agent:1.0.5 not found

GuteNacht
/home/gutenacht
pulse-dir-missing
```

结果：Harbor 尚未存在 `1.0.5` 的 Hub / Agent 目标镜像，当前 `flynas` SSH 别名也没有看到正式部署目录 `/vol1/1000/docker/pulse`。因此不能执行 `docker compose pull && docker compose up -d --force-recreate`，第 14 节 Harbor / FlyNAS / 回滚和第 17 节 FlyNAS 部署 / 回滚检查保持未通过。  
后续：正式发布时先执行统一发布脚本推送 `1.0.5` 镜像，再确认 SSH 目标和部署目录，完成备份、拉取重建、运行态验证和回滚演练。

### 2026-06-18 告警中心 realtime 风暴验收

日期：2026-06-18  
验收项：Realtime 高频更新不导致整页闪动  
状态：通过  
环境：Windows 本地开发环境，Vite `http://127.0.0.1:5173`，Hub `http://127.0.0.1:8090`，浏览器登录态为当前真实用户 `fqtxyb9kzhee2vm`  
执行人：Codex  
证据：

```text
URL: http://127.0.0.1:5173/alerts?verify-task15-realtime=1781722574561
alertId: hy7nf8zfqsgt0o6
historyCount: 14
remainingHistoryCount: 0
loadingSamples: 0
loginSamples: 0
errorBoundarySamples: 0
horizontalOverflowCount: 0
routeChanges: ["/alerts"]
newWarnErrorLogs: 0
```

页面样本：

```text
before / tick / burst-finished / after-cleanup
- bodyLength 在 246 到 781 之间变化，页面始终保持在告警中心。
- 没有出现整页 loading 文案。
- 没有出现登录页或错误边界。
- 页面没有横向溢出。
```

结果：告警中心在高频 realtime 更新和临时记录快速变更下没有整页闪动，也没有路由跳转、白屏、横向溢出或新增控制台告警。临时告警和历史记录已清理。  
后续：该项可作为第 15 节 `Realtime 高频更新不导致整页闪动` 的通过证据。

### 2026-06-18 Android 冷启动验收

日期：2026-06-18  
验收项：Android 冷启动可接受  
状态：通过  
环境：Windows 本地开发环境，MuMu Android `127.0.0.1:16384`，设备 `PHY110` / Android 12 / 物理分辨率 `2160x3840` / density `960`  
执行人：Codex  
证据：

```powershell
Get-Content "D:\Program Files\Netease\MuMu Player 12\vms\MuMuPlayer-12.0-0\configs\vm_config.json" -Raw
& "D:\Program Files\Netease\MuMu Player 12\nx_device\12.0\shell\NemuShell.exe" mumu-0 ginstance1400101743819653200 "getprop ro.product.model"
adb connect 127.0.0.1:16384
adb -s 127.0.0.1:16384 shell dumpsys package site.gutenacht.pulse
adb -s 127.0.0.1:16384 reverse tcp:8090 tcp:8090
adb -s 127.0.0.1:16384 shell am force-stop site.gutenacht.pulse
adb -s 127.0.0.1:16384 shell am start -W -n site.gutenacht.pulse/.MainActivity
adb -s 127.0.0.1:16384 exec-out uiautomator dump /dev/tty
adb -s 127.0.0.1:16384 logcat -b crash -d
adb -s 127.0.0.1:16384 shell screencap -p /sdcard/pulse-coldstart.png
adb -s 127.0.0.1:16384 pull /sdcard/pulse-coldstart.png .codex-artifacts\mumu-coldstart.png
```

关键输出：

```text
vm_config.json:
- ginstance: ginstance1400101743819653200

NemuShell:
- PHY110

adb devices:
- 127.0.0.1:16384 device

dumpsys package:
- versionCode=10005
- versionName=1.0.5

adb reverse:
- host-14 tcp:8090 tcp:8090

am start -W, 5 次采样：
- TotalTime: 1041 ms
- TotalTime: 783 ms
- TotalTime: 706 ms
- TotalTime: 751 ms
- TotalTime: 652 ms
- MaxTotalTimeMs: 1041
- AvgTotalTimeMs: 786.6

UI tree / logcat:
- 5 次采样后均能命中 Pulse 登录 / 首页相关文本，不是白屏。
- crash buffer 未出现 site.gutenacht.pulse 崩溃。
```

截图证据：

```text
.codex-artifacts\mumu-coldstart.png
```

排障记录：本项第一次预检时 `adb devices` 未列出设备，`adb connect 127.0.0.1:16384` 返回目标计算机拒绝连接 `10061`。后续检查发现 `.nemu` 里的 `ginstance1400094285297238800` 已过期，改用 `vm_config.json` 当前值 `ginstance1400101743819653200` 后，`NemuShell` 和 ADB 均恢复可控。  
结果：MuMu Android 上 Pulse `1.0.5` 冷启动可接受，5 次 `am start -W` 最大 `1041 ms`、平均 `786.6 ms`，首屏有有效登录界面，未发现崩溃或白屏。该项可勾选第 15 节 `Android 冷启动可接受`。  
后续：正式发布前如更换 APK、MuMu 实例或真机设备，需要重新执行同一组 `force-stop` / `am start -W` / UI tree / crash buffer 验收。

### 2026-06-16 安全 / 权限 / 密钥后端验证

日期：2026-06-16  
验收项：只读写入拦截、Hub 机器删除保护、保护容器 / 服务操作拒绝、Token 生命周期和敏感信息脱敏  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(DeleteSystemRejectsLocalSystem|CollectionDeleteRejectsLocalSystem|OperationsAPI|Operation|Collection|AgentToken|Fingerprint|InfoReadiness|Protected)"
go test -tags=testing -count=1 -timeout=180s ./internal/common ./internal/hub ./internal/alerts
```

结果：两条命令通过；后端拒绝 Hub 机器删除和受保护 Pulse 容器 / Windows 服务危险操作，不依赖前端隐藏按钮。  
后续：正式发布前仍需用真实登录态在页面和 API 侧做一次冒烟验证。

### 2026-06-16 操作审计直接写入覆盖

日期：2026-06-16  
验收项：绕过 UI 的 collection API 写入审计、只读接入会话删除拦截、通知目标脱敏  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(UserWritableCollectionRequestsWriteOperationAudit|CollectionRulesDefault|CollectionRulesShareAllSystems|ApiCollectionsAuthRules)"
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(OperationAudit|Backup|AgentToken|CollectionRecord|UserWritableCollection|ApiCollectionsAuthRules|CollectionRules|WebsiteMonitor|User|Pairing|Readonly|Protected)"
go test -tags=testing -count=1 -timeout=180s ./internal/common ./internal/hub ./internal/alerts -run "Test(OperationAudit|Backup|AgentToken|CollectionRecord|UserWritableCollection|ApiCollectionsAuthRules|CollectionRules|WebsiteMonitor|User|Pairing|Readonly|Protected|Notification|Alert|Redact)"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

结果：所有命令通过。`alerts`、`alert_policies`、`agent_pairing_codes`、`notification_channel_health`、`alert_notification_states` 和 `script_templates` 等用户可写集合已纳入统一 collection 审计 hook；readonly 用户不能直接删除 `agent_pairing_codes`；通知类审计目标只记录 `scheme://host`，不保存 webhook 路径。  
后续：正式发布前仍需在真实页面触发一次设置页操作审计查看，确认新增动作中文名在桌面端和手机端都可读。

### 2026-06-16 关于页验收证据记录可见性

日期：2026-06-16  
验收项：About 页 `1.0.5-dev` 记录同步  
状态：通过  
环境：本地浏览器，`http://localhost:5173/settings/about`  
执行人：Codex  
证据：

```text
页面包含“生产上线验收证据”。
页面包含“没有可复查证据的项目不能标记为通过”。
刷新后新增 console error 数量：0。
```

结果：关于页能看到本轮新增的生产验收证据规则，和 `docs/release-notes-next.md` 记录一致。  
后续：后续多视口浏览器验收和 MuMu Android 验收已在 2026-06-17 第 12 节证据中补齐；正式发布前继续按最新 checklist 复查即可。

### 2026-06-16 会话过期回登录页

日期：2026-06-16  
验收项：旧 Token / 失效会话处理  
状态：通过  
环境：本地浏览器，`http://localhost:5173/settings/about`  
执行人：Codex  
证据：

```text
临时备份真实 pocketbase_auth。
写入格式有效但服务端无效的 auth token。
刷新页面后显示登录页文本“用户名或邮箱 / 密码 / 登录”。
刷新后 pocketbase_auth 被清空。
刷新后新增 console error 数量：0。
恢复原 pocketbase_auth 后刷新，页面回到已登录的关于页。
```

结果：会话过期不会白屏或停留在业务页连续报错，会回到登录页。  
后续：MFA 开启 / 关闭的真实登录路径已在 2026-06-18 隔离环境中补齐验收。

### 2026-06-16 登录 / 初始化入口状态化

日期：2026-06-16  
验收项：首次初始化入口、普通登录页渲染、About 更新记录同步  
状态：通过  
环境：本地浏览器，`http://localhost:5173/settings/about?verify-login-wizard-history=1` 和 `http://localhost:5173/?verify-login-entry=1`  
执行人：Codex  
证据：

```text
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run android:sync

浏览器 About 页包含“首次初始化入口改为状态化安装向导”。
浏览器 About 页包含“登录错误统一归类为 Hub 不可达”。
临时清空 pocketbase_auth 后，登录页显示“用户名或邮箱 / 密码 / 登录”。
恢复原 pocketbase_auth 后，About 页重新显示 1.0.5-dev 版本记录。
About 页本轮刷新新增 console error 数量：0。
```

结果：入口代码、构建产物和 About 记录已同步；普通非 first-run 登录页可正常渲染，登录态可恢复。  
后续：仍需验证 MFA 开启 / 关闭真实登录路径，以及 Android Hub URL 错误重试流程。

### 2026-06-16 隔离清库首次初始化

日期：2026-06-16  
验收项：空数据目录首次初始化、首个管理员创建、二次初始化拒绝  
状态：通过  
环境：临时 Hub，`http://127.0.0.1:18090`，临时数据目录位于 `build\verify\first-run-data-*`，验收后已停止并清理  
执行人：Codex  
证据：

```text
GET http://127.0.0.1:18090/api/pulse/first-run
结果：{"firstRun":true}

浏览器页面：
- 显示“首次初始化”
- 显示“Hub 1.0.5 / 生产构建”
- 显示“创建管理员 / 二次验证 / 进入 Pulse”

浏览器创建临时管理员：
- username: pulseadmin
- email: pulseadmin@example.test
- password: 本地临时测试密码，未写入文档
结果：进入首页，显示“初始化完成”，首次初始化表单消失。

GET http://127.0.0.1:18090/api/pulse/first-run
结果：{"firstRun":false}

POST http://127.0.0.1:18090/api/pulse/create-user
结果：403 Forbidden

隔离浏览器验收新增 console error 数量：0
```

结果：空库能进入首次初始化向导，首个管理员能创建并进入系统，初始化完成后后端拒绝再次创建首个管理员。  
后续：MFA 开启 / 关闭真实登录路径已在 2026-06-18 隔离环境中补齐验收；Android Hub URL 错误重试已在 2026-06-17 Android 运行态验收中补齐。

### 2026-06-16 生产静态文件和 Service Worker

日期：2026-06-16  
验收项：Hub 生产静态文件不误 fallback 到前端路由  
状态：通过  
环境：临时 Hub，`http://127.0.0.1:18090`  
执行人：Codex  
证据：

```text
问题复现：
GET http://127.0.0.1:18090/sw.js 曾返回 index.html，浏览器报错：
service worker SecurityError: sw.js unsupported MIME type text/html

修复后：
GET http://127.0.0.1:18090/sw.js
status: 200
Content-Type: text/javascript; charset=utf-8
Content starts with: const CACHE_NAME = "pulse-mobile-shell-v1"

go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "TestProductionStaticFilesDoNotFallbackToIndex"
结果：通过
```

结果：Hub 会优先返回嵌入产物中真实存在的静态文件，`/sw.js` 不再被 SPA fallback 成 HTML。  
后续：正式发布前仍需在 FlyNAS 生产镜像里重新验证 `/sw.js`、favicon、manifest 和深层路由。

### 2026-06-16 Agent 能力边界和前端真实性展示

日期：2026-06-16  
验收项：Agent Profile 能力矩阵、能力声明和采集结果分离、旧 Agent / 缺字段不显示假可用  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`，本地浏览器 `http://localhost:5173`  
执行人：Codex  
证据：

```text
文档：
- docs/agent-capability-boundary.md 补齐 windows-host、linux-container、Hub local Agent 能力矩阵。
- 文档明确 Linux systemd / 裸机 Linux Agent 在 1.0.5 不作为默认支持入口展示。

代码：
- internal/site/src/components/routes/system/capability-strip-utils.ts
- internal/site/src/components/routes/system/capability-strip.tsx
- internal/site/src/components/routes/system.tsx

命令：
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
go test -tags=testing -count=1 -timeout=180s ./agent ./internal/hub/systems -run "Test(BuildCapabilities|UpdateCapability|SanitizeSystemInfo|Smart|SMART|Capability|Profile|Backoff|Collection)"

浏览器：
http://localhost:5173/system/75kygz8ntiwewqy?verify-capability-truth=1
- 页面包含“设备能力”。
- 能力条在缺少 collection_results 确认状态时显示“未知”，没有显示“可用”。
- 页面不再显示 WebSocket 这类内部连接实现。
- 无横向溢出。
- 新增 console error 数量：0。

http://localhost:5173/settings/about?verify-capability-boundary-history=1
- About 页包含 1.0.5-dev。
- About 页包含“只认 collection_results / diagnostics 状态”。
- About 页包含“Profile 能力矩阵”。
- 无横向溢出。
- 新增 console error 数量：0。
```

结果：能力条不再把 Agent 声明能力、旧字段、容器列表、GPU 列表或 SMART 记录反推成“已采集 / 可用”；旧 Agent 或缺少采集结果字段时显示未知 / 升级提示。  
后续：仍需在真实 Windows Agent、Linux / NAS 容器 Agent 和 Hub 同机 Agent 上做多 profile 运行态验收。

### 2026-06-16 Agent 能力 stale 过期状态

日期：2026-06-16  
验收项：Agent 能力状态根据真实采集时间显示过期  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`  
执行人：Codex  
证据：

```text
代码：
- internal/hub/systems/system.go
- internal/hub/systems/system_capabilities_test.go

规则：
- 普通心跳能力状态根据真实 checked_at 判断，超过 5 分钟未刷新时写入 stale。
- S.M.A.R.T. 能力状态按 Agent 上报的 SMART_INTERVAL / 默认 1 小时，加 2 倍周期和 5 分钟宽限后再判定 stale。
- 缺少 checked_at、时间格式无效、unknown 或 unsupported 状态不强行标记为 stale，避免把无证据状态伪装成过期结果。

命令：
go test -tags=testing -count=1 -timeout=180s ./internal/hub/systems -run "Test(SanitizeSystemInfo|MarkStaleCapabilityStatuses|ShouldFetchSmart|RecordSmartFetchResult)"
go test -tags=testing -count=1 -timeout=180s ./agent ./internal/hub/systems -run "Test(BuildCapabilities|UpdateCapability|SanitizeSystemInfo|Smart|SMART|Capability|Profile|Backoff|Collection|MarkStale)"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
结果：通过

浏览器：
http://localhost:5173/settings/about?verify-capability-stale-history=1
- 页面包含 1.0.5-dev。
- 页面包含“Hub 保存 Agent 能力状态”。
- 页面包含 checked_at 和“普通心跳能力超过 5 分钟”。
- 无横向溢出。
- 新增 console error 数量：0。

http://localhost:5173/system/75kygz8ntiwewqy?verify-capability-stale-source=1
- 页面包含“设备能力”。
- 页面包含 Agent Profile 标签。
- 能力状态显示已采集 / 未发现 / 未知 / 失败 / 过期 / 离线中的真实状态之一。
- 不显示 WebSocket。
- 无横向溢出。
- 新增 console error 数量：0。
```

结果：Hub 在保存机器信息前会把过期的 `collection_results` / `diagnostics` 写成 `stale`，前端能力条和 Agent 采集诊断面板读取同一个后端状态，不再由 UI 猜测过期。  
后续：正式发布前仍需用真实机器制造或等待一次过期状态，补充页面截图 / 浏览器验收记录。

### 2026-06-16 操作审计页面与 About 记录验证

日期：2026-06-16  
验收项：操作审计直接 collection API 覆盖、只读规则收紧、About 更新记录、设置页操作审计入口  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`，本地浏览器 `http://localhost:5173`  
执行人：Codex  
证据：

```text
命令：
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(UserWritableCollectionRequestsWriteOperationAudit|CollectionRulesDefault|CollectionRulesShareAllSystems|ApiCollectionsAuthRules)"
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(OperationAudit|Backup|AgentToken|CollectionRecord|UserWritableCollection|ApiCollectionsAuthRules|CollectionRules|WebsiteMonitor|User|Pairing|Readonly|Protected)"
go test -tags=testing -count=1 -timeout=180s ./internal/common ./internal/hub ./internal/alerts -run "Test(OperationAudit|Backup|AgentToken|CollectionRecord|UserWritableCollection|ApiCollectionsAuthRules|CollectionRules|WebsiteMonitor|User|Pairing|Readonly|Protected|Notification|Alert|Redact)"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
结果：通过

浏览器：
http://localhost:5173/settings/about?verify-operation-audit-collection=1
- 页面包含 1.0.5-dev。
- 页面包含“操作审计继续覆盖绕过 UI 的直接 collection API”。
- 页面包含“接入会话”“脚本模板”“通知目标只记录 scheme://host”和“只读角色写权限矩阵继续收紧”。
- 无横向溢出。
- 新增 console error 数量：0。

http://localhost:5173/settings/operation-audit?verify-operation-audit-collection=1
- 页面包含“操作审计”和“用户、备份、Token 和管理动作”。
- 当前页审计记录按页展示，动作列显示中文，例如“更新 Agent”“重启容器堆栈”“更新容器镜像”。
- 当前可见记录未出现 alert_policy_update、agent_pairing_code_delete、script_template_create 等裸 action 名。
- 打开第一条详情后可见“操作审计详情”“复制详情”“目标”“结果”等字段。
- 无横向溢出。
- 新增 console error 数量：0。
```

结果：绕过 UI 的直接 collection API 写入审计、只读角色拦截、About 更新记录和设置页操作审计入口完成闭环验证。  
后续：仍需在真实操作流里逐项补齐容器、Compose、服务、Agent 更新、网站检测和通知测试的状态证据。

### 2026-06-17 操作记录 / 审计闭环验收

日期：2026-06-17  
验收项：操作记录状态、审计关联、日志 / 告警反查、备份下载审计、URL 筛选入口  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(OperationAuditLinksActionAndCanBeQueriedByOperation|OperationPreflightAuditDoesNotClaimOperationRecord|OperationListsIncludeActorIdentity|GlobalOperationAuditIsScopedToActorAndAdmin|WebsiteMonitorCheckWritesOperationAudit|BackupActionsWriteOperationAudit|CollectionRecordUpdateWritesOperationAudit|UserWritableCollectionRequestsWriteOperationAudit|AgentTokenRotateAuditDoesNotExposeSecrets|FingerprintCollectionDirectWriteIsBlocked|OperationAuditPagedList|OperationsAPI|Protected|DeleteSystemRejectsLocalSystem|CollectionDeleteRejectsLocalSystem)"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
```

浏览器：

```text
About 页：
- URL: http://localhost:5173/settings/about?verify-task10-audit-links=1
- 页面包含 1.0.5-dev。
- 页面包含“操作审计反查链路继续补齐”。
- 页面包含 `download_backup` / 备份下载审计修正记录。
- 页面无横向溢出。

设置页操作审计筛选：
- URL: http://localhost:5173/settings/audit?verify-task10-audit-page=1&search=backup&action=download_backup&result=success
- 页面显示“操作审计”。
- URL 初始筛选带入搜索 `backup`、动作“下载备份”、结果“成功”。
- 当前环境没有匹配记录时显示“暂无操作审计记录”，没有白屏或结构错误。
- 页面无横向溢出。

操作审计详情：
- URL: http://localhost:5173/settings/audit?verify-task10-audit-detail=1
- 当前页按后端分页展示 25 条审计记录。
- 打开“删除机器 / 压测机器 100”审计详情后可见“操作审计详情”“复制详情”“关联入口”“关键字段”。
- 详情字段包含发起人、目标、结果、请求 IP。
- 关联入口包含“机器操作记录”和“搜索系统日志”。
- 当前打开的是机器删除审计，不属于告警动作，因此不显示告警历史入口；告警动作入口由告警 action 规则和后端 / 前端测试覆盖。
- 页面无横向溢出。

系统日志 URL 筛选：
- URL: http://localhost:5173/settings/logs?verify-task10-log-search=1&search=delete_system
- 页面显示“系统日志”，搜索框保留 `delete_system`。
- 当前环境没有匹配日志时显示“暂无日志”，没有白屏。
- 页面无横向溢出。

告警 URL 筛选：
- URL: http://localhost:5173/alerts?verify-task10-alert-search=1&search=alert&state=current&source=machine
- 页面显示“告警”和“历史记录 / 当前未恢复”区域。
- 搜索框保留 `alert`。
- 页面无横向溢出。
```

结果：第 10 节操作记录 / 审计闭环通过本地验收。容器、Compose、Windows 服务、Agent 更新等会产生 `operation_actions` 的操作具备状态、阶段、耗时、超时、失败码和审计关联；网站检测、通知测试、告警、备份、用户、接入、Token、Agent release、SMART 和主要 collection 写入等 Hub 本地动作写入 `operation_audit` 并可在系统详情或设置页查看。无真实百分比时只显示阶段式进度，不显示假百分比；移动端危险操作沿用底部 Sheet 强确认。  
后续：正式发布前仍可用真实维护窗口补一条 Windows 服务或容器真实成功操作截图；当前第 10 节不再阻塞本地上线验收。

### 2026-06-17 设置 / 日志 / 用户 / Token / 备份 / Agent 管理验收

日期：2026-06-17  
验收项：设置入口分组、系统日志、操作审计分离、备份敏感提示、用户角色说明、Agent 版本状态、Token 脱敏、高级风险提示、About 分端记录  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```text
设置入口：
- URL: http://localhost:5173/settings?verify-task11-current-settings=1
- 页面显示常规、告警与通知、Agent 与接入、用户与权限、数据与记录、系统维护。
- 设置搜索存在。
- 系统日志和操作审计是独立入口，操作记录不混在 Hub 技术日志里。
- 页面无旧品牌文本、无横向溢出、未发现长 Token 直接展示。

系统日志：
- URL: http://localhost:5173/settings/logs?verify-task11-current-logs=1
- 日志列表列出事件、重点和详情。
- 点击最新日志的“查看”后打开日志详情。
- 详情包含日志详情、复制、重点信息、原始消息、可读字段和原始数据。
- 页面无旧品牌文本、无横向溢出、未发现长 Token 直接展示。

备份管理：
- URL: http://localhost:5173/settings/backups?verify-task11-current-backups=1
- 页面提示备份包含用户、Agent Token、配对凭据、通知配置、网站监控地址和操作审计。
- 还原和删除强确认已在本轮浏览器验收中过一遍；临时备份 `pulse_backup_20260617_062325.zip` 已删除，列表回到暂无备份。
- 页面无旧品牌文本、无横向溢出、未发现长 Token 直接展示。

用户管理：
- URL: http://localhost:5173/settings/users?verify-task11-current-users=1
- 页面显示管理员、普通用户、只读用户三类角色说明。
- 行菜单保留编辑、重置密码、删除等管理动作入口。
- 页面无旧品牌文本、无横向溢出。

Agent 管理：
- URL: http://localhost:5173/settings/agent?verify-task11-current-agent=1
- 页面显示 Agent 管理、有更新 / 已最新 / 阻塞 / 跳过统计。
- 更新行显示实际版本、目标版本和版本仓库。
- 页面无旧品牌文本、无横向溢出、未发现长 Token 直接展示。

Agent 接入 Token：
- URL: http://localhost:5173/settings/tokens?verify-task11-current-tokens=1
- 页面显示 Agent 接入 Token。
- Token 以 `ecfd49...2bf8`、`bd6771...5fd5`、`a49cde...1e82` 这类摘要展示。
- 页面未发现 48 位以上完整 Token 泄露，无横向溢出。

高级设置：
- URL: http://localhost:5173/settings/advanced?verify-task11-current-advanced=1
- 页面显示危险维护入口，并说明上线环境只建议在备份完成、明确影响范围时使用。
- 高级页保留 Agent 接入 Token 管理入口。
- 页面无旧品牌文本、无横向溢出、未发现长 Token 直接展示。

About：
- URL: http://localhost:5173/settings/about?verify-task11-current-about=1
- 页面显示 Pulse、1.0.5-dev、Web / Hub、移动端 / Android、Agent、部署 / 发布、版本规则。
- 页面未发现 `Beszel|beszel|BESZEL`。
- 页面无横向溢出、未发现长 Token 直接展示。
```

结果：第 11 节设置 / 日志 / 用户 / Token / 备份 / Agent 管理通过本地浏览器验收。设置入口已按运维任务分组，技术日志、操作审计和告警历史边界清楚；备份、Token、高级维护入口都有风险提示和默认脱敏；Agent 管理能看到目标版本和实际版本关系；About 页继续保持 Pulse 品牌和分端更新记录。  
后续：正式发布前如要把“备份还原成功”也作为运行态证据，需要在可清库环境里做一次真实还原演练；当前第 11 节不再阻塞本地上线验收。

### 2026-06-17 移动端 / 平板浏览器多视口验收

日期：2026-06-17  
验收项：手机底部导航、更多入口、移动首页、机器详情单模块、网站 / 容器移动列表、平板竖屏布局  
状态：部分通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`，浏览器视口 `375x812`、`390x844`、`430x932`、`768x1024`  
执行人：Codex  
证据：

```text
视口矩阵：
- 375x812
- 390x844
- 430x932
- 768x1024

页面矩阵：
- 首页：/
- 机器列表：/clients
- 机器详情：/system/75kygz8ntiwewqy
- 告警：/alerts
- 网站：/websites
- 容器：/containers
- 设置：/settings
- 关于：/settings/about

统一结果：
- 所有页面 `scrollWidth <= clientWidth`，未出现页面级横向溢出。
- 所有页面正文非空，没有黑屏 / 白屏。
- 四组视口均显示底部导航：`首页 / 机器 / 告警 / 网站 / 容器`。
- `/settings` 在手机 / 平板下显示“更多”，承载设置、日志、版本和管理入口。
- `/settings/about` 从设置入口承载关于页，并继续显示 Pulse、Web 版本、Hub 版本、Agent 目标版本、Agent 实际版本、Android App 版本和 Hub 地址。
- 首页显示“今日状态”、在线机器、告警、网站、服务概览和近期机器，不是桌面大屏表格压缩版。
- 机器详情显示“功能模块 / 一次只看一类内容”，模块入口为概览、内存、磁盘、网络、容器、GPU、服务、网站、记录。
- 网站页在四组视口下显示状态标签、监控列表和分页信息，没有可见宽表格。
- 容器页在四组视口下显示当前机器摘要、编排卡片和独立容器卡片，没有可见宽表格。
```

结果：第 12 节的浏览器多视口布局项通过，包括底部导航、更多入口、移动首页、机器详情单模块、网站和容器非宽表格、平板竖屏无横向溢出。  
后续：Android Hub 地址错误提示、Android 登录态重启保持、离线只读快照显示时间和禁用操作、MuMu 模拟器核心流程已在 2026-06-17 第 12 节运行态证据中补齐。

### 2026-06-16 MFA 登录 API 回归验证

日期：2026-06-16  
验收项：MFA 开启 / 关闭的 Hub 登录 API 路径  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run TestPasswordLoginMFAPaths
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "TestPasswordLoginMFAPaths|TestPasswordLoginRateLimit|TestMFAOtp|TestInfoReadinessChecksDangerousConfig"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

浏览器：

```text
http://localhost:5173/settings/about?verify-mfa-api-regression=1
- 页面包含 1.0.5-dev。
- 页面包含“补齐 MFA 登录 API 回归测试”。
- 页面包含 MFA 关闭路径说明；端到端补证见 2026-06-18 MFA 真实浏览器 / 邮件 OTP 验收记录。
- scrollWidth = clientWidth = 1265，无横向溢出。
- 新增 console error 数量：0。
```

结果：命令通过，About 记录可见。测试覆盖 MFA 关闭时密码登录直接返回 token；MFA 开启时密码登录返回 `401` 和 `mfaId`，不返回 token；错误 OTP 返回 `400` 且不发 token；正确 OTP 携带 `mfaId` 后完成登录并清理 MFA 会话。  
后续：这只是 API 级回归证据；真实浏览器收验证码登录、真实邮件 / OTP 环境、用户实际输入验证码的端到端流程已在 2026-06-18 的 MFA 真实浏览器 / 邮件 OTP 验收中补齐。

### 2026-06-18 MFA 真实浏览器 / 邮件 OTP 端到端验收

日期：2026-06-18  
验收项：MFA 开启 / 关闭真实浏览器登录、真实 SMTP 邮件 OTP、用户输入验证码后完成登录  
状态：通过  
环境：Windows 本地隔离验收环境，`C:\Users\Nacht\Documents\123`，临时 Hub 不影响主开发 `8090/5173`  
执行人：Codex  
证据：

```powershell
go build -o .codex-artifacts\pulse-hub-mfa-e2e.exe .\internal\cmd\hub
```

隔离环境：

```text
数据目录：.codex-artifacts\mfa-e2e-data-20260618-044244
测试账号：mfa-e2e@example.test
SMTP 捕获：127.0.0.1:2525
MFA 关闭 Hub：http://127.0.0.1:18091/?verify-mfa-disabled=1
MFA 开启 Hub：http://127.0.0.1:18092/?verify-mfa-enabled=1
```

MFA 关闭浏览器结果：

```text
输入 mfa-e2e@example.test / Password123! 后进入首页。
title = 监控大屏 / Pulse
hasOtp = false
hasLogin = false
scrollWidth = clientWidth = 2453
console warn / error = []
```

MFA 开启浏览器结果：

```text
输入 mfa-e2e@example.test / Password123! 后页面停留在登录页二次验证步骤。
页面可见文本包含：二次验证、请输入发送到账号邮箱的 6 位验证码、验证并登录、重新发送、返回登录。
SMTP 捕获邮件数量：1
邮件主题：OTP for Pulse
邮件收件人：mfa-e2e@example.test
邮件正文包含真实 6 位 OTP。
输入邮件 OTP 后进入首页。
title = 监控大屏 / Pulse
hasOtp = false
hasLoginButton = false
scrollWidth = clientWidth = 2453
console warn / error = []
```

结果：第 1 节 `MFA 开启时完整登录成功`、`MFA 关闭时不出现 MFA 干扰` 和第 16 节 `MFA 登录流程完整` 可以勾选通过。该验收没有使用数据库后门或测试代码改验证码，验证码来自本地 SMTP 捕获的真实邮件内容。  
后续：正式发布前只需随整体回归重新跑前端质量闸门；MFA 端到端路径已具备可复查证据。

### 2026-06-16 机器接入配对规则回归验证

日期：2026-06-16  
验收项：添加机器不预创建记录、配对码边界、待确认机器不进入客户端摘要  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "TestApiRoutesAuthentication|TestSystemsSummaryAPI|TestPairingCodeCreationDoesNotCreateSystem"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

浏览器：

```text
http://localhost:5173/settings/about?verify-pairing-api-regression=1
- 页面包含 1.0.5-dev。
- 页面包含“补齐机器接入回归测试”。
- 页面包含“生成配对码不会提前创建系统记录”。
- 页面包含“待确认机器不会进入客户端摘要列表”。
- scrollWidth = clientWidth = 1265，无横向溢出。
- 新增 console error 数量：0。
```

结果：命令通过，About 记录可见。`TestPairingCodeCreationDoesNotCreateSystem` 验证创建配对会话不会新增 `systems` 记录；`TestSystemsSummaryAPI` 验证同用户未确认配对机器不会出现在 `/api/pulse/systems/summary`；`TestApiRoutesAuthentication` 覆盖非目标 IP、过期配对码、已使用配对码和指纹冲突都会在创建机器前失败。  
后续：真实 Windows / Linux / NAS 目标机执行完整安装命令仍需单独验收。

### 2026-06-16 真实 Agent 配对 / 上线 / 身份确认验收

日期：2026-06-16  
验收项：真实 Agent 一次性配对、上线等待、身份确认、客户端列表准入、普通配对 Agent 不误拿 Hub 标签  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`，Hub `http://192.168.1.10:8090`，Vite `http://localhost:5173`  
执行人：Codex  
证据：

```powershell
.\build\releases\agent\1.0.5\pulse-agent_windows_amd64.exe --version
# pulse-agent 1.0.5

.\build\releases\agent\1.0.5\pulse-agent_windows_amd64.exe pair --url http://192.168.1.10:8090 --code <一次性配对码>
# pairing completed

go test -tags=testing -count=1 -timeout=180s ./internal/hub ./internal/hub/systems -run "Test(RepairLocalSystemMarkers|UpdateLocalSystemMarkerFromInfo|FindOrCreateLocalSystem|ApiRoutesAuthentication|SystemsSummaryAPI|PairingCodeCreationDoesNotCreateSystem)"
```

运行态证据：

```text
public-info:
{"v":"1.0.5","agent_hub_url":"http://192.168.1.10:8090","environment":"development"}

临时 Agent：
- 使用临时数据目录，手动写入唯一 fingerprint，避免和真实本机 Agent 指纹冲突。
- Agent 启动后日志包含 WebSocket connected host=192.168.1.10:8090。

页面验收：
- 未执行安装命令时，客户端列表保持 2 / 2，检测安装提示还未检测到 Agent。
- agent pair 成功但 Agent 未启动时，客户端列表保持 2 / 2，弹窗显示等待上线，无确认添加按钮。
- Agent 上线后再次检测，客户端列表仍保持 2 / 2，弹窗显示主机名、显示名、目标 IP、连接 IP、Agent 上报 IP、fingerprint 摘要和 Agent Profile，并出现确认添加按钮。
- 点击确认添加后，临时机器进入客户端列表，变为 3 / 3。
- 临时机器显示用户填写的“配对验收临时Agent-LAN”、目标 IP 192.168.1.10，不显示 Hub 标签。
- 验收后停止临时 Agent，并通过 API 删除临时机器；刷新客户端页恢复 2 / 2。
```

结果：真实 Agent 从配对、等待上线、身份确认到进入资产列表的准入链路通过；未确认机器不会进入客户端列表；普通临时配对 Agent 不会因开发环境 loopback / LAN 调试被误标为 Hub。  
后续：仍需把完整 Windows PowerShell、Linux / NAS Docker Compose 和 docker run 安装命令拿到真实目标机器执行，补充目标机安装级证据。

### 2026-06-16 客户端页 Hub 身份显示验收

日期：2026-06-16  
验收项：Hub 机器不再显示“本机”，客户端页无 Hub 标签误标现象  
状态：通过  
环境：本地浏览器，`http://localhost:5173/clients?verify-hub-identity-current=1`  
执行人：Codex  
证据：

```text
页面标题：所有客户端 / Pulse
客户端数量：2 / 2 台机器
页面包含 Hub 相关标签。
页面不包含“本机”文本。
scrollWidth = clientWidth = 2453，无横向溢出。
刷新后新增 console error 数量：0。
```

结果：当前开发环境客户端页不再把 Hub 机器显示成“本机”，普通临时配对 Agent 验收后已删除，未留下 Hub 标签污染。  
后续：正式 FlyNAS 部署时仍需验证 Hub 同机 Agent 自动加入和运行态上线。

### 2026-06-16 Hub 机器身份保护和菜单强确认验收

日期：2026-06-16  
验收项：Hub 机器删除保护、身份字段防篡改、唯一 Hub 标签、暂停 / 首页隐藏强确认、隐藏后仍可在客户端和详情页访问  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`，本地浏览器 `http://localhost:5173`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub ./internal/hub/systems -run "Test(DeleteSystemRejectsLocalSystem|CollectionDeleteRejectsLocalSystem|CollectionUpdateAllowsHomeVisibilityForLocalSystem|FindOrCreateLocalSystem|RepairLocalSystemMarkers|UpdateLocalSystemMarkerFromInfo|InfoReadinessChecksDangerousConfig)"
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(CollectionUpdateRejectsProtectedSystemIdentityFields|DeleteSystemRejectsLocalSystem|CollectionDeleteRejectsLocalSystem|CollectionUpdateAllowsHomeVisibilityForLocalSystem)"
```

浏览器：

```text
http://localhost:5173/clients?verify-task3-menu=1
- 页面显示 2 / 2 台机器。
- `UM-690` 行显示 `Hub` 标签，不显示“本机”。
- 精确可见 `Hub` 标签数量为 1。
- Hub 机器菜单不显示删除入口。
- 点击暂停只打开“确认暂停 Hub 机器监控？”二次确认；未执行确认。
- 点击首页隐藏只打开“确认从首页隐藏 Hub 机器？”二次确认。
- 页面无横向溢出，新增 console error 数量为 0。

http://localhost:5173/system/75kygz8ntiwewqy?verify-task3-identity=1
- 展开身份详情后可见显示名称、真实主机名、目标 IP、连接 IP、Agent 上报 IP、指纹摘要、Agent Profile、首次发现和最近记录。
- 页面不显示“本机”。
- 页面无横向溢出，新增 console error 数量为 0。

首页隐藏可逆流：
- 临时确认首页隐藏后，客户端列表仍显示 `UM-690` 和 `2 / 2 台机器`。
- 隐藏后详情页 `/system/75kygz8ntiwewqy` 仍可打开并显示 Hub / 身份信息。
- 验收后已通过菜单恢复为首页显示；最终菜单显示“首页隐藏”动作。
- 过程中新增 console error 数量为 0。
```

结果：Hub 机器身份保护不只依赖 UI；后端拒绝删除和身份字段篡改，前端隐藏删除入口，并对暂停 / 首页隐藏给出强确认。首页隐藏只影响首页展示，不影响客户端列表和机器详情访问。  
后续：正式 FlyNAS / Linux 同机 Compose 部署时仍需补充 Hub 同机 Agent 自动加入的运行态证据。

### 2026-06-16 大数据摘要和日志分页回归验证

日期：2026-06-16  
验收项：100 台机器摘要接口、1000 条 Hub 日志分页接口  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "TestSystemsSummaryHandlesLargeInventory|TestSystemLogsPagedListHandles1000Rows"
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
```

浏览器：

```text
http://localhost:5173/settings/about?verify-large-data-regression=1
- 页面包含 1.0.5-dev。
- 页面包含“补齐性能回归测试”。
- 页面包含“100 台已确认机器”和“1000 条 Hub 日志”。
- scrollWidth = clientWidth = 1265，无横向溢出。
- 新增 console error 数量：0。
```

结果：命令通过，About 记录可见。`TestSystemsSummaryHandlesLargeInventory` 创建 100 台已确认机器，验证 `/api/pulse/systems/summary` 返回 100 条轻量摘要，同时剔除大字段和 `diagnostics`，响应体保持受控；`TestSystemLogsPagedListHandles1000Rows` 创建 1000 条 Hub 日志，验证第一页只返回 50 条和 `hasMore=true`，第 20 页返回最后 50 条和 `hasMore=false`，不会把 1000 条日志一次性发给前端。  
后续：首页首屏性能和 Android 冷启动仍需单独验收。

### 2026-06-17 首页 / 客户端列表浏览器验收

日期：2026-06-17  
验收项：首页运维总览、客户端搜索 / 筛选 / 排序、100 台机器列表渲染、手机端分批加载  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```text
数据准备：
- 当前开发库已有 100 台 `压测机器` 临时记录和 2 台真实机器，共 102 台。
- 验收完成后通过 authenticated collection API 删除 100 台临时记录。
- 删除结果：before=102，deleted=100，failed=0，after=2，remainingStress=0。

桌面首页：
http://localhost:5173/?verify-task4-final-home=1
- 页面标题：监控大屏 / Pulse。
- 首页显示客户端、容器、网站监控、当前告警、客户端状态和快捷入口。
- 客户端摘要显示 2/102，详情显示 100 台需关注。
- 首页只渲染 6 个 /system 链接，不复制完整客户端列表。
- scrollWidth = clientWidth = 1350，无横向溢出。

桌面客户端：
http://localhost:5173/clients?verify-task4-final-desktop=1
- 页面标题：所有客户端 / Pulse。
- 页面显示 102 / 102 台机器、筛选和添加系统。
- 默认只渲染首批机器，显示加载更多 60/102。
- 机器卡片显示目标 IP、离线 / 暂停状态、未采集 / 离线指标，不显示假 0%。
- scrollWidth = clientWidth = 1350，无横向溢出。

桌面搜索：
http://localhost:5173/clients?verify-task4-search=1
- 搜索 UM-690 后显示 1 / 2 台机器。
- 页面包含 UM-690，不包含 nacht。
- scrollWidth = clientWidth = 2453，无横向溢出。

手机端 375x812：
http://localhost:5173/clients?verify-task4-final-mobile=1
- 页面显示机器、2/102 在线、状态筛选、类型筛选、用途筛选和机器列表 102 台。
- 默认显示需关注优先、名称、最近更新、状态排序入口。
- 默认只渲染 50 个 /system 链接，显示加载更多 50/102。
- 点击名称排序后，列表从压测机器 001 开始。
- 点击加载更多后渲染 100 个 /system 链接，显示加载更多 100/102。
- scrollWidth = clientWidth = 360，无横向溢出。

浏览器事件：
- 使用 CDP 事件游标从本轮导航开始采集。
- 本轮事件只有 React DevTools 提示和 Vite connected / connecting 开发提示。
- 未出现 console warn / error 或 Network.loadingFailed。
```

结果：首页不再是完整客户端列表复制；客户端页能搜索、筛选、排序并按桌面 60 台 / 手机 50 台分批渲染；在线、离线、暂停、未采集和 IP 来源口径可见；100 台临时压测数据验收后已删除，开发库恢复 2 台真实机器。  
后续：首页首屏加载快仍需正式发布前结合真实网络和冷启动计时单独记录；Android 冷启动继续留在移动端 / Android 验收项。

### 2026-06-17 机器详情 / 硬件真实性浏览器验收

日期：2026-06-17  
验收项：机器详情首屏身份确认、硬件摘要真实展示、身份详情展开、网络详情点击、未发现模块不跳黑屏  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```text
页面 URL：
http://localhost:5173/system/75kygz8ntiwewqy?verify-task5-hardware-truth=1

首屏可见：
- UM-690
- 物理机
- Hub
- 开发调试
- Windows 11 Pro for Workstations
- AMD Ryzen 9 6900HX
- 2 条 / 32 GB / DDR5 / 4800 MT/s
- Intel(R) Ethernet Controller (3) I225-V
- AMD Radeon 680M
- CPU / 内存 / 磁盘 / 网络 / GPU / 容器摘要卡

身份详情展开后可见：
- 显示名称：UM-690
- 真实主机名：UM-690
- 目标 IP：未采集
- 连接 IP：127.0.0.1
- Agent 上报 IP：未采集
- 指纹摘要：未采集
- Agent Profile：windows-host

硬件摘要和能力状态：
- 内存卡显示 DDR5。
- 网络卡显示 2.50 Gbps 和“负载 N%”。
- GPU 卡显示核显。
- 设备能力里 S.M.A.R.T. / GPU 在缺少新版采集结果确认时显示未知，没有标成可用。
- 页面无“本机”文案。
- 页面无 WebSocket 文案。

网络卡点击后可见：
- Intel(R) Ethernet Controller (3) I225-V
- 链路速率 2.50 Gbps
- MAC
- 带宽
- 保持在同一机器详情页。

容器“未发现”卡点击后：
- 仍停留在同一机器详情页。
- 显示未采集到容器运行时。
- 显示暂无数据。
- 没有黑屏跳转。

页面检查：
- scrollWidth = clientWidth。
- 刷新后新增 console error 数量：0。

只读数据库核对：
- `systems.info.cap.agent_version = 1.0.4`。
- `system_details.network_interfaces` 当前只有 name / display_name / MAC / link_speed / status。
- `system_details.network_interfaces` 当前没有 IPv4 / IPv6 / 网关 / DNS / DHCP。
- `smart_devices` 当前有 1 条记录，`type = nvme`，`media_type = ""`。
- 前端没有根据旧 `type=nvme` 猜测磁盘介质标签。

补充回归测试：
- `agent/network_details_windows_shared_test.go` 新增 `TestMakeNetworkInterfaceDetailsPreservesAddressMetadata`，覆盖 IPv4、IPv6、默认网关、DNS、DHCP / 静态、MAC 和链路速率字段会原样写入 `network_interfaces`。
- `go test -tags=testing -count=1 -timeout=180s ./agent -run "Test(MakeNetworkInterfaceDetailsPreservesAddressMetadata|NormalizeWindowsIPMethod|NormalizeStringList|FindWindowsAdapterForInterface|ParseLinuxLspciDeviceName)"` 通过。
- `npm.cmd --prefix internal/site run check -- --max-diagnostics=200` 和 `npm.cmd --prefix internal/site run build` 通过。
```

结果：机器详情首屏能确认机器身份，身份详情可展开核对显示名、真实 hostname、连接 IP 和 Agent Profile；当前运行态主要摘要卡不会把缺失采集结果伪装成可用，未发现模块点击不会跳转到空页面。  
后续：当前在线 Agent 实际版本仍为 `1.0.4`，网络 IPv4 / IPv6 / 网关 / DNS / DHCP 来源字段、虚拟机 SMART 运行态和新版 Agent 字段完整上报仍需后续用目标机器补验。

### 2026-06-17 虚拟机 S.M.A.R.T. 真实性浏览器验收

日期：2026-06-17  
验收项：虚拟机不默认显示 S.M.A.R.T. 可用  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```text
页面 URL：
http://localhost:5173/system/nm04thq6ov5v4by?verify-task5-vm-smart=1

页面可见：
- nacht
- 虚拟机
- KVM/QEMU
- Linux 容器版
- S.M.A.R.T.
- 未知

能力块：
设备能力
Linux 容器版
基础指标：未知
容器：未知
S.M.A.R.T.：未知
GPU：未知
虚拟化信息：KVM/QEMU

页面检查：
- 没有出现 S.M.A.R.T. 可用 / S.M.A.R.T. 已采集。
- scrollWidth = clientWidth。
- 页面不是空白页。
- 刷新后新增 console error 数量：0。
```

结果：虚拟机页面不会因为 Agent 声明或旧字段而把 S.M.A.R.T. 默认显示为可用；没有真实采集结果时保持未知。  
后续：如果后续某台虚拟机透传了真实 SMART 设备，需要再补一条“透传设备可采集”的正向证据。

### 2026-06-17 摘要卡与移动端布局验收

日期：2026-06-17  
验收项：桌面摘要卡高度统一、手机和平板视口无页面级横向溢出、移动端机器详情不黑屏  
状态：通过  
环境：Windows 本地开发环境，Vite `http://localhost:5173`  
执行人：Codex  
证据：

```text
桌面端：
- /system/75kygz8ntiwewqy?verify-task5-card-heights=1
- 资源摘要卡同组按钮高度均为 64px
- 页面无横向溢出

手机端 375x812：
- /system/75kygz8ntiwewqy?verify-task5-mobile-layout-phone=1
- 显示 UM-690、移动端标题、CPU / 内存 / 磁盘 / 网络摘要和模块入口
- 页面级 scrollWidth = clientWidth
- 页面不黑屏

平板端 768x1024：
- /system/75kygz8ntiwewqy?verify-task5-mobile-layout-tablet=1
- 显示 UM-690、移动端标题、CPU / 内存 / 磁盘 / 网络摘要和模块入口
- 页面级 scrollWidth = clientWidth
- 页面不黑屏

说明：
- 手机端“容器 / GPU / 服务 / 网站 / 记录”按钮出现在横向模块条视口外是预期滚动内容，不是页面撑屏。
```

结果：桌面摘要卡高度一致，手机和平板的机器详情首屏没有页面级横向溢出，也没有黑屏。  
后续：如果后续继续收紧手机端模块条，只能调滚动条和入口密度，不能把横向模块入口硬塞进首屏导致重叠。

### 2026-06-16 添加机器安装命令复制验收

日期：2026-06-16  
验收项：添加机器向导里的 Windows、Linux Compose、Linux docker run 安装命令完整复制  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`，Hub `1.0.5`，Vite `http://localhost:5173`  
执行人：Codex  
证据：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-dev.ps1 -Restart
(Invoke-WebRequest -Uri 'http://localhost:8090/api/pulse/public-info' -UseBasicParsing -TimeoutSec 10).Content
```

`public-info` 返回：

```json
{"v":"1.0.5","agent_hub_url":"http://192.168.1.10:8090","environment":"development"}
```

本地启动脚本地址选择规则验证：

```text
supplemental\scripts\run-hub-dev.ps1   Default=http://192.168.1.10:8090, Reject198=false, RejectLinkLocal=false, RejectLoopback=false
supplemental\scripts\run-hub-local.ps1 Default=http://192.168.1.10:8090, Reject198=false, RejectLinkLocal=false, RejectLoopback=false
```

浏览器：

```text
http://localhost:5173/clients?verify-install-copy-flow=3
- 添加系统弹窗生成配对码。
- NAS 勾选后主要用途仍保持“生产服务”。
- 加入告警默认未勾选。
- Windows 复制命令为 irm http://192.168.1.10:8090/api/pulse/agent-install/windows.ps1?code=... | iex。
- Windows 服务端脚本包含 AgentVersion=1.0.5、配对码、HubUrl=http://192.168.1.10:8090、1.0.5 下载地址和 agent pair --url $HubUrl --code $PairingCode。
- Linux Compose 复制内容包含 pulse-agent:1.0.5、Hub URL、配对码和 /agent pair --url ... --code ...。
- Linux docker run 复制内容包含 pulse-agent:1.0.5、Hub URL、配对码和 /agent pair --url ... --code ...。
- 添加系统弹窗 scrollWidth = clientWidth = 1265，无横向溢出。
- 服务重启后的稳定等待期间新增 console error 数量：0。
```

结果：安装命令复制链路通过。复制逻辑不再因为开发数据库保留 `1.0.4` Agent release 记录而生成旧版本命令；本地源码预览和 Docker 预览脚本默认 Hub 地址会避开 `198.18/198.19`、`169.254`、loopback 和组播等不适合给目标机器访问的地址。  
后续：仍需把 Windows / Linux / NAS 命令拿到真实目标机器执行，完成 Agent 配对、上线、身份确认和客户端列表显示的端到端验收。

### 2026-06-17 Windows Agent 网卡详情真实上报验收

日期：2026-06-17  
验收项：机器详情网络链路速率、IPv4、IPv6、网关、DNS、DHCP / 静态来自真实 Agent 采集  
状态：通过  
环境：Windows 本地开发环境，`C:\Users\Nacht\Documents\123`，本机服务 `pulse-agent`，Vite `http://localhost:5173`，Hub `http://127.0.0.1:8090`  
执行人：Codex  
证据：

```powershell
go test -tags=testing -count=1 -timeout=180s ./agent -run "Test(ParseWindowsNetAdapterRowsAcceptsPowerShellScalarAndEmptyGatewayShapes|BuildWindowsNetAdapterCommandFiltersValidNamesAndKeepsGatewayArray|MakeNetworkInterfaceDetailsPreservesAddressMetadata|NormalizeWindowsIPMethod|NormalizeStringList|FindWindowsAdapterForInterface|ParseLinuxLspciDeviceName|RefreshNetworkInterfaceDetails|SkipNetworkInterface|EnsureNetworkInterfacesMap|SelectPrimaryNetworkInterface|DetectPrimaryNetworkInterface)"
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\build-agent-v1.ps1 -Version 1.0.5 -OS windows -Arch amd64
```

根因和修复：

```text
- 复现：Windows PowerShell 的 Gateways 字段会按实际值输出为 {}、"198.18.0.2" 或 ["192.168.1.1","fe80::1"]，旧 Go 结构体只接受 []string，导致整段网卡详情 JSON 解析失败。
- 复现：完整 Get-NetAdapter / Get-NetIPConfiguration 命令多次耗时约 4.9-6.6 秒，旧 5 秒超时会在真实机器上截断采集。
- 修复：新增兼容解析，空对象按空列表、单字符串按单元素列表、数组按原数组；命令改为只查询当前有效网卡，并把网络详情采集超时放宽到 12 秒。
```

运行态：

```text
本机服务替换前：
- C:\ProgramData\pulse-agent\pulse-agent.exe 为 pulse-agent 1.0.4。

本机服务替换后：
- build\releases\agent\1.0.5\pulse-agent_windows_amd64.exe 重新构建并替换到 C:\ProgramData\pulse-agent\pulse-agent.exe。
- 旧 exe 已备份到 C:\ProgramData\pulse-agent\backups\。
- 服务 pulse-agent 状态为 Running，版本为 pulse-agent 1.0.5。

只读查询 pulse_data\data.db：
- systems.info.cap.agent_version = 1.0.5。
- system_details.network_interfaces 包含：
  - name: 以太网
  - display_name: Intel(R) Ethernet Controller (3) I225-V
  - mac: 58:47:ca:70:6a:c2
  - link_speed: 2500000000
  - status: Up
  - ip_method: dhcp
  - ipv4: 192.168.1.10
  - ipv6: 2408:8207:9011:8ee0:5b5f:a14:c82a:828e
  - gateways: 192.168.1.1 / fe80::1
  - dns_servers: fe80::1 / 192.168.1.1
```

浏览器：

```text
http://localhost:5173/system/75kygz8ntiwewqy?verify-task5-agent105-network=1

首屏：
- 网络摘要卡显示 2.50 Gbps 和 DHCP。

点击网络卡后：
- 显示 Intel(R) Ethernet Controller (3) I225-V。
- 显示 IPv4 192.168.1.10。
- 显示 IPv6 2408:8207:9011:8ee0:5b5f:a14:c82a:828e。
- 显示网关 192.168.1.1 / fe80::1。
- 显示 DNS fe80::1 / 192.168.1.1。
- 显示获取方式 DHCP。
- 显示链路速率 2.50 Gbps。
- 显示 MAC 58:47:ca:70:6a:c2。
- scrollWidth = clientWidth，无横向溢出。
- 刷新后新增 console warn / error 数量为 0。
```

结果：第 5 节“网络链路速率、IPv4、IPv6、网关、DNS、DHCP/静态来自真实采集”已通过。机器详情硬件真实性当前第 5 节已完成闭环。  
后续：更多 Windows / Linux / NAS 机器上线后，应继续补充不同 profile 的正向证据；不能因为一台机器通过就放宽“缺字段不猜测”的规则。

## 待补证据

- 真实 Windows PowerShell、Linux / NAS Docker Compose 和 docker run 安装命令在目标机执行后的安装级证据。
- 更多 Windows / Linux / NAS profile 的真实机器详情硬件标签和能力诊断。
- 网站监控外网 IPv6、证书错误、DNS 失败和内容校验失败的真实生产目标运行态截图 / 日志。
- 首页首屏性能和 Android 冷启动。
- Harbor 镜像存在性、FlyNAS 部署、正式备份和回滚演练。
