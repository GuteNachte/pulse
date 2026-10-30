# 项目全景报告（Day 1）

- 生成日期：2026-10-09
- 生成方式：从仓库根目录开始的全量只读勘察（git 跟踪文件为口径，跳过 node_modules / dist / .git / lock 文件 / 二进制）
- 用途：「14 天项目治理计划」第 1 天基线报告，后续 13 天的任务以本报告为输入
- 版本口径：当前开发版本 `1.0.6`（`pulse.go:9`、`Makefile:5-7`、`internal/site/package.json:4` 三处一致），已发布固定版本 `1.0.5`（`readme.md:68`）

---

## 1. 项目身份

**项目名**：Pulse，Go module 名 `gutenacht.site/pulse`（`go.mod:1`）。

**项目类型**：混合型——一个 Go 单仓库里同时包含：Web 后端服务（Hub）、常驻采集客户端（Agent）、React 前端（Web App）、Android 壳应用（Capacitor）、Windows 桌面配置工具（Wails）、Windows 安装器（Inno Setup 脚本）、PowerShell 发布/开发脚本集。不是库，不是纯 CLI，是以「Hub 服务端」为中心的完整产品型仓库。

**项目用途**（依据 `readme.md:3-5`，与代码结构交叉验证一致）：面向**家庭场景**的资产管理与监控平台。核心思路是先把家里所有电子设备（数码硬件、网络设备、智能设备、网站端点）建成可信的「资产主档」，能采集的设备叠加 Agent / SNMP / 网站监控，不能采集的靠手动档案；再叠加告警、通知、操作审计、备份。给谁用：个人/家庭用户（自部署，正式部署在家庭 NAS 的 Docker Compose 上，见 `AGENTS.md` 约定与 `docs/flynas-compose-checklist.md`）。

**两大运行组件**（`readme.md:23-26`）：

| 组件 | 形态 | 职责 |
|---|---|---|
| Hub | 基于 PocketBase 的 Go 服务（含内嵌 Web UI） | 页面、API、告警、审计、设置、备份、Agent 版本与发布管理 |
| Agent | 被监控机器上的常驻进程（Windows/Linux/NAS/容器） | 采集 CPU/内存/磁盘/网络/GPU/温度/电池/SMART/容器/服务/软件，主动 WebSocket 连 Hub |

**架构上的第三个一等公民是「模块系统」**：从 `1.0.6` 起 Pulse 按「基础底座 + 可管理功能模块」演进（`AGENTS.md`、`docs/module-architecture.md`），共 11 个模块（foundation、asset-center、smarthome、client-monitoring、website-monitoring、network-topology、alerts、notifications、agent-management、account-access、maintenance），带依赖关系、默认开关和集合级 API 门禁（详见第 7 节与附录 A 的 `internal/hub/module_gate.go`）。

**规模概况**（`git ls-files` 统计）：Go 非测试文件 295 个 + 测试文件 137 个；前端 ts/tsx 399 个（其中测试 78 个）；`docs/` 下 Markdown 103 个。单包最大的是 `internal/hub`（顶层 133 个 .go 文件、38,658 行，含测试）。

---

## 2. 技术栈清单

所有版本号均从配置文件读取，未做任何猜测。

| 层 | 技术 | 版本 | 出处 |
|---|---|---|---|
| 后端语言 | Go | `go 1.27` | `go.mod:3` |
| 后端框架 | PocketBase | v0.40.4 | `go.mod:16` |
| 数据库 | SQLite（PocketBase 内嵌，modernc.org/sqlite 纯 Go 驱动 v1.57.0） | — | `go.mod:72` |
| 数据库构建器 | pocketbase/dbx | v1.12.0 | `go.mod:15` |
| WebSocket | lxzan/gws | v1.9.1 | `go.mod:13` |
| 序列化 | fxamacker/cbor/v2 | v2.9.2 | `go.mod:9`（Agent 通信用 CBOR） |
| 系统指标采集 | shirou/gopsutil/v4 | v4.26.5 | `go.mod:17` |
| 通知 | nicholas-fedor/shoutrrr | v0.16.1 | `go.mod:14` |
| CLI 框架 | spf13/cobra + pflag | v1.10.2 / v1.0.10 | `go.mod:18-19`（Hub 用 cobra；Agent 入口用 pflag） |
| 版本比较 | blang/semver | v3.5.1+incompatible | `go.mod:7` |
| 校验 | go-ozzo/ozzo-validation/v4 | v4.3.0 | `go.mod:11` |
| 图像处理 | disintegration/imaging + golang.org/x/image | v1.6.2 / v0.46.0 | `go.mod:8,22`（资产图片） |
| Windows 互操作 | Microsoft/go-winio、purego、howett.net/plist | v0.6.2 / v0.10.1 / v1.0.1 | `go.mod:6,9,26` |
| Go 测试 | 标准 testing + stretchr/testify | v1.11.1 | `go.mod:20` |
| 前端语言 | TypeScript | ^6.0.3 | `internal/site/package.json:90` |
| 前端框架 | React | ^19.2.7 | `internal/site/package.json:67-68` |
| 构建工具 | Vite（rolldown 系列） | ^8.1.0 | `internal/site/package.json:91` |
| CSS | Tailwind CSS（@tailwindcss/vite 插件） | ^4.3.1 | `internal/site/package.json:82,88` |
| UI 组件 | Radix UI 全家桶 + lucide-react + shadcn 风格（components.json） | 多个 ^1.x | `internal/site/package.json:42-56` |
| 状态/路由 | nanostores + @nanostores/react + @nanostores/router | ^1.x | `internal/site/package.json:40-41,65` |
| 图表 | recharts | ^3.9.0 | `internal/site/package.json:69` |
| 表格/虚拟化 | @tanstack/react-table / react-virtual | ^8.21.3 / ^3.14.3 | `internal/site/package.json:57-58` |
| 校验（前端） | valibot | ^1.4.2 | `internal/site/package.json:72` |
| i18n | Lingui（core/react/cli/vite-plugin） | ^6.4.0 | `internal/site/package.json:38-39,77-79` |
| 移动端壳 | Capacitor（android/core/cli、local-notifications、preferences、secure-storage） | ^8.4.1 | `internal/site/package.json:34-37,77`；`internal/site/capacitor.config.ts`（appId `site.gutenacht.pulse`） |
| Lint/格式化 | Biome | 2.5.1 | `internal/site/package.json:76` |
| 前端测试 | 无测试框架，`node --experimental-strip-types` 逐文件运行 | — | `internal/site/package.json:21-30` |
| E2E | Playwright | ^1.61.1 | `internal/site/package.json:87`；`internal/site/playwright.config.ts` |
| 桌面配置工具 | Wails（windows/agent-config，独立 go.mod） | 待确认（wails.json 未读出版本号） | `windows/agent-config/wails.json` |
| .NET 辅助 | LibreHardwareMonitor 封装（agent/lhm/pulse_lhm.csproj，C#） | 待确认 | `Makefile:75-84` |
| 安装器 | Inno Setup（.iss 脚本 ×4） | — | `windows/installer/pulse-agent.iss` 等 |
| 包管理器 | npm（前端）、go mod（后端）、dotnet（LHM） | — | `internal/site/package-lock.json`、`go.sum`、`Makefile` |
| 构建编排 | GNU Make | — | `Makefile` |
| CI | GitHub Actions：quality.yml（Go + Web 双 job）、vulncheck.yml、inactivity-actions.yml | Go 1.26.x / Node 22 | `.github/workflows/quality.yml:22,48` |
| 容器 | Dockerfile（golang:alpine 多阶段）×5 | — | `internal/dockerfile_hub` 等 |

