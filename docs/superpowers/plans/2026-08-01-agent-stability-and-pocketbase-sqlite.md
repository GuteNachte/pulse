# Agent Stability and PocketBase SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Agent 采集超时与 Hub 同机身份地址修复，并把 PocketBase 的 SQLite 运行依赖锁回官方测试组合。

**Architecture:** Agent 继续上报真实物理网卡详情，Hub 将连接观察地址与页面身份地址分开处理，只有已确认的 Hub 同机系统可用物理 LAN 地址替换 loopback。WebSocket 只延长完整采集动作的默认期限；Foundation 通过可执行依赖契约测试锁定 PocketBase、SQLite 与 libc 组合。

**Tech Stack:** Go 1.26、PocketBase v0.39.4、modernc SQLite、gopsutil、testify、PowerShell、React/Vite、Android Gradle

---

## 文件边界

- `internal/hub/ws/request_manager.go`：按 WebSocket 动作提供默认请求期限。
- `agent/network_details.go`、`agent/network_details_linux.go`：规范化并上报 Linux 物理网卡地址。
- `internal/hub/systems/system.go`：选择并保存 Hub 同机系统的页面身份地址。
- `internal/tests/pocketbase_dependency_contract_test.go`：构建时依赖组合契约。
- `go.mod`、`go.sum`：PocketBase 测试组合的实际模块图。
- `internal/hub/portable_backup_test.go`：备份内 SQLite 数据库完整性验证。
- `docs/release-notes-next.md`、`internal/site/src/components/routes/settings/release-history.ts`：下一版本记录。

### Task 1: 收口 WebSocket 完整采集期限

**Files:**
- Modify: `internal/hub/ws/request_manager.go:35`
- Test: `internal/hub/ws/request_manager_test.go:14`

- [ ] **Step 1: 核对现有回归测试覆盖动作差异**

```go
func TestDefaultRequestTimeout(t *testing.T) {
	assert.Equal(t, 30*time.Second, defaultRequestTimeout(common.GetData))
	assert.Equal(t, 5*time.Second, defaultRequestTimeout(common.GetContainerInfo))
}

func TestRequestContextPreservesExplicitDeadline(t *testing.T) {
	expected := time.Now().Add(time.Second)
	parent, cancel := context.WithDeadline(context.Background(), expected)
	defer cancel()

	requestCtx, requestCancel := requestContext(parent, common.GetData)
	defer requestCancel()
	actual, ok := requestCtx.Deadline()
	require.True(t, ok)
	assert.WithinDuration(t, expected, actual, 10*time.Millisecond)
}
```

测试文件同时添加 `github.com/stretchr/testify/require` import。

- [ ] **Step 2: 运行定向测试确认当前工作树状态**

Run: `go test -tags=testing -count=1 ./internal/hub/ws -run "Test(DefaultRequestTimeout|RequestContextPreservesExplicitDeadline)"`

Expected: 新测试先因 `requestContext` 不存在而 FAIL；默认期限测试保持通过。

- [ ] **Step 3: 核对最小实现**

```go
func defaultRequestTimeout(action common.WebSocketAction) time.Duration {
	if action == common.GetData {
		return 30 * time.Second
	}
	return 5 * time.Second
}

func requestContext(ctx context.Context, action common.WebSocketAction) (context.Context, context.CancelFunc) {
	if _, hasDeadline := ctx.Deadline(); hasDeadline {
		return context.WithCancel(ctx)
	}
	return context.WithTimeout(ctx, defaultRequestTimeout(action))
}
```

`SendRequest` 中改为 `reqCtx, cancel := requestContext(ctx, action)`，其余 pending request、写入和错误处理保持不变。

- [ ] **Step 4: 运行 WebSocket 包测试**

Run: `go test -tags=testing -count=1 ./internal/hub/ws`

Expected: 全部通过，无超时测试泄漏。

- [ ] **Step 5: 提交本任务**

```powershell
git add internal/hub/ws/request_manager.go internal/hub/ws/request_manager_test.go
git commit -m "fix: allow complete agent collection to finish"
```

### Task 2: 仅为 Hub 同机 Agent 保存物理 LAN 地址

**Files:**
- Modify: `agent/network_details.go:53`
- Modify: `agent/network_details_linux.go:24`
- Test: `agent/network_test.go:336`
- Modify: `internal/hub/systems/system.go:289`
- Test: `internal/hub/systems/system_test.go:263`

- [ ] **Step 1: 先补普通 loopback Agent 与虚拟网卡失败测试**

```go
func TestSystemIdentityIPKeepsLoopbackForNonHubAgent(t *testing.T) {
	record := newSystemTestRecord(t)
	record.Set("is_local", false)
	details := &system.Details{NetworkInterfaces: []system.NetworkInterfaceDetails{
		{Name: "enp2s0", Status: "up", IPv4: []string{"192.168.1.30"}},
	}}

	require.Equal(t, "127.0.0.1", systemIdentityIP(record, "127.0.0.1", details))
}

func TestSelectSystemIdentityIPIgnoresVirtualTunnel(t *testing.T) {
	details := &system.Details{NetworkInterfaces: []system.NetworkInterfaceDetails{
		{Name: "wg0", Status: "up", IPv4: []string{"10.0.0.1"}},
		{Name: "enp2s0", Status: "up", IPv4: []string{"192.168.1.30"}},
	}}

	require.Equal(t, "192.168.1.30", selectSystemIdentityIP("127.0.0.1", details))
}
```

