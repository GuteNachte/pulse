# 发布流程

本文描述 Pulse 从「开发完成」到「用户可用」的完整发布流程。整条链由发布向导 `supplemental/scripts/release.ps1` 编排，复用既有的构建、校验与审计脚本。

## 前置要求

| 项目 | 说明 |
| --- | --- |
| 分支 | 必须在 `main`，工作树干净 |
| 工具 | pwsh 7、Node 22、Go 1.27、Docker（构建镜像）、gh（GitHub CLI，已登录）、gitleaks（泄露审计） |
| Android | 暂停期（`PULSE_RELEASE_ANDROID_PAUSED=1`），发布时自动跳过 APK；恢复开发后需本机签名材料 |
| 版本记录 | **必须手工完成**（见下文「版本记录双写」），向导有门禁强制检查 |

## 一条命令发布

```powershell
# 本地构建与验证（不发布）
pwsh -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/release.ps1 -Version 1.0.9

# 确认无误后正式发布（tag + push + GitHub Release）
pwsh -NoProfile -ExecutionPolicy Bypass -File supplemental/scripts/release.ps1 -Version 1.0.9 -Publish
```

## 向导步骤

| 步骤 | 内容 | 自动化 |
| --- | --- | --- |
| 0 | 前置检查（main、干净工作树、gitleaks、gh 登录） | 自动 |
| 1 | 版本号全仓改写（约 29 个文件）并提交 | 自动 |
| 2 | 本地验证：biome / typecheck / 前端测试 / 前端构建 / go vet / Go 测试（hub 包由 CI 覆盖） | 自动，可 `-SkipVerify` |
| 3 | 公开泄露审计（当前树 + 全历史 + gitleaks） | 自动，可 `-SkipAudit` |
| 4 | 构建 Windows Agent exe | 自动 |
| 5 | 构建 Linux Agent 镜像（amd64+arm64）并推 GHCR | 自动 |
| 6 | 构建 Hub 镜像并推 GHCR（内嵌 Windows exe） | 自动 |
| 7 | 发布产物验证（版本一致性 / sha256 / 镜像 manifest） | 自动 |
| 8 | 同步 agent_releases 到本机 Hub（受控升级数据源） | 自动，失败不阻塞 |
| 9 | 生成公开离线包（exe + compose + SHA256SUMS） | 自动，可 `-SkipOfflinePackage` |
| 9b | Windows Inno Setup 安装包（检测到 ISCC 才构建） | 自动，可 `-SkipInstaller` |
| 10 | **版本记录双写门禁**：release-history.json 版本必须一致 | 门禁，内容手工 |
| 11 | 发布：`git tag` → push github → `gh release create`（上传 exe / 离线包 / 安装包）→ push origin | 仅 `-Publish` |

## 版本记录双写（唯一手工环节）

向导无法替你写内容，步骤 10 会强制检查。发布前必须：

1. 在 `docs/release-notes-next.md` 追加本次「版本发布」条目（过程记录）。
2. 把上一版本条目从 `internal/site/src/components/routes/settings/release-history.json` 移入 `release-history-archive.json`。
3. 在 `release-history.json` 写入新版本记录，按四端分节：Web / Hub、Agent / 部署、移动端 / Android、文档 / 规则。没有功能改动的端也要写明「随版本同步」。

## 发布产物

| 产物 | 位置 | 用途 |
| --- | --- | --- |
| Hub / Agent 镜像 | `ghcr.io/gutenachte/pulse-hub|pulse-agent:<版本>`（另有 `latest`） | `docker compose pull` 直接部署 |
| Agent 镜像变体 | `:alpine`（精简）、`:intel`（核显）、`:nvidia`（CUDA） | 按宿主硬件选择 |
| Windows Agent exe | Release 附件 + Hub 内置版本仓库 | Hub 页面发起受控升级 |
| 公开离线包 | Release 附件（compose + exe + SHA256SUMS） | 离线 / 无 Docker 环境部署 |
| Windows 安装包 | Release 附件（装了 Inno Setup 时） | 图形化安装 |

镜像自动发布有双保险：向导步骤 5/6 本机构建推送；另外打 `v*` 标签会触发 `.github/workflows/publish-images.yml` 在 CI 重新构建推送。

## 发布后的部署升级

- **Docker 部署实例**：改 compose 里的版本号 → `docker compose pull && docker compose up -d`。
- **已接入的 Agent**：Hub 页面「设置 → Agent 管理」对每台机器点更新（受控升级，无需登录目标机器）。
- **Windows Agent**：Release 附件里的 exe 也可手动替换服务目录（升级前备份）。

## 演练

第一次使用或验证链路时，不带 `-Publish` 跑一遍即可：全部本地步骤真实执行，但不打标签、不推送、不创建 Release。

## 安全边界

- 步骤 3 的公开泄露审计**不可跳过**（除非明确 `-SkipAudit` 并自查）：当前树 + 全历史中的私有端点、操作者公网 IP、凭据形态内容都会被拦截，规则见 `supplemental/scripts/public-audit-rules.json`。
- 发布动作（tag / push / Release）只在显式传入 `-Publish` 时执行。