> 待确认项：CI 的 Go 版本（1.26.x）低于 `go.mod` 声明的 `go 1.27`。当前依赖 GOTOOLCHAIN 自动下载补齐才能跑通，属于治理计划应处理的版本错位（详见第 9 节）。

---

## 3. 目录结构地图

顶层目录与关键文件（`ls` 实查）：

| 路径 | 职责（基于实际内容） |
|---|---|
| `agent/` | Agent 采集端 Go 包（顶层 70 个非测试 .go + 对应测试）：按平台拆分的采集实现（cpu/disk/memory/network/gpu/smart/software/virtualization 等，`*_linux.go`/`*_windows.go`/`*_unsupported.go` 三件套模式）+ 子包 `deltatracker`、`health`、`lhm`（C# 温度辅助）、`tools/fetchsmartctl`、`utils`、`zfs`、`test-data` |
| `internal/` | 后端主体与前端：`cmd/`（两个入口）、`hub/`（Hub 核心，133 文件）、`alerts/`、`records/`（指标记录与保留）、`users/`、`common/`、`entities/`（system/service/smart 实体类型）、`migrations/`（60+ 迁移）、`assetcatalog/`（资产参数注册表）、`tests/`（测试基建）、`site/`（React 前端 + Android）、5 个 `dockerfile_*` |
| `internal/site/` | 前端工程：`src/components`（含 `routes/` 页面、`ui/` 基础件）、`src/modules/`（11 个模块目录 + registry）、`src/lib`（工具）、`src/locales`（Lingui 多语言）、`android/`（Capacitor Android 工程）、`e2e/`（Playwright） |
| `windows/` | Windows 侧交付物：`installer/`（Inno Setup 脚本 + fixtures）、`agent-config/`（Wails 桌面 GUI，独立 go.mod） |
| `supplemental/` | 脚本与部署模板：`scripts/`（24 个 PS1/mjs：开发启动、构建、发布、版本校验、安装器测试、回滚演练）、`docker/`（agent/hub/local-dev/same-system 四组 compose 模板）、`licenses/` |
| `docs/` | 103 个 Markdown：runbook、checklist、release-notes（1.0.1→1.0.5 + next）、路线图、模块契约 `module-contract.json`、`superpowers/` 子目录（计划文档） |
| `build/` | 构建产物目录（`dev`、`dev-logs`，未被 git 跟踪） |
| `pulse_data/` | 本地运行的 PocketBase 数据目录（未跟踪） |
| `.github/` | CI 工作流 ×3 + issue/PR 模板 |
| `.agents/skills/` | ZCode 技能：`pulse-dev`（开发环境启动验证）、`pulse-ui-check`（UI 实查流程） |
| `.codex/` | 旧 Codex 协作配置（config.toml） |
| 根文件 | `readme.md`、`AGENTS.md`（协作规则）、`Makefile`、`go.mod`/`go.sum`、`pulse.go`（版本常量）、`Start-Pulse-Dev.cmd`（开发一键启动）、`i18n.yml`（Crowdin 映射）、`LICENSE`、`SECURITY.md`、`THIRD_PARTY_NOTICES.md`、`hub.exe`（43MB 本地构建产物，未跟踪） |

七类目录定位：

| 类别 | 位置 |
|---|---|
| 源码主目录 | `agent/`、`internal/`（后端）；`internal/site/src/`（前端）；`windows/agent-config/`（桌面） |
| 测试目录 | 与源码同目录内嵌（`*_test.go` 137 个、`*.test.ts` 78 个）+ `internal/site/e2e/` + `agent/test-data/` + `supplemental/scripts/test-*.ps1`（14 个） |
| 配置目录 | 无独立 config 目录：构建配置在根 `Makefile`、`internal/site/*.config.ts`、`internal/site/biome.json`、`internal/site/tsconfig*.json`；CI 在 `.github/workflows/`；模块契约在 `docs/module-contract.json` |
| 文档目录 | `docs/`（主）+ 根 `readme.md`/`AGENTS.md`/`SECURITY.md` |
| 脚本/工具目录 | `supplemental/scripts/`；`agent/tools/fetchsmartctl/`；根 `Start-Pulse-Dev.cmd` |
| 部署/CI 目录 | `internal/dockerfile_hub`、`internal/dockerfile_agent*`（×4 变体）；`supplemental/docker/`（4 组 compose）；`.github/workflows/`；`windows/installer/` |
| 产物目录 | `build/`、`internal/site/dist/`（构建时生成）、`pulse_data/`（运行时数据）、根 `hub.exe`（本地遗留） |

---

## 4. 入口与运行命令

### 4.1 启动入口文件

| 入口 | 路径 | 说明 |
|---|---|---|
| Hub 主程序 | `internal/cmd/hub/hub.go` | `main()` 在 24 行；先短路处理 `health` 子命令（26-33 行），再构建 PocketBase 应用交给 `hub.NewHub(...).StartHub()`；`ENV=dev` 时启用开发模式与自动迁移（44、64-67 行） |
| Agent 主程序 | `internal/cmd/agent/agent.go` | `main()` 在 174 行；pflag 解析 `--url/--token/--code/--data-dir`（46-49 行），转写为 `HUB_URL`/`TOKEN`/`DATA_DIR` 环境变量（105-116 行）；子命令 `pair`/`update`/`fingerprint`/`health`（69-103 行） |
| 前端入口 | `internal/site/index.html` → `internal/site/src/main.tsx`（366 行） | Vite 标准；路由表在 `internal/site/src/components/router.tsx` |
| Agent 核心对象 | `agent/agent.go` | `NewAgent()` 装配全部采集管理器；`Start()` 启动 WebSocket 连接管理器 |
| Windows 配置 GUI | `windows/agent-config/main.go` | Wails 应用，独立 go.mod，不在主 module 内 |
| 构建期工具 | `agent/tools/fetchsmartctl/main.go` | `go generate -run fetchsmartctl` 下载 smartctl.exe（`Makefile:87-90`） |

### 4.2 命令清单（全部有出处）

**Make（根 `Makefile`，`.DEFAULT_GOAL := build`）**：

| 命令 | 用途 | 出处 |
|---|---|---|
| `make build` | 构建 Agent + Hub（默认目标） | `Makefile:52,103` |
| `make build-agent` | 构建 Agent（含条件 .NET LHM 构建、smartctl 下载），版本经 ldflags 注入 | `Makefile:93-94` |
| `make build-hub` | 构建发布版 Hub（默认连带 Web UI 构建，`SKIP_WEB=false`） | `Makefile:96-97` |
| `make build-hub-dev` | 构建开发版 Hub（`-tags development`，占位 dist/index.html） | `Makefile:99-101` |
| `make build-web-ui` | `npm ci` + `npm run build`（前端） | `Makefile:70-72` |
| `make dev-server` | Vite 开发服务器（`--host 0.0.0.0`） | `Makefile:111-112` |
| `make dev-hub` | `go run -tags development . serve --http 0.0.0.0:8090`（有 entr 时自动重载） | `Makefile:114-121` |
| `make dev-agent` | `go run` Agent（可选 entr 重载；NVML tag 逻辑见 39-46 行） | `Makefile:123-128` |
| `make test` | `go test -tags=testing ./...` | `Makefile:61-62` |
| `make vet` | `go vet -tags=testing ./...` | `Makefile:64-65` |
| `make lint` | `golangci-lint run` | `Makefile:58-59` |
| `make generate-locales` | 缺失本地化时生成 Lingui 语言包 | `Makefile:105-109` |

**npm（`internal/site/package.json` scripts，均在此文件 6-32 行）**：

