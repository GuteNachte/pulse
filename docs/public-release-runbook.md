# Pulse 公开预发布运行手册

## 当前边界

公开首发版本 `1.0.6-beta.1` 已于 2026-07-27 完成发布；`1.0.6-beta.2` 当前仅完成源码、固定 Android Release 身份和本地候选产物准备，尚未创建 tag、Release、公开镜像或 FlyNAS 部署。本手册继续作为后续公开预发布的执行基线；每次产生新 tag、镜像或 Release 前仍需获得白老板明确授权。后续涉及 `gh repo create`、向公开 remote 执行 `git push`、执行 `docker push` 或 `gh release create` 时同样不得复用本次授权。Pages 暂不启用。

仓库外的安全镜像、历史改写映射和两份净化克隆必须继续保留。公开发布失败、撤回或重做时，不删除这些本地保护材料。

## 双重发布门禁

`.github/workflows/public-release.yml` 支持两种入口：

- `workflow_dispatch`：`publish` 默认是 `false`，默认执行无密钥仓库审计、版本 / Go / Web / Windows Agent 契约和 Android Debug 编译检查；不会读取 Release 密钥、不会生成已签名公开包，也不会执行外部发布。
- `v*.*.*-*.*` 预发布 tag：只有 tag 与 `internal/site/package.json` 完全一致时才可进入发布候选。

即使 tag 正确，发布 job 仍要求：

- 仓库 Ruleset 对 `v*` tag 禁止更新和删除；工作流还会在审批后、镜像推送前和 GitHub Release 创建前三次核对远端 tag 与已验证提交 SHA。
- 当前 Android `versionCode` 必须大于所有历史发布 tag 的最大值；`1.0.6-beta.1` 的迁移基线按 `10006` 处理。

1. 仓库变量 `PUBLIC_RELEASE_ENABLED` 明确设置为 `true`。
2. GitHub Environment `public-release` 已创建，并配置白老板认可的 Required reviewers。
3. `public-release` 已配置四个 Android 签名 Secret，名称和固定证书指纹通过发布前核对。
4. 验证 job 已通过仓库审计、`Status: ready` 报告、版本一致性、Go / Web 测试、Windows Agent、Android 无密钥契约和公开包校验。

未同时满足这些条件时，工作流不会获得 `contents: write` 或 `packages: write` 权限。

## 首次公开配置（1.0.6-beta.1 已完成）

以下配置已在单独授权后完成；后续若更换仓库、owner 或发布环境，必须重新逐项核对：

1. 安装并登录 GitHub CLI，确认目标账号与组织。
2. 创建 GitHub 仓库并确认最终 slug、默认分支和可见性。
3. 开启 Private Vulnerability Reporting、Issues 与 Discussions；Pages 暂不启用，除非另行确认。
4. 创建 `public-release` Environment，设置 Required reviewers，禁止管理员绕过审批。
5. 创建仓库变量 `PUBLIC_RELEASE_ENABLED=true`。这不是 Secret；工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，首发不需要额外 PAT。
6. 确认 GHCR 包名为当前仓库 owner 下的 `pulse-hub` 和 `pulse-agent`，并在首次推送后检查包可见性。

### Android Release 身份

公开仓库只保存证书 SHA-256 `BF114B3A8EA33125893B5B1E6865B43BFE8DAC89E1BE154F7E48A91D93D51374`，不保存 PKCS12 或口令。`public-release` Environment 必须配置：

```text
ANDROID_RELEASE_KEYSTORE_BASE64
ANDROID_RELEASE_STORE_PASSWORD
ANDROID_RELEASE_KEY_ALIAS
ANDROID_RELEASE_KEY_PASSWORD
```

验证 job 不读取这些 Secret；只有通过人工审批的 publish job 才把签名材料写入 runner 临时目录，构建并复核 Release APK，最后在 `if: always()` 清理。Secret 配置后只核对名称和更新时间，不读取或输出值。任何指纹不一致都必须停止发布，不能更换密钥或修改固定指纹绕过。

## 本地无发布验证

```powershell
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.2
pwsh -NoProfile -File supplemental/scripts/test-android-signing-helpers.ps1
pwsh -NoProfile -File supplemental/scripts/test-build-android-release.ps1
pwsh -NoProfile -File supplemental/scripts/test-package-public-release.ps1
pwsh -NoProfile -File supplemental/scripts/test-public-release-workflow.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
```

有真实 Windows Agent 与 Android APK 后，可生成本地公开包：

```powershell
pwsh -NoProfile -File supplemental/scripts/package-public-release.ps1 `
  -Version 1.0.6-beta.2 `
  -HubImage ghcr.io/OWNER/pulse-hub:1.0.6-beta.2 `
  -AgentImage ghcr.io/OWNER/pulse-agent:1.0.6-beta.2 `
  -OutputDirectory build/public-release/1.0.6-beta.2
```

`OWNER` 必须在绑定仓库身份后替换为小写 GitHub owner。离线包包含 Windows Agent、Android APK、两份公开 Compose、许可证、第三方声明、`release-manifest.json` 和 `SHA256SUMS`。

## 正式发布顺序

1. 再次确认安全审计、许可证、版本和发布包全部通过。
2. 确认工作树干净，待发布提交就是授权摘要中的 commit。
3. 在 GitHub 上先以 `workflow_dispatch` 且 `publish=false` 跑一遍默认只验证流程。
4. 获得明确授权后创建精确 tag `v1.0.6-beta.2` 并推送。
5. 在 `public-release` Environment 审批页核对版本、commit、GHCR 镜像名和附件，再批准发布 job。
6. 发布后核对两个 GHCR 镜像、GitHub prerelease、附件 SHA256、公开 Compose 和全新环境部署。

