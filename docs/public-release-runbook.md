# Pulse 公开预发布运行手册

## 当前边界

公开首发版本固定为 `1.0.6-beta.1`。本手册只准备和验证发布链路；在白老板明确授权前，不得执行 `gh repo create`、修改仓库公开可见性、向公开 remote 执行 `git push`、执行 `docker push`、运行 `gh release create`，也不得创建 GitHub Secrets、Environment、Issue、Discussion 或 Pages。

仓库外的安全镜像、历史改写映射和两份净化克隆必须继续保留。公开发布失败、撤回或重做时，不删除这些本地保护材料。

## 双重发布门禁

`.github/workflows/public-release.yml` 支持两种入口：

- `workflow_dispatch`：`publish` 默认是 `false`，默认只验证、构建并生成离线发布包，不执行外部发布。
- `v*.*.*-*.*` 预发布 tag：只有 tag 与 `internal/site/package.json` 完全一致时才可进入发布候选。

即使 tag 正确，发布 job 仍要求：

1. 仓库变量 `PUBLIC_RELEASE_ENABLED` 明确设置为 `true`。
2. GitHub Environment `public-release` 已创建，并配置白老板认可的 Required reviewers。
3. 验证 job 已通过仓库审计、`Status: ready` 报告、版本一致性、Go / Web 测试、Windows Agent、Android APK 和公开包校验。

未同时满足这些条件时，工作流不会获得 `contents: write` 或 `packages: write` 权限。

## 首次公开前配置

这些操作都属于外部状态变更，必须在单独的最终授权后执行：

1. 安装并登录 GitHub CLI，确认目标账号与组织。
2. 创建 GitHub 仓库并确认最终 slug、默认分支和可见性。
3. 开启 Private Vulnerability Reporting、Issues 与 Discussions；Pages 暂不启用，除非另行确认。
4. 创建 `public-release` Environment，设置 Required reviewers，禁止管理员绕过审批。
5. 创建仓库变量 `PUBLIC_RELEASE_ENABLED=true`。这不是 Secret；工作流使用 GitHub 自动提供的 `GITHUB_TOKEN`，首发不需要额外 PAT。
6. 确认 GHCR 包名为当前仓库 owner 下的 `pulse-hub` 和 `pulse-agent`，并在首次推送后检查包可见性。

## 本地无发布验证

```powershell
pwsh -NoProfile -File supplemental/scripts/check-version-consistency.ps1 -Version 1.0.6-beta.1
pwsh -NoProfile -File supplemental/scripts/test-package-public-release.ps1
pwsh -NoProfile -File supplemental/scripts/test-public-release-workflow.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
```

有真实 Windows Agent 与 Android APK 后，可生成本地公开包：

```powershell
pwsh -NoProfile -File supplemental/scripts/package-public-release.ps1 `
  -Version 1.0.6-beta.1 `
  -HubImage ghcr.io/OWNER/pulse-hub:1.0.6-beta.1 `
  -AgentImage ghcr.io/OWNER/pulse-agent:1.0.6-beta.1 `
  -OutputDirectory build/public-release/1.0.6-beta.1
```

`OWNER` 必须在绑定仓库身份后替换为小写 GitHub owner。离线包包含 Windows Agent、Android APK、两份公开 Compose、许可证、第三方声明、`release-manifest.json` 和 `SHA256SUMS`。

## 正式发布顺序

1. 再次确认安全审计、许可证、版本和发布包全部通过。
2. 确认工作树干净，待发布提交就是授权摘要中的 commit。
3. 在 GitHub 上先以 `workflow_dispatch` 且 `publish=false` 跑一遍默认只验证流程。
4. 获得明确授权后创建精确 tag `v1.0.6-beta.1` 并推送。
5. 在 `public-release` Environment 审批页核对版本、commit、GHCR 镜像名和附件，再批准发布 job。
6. 发布后核对两个 GHCR 镜像、GitHub prerelease、附件 SHA256、公开 Compose 和全新环境部署。

## 回滚与撤回

如果预发布错误但尚未批准 Environment，直接拒绝或取消 job，不会产生公开镜像和 Release。

如果已经发布：

```powershell
gh release delete v1.0.6-beta.1 --yes
git push PUBLIC_REMOTE :refs/tags/v1.0.6-beta.1
```

随后在 GitHub Packages 页面删除或改为私有对应 GHCR 版本，立刻把 `PUBLIC_RELEASE_ENABLED` 改为 `false`，并保留事故记录。已经被第三方拉取或复制的公开代码和镜像无法真正收回，因此“改回私有”不是完整回滚，发布前审计和人工审批不能省略。

## 费用与风险

GitHub 公共仓库、公开 Releases 和公开 GHCR 包通常不直接收费，公共仓库的 GitHub Actions 也通常有较宽松政策；实际额度、保留期和计费规则可能调整，正式创建仓库时必须以目标账号当日显示的 GitHub 计划为准。风险主要是公开内容不可逆传播、Actions 或存储额度变化、Actions 供应链，以及错误 tag 触发候选发布。双重门禁、最小权限、所有 `uses:` 固定到已核验提交、固定 Gitleaks 校验和本地安全镜像用于降低这些风险。