| 命令 | 用途 |
|---|---|
| `npm run dev` | `vite --host`（开发服务器，5173 端口，代理 /api 与 /_/ 到 8090，见 `internal/site/vite.config.ts:22-25`） |
| `npm run build` | `lingui extract && lingui compile && vite build` |
| `npm run build:capacitor` | Capacitor 模式构建（`vite build --mode capacitor`） |
| `npm run android:sync` | 构建 + `cap sync android` |
| `npm run check` / `check:fix` | Biome 检查 / 自动修复 |
| `npm run typecheck` | `tsc -p tsconfig.app.json --noEmit` |
| `npm run test` | 串联 6 个子测试套件（registry/asset-center/modules/network-topology/websites 等，全部 `node --experimental-strip-types` 逐文件运行，合计 60+ 个测试文件） |
| `npm run test:e2e:network-topology` | Playwright E2E |
| `npm run check:versions` | 调 `supplemental/scripts/check-version-consistency.ps1` |

**日常开发（Windows）**：

| 命令 | 用途 | 出处 |
|---|---|---|
| 双击 `Start-Pulse-Dev.cmd` | 启动/复用 Hub+Vite，健康检查后打开页面（优先 pwsh） | `Start-Pulse-Dev.cmd:1-25` |
| `powershell -File supplemental/scripts/run-hub-dev.ps1 -Restart` | 强制重启开发环境 | `readme.md:41-44` |