- [ ] **Step 2: 运行测试确认新边界先失败**

Run: `go test -tags=testing -count=1 ./internal/hub/systems -run "Test(SystemIdentityIPKeepsLoopbackForNonHubAgent|SelectSystemIdentityIPIgnoresVirtualTunnel)"`

Expected: FAIL，分别因为 `systemIdentityIP` 尚不存在、`wg0` 尚未被排除。

- [ ] **Step 3: 实现 Hub 本机门控与虚拟接口过滤**

```go
func systemIdentityIP(record *core.Record, observedIP string, details *system.Details) string {
	observedIP = strings.TrimSpace(observedIP)
	if record == nil || !record.GetBool("is_local") {
		return observedIP
	}
	return persistedSystemIdentityIP(record, selectSystemIdentityIP(observedIP, details))
}
```

保存系统信息时改为：

```go
updateLocalSystemMarkerFromInfo(systemRecord, info)
info.RemoteIP = systemIdentityIP(systemRecord, connectionIP, data.Details)
systemRecord.Set("info", info)
```

虚拟接口前缀统一为：

```go
for _, prefix := range []string{
	"docker", "podman", "veth", "virbr", "br-", "cni", "flannel",
	"tailscale", "wg", "zt", "tun", "tap",
} {
	if strings.HasPrefix(name, prefix) {
		return true
	}
}
```

- [ ] **Step 4: 核对 Agent 地址采集实现**

`networkInterfaceAddresses` 必须使用 `net.ParseCIDR` / `net.ParseIP`，跳过未指定和多播地址，按 IPv4 / IPv6 分组后调用 `normalizeStringList`。Linux 物理网卡构造必须传入返回的 `ipv4`、`ipv6`，不能重新引入 Docker 或桥接接口。

- [ ] **Step 5: 运行 Agent 与 Hub 系统定向测试**

```powershell
go test -tags=testing -count=1 ./agent -run "Test(NetworkInterfaceAddresses|SkipNetworkInterface|RefreshNetworkInterfaceDetails)"
go test -tags=testing -count=1 ./internal/hub/systems -run "Test(SelectSystemIdentityIP|PersistedSystemIdentityIP|SystemIdentityIP|UpdateLocalSystemMarker)"
```

Expected: 两条命令全部通过。

- [ ] **Step 6: 提交本任务**

```powershell
git add agent/network_details.go agent/network_details_linux.go agent/network_test.go internal/hub/systems/system.go internal/hub/systems/system_test.go
git commit -m "fix: preserve secure local agent identity"
```

### Task 3: 用自动化契约锁定 PocketBase SQLite 组合

**Files:**
- Create: `internal/tests/pocketbase_dependency_contract_test.go`
- Modify: `go.mod`
- Modify: `go.sum`

- [ ] **Step 1: 写依赖版本失败测试**

```go
package tests

import (
	"runtime/debug"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPocketBaseSQLiteDependencyContract(t *testing.T) {
	info, ok := debug.ReadBuildInfo()
	require.True(t, ok)

	versions := make(map[string]string, len(info.Deps))
	for _, dependency := range info.Deps {
		versions[dependency.Path] = dependency.Version
	}

	require.Equal(t, "v0.39.4", versions["github.com/pocketbase/pocketbase"])
	require.Equal(t, "v1.52.0", versions["modernc.org/sqlite"])
	require.Equal(t, "v1.72.3", versions["modernc.org/libc"])
}
```

- [ ] **Step 2: 运行测试确认当前依赖组合失败**

Run: `go test -tags=testing -count=1 ./internal/tests -run TestPocketBaseSQLiteDependencyContract`

Expected: FAIL，当前实际值为 SQLite `v1.53.0` 或 libc `v1.73.4`。

- [ ] **Step 3: 使用 Go 模块工具对齐依赖**

```powershell
go get modernc.org/sqlite@v1.52.0 modernc.org/libc@v1.72.3
go mod tidy
```

Expected: `go.mod` / `go.sum` 更新；如 MVS 仍选择更高版本，先用 `go mod graph` 找到要求方并同步降到 SQLite `v1.52.0` 声明的版本，不添加 `replace`。

- [ ] **Step 4: 验证最终模块图**

```powershell
go list -m all | Select-String "pocketbase|modernc.org/sqlite|modernc.org/libc"
go mod graph | Select-String "pocketbase@v0.39.4 modernc.org/(sqlite|libc)"
```

Expected: 最终解析为 PocketBase `v0.39.4`、SQLite `v1.52.0`、libc `v1.72.3`，PocketBase 边也指向同一组合。

- [ ] **Step 5: 运行依赖契约与 Hub 基础测试**