## 首次发布执行记录

- 发布提交与 tag：`277dc15015cd430f22e3b672a4488f19ba13f3bc` / `v1.0.6-beta.1`；发布时准备分支、`main` 和 tag 指向同一提交。
- 只验证演练：[Run 30270799478](https://github.com/GuteNachte/pulse/actions/runs/30270799478)，以 `workflow_dispatch`、`publish=false` 执行并成功。
- 正式发布：[Run 30271683147](https://github.com/GuteNachte/pulse/actions/runs/30271683147)，Validate 与经过 `public-release` Environment 人工审批的 Publish job 均成功。
- GitHub prerelease：[v1.0.6-beta.1](https://github.com/GuteNachte/pulse/releases/tag/v1.0.6-beta.1)，包含 8 个附件；重新下载后 `SHA256SUMS` 中 7 个受校验文件全部匹配。
- 公开 Hub 镜像：`ghcr.io/gutenachte/pulse-hub:1.0.6-beta.1`，digest `sha256:0311e01b1c64f96eeaa2ba9b31b036095dcef0911ffef71f8e624dfb0d390fe3`。
- 公开 Agent 镜像：`ghcr.io/gutenachte/pulse-agent:1.0.6-beta.1`，digest `sha256:b45773f36fd5fc8db85973056848dfe3fb841729fdae91fb9505b44a9e70cc3a`。
- 两个 GHCR manifest 均已使用匿名 token 验证可读取，普通用户不需要登录即可拉取；本次未启用 Pages，也未部署 FlyNAS。
- 普通用户视角的公开附件、Windows Agent、Android APK、Compose、GHCR 拉取和隔离 Hub 运行态验收见 `docs/public-installation-acceptance.md`；Android / Windows 签名与未执行的真机、服务安装和独立 Linux 主机项均在该文档中明确保留为限制。

## 首次发布故障复盘

1. 就绪报告状态是精确契约：必须保留独立纯文本行 `Status: ready`，不能添加 Markdown 加粗等装饰；本地工作流契约必须读取真实报告文件验证。
2. Linux runner 不能直接运行 Windows `.exe`：同平台产物运行 `--version`，跨平台 Go 产物使用 `go version -m` 核对 `GOOS`、`GOARCH` 和版本 ldflags；PowerShell 调用每个原生子进程后都要立即检查 `$LASTEXITCODE`。
3. 构建脚本不得临时改变 Git 跟踪模式：Linux 需要执行的 Gradle Wrapper 应在索引中固定为 `100755`，发布工作流契约同步锁定该模式，构建后继续检查工作树干净。
4. 测试命令桩不能边写边执行：先在临时文件完整写入、关闭并授权，再原子重命名到最终路径，避免 Linux 临时文件系统出现 `text file busy`。
5. Windows Docker CLI 的 `docker manifest inspect` 可能因 GHCR token 端点 EOF 误报镜像不存在；验证器先保留该检查，失败后回退到 `docker buildx imagetools inspect`，两者都失败才判定镜像不可用。

## 回滚与撤回

如果预发布错误但尚未批准 Environment，直接拒绝或取消 job，不会产生公开镜像和 Release。

如果已经发布：

```powershell
gh release delete v1.0.6-beta.1 --yes
git push PUBLIC_REMOTE :refs/tags/v1.0.6-beta.1
```

随后在 GitHub Packages 页面删除或改为私有对应 GHCR 版本，立刻把 `PUBLIC_RELEASE_ENABLED` 改为 `false`，并保留事故记录。已经被第三方拉取或复制的公开代码和镜像无法真正收回，因此“改回私有”不是完整回滚，发布前审计和人工审批不能省略。

## 私有 Git 镜像

私有 Gitea 只同步公开 Git 仓库的分支和 tag，不复制 GitHub Secrets、Actions Environment、Issues、Discussions、Releases、Pages 或 Packages。先在净化仓库配置两个 remote：

```powershell
git remote add public https://github.com/OWNER/REPOSITORY.git
git remote add private-mirror https://GITEA_HOST/OWNER/REPOSITORY.git
```

默认命令只 fetch 公开源并显示精确 ref 与 `git push --dry-run --porcelain` 结果：

```powershell
pwsh -NoProfile -File supplemental/scripts/sync-private-mirror.ps1 `
  -SourceRemote public `
  -MirrorRemote private-mirror
```

检查清单后才允许应用，并且确认值必须与 `git remote get-url private-mirror` 完全一致：

```powershell
pwsh -NoProfile -File supplemental/scripts/sync-private-mirror.ps1 `
  -SourceRemote public `
  -MirrorRemote private-mirror `
  -Apply `
  -ConfirmMirrorUrl https://GITEA_HOST/OWNER/REPOSITORY.git
```

工具要求工作树干净且 `docs/public-readiness-report.md` 为 `Status: ready`。同步使用 `--prune`，因此私有镜像里独有、但公开源已经删除的分支或 tag 也会被删除；私有开发分支应放在另一个仓库或使用不参与镜像的独立命名空间。

## 费用与风险

GitHub 公共仓库、公开 Releases 和公开 GHCR 包通常不直接收费，公共仓库的 GitHub Actions 也通常有较宽松政策；实际额度、保留期和计费规则可能调整，正式创建仓库时必须以目标账号当日显示的 GitHub 计划为准。风险主要是公开内容不可逆传播、Actions 或存储额度变化、Actions 供应链，以及错误 tag 触发候选发布。双重门禁、最小权限、所有 `uses:` 固定到已核验提交、固定 Gitleaks 校验和本地安全镜像用于降低这些风险。