**版本验证四件套（发布前，`readme.md:78-83`）**：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
go test -tags=testing -count=1 -timeout=240s ./...
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.6
```

**CI（`.github/workflows/`）**：quality.yml = gofmt 校验 + `go vet -tags=testing` + `go test -tags=testing -count=1 -timeout=300s ./...`（Go 1.26.x）+ npm ci/check/typecheck/test/build（Node 22）；vulncheck.yml = `govulncheck -show verbose ./...`；inactivity-actions.yml = 每日锁定无响应议题/PR。

---

## 5. 环境变量清单

先说三个全局事实：
1. **无 `.env.example`**：全仓库（根目录与 `internal/site/`）均无 .env 模板文件，环境变量知识只存在于代码与文档中。
2. **Hub 端读取走统一封装**：`internal/hub/utils/utils.go:8-13` 的 `GetEnv` 先查 `PULSE_HUB_<KEY>` 再回退裸 `<KEY>`，即所有 Hub 变量都支持 `PULSE_HUB_` 前缀覆盖。
3. **前端不用 `import.meta.env`**：`internal/site/src` 中 0 处引用；运行时配置（版本、Hub 地址、Agent 接入地址等）由 Hub 在 `server.go:25-34` 注入 index.html 的 `"{info}"` 占位符（`PublicAppInfo` 结构）。

### Hub 端（internal/ 内引用）

| 变量 | 默认值 | 必填 | 用途（依据） |
|---|---|---|---|
| `ENV` | 非 dev | 否 | `dev` 时启用 PocketBase 开发模式与 Admin UI 自动迁移（`internal/cmd/hub/hub.go:44`） |
| `APP_URL` | 空（回退设置里的 AppURL） | 否 | 覆盖应用对外 URL（`internal/hub/hub.go:143-146`） |
| `AGENT_HUB_URL` | 从本机出口 IPv4 自动推导 | 否 | 覆盖注入给 Agent 的接入地址（`internal/hub/server.go:63-85`） |
| `AUTO_LOGIN` | 空 | 否 | 按邮箱自动登录（仅开发/内网用途，`internal/hub/api.go:54`） |
| `TRUSTED_AUTH_HEADER` | 空 | 否 | 信任反向代理认证头（`internal/hub/api.go:60`） |
| `DISABLE_PASSWORD_AUTH` | 关（非 `true` 即启用密码登录） | 否 | 关闭密码认证（`internal/hub/collections.go:28-29`） |
| `USER_CREATION` | 关 | 否 | 允许 OAuth 用户自建账号（`internal/hub/collections.go:32-37`） |
| `MFA_OTP` | 关 | 否 | `true` 全员启用 OTP/MFA，`superusers` 仅超管启用（`internal/hub/collections.go:40-46`） |
| `SHARE_ALL_SYSTEMS` | 关 | 否 | 家庭共享读模型：开启后任何登录用户可读系统级数据（`internal/hub/collections.go:56-73`，另被 `dashboard_summary.go:114`、`important_monitoring.go:294`、`systems/system.go:514` 引用） |
| `CONTAINER_DETAILS` | 开（除非显式 `false`） | 否 | 是否注册容器日志/详情两个路由（`internal/hub/api.go:203-208`） |
| `OAUTH_DISABLE_POPUP` | 关 | 否 | 注入前端，禁用 OAuth 弹窗流程（`internal/hub/server.go:48`） |
| `CSP` | 无 | 否 | 生产构建 Content-Security-Policy 覆盖（`internal/hub/server_production.go:24`） |
| `PULSE_LOCAL_AGENT_TOKEN` | `pulse-local-agent` | 否 | Hub 同机 Agent 专用 token（仅回环允许，`internal/hub/agent_connect.go:32,131-136`） |
| `PULSE_DEV_LOCAL_AGENT_AS_HUB` | 关 | 否 | 开发期把本机 Agent 标记为 Hub 同机（`internal/hub/agent_connect.go:203`、`systems/system.go:432`） |
| `PULSE_PUBLIC_IPV4_DETECTOR_URL` / `PULSE_PUBLIC_IPV6_DETECTOR_URL` | 内置探测地址 | 否 | 公网地址探测服务覆盖（`internal/hub/internet_access.go:178-179`） |
| `PULSE_ASSET_ENRICHMENT_AI_ENABLED` | 未设时看有无 API key | 否 | 资产 AI 富化开关（`internal/hub/asset_enrichment_online.go:403`） |
| `PULSE_ASSET_ENRICHMENT_AI_PROVIDER` / `_ENDPOINT` / `_MODEL` | agnes 系列默认值 | 否 | 资产富化 AI 供应商配置（`asset_enrichment_online.go:402,414,416`、`asset_enrichment_config.go:204`） |
| `PULSE_ASSET_ENRICHMENT_AI_API_KEY` / `PULSE_AGNES_API_KEY` | 空 | 用 AI 时必填 | 富化 AI 密钥（`asset_enrichment_online.go:400-401`） |
| `PULSE_ASSET_VISUAL_AI_ENABLED` / `_PROVIDER` / `_ENDPOINT` / `_MODEL` / `_API_KEY` | 关 / `agnes` / — / `agnes-2.0-flash` / 空 | 否 | 资产可视化（转盘图）AI 配置（`internal/hub/asset_visuals.go:386-404`、`asset_enrichment_config.go:242`） |

### Agent 端（agent/ 内引用）

| 变量 | 默认值 | 必填 | 用途（依据） |
|---|---|---|---|
| `HUB_URL` | 无 | **是** | Hub 地址；CLI `--url` 会写入它（`agent/client.go:49`、`internal/cmd/agent/agent.go:107`） |
| `TOKEN` / `TOKEN_FILE` | 无 | 与 TOKEN 二选一 | 认证令牌或令牌文件（`agent/client.go:103,108`） |
| `DATA_DIR` | Windows 下 `APPDATA`/`LOCALAPPDATA` 下 `pulse-agent` | 否 | 凭据/缓存/更新目录（`agent/data_dir.go:21,37-38`） |
| `LOG_LEVEL` | info | 否 | debug/warn/error（`agent/agent.go:87-97`） |
| `MEM_CALC` | 内置公式 | 否 | 内存计算公式选择（`agent/agent.go:73`） |
| `DISK_USAGE_CACHE` | 0（不缓存） | 否 | 磁盘用量缓存时长，避免唤醒休眠盘（`agent/agent.go:77-84`） |
| `SMART_INTERVAL` | 内置间隔 | 否 | SMART 刷新间隔（`agent/agent.go:108-115`） |
| `SMART_DEVICES` / `SMART_DEVICES_SEPARATOR` / `EXCLUDE_SMART` | 全部扫描 | 否 | SMART 设备过滤（`agent/smart.go:167,233,271`） |
| `DOCKER_HOST` / `DOCKER_TIMEOUT` / `EXCLUDE_CONTAINERS` | 本机 socket / 默认 / 空 | 否 | Docker 采集配置（`agent/docker.go:837,864,881`） |
| `SKIP_GPU` / `GPU_COLLECTOR` / `INTEL_GPU_NAME` / `INTEL_GPU_DEVICE` | 关 / 自动 / 空 | 否 | GPU 采集控制（`agent/gpu.go:735,743`、`gpu_intel.go:54,110`） |
| `NICS` | 全部 | 否 | 限定监控网卡（`agent/network.go:234`） |
| `PRIMARY_SENSOR` / `SYS_SENSORS` / `SENSORS` / `SENSORS_TIMEOUT` / `LHM` | 自动 / 自动 / 空 / 默认 / 关 | 否 | 温度传感器选择；`LHM=true` 启用 LibreHardwareMonitor（`agent/sensors.go:39-43`、`sensors_windows.go:49`） |
| `FILESYSTEM` | 全部 | 否 | 限定监控文件系统（`agent/disk.go:198`） |
| `SYSTEM_NAME` | 空（上报真实主机名） | 否 | 覆盖上报的系统名（`agent/client.go:244`） |
| `INSTALL_METHOD` / `RUN_MODE` / `AGENT_PROFILE` | 自动探测 | 否 | 能力上报标注（`agent/capabilities.go:274,292,305`） |
| `EXIT_ON_DNS_ERROR` | 关 | 否 | DNS 解析失败时直接退出（`agent/connection_manager.go:233`） |
| `PULSE_AGENT_ALL_PROXY` | 空 | 否 | Agent 侧代理（`agent/client.go:161`） |
| `PULSE_SMARTCTL_URL` | 官方地址 | 否 | 构建期下载 smartctl.exe 的镜像（`agent/tools/fetchsmartctl/main.go:41`） |

---

## 6. 数据模型清单

数据库为 PocketBase 内嵌 SQLite，全部模型即「集合（collection）」，定义分两层：

1. **迁移层**（`internal/migrations/`，60+ 文件）：基线快照 `0_collections_snapshot_0_19_0_dev_1.go`（1572 行，JSON 全量导入）+ 后续逐个迁移（命名前缀 `zz...` 保证执行顺序，如 `zzzzz_asset_media_library.go`）。Hub 入口 blank-import 该包（`internal/cmd/hub/hub.go:17`）。
2. **运行时规则层**（`internal/hub/collections.go`）：每次启动把 API 规则（list/view/create/update/delete 的 PocketBase 过滤表达式）统一覆盖到约 40 个集合上——规则真源在代码不在迁移 JSON。

集合全景（按域分组，✱ = 基线快照内置）：

| 域 | 集合 | 字段概要 / 定义文件 |
|---|---|---|
| 账号 | `users`✱、`universal_tokens`✱ | users 为 auth 集合，带自定义 `role` 字段（admin/普通/readonly 三态，见 `internal/hub/api.go:14,19`） |
| 客户端监控 | `systems`✱、`system_details`✱、`system_stats`✱、`containers`✱、`container_stats`✱、`smart_devices`✱、`fingerprints`✱、`monitored_services`、`monitored_software`、`service_control_rules`、`software_monitor_rules`、`container_monitor_rules` | systems 是被监控主机主档（含 display_name、role、primary_use、is_nas、is_local、pairing_confirmed、hide_from_home 等字段，由 `system_*_field.go` 系列迁移增量添加）；system_stats/container_stats 为 JSON 指标记录；fingerprints 存 Agent 令牌与设备指纹（Agent 接入鉴权依据，`internal/hub/ws/ws.go:36-41`）；monitored_services 定义在 `monitored_services_collection.go` |
| 告警 | `alerts`✱、`alerts_history`✱、`alert_policies` | alerts：user/system/name/value/min/triggered；history 含 resolved、ack/silence 字段（`alerts_history_ack_silence_fields.go`）；policies 为全局策略（`global_alert_policies_collection.go`） |
| 通知 | `notification_failures`、`notification_channel_health`、`alert_notification_states` | 通知失败记录与渠道健康（`notification_*_collection.go`） |
| 资产中心 | `assets`、`asset_interfaces`、`asset_relations`、`asset_locations`、`asset_maintenance`、`asset_components`、`asset_attachments`、`asset_changes`、`asset_media`、`asset_visuals`、`ai_tasks`、`asset_enrichment_reports` | assets 主档 17 字段：user、name、type（30 个枚举：internet/physical_host/nas/server/mini_pc/router/switch/ap/gateway/ont/firewall/phone/tablet/camera/printer/ups/game_console/handheld/ebook/wearable/tv/speaker/smarthome_gateway/sensor/light/plug/lock/vacuum/iot/web_endpoint/custom）、status、parent_asset、vendor、model、serial_number、management_ip、location、role、notes、tags(JSON)、metadata(JSON)、created、updated（`assets_collections.go:21-38`）；interfaces：asset、kind（ethernet/wifi/wan/lan/management/virtual/custom）、mac、ipv4、ipv6、speed_mbps、connected、primary、source；relations：source_asset、target_asset、kind（hosted_on/connected_to/monitors/depends_on/owns/located_in/powered_by/custom）；components：asset、category、vendor、model、spec、serial_number、purchase_date、purchase_price_cny（`zzzzzzzzzz_asset_components.go`）；media/visuals/ai_tasks 见 `zzzzz_asset_media_library.go`、`zzz_asset_ai_tasks_visuals.go`（ai_tasks：asset、kind、status、provider、model、prompt、input_summary、output_summary、error；visuals：asset、kind、title、color、primary、frames、frame_count、sources） |
| 网站监控 | `website_monitors`、`website_monitor_checks` | monitors：name、url、internal_url、external_url、targets、expected_content、icon_url、group、interval_seconds(60-3600)、timeout_seconds(1-60)、enabled、last_status/last_status_code/last_latency_ms/last_error/last_failure_category/last_checked、uptime_24h（`website_monitoring_collections.go:21-44`）；checks 为逐次检测记录：monitor、target、url、ip_version、status、status_code、latency_ms、error、failure_category |
| 网络拓扑 | `network_devices`、`network_ports`、`network_links`、`network_layouts` | `network_topology_collections.go` |
| Agent 管理 | `agent_pairing_codes`、`agent_releases` | 配对码（`agent_pairing_codes_collection.go`）与 Agent 版本发布登记（`agent_releases_collection.go`，`normalize_agent_release_registry.go` 做规范化） |
| 操作与审计 | `operation_actions`、`operation_audit`、`script_templates` | `operation_collections.go`：actions 含 system、action、target、status、stage、started_at、completed_at、duration_ms、failure_code、error、result；audit 含 user、system、operation、action、target、result、detail、ip、failure_code |
| 模块与设置 | `module_settings`、`system_settings`、`user_settings`✱ | module_settings 按用户/全局存 11 个模块的开关（`module_settings_collection.go`、`module_settings_global_scope.go`），是模块系统的数据基础 |
| 已删除 | `quiet_hours`✱（`remove_quiet_hours_collection.go`） | 历史遗留，启动时移除 |

配套的资产「参数注册表」不在数据库而在代码资源：`internal/assetcatalog/asset-parameter-registry.json` + `parameter_registry.go`（各类型资产的参数定义，前端资产详情/编辑页共用，有专门测试与生成脚本 `supplemental/scripts/generate-asset-parameter-registry.mjs`）。

---

## 7. 对外接口清单

### 7.1 自定义 HTTP API（全部挂 `/api/pulse` 前缀，注册于 `internal/hub/api.go:68-209`）

权限列含义：`auth`=需登录（`apis.RequireAuth()`）、`admin`=仅管理员、`非readonly`=登录且非只读角色、`公开`=无需登录。`模块`列 = 绑定的模块门禁（`requirePulseModule`，模块关闭时返回 503 `module_disabled`）。

| 方法 | 路径 | 处理函数（文件:行） | 权限 / 模块 |
|---|---|---|---|
| POST | /api/pulse/create-user | `CreateFirstUser`（`internal/users/users.go:70`） | 公开；仅零用户时注册（api.go:87-89） |
| GET | /api/pulse/first-run | 内联（api.go:91-94） | 公开 |
| GET | /api/pulse/public-info | `getInfo`（`internal/hub/api_version.go:42`） | 公开 |
| GET | /api/pulse/info | `getInfo` | auth |
| GET | /api/pulse/systems/summary | `listSystemSummaries`（`internal/hub/systems_summary.go:81`） | auth / client-monitoring |
| GET | /api/pulse/dashboard/summary | `getDashboardSummary`（`internal/hub/dashboard_summary.go:30`） | auth |
| GET | /api/pulse/website-monitors | `listWebsiteMonitors`（`internal/hub/api_websites.go:59`） | auth / website-monitoring |
| GET | /api/pulse/containers | `listContainers`（`internal/hub/containers_summary.go:50`） | auth / client-monitoring |
| GET | /api/pulse/containers/logs | `getContainerLogs`（`internal/hub/api_containers.go:37`） | auth / client-monitoring；`CONTAINER_DETAILS≠false` 时才注册 |
| GET | /api/pulse/containers/info | `getContainerInfo`（`internal/hub/api_containers.go:43`） | 同上 |
| POST | /api/pulse/test-notification | `SendTestNotification`（`internal/alerts/alerts_api.go:594`） | 非readonly / notifications |
| POST | /api/pulse/notifications/email/test | `SendTestEmailNotification`（`internal/alerts/alerts_api.go:642`） | 非readonly / notifications |
| POST | /api/pulse/account/password | `changeAccountPassword`（`internal/hub/account_password.go:19`） | auth |
| GET | /api/pulse/agent-connect | `handleAgentConnect`（`internal/hub/agent_connect.go:35`） | 公开（X-Token 设备凭据） |
| GET | /api/pulse/agent-status | `getAgentStatus`（`internal/hub/agent_status.go:13`） | 公开（Agent 自身 token） |
| GET | /api/pulse/agent-releases/{version}/{filename} | `downloadAgentRelease`（`internal/hub/agent_releases.go:64`） | 公开（受控更新下载） |
| GET | /api/pulse/agent-install/windows.ps1 | `downloadWindowsAgentInstallScript`（`internal/hub/agent_releases.go:75`） | 公开 |
| GET | /api/pulse/agent-install/unraid.xml | `downloadUnraidAgentTemplateXml`（`internal/hub/agent_install_unraid.go:19`） | 公开 |
| POST | /api/pulse/agent-releases/sync | `syncAgentReleases`（`internal/hub/agent_releases.go:198`） | 非readonly / agent-management |
| POST/GET | /api/pulse/pairing-codes（含 /{id}、/{id}/reset） | `createPairingCode` 等（`internal/hub/api_pairing.go:87,139,164,180`） | 非readonly（reset 为 admin）/ agent-management |
| POST | /api/pulse/agent-pair | `pairAgent`（`internal/hub/api_pairing.go:241`） | 公开（一次性配对码，有限流） |
| POST/DELETE | /api/pulse/user-alerts | `alerts.UpsertUserAlerts` / `DeleteUserAlerts`（`internal/alerts/alerts_api.go:212`） | 非readonly / alerts |
| GET/POST/DELETE | /api/pulse/alert-policies | `alerts.ListGlobalAlertPolicies` 等 | GET auth，写非readonly / alerts |
| GET | /api/pulse/alerts-history | `alerts.ListAlertHistory`（`internal/alerts/alerts_history_list.go:55`） | auth / alerts |
| POST | /api/pulse/alerts-history/{id}/acknowledge、/silence、/unsilence | alerts 包处理 | 非readonly / alerts |
| POST | /api/pulse/smart/refresh | `refreshSmartData`（`internal/hub/api_containers.go:128`） | 非readonly / client-monitoring |
| GET | /api/pulse/services/search、/software/search | `searchServices` / `searchSoftware`（`api_containers.go:49,75`） | 非readonly / client-monitoring |
| POST/DELETE | /api/pulse/important-monitoring/rules... | `upsertImportantMonitoringRule` 等（`internal/hub/important_monitoring.go:26,92`） | 非readonly / client-monitoring |
| DELETE | /api/pulse/systems/{id} | `deleteSystemAndRelatedData`（`internal/hub/system_delete.go:40`） | 非readonly / client-monitoring |
| POST | /api/pulse/assets/auto-fetch | `autoFetchAssetInfo`（`internal/hub/asset_auto_fetch.go:23`） | 非readonly / asset-center |
| POST | /api/pulse/assets/image-candidates | `assetImageCandidates`（`internal/hub/asset_auto_fetch.go:77`） | 非readonly / asset-center |
| POST | /api/pulse/assets/{id}/enrichment-reports | `generateAssetEnrichmentReport`（`internal/hub/asset_enrichment.go:26`） | 非readonly / asset-center |
| POST | /api/pulse/assets/migrations/export、/upload、/{id}/preflight、/{id}/apply | `exportAssetMigrationPackage` 等（`asset_migration_export.go:28`、`asset_migration_import.go:44,97,123`） | 非readonly / asset-center |
| POST | /api/pulse/assets/{id}/internet-addresses/refresh、/settings | `refreshInternetPublicAddresses` / `updateInternetPublicAddressSettings`（`internal/hub/internet_access.go:37,54`） | 非readonly / asset-center |
| POST | /api/pulse/assets/{id}/visuals/turntable、/{visualId}/select、/{visualId}/crop | `generateAssetTurntableVisual` 等（`internal/hub/asset_visuals.go:40,172,242`） | 非readonly / asset-center |
| GET/POST | /api/pulse/assets/{id}/media（含 upload、import-url、import-visual、versions、adopt、placements、album、archive、{mediaId} 删除共 12 条） | `asset_media.go:34-547` 系列 | 读 auth / 写非readonly / asset-center |
| GET/POST | /api/pulse/asset-media/store | `getAssetMediaStoreSettings` 等（`asset_media.go:458,514`） | admin / asset-center |
| GET | /api/pulse/asset-media/object | `readAssetMediaObject`（`asset_media.go:547`） | auth / asset-center |
| GET/POST | /api/pulse/asset-enrichment/config | `getAssetEnrichmentConfig` 等（`asset_enrichment_config.go:44,48`） | admin / asset-center |
| POST | /api/pulse/asset-enrichment-suggestions/{id}/accept、/reject、/accept-batch | `asset_enrichment.go:155,184,221` | 非readonly / asset-center |
| DELETE | /api/pulse/service-control-rules/{id} | `deleteServiceControlRule`（`api_containers.go:101`） | 非readonly |
| GET/POST | /api/pulse/operations | `getOperations` / `createOperation`（`internal/hub/operations.go:362,86`） | GET auth，POST 非readonly |
| GET | /api/pulse/operations/audit | `getOperationAudit`（`operations.go:382`） | auth |
| GET | /api/pulse/logs | `getSystemLogs`（`internal/hub/logs.go:27`） | auth / maintenance |
| GET/POST/PATCH/DELETE | /api/pulse/users（含 /{id}、/{id}/password） | `admin.go:66-215` 五个函数 | admin |
| GET/POST/DELETE | /api/pulse/backups（含 /upload、/{key}、/{key}/restore、/{key}/preflight、/tasks/{id}、/scheduled/* 共 11 条） | `admin.go:289-407`、`portable_backup_*.go`、`backup_schedule.go:540-609` | admin / maintenance |
| GET | /api/pulse/health/deep | `getDeepHealth`（`internal/hub/health_deep.go:194`） | admin（cron 心跳、DB 写探针、磁盘） |
| POST | /api/pulse/website-monitors/{id}/check | `checkWebsiteMonitorNow`（`internal/hub/website_monitors.go:108`） | 非readonly / website-monitoring |

### 7.2 PocketBase 内建接口

- REST CRUD：`/api/collections/<name>/records`（全部集合，受 `internal/hub/collections.go` 的规则与 `module_gate.go` 的模块门双重控制）
- 实时订阅（SSE）、认证（`/api/collections/users/auth-*`）、批量请求、文件服务、Admin API（`/_/`）。前端 Vite 代理把 `/api` 与 `/_/` 都转发到 8090（`internal/site/vite.config.ts:22-25`）。

### 7.3 Agent WebSocket 协议

- 接入：`GET /api/pulse/agent-connect`，HTTP 头 `X-Token`（设备令牌，≤64 字符）+ `X-Pulse`（语义化版本号）（`internal/hub/agent_connect.go:117-125`）；Hub 同机 Agent 用 `PULSE_LOCAL_AGENT_TOKEN`（默认 `pulse-local-agent`），仅接受回环来源（50-55 行）。
- 升级后先取设备指纹再绑定/创建 system 记录（`verifyWsConn`，87-114 行），随后交给 `SystemManager.AddWebSocketSystem`。传输层 gws + CBOR 编码，请求-响应带 70 秒超时（`internal/hub/ws/ws.go:18-20`）。
- 兼容下限：CBOR 协议 ≥ `0.12.0`，AgentResponse ≥ `0.13.0`（`pulse.go:23-26`）。

### 7.4 CLI 命令

| 程序 | 命令 | 参数 | 出处 |
|---|---|---|---|
| pulse（Hub） | `serve` | PocketBase 内建，`--http 0.0.0.0:8090` | `Makefile:118-120` |
| pulse（Hub） | `update` | 无（打印升级指引） | `internal/cmd/hub/hub.go:54-58` |
| pulse（Hub） | `health` | `--url <base>`（探测 `/api/health`） | `internal/cmd/hub/hub.go:72-88` |
| pulse-agent | （默认运行） | `--url/-u`、`--token/-t`、`--code`、`--data-dir`、`--version/-v`、`--help/-h`；兼容单横线旧写法 | `internal/cmd/agent/agent.go:46-67` |
| pulse-agent | `pair` | `--url` + `--code`（一次性配对码） | `agent.go:95,120-140` |
| pulse-agent | `update` | 无（自更新，按平台分文件 `agent_update_*.go`） | `agent.go:95-97` |
| pulse-agent | `fingerprint [view\|reset]` | view 打印指纹，reset 重置 | `agent.go:142-172` |
| pulse-agent | `health` | 无 | `agent.go:33-39` |

---

## 8. TODO / FIXME 汇总

全项目扫描（git 跟踪的 .go/.ts/.tsx/.md/.yml/.json，排除 release-notes 与语言包）：**FIXME 0 条、HACK 0 条、@deprecated 0 条**，代码内 TODO 共 12 条——对一个 43 万行级仓库来说非常干净，但残留的几条恰好都指向真实的技术债。

按文件统计：

| 文件 | 数量 |
|---|---|
| internal/entities/system/system.go | 3 |
| agent/docker.go | 2 |
| internal/hub/backup_schedule.go | 2 |
| agent/gpu.go | 1 |
| agent/system.go | 1 |
| internal/hub/systems/systems_test.go | 1 |
| docs/superpowers/plans/2026-08-04-network-topology-asset-driven.md | 1（历史计划文档中的流程性表述，非代码债） |

最值得关注的 10 条（全部代码 TODO）：

1. `internal/entities/system/system.go:3` — `// TODO: this is confusing, make common package with common/types common/helpers etc`。解读：实体包的职责边界自认混乱，作者本想把 common/types/helpers 收拢，属于架构级自省，影响后续重构方向。
2. `internal/entities/system/system.go:43` — `// TODO: remove other load fields in future release in favor of load avg array`。解读：负载字段新旧两套并存（标量 → 数组），迁移未完成，涉及 Agent↔Hub 协议兼容。
3. `internal/entities/system/system.go:98` — `// TODO: remove DiskReadPs and DiskWritePs in future release in favor of DiskReadBytes and DiskWriteBytes`。解读：同上，磁盘 IO 速率字段被字节数字段替代但旧字段仍保留，CBOR 协议里可能仍在传。
4. `agent/docker.go:375` 与 `agent/docker.go:540` — `// TODO(0.19+): stop populating NetworkSent/NetworkRecv (deprecated in 0.18.3)`。解读：有明确版本锚点的弃用计划，说明 0.19 起可清理，做协议瘦身时要一并处理。
5. `internal/hub/backup_schedule.go:24` — `// TODO(PBL-00x V2): 每月自动恢复演练（用最近一次自动备份在隔离目录做恢复验证）`。解读：备份只有「能备份」，「能恢复」的自动验证还是 V2 蓝图；对家庭单管理员场景是实打实的可用性风险。
6. `internal/hub/backup_schedule.go:204` — 同上主题的第二处（成功备份后触发演练），两处呼应，是备份域唯一的规划性缺口。
7. `agent/gpu.go:721` — `// TODO: uncomment below when Apple collectors are confirmed to be working.`。解读：macOS GPU 采集代码写好了但被注释禁用，说明 Darwin 支持处于半成品状态（目录里确有 `gpu_darwin.go`）。
8. `agent/system.go:238` — `// TODO: maybe refactor to methods on systemStats`。解读：采集函数到统计结构的过程式写法，作者自己标记的重构候选。
9. `internal/hub/systems/systems_test.go:122` — `// TODO: test with websocket client`。解读：系统管理器测试目前只做单元级，缺真实 WS 客户端的端到端覆盖——Agent 链路回归主要靠手工验证时的已知薄弱点。
10. （仅作说明）`docs/superpowers/plans/...:277` 出现的 "TODO" 是计划文档中「不许使用 TBD/TODO 占位」的规则表述，不是遗留任务，可忽略。