```powershell
go test -tags=testing -count=1 ./internal/tests -run TestPocketBaseSQLiteDependencyContract
go test -tags=testing -count=1 ./internal/hub ./internal/hub/systems
```

Expected: 全部通过，Hub 启动测试不再输出 SQLite 版本偏离警告。

- [ ] **Step 6: 提交本任务**

```powershell
git add go.mod go.sum internal/tests/pocketbase_dependency_contract_test.go
git commit -m "fix: align sqlite with pocketbase test matrix"
```

### Task 4: 验证便携备份中的 SQLite 完整性

**Files:**
- Modify: `internal/hub/portable_backup_test.go:18`

- [ ] **Step 1: 为备份内数据库增加完整性断言**

在 `TestCreatePortableBackupWrapsPocketBaseAndManifest` 读取 `pocketbase.zip` 后增加：

```go
nativeData := readAssetMigrationAPIArchiveEntry(t, archive.File, "pocketbase.zip")
nativeArchive, err := zip.NewReader(bytes.NewReader(nativeData), int64(len(nativeData)))
require.NoError(t, err)
databaseBytes := readAssetMigrationAPIArchiveEntry(t, nativeArchive.File, "data.db")
databasePath := filepath.Join(t.TempDir(), "data.db")
require.NoError(t, os.WriteFile(databasePath, databaseBytes, 0o600))

database, err := sql.Open("sqlite", databasePath)
require.NoError(t, err)
var integrity string
require.NoError(t, database.QueryRow("PRAGMA quick_check").Scan(&integrity))
require.Equal(t, "ok", integrity)
require.NoError(t, database.Close())

restoredApp, err := pbtests.NewTestApp(filepath.Dir(databasePath))
require.NoError(t, err)
t.Cleanup(restoredApp.Cleanup)
_, err = restoredApp.FindCollectionByNameOrId("users")
require.NoError(t, err)
```

同时补充 `database/sql`、`os`、`path/filepath` 和 `pbtests "github.com/pocketbase/pocketbase/tests"` import。PocketBase 已在 Hub 测试二进制注册 `sqlite` 驱动，不重复注册驱动。测试先关闭直接数据库连接，再让独立 PocketBase 测试实例从临时目录打开恢复出的 `data.db`，避免 Windows 文件锁干扰。

- [ ] **Step 2: 运行便携备份与恢复编排测试**

Run: `go test -tags=testing -count=1 -timeout=180s ./internal/hub -run "Test(CreatePortableBackupWrapsPocketBaseAndManifest|PortableBackupUploadAndPreflight|PortableRestoreCreatesSafetyBackupAndTask|PortableRestoreRollbackUsesNativeSafetyArchive)"`

Expected: 创建、上传预检、安全备份、恢复任务、原生回滚包、SQLite `quick_check` 和临时 PocketBase 实例重开全部通过。测试只使用 `t.TempDir()`，不得读取或写入仓库 `pulse_data` 与 FlyNAS 数据。

- [ ] **Step 3: 提交本任务**

```powershell
git add internal/hub/portable_backup_test.go
git commit -m "test: verify portable backup sqlite integrity"
```

### Task 5: 同步版本记录并执行完整回归

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`
- Verify: `docs/current-dev-inventory.md`
- Verify: `docs/flynas-compose-checklist.md`
- Verify: `docs/agent-1.0-install.md`

- [ ] **Step 1: 更新下一版本记录**

在 Agent / 部署小节补充：PocketBase `v0.39.4` 的 SQLite / libc 已恢复官方测试组合，依赖契约和便携备份 `quick_check` 已纳入回归。About 的 Agent / 部署小节使用同一事实口径，不声称已经发布或部署。

- [ ] **Step 2: 格式化 Go 文件**

Run:

```powershell
gofmt -w agent/network_details.go agent/network_details_linux.go agent/network_test.go internal/hub/systems/system.go internal/hub/systems/system_test.go internal/hub/ws/request_manager.go internal/hub/ws/request_manager_test.go internal/hub/portable_backup_test.go internal/tests/pocketbase_dependency_contract_test.go
```

Expected: 命令成功，`git diff --check` 无空白错误。

- [ ] **Step 3: 运行完整 Go 验证**

```powershell
go vet -tags=testing ./...
go test -tags=testing -count=1 -timeout=300s ./...
```

Expected: 全部通过。

- [ ] **Step 4: 运行前端与 Android 验证**

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run test
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
internal/site/android/gradlew.bat -p internal/site/android testDebugUnitTest --console=plain
```

Expected: Biome、前端测试、TypeScript、Vite 构建和 Android 单元测试全部通过。

- [ ] **Step 5: 运行版本与工作区检查**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6
git diff --check
git status --short
```

Expected: 版本源一致、无空白错误；状态只包含本计划明确修改及进入本轮前已存在的文档改动，不包含构建产物或敏感文件。

- [ ] **Step 6: 提交记录与验证收口**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record agent and sqlite stability fixes"
```

本任务完成后不发布、不改 FlyNAS 容器。下一统一版本发布时再执行停写备份、同版本 Hub / Agent / Web / Android 构建和真实运行态验收。
