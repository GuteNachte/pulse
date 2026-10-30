# 依赖与许可证核对清单

更新时间：2026-09-01

## 当前范围

- Web：`internal/site/package.json`、`internal/site/package-lock.json`
- Hub / Agent：`go.mod`、`go.sum`
- 随安装包提供的采集组件：`supplemental/licenses/LibreHardwareMonitor`、`supplemental/licenses/smartmontools`
- 基础运行时：PocketBase `v0.39.4`、PocketBase JS SDK `0.27.0`

## 本次核对结果

- Web 生产依赖：`npm audit --omit=dev` 返回 0 个漏洞；生产依赖 242 个。
- Go 模块完整性：使用临时用户缓存执行 `go mod verify`，全部模块校验通过。
- Go 可升级项：`go list -m -u all` 能看到多个上游新版本，但这只表示存在更新，不代表可以直接升级。PocketBase、`modernc.org/sqlite` / `modernc.org/libc` 以及 Agent 采集链路必须按独立设计、完整测试和回退方案处理。
- 许可证文件：LibreHardwareMonitor 和 smartmontools 的随包许可证文件已纳入仓库；新增随包组件前必须补齐对应许可证和来源记录。
- `govulncheck@v1.7.0` 已安装到项目目录外并完成扫描。发现 2 个实际命中：`golang.org/x/image v0.43.0` 的 VP8L 解码内存分配问题（修复版 `v0.45.0`，命中资产图片解码路径）；`golang.org/x/text v0.38.0` 的非法输入死循环问题（修复版 `v0.39.0`，命中 PocketBase 启动调用路径）。另有 3 个仅存在于依赖图、当前代码未命中的漏洞。

## 依赖选择规则

新增或升级依赖前，必须记录：

1. 为什么需要，能否复用现有能力。
2. 官方来源、维护状态和当前版本。
3. 许可证是否允许当前使用和随包分发。
4. 已知漏洞、受影响代码路径和修复版本。
5. 体积、CPU、内存、启动时间和升级 / 回退影响。
6. 测试范围、备份要求和失败停止条件。

## 固定检查步骤

### 每月一次和发布前

```powershell
npm.cmd --prefix internal/site audit --omit=dev
$env:GOMODCACHE = Join-Path $env:TEMP 'pulse-go-modcache'
$env:GOPATH = Join-Path $env:TEMP 'pulse-go-path'
go mod verify
go list -m -u all
```

如果已安装 `govulncheck`，再执行：

```powershell
govulncheck ./...
```

### 依赖变更前

- 先更新本清单和待办，说明必要性、替代方案和影响。
- 需要安装扫描工具、下载漏洞数据库或升级依赖时，先向用户说明并取得确认。
- 不把工具、缓存、报告或真实凭据写入项目目录。
- 变更后运行对应 Go / Web 测试、正式构建和浏览器实查；涉及 PocketBase、Agent 或发布链路时增加备份与回退验证。

## 当前剩余事项

- 评估并修复 `golang.org/x/image` 与 `golang.org/x/text` 的 2 个实际命中漏洞；升级前需单独设计、备份、回归和用户确认。
- 对随包采集组件继续保留来源、版本、许可证、哈希和卸载清单；不得把许可证不明或维护停滞的组件默认打进 Windows Agent。