---

## 9. 给后续天数的输入

### 9.1 最重要的 5 个核心模块

1. **`internal/hub`（含 systems/ws/transport/config/utils 子包）** — Hub 的全部业务逻辑、65 条自定义路由、模块门禁、集合规则。133 个顶层文件 3.87 万行，是变更最频繁、风险最集中的地方；任何治理动作都绕不开它。
2. **`agent/`（根目录）** — 采集端全部实现，平台分支密度最高（Linux/Windows/macOS/unsupported 四态文件三件套），加上自更新、配对、指纹、Docker/LHM/smartctl 外部依赖，是「运行在别人机器上」的最脆弱环节。
3. **`internal/site/src/`（尤其 `modules/asset-center`）** — 前端 399 个文件中资产中心一个模块目录就占 108 个 ts/tsx（含测试），是当前开发重心（1.0.6 的主要增量），也是「基础底座+模块」架构在前端的落点（`modules/registry.ts`）。
4. **`internal/migrations`** — 数据模型真源（60+ 迁移），且与 `internal/hub/collections.go` 的运行时规则覆盖构成「双真源」结构；治数据必先治这里。
5. **`internal/hub/ws` + `internal/hub/systems` + `internal/records`** — Agent↔Hub 通信链路与指标落库/保留（30 天保留策略在 `internal/records/retention.go`），跨端版本兼容（CBOR/AgentResponse 下限）都在这条线上。

### 9.2 最可能存在的 3 类问题（给风险扫描定向）

1. **权限/集合规则的漂移与双真源**：迁移 JSON 里内嵌一套旧规则（如 `assets_collections.go:13-17` 的 userMatches 旧规则），启动时又被 `collections.go:114-122` 覆盖成家庭共享新规则——同一集合的规则在两处定义、时间点不同；加上 `SHARE_ALL_SYSTEMS` 环境变量在四个文件里各自判断（collections.go、dashboard_summary.go:114、important_monitoring.go:294、systems/system.go:514），读模型一致性容易出现缝隙（历史上已发生过 PBL-023 这类读模型缺口，见 git log `29a9481d`）。
2. **四端版本一致性与构建链的人工依赖**：Hub/Agent/Web/Android 必须同版本发布（AGENTS.md 硬规则），靠 `supplemental/scripts/check-version-consistency.ps1` 保障；但 go.mod 声明 go 1.27 而 CI 固定 Go 1.26.x（quality.yml:22）依赖工具链自动下载、前端版本散布在 package.json/pulse.go/Makefile/About 页 JSON 多处，版本错位风险是结构性的。另外发布/构建关键路径在 24 个 PowerShell 脚本里，跨平台可重复性弱。
3. **巨包与超长命令行的可维护性**：`internal/hub` 单包 133 文件（asset_enrichment 系列 10+ 文件、asset_media 8+ 文件全在一个包里）；前端 `package.json` 的 `test:asset-center` 是一条串了 40+ 个 `node --experimental-strip-types` 的超长单行命令，且前端测试没有断言框架（纯 node 运行 .ts 测试文件），测试能力与 399 个文件的规模不匹配。

### 9.3 一眼看到但来不及细讲的异常

- **根目录躺着 43MB 的 `hub.exe`**（未跟踪）：本地构建产物混在仓库根目录，极易误执行旧版本二进制造成「改了代码没生效」的假象；同类还有 `build/`、`pulse_data/` 在仓库内（虽已忽略）。
- **工作区有约 60 个未提交的修改文件**（git status 实查）：1.0.6 开发到一半的脏工作区，Day 2 做任何基线对比前应先确认这批改动的去向。
- **`internal/site/temp/` 下有两个 tsc 日志文件**（tsc-after-router.log、tsc-app.log）：调试遗留物，被 git 跟踪与否待确认，应清理。
- **迁移的「建了又删」churn**：`remove_*` 系列迁移有 8 个（quiet_hours、systemd_services、wol_configs、software_launch_command、agent_auto_update、host_port、agent_release_recommended、legacy linux update capability），说明早期 schema 决策反复；读迁移链时要跳过这些墓碑。
- **`internal/dockerfile_*` 五个无扩展名 Dockerfile 放在 `internal/` 里**：非主流布局（构建脚本按路径引用，功能正常但容易被治理工具忽略）。
- **前端 pocketbase JS SDK ^0.28.1 与服务端 PocketBase v0.40.4 的版本关系**：两者版本线不同属正常现象，但 SDK 落后服务端大版本的兼容面（如新集合规则语法）值得在风险日专项核对——待确认。
- **`windows/agent-config` 是独立 go.mod 的 Wails 工程**：不参与根 module 构建，`go test ./...` 覆盖不到它，容易成为测试盲区。
- **测试声明与实际能力**：`package.json` 声明了 `test:asset-media-crop` 等脚本但 `test` 主命令未串联全部（如 asset-media-crop 不在 `test` 链里），存在「测试写了但没进默认门」的情况。

---

## 附录 A：核心模块精读 —— `internal/hub`

选它的理由：它是 Hub 的一切业务逻辑所在，65 条路由、模块系统、集合规则、Agent 接入、备份恢复全在此包。精读方式：hub.go/api.go/server.go/module_gate.go/collections.go/agent_connect.go/ws 子包全文通读，其余文件按功能分组逐一确认职责（文件名 + 包内引用关系 + 抽读）。

### A.1 骨架（已通读）

**`internal/hub/hub.go`（175 行）** — 包的装配中心。
- 导出：`Hub` 结构体（内嵌 `core.App` + `*alerts.AlertManager`，持有 UserManager/RecordManager/SystemManager、登录与配对限流器、cron 心跳跟踪器）、`NewHub(app)`、`StartHub()`、`MakeLink(parts...)`。
- `NewHub`（39-65 行）依次绑定 10 类 hook：认证安全、Agent 发布、网站监控、系统删除保护、资产主档校验、资产绑定校验、网络拓扑旧校验、模块集合门、模块运行时 hook、集合审计、资产变更 hook——这就是全包的目录索引。
- `StartHub`（87-134 行）在 OnServe 时：恢复中断的便携还原 → `config.SyncSystems` → 注册中间件与路由 → 同步本地 Agent 发布并裁剪 → 修复本机系统标记 → 注册 6 个 cron（全部包心跳，见 155-162 行中文注释）→ 启动 server → 初始化 SystemManager。
- 关键依赖：`internal/alerts`、`internal/hub/config`、`internal/hub/systems`、`internal/records`、`internal/users`。

**`internal/hub/api.go`（210 行）** — 路由与中间件唯一注册点（全部路由已在第 7 节列表）。
- 导出/关键符号：`requireAdminRole`、`excludeReadOnlyRole`、`customAuthMiddleware`（13-34 行，统一「未登录 401 / 越权 403」语义）、`registerMiddlewares`（37-65 行，`AUTO_LOGIN`/`TRUSTED_AUTH_HEADER` 两个自动登录通道）、`registerApiRoutes`。
- 值得注意：`apiNoAuth` 组与 `apiAuth` 组同前缀并存；`create-user` 仅在零用户时注册（87-89 行）。

**`internal/hub/server.go`（128 行）** — 对外信息注入与地址推导。
- 导出：`PublicAppInfo`（BASE_PATH/HUB_VERSION/HUB_URL/AGENT_HUB_URL/BUILD_COMMIT/BUILD_TIME/DEV_BUILD/OAUTH_DISABLE_POPUP）；`modifyIndexHTML` 把 `./` 重写为 BASE_PATH 并把 JSON 注入 index.html 的 `"{info}"` 占位（25-34 行）。
- `getAgentHubURL`（63-85 行）：本地地址时自动换成本机非回环 IPv4（拨打 UDP 8.8.8.8 探测，92-99 行），排除 docker/veth/wsl 网卡——这是「本地开发 Agent 必须连局域网 IP」约定的代码实现。

**`internal/hub/collections.go`（292 行）** — 集合 API 规则真源（详见第 6 节）。导出 `setCollectionAuthSettings`：还负责密码认证开关、OTP/MFA、`SHARE_ALL_SYSTEMS` 读规则切换。规则用 PocketBase 过滤表达式字符串拼接（58-74 行），资产家庭共享决策有中文注释锚点（110-113 行，2026-10-03 产品决策）。

**`internal/hub/module_gate.go`（328 行）** — 模块系统核心。
- `pulseModulePolicies`（20-32 行）：11 个模块的中文名/默认开/必需/依赖（如 client-monitoring 依赖 asset-center+agent-management；notifications 依赖 alerts）。
- `pulseCollectionModulePolicies`（34-58 行）：23 个集合归属到模块，对这些集合的 CRUD 与实时订阅统一过模块门（`bindModuleCollectionGates` 60-69 行）。
- 解析算法（240-310 行）：默认值 → 用户级 module_settings → 全局 module_settings 覆盖 → 带环检测的依赖递归；关闭模块返回 503 `module_disabled` 并指明 `blocked_by`。导出 `RealtimeSubscriptionModule`（133 行）供测试直接验证「订阅主题→模块」契约。
- 运行时联动（71-109 行）：关闭 client-monitoring/website-monitoring 时主动踢掉对应用户的实时订阅。

**`internal/hub/agent_connect.go`（625 行，精读前 150 行 + 符号扫描）** — Agent WebSocket 接入：头校验 → 令牌查 fingerprints → 本机 token 仅回环 → 版本 semver 校验 → gws 升级 → 异步取指纹 → `findOrCreateSystemForToken` 绑定/建 system → `sm.AddWebSocketSystem`。导出 `(h *Hub) SetFingerprint`（585 行）。默认本机 token 常量 `defaultLocalAgentToken = "pulse-local-agent"`（32 行）。

**`internal/hub/ws/`（5 文件）** — WS 协议层：`ws.go`（`WsConn`、`FingerprintRecord`、gws 单例 upgrader、CBOR 编解码、70s deadline）、`request_manager.go`（请求-响应配对）、`handlers.go`（入站消息分派）。依赖 fxamacker/cbor + lxzan/gws。

**`internal/hub/utils/utils.go`** — 13 行的 `GetEnv`（`PULSE_HUB_` 前缀优先）。全包环境变量读取的事实标准。

**`internal/hub/config/config.go`** — `config.SyncSystems`（启动时按 collections 配置同步系统记录，被 hub.go:93 调用）。

### A.2 其余文件分组清单（非测试文件，职责一句话）

| 分组 | 文件 | 职责 |
|---|---|---|
| 路由辅助 | `api_version.go`（379 行） | `getInfo` 元信息接口 + 版本比较逻辑 |
| | `api_pairing.go`（602 行） | 配对码生命周期（创建/列表/重置）与 `agent-pair` 配对事务（带尝试限流 `pairAgentAttempt`） |
| | `api_containers.go` | 容器日志/详情、服务与软件搜索、服务控制规则删除、SMART 刷新 |
| | `api_websites.go` | 网站监控分页列表 |
| 系统与客户端监控 | `systems_summary.go`、`containers_summary.go`、`dashboard_summary.go` | 三个轻量汇总接口（首页/客户端/容器页数据源） |
| | `system_delete.go` | 删除系统及其级联数据（有删除保护 hook 配合） |
| | `systems/`（19 文件） | SystemManager：WebSocket 系统接入、实时指标分发（rt_metrics）、告警联动、SMART/服务/软件记录、systemd 支持（`systems_production.go` 生产分支） |
| 资产域 | `asset_master_validation.go`（733 行）+ `asset_binding_validation.go` + `asset_type_validation.go` + `asset_validation_rules.go` | 资产主档/绑定/类型的写前校验 hook（NewHub 里 56-58 行绑定的三件套） |
| | `asset_changes.go` | 资产变更审计（asset_changes 集合写入） |
| | `asset_auto_fetch.go` | 资产信息在线自动抓取 + 图片候选 |
| | `asset_online_search.go`、`asset_image_search.go`（532 行） | 在线搜索与图片搜索 |
| | `asset_interface_display` 相关在 `internal/site`；Hub 侧接口同步在 `internet_access.go`（290 行，公网地址刷新/设置 + 探测器） |
| 资产富化 AI | `asset_enrichment.go`、`_pages`、`_sources`、`_suggestions*`（×4）、`_config`、`_helpers`、`_ai_payload`、`_domain`、`_online`（453 行）、`_profile` | 富化报告生成管线：域名/在线源抓取 → AI（agnes/OpenAI 兼容端点）payload 组装 → 建议构建/接受/拒绝/批量接受；配置走 admin 接口 + 环境变量 |
| 资产可视化 | `asset_visuals.go`（641 行）、`asset_visual_frames.go`（755 行）、`asset_visual_pages.go`、`asset_visual_sources.go`、`asset_visual_prompts.go` | 转盘图生成、候选选择、裁剪、帧处理、提示词 |
| 资产媒体 | `asset_media.go`（568 行）及 `asset_media_album/edit/filter/import/mime/placement/repair/render/store`（×9） | 媒体库 CRUD、相册、导入（URL/视觉候选）、MIME 白名单、存储位置设置（store）、渲染与修复 |
| 资产迁移 | `asset_migration_contract.go`、`_export.go`（300 行）、`_import.go`（949 行，包内最大非测试文件） | 资产包导出/上传/预检/应用（preflight-apply 两段式） |
| Agent 发布 | `agent_releases.go`（626 行）、`agent_install_unraid.go` | Agent 版本登记、二进制分发、Windows 安装脚本与 Unraid 模板下发、发布同步与保留裁剪 |
| | `agent_status.go` | Agent 自查询状态端点 |
| 运维 | `admin.go`（441 行） | 用户管理 ×5 + 备份 CRUD ×4（PocketBase 内建备份的包装） |
| | `backup_schedule.go`（642 行） | 每日定时备份（02:00）、保留 7/4/12 策略入口、手动触发（TODO：月度恢复演练） |
| | `portable_backup_*.go`（×5） | 便携备份包的创建/上传/预检/恢复/任务查询（恢复可断点续做，StartHub 里 resume） |
| | `health_deep.go`（295 行）、`diag_init.go` | 深度健康报告（cron 心跳、DB 写探针、磁盘）与诊断初始化 |
| | `logs.go` | 系统日志查询 |
| | `update.go` | `pulse update` 子命令实现（打印升级指引） |
| | `archive_safety.go` | 压缩包上传安全（zip 炸弹/路径穿越防护，配合备份与媒体导入） |
| 操作与审计 | `operations.go`（665 行）、`operations_validation.go`、`operations_effects.go`、`operations_failures.go`、`operation_audit_hooks.go` | 面向系统的受控操作（服务控制等）创建/查询/审计，导出 `AllowedOperationActions()`、`OperationFailureCodes()` |
| 网站监控 | `website_monitors.go`（797 行） | 检测调度、手动触发、失败分类、历史写入 |
| 告警联动 | `important_monitoring.go`（307 行） | 重要监控规则（服务/软件/容器）upsert/delete |
| 安全 | `auth_security.go`、`account_password.go` | 登录失败限流（loginLimiter/pairLimiter）、账户改密 |
| 基建 | `expirymap/expirymap.go`、`transport/transport.go`+`websocket.go` | 过期map工具；HTTP/WS 传输抽象 |
| | `server_development.go` / `server_production.go` | 按 build tag 二选一的 server 装配（生产含 CSP 注入） |
| | `hub_test_helpers.go`、`first_run_test.go` 等 40+ `_test.go` | 测试（合计约 1.4 万行，`asset_enrichment_test.go` 3356 行最大） |

### A.3 关键依赖图（Hub 视角）

```
internal/cmd/hub ──> internal/hub ──> internal/alerts（告警/通知，含 shoutrrr）
        │                 │      ├──> internal/records（指标落库+30天保留）
   PocketBase v0.40.4     │      ├──> internal/users（用户/首用户/改密）
   + migratecmd           │      ├──> internal/hub/systems ──> internal/hub/ws ──> gws+CBOR
   + internal/migrations  │      ├──> internal/entities/system（Agent 上报的数据结构，与 agent/ 共享）
                         │      └──> internal/common（WS 消息/脱敏）
                         └──> internal/site/dist（embed 进 Hub 二进制的 Web UI，internal/site/embed.go）
```

`internal/entities/system` 是 Agent 与 Hub 的共享数据契约（CombinedData/Info/Details/Stats），`agent/` 采集产出它、`internal/hub/systems` 消费它——改这个包等于改协议，必须两端同版本发布，这正是 AGENTS.md 版本同步规则的代码层原因。

---

*报告完。Day 2 风险扫描建议优先级：① 集合规则双真源与 SHARE_ALL_SYSTEMS 四处判断的一致性；② 未提交的 60 文件工作区与版本一致性链；③ agent_connect/ws 链路的认证边界（配对限流、本机 token 回环限制、token 长度上限）。*
