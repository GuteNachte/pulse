# Pulse Public Readiness Report

审计日期：2026-07-25

**Status: ready**

## 审计范围

- 当前 Git 跟踪树：运行数据、数据库、备份、日志、生成凭据、私钥、本地媒体、凭据赋值和私有基础设施端点。
- 当前待发布分支 `HEAD` 的完整 Git 历史：Gitleaks 默认规则，以及仓库规则中登记的私有基础设施端点；共享仓库中的其他私有分支不属于本次发布输入。
- 法律与政策：上游 MIT 版权、Pulse 修改署名、Homelable 第三方声明、安全报告入口和公开测试隐私边界。
- 自动化：最小权限 GitHub Actions、完整历史检出、固定扫描器版本与校验和、失败时仅上传脱敏报告。

## 执行命令与工具

```powershell
pwsh -NoProfile -File supplemental/scripts/test-public-repository-audit.ps1
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1 -SkipHistoryScan
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
gitleaks version
```

- Gitleaks：`8.30.1`
- CI 下载校验：Linux x64 官方发布压缩包 SHA256 已固定在 `.github/workflows/public-readiness.yml`。
- 审计输出：`.public-audit/findings.json` 和脱敏的 `.public-audit/gitleaks-history.json`，均不提交仓库。

## 当前结果

- 当前树扫描通过：33 个源码、测试、安装模板、发布脚本和历史文档中的私人基础设施地址已替换为保留示例；内部镜像目标仍可通过发布脚本参数显式传入。
- Gitleaks 对 `HEAD` 可达历史的扫描通过：扫描器未报告密钥类命中。
- 两类已登记私有基础设施端点的原文和正则转义形式均已从 `HEAD` 可达历史中完成定向替换，精确历史扫描为 0 条发现；业务文件和提交顺序未删除。
- 审计契约覆盖禁止路径、允许占位符、源码端点、正则转义端点、当前分支历史端点、旁支隔离、Gitleaks `HEAD` 参数、扫描器输出隔离和政策文件。

## 前端依赖漏洞评估

2026-07-25 执行 `npm audit --json` 共报告 4 项，并确认均有可用修复版本；本轮未运行 `npm audit fix`，避免在公开发布收口阶段引入未经单独评审的依赖变化。

| 包 | 严重度 | 来源与当前暴露面 | 处理结论 |
| --- | --- | --- | --- |
| `tar@7.5.16` | critical | `@capacitor/cli` 的开发依赖，只在受控 Android 构建输入中处理归档，不进入 Hub / Web 运行包 | 外部 beta 发布前单独升级并重跑 Android 全链路；当前本地发布准备接受受限构建期风险 |
| `brace-expansion@5.0.6` | high | `@capacitor/cli -> rimraf -> glob -> minimatch` 的开发依赖，不进入运行包 | 与 Capacitor 工具链一并升级并复验 |
| `postcss@8.5.15` | high | Vite 的开发依赖；公开工作流只构建受审计仓库，不加载用户提供的 source map | 升级 Vite 锁定依赖并重跑 Web 构建 |
| `valibot@1.4.1` | moderate | 直接运行依赖；项目仅使用 `object`、`parse`、`safeParse` 与字符串校验，未使用公告涉及的 `record()` + `flatten()` 组合 | 当前代码路径不可触发；外部 beta 发布前升级补丁版本并回归登录与通知表单 |

这 4 项不改变源码与历史敏感信息审计的 `ready` 结论，但属于外部 beta 发布前必须重新确认的依赖门禁；若届时仍未升级，必须由维护者显式接受并写入发布说明。

## 许可证与隐私检查

- `LICENSE` 保留 `Copyright (c) 2024 henrygd`，并单独声明 `Copyright (c) 2026 Pulse contributors`。
- `THIRD_PARTY_NOTICES.md` 保留 Homelable 来源、版本、提交、改编范围和 MIT 许可全文，并说明与仓库主许可证的关系。
- `SECURITY.md` 使用 GitHub Private Vulnerability Reporting，不公开未确认的个人邮箱。
- `docs/public-security-and-privacy.md` 说明 `pulse_data` 本地数据、默认无遥测、用户主动外连和公开演示脱敏边界。

## 历史净化记录

- 改写前已在仓库外创建安全镜像，并保存改写前引用、受影响提交清单和完整 `git-filter-repo` commit map。
- 改写基线 HEAD：`419ed6ba1d0693489b9524dde5eba875d2956724` -> `79fc50201276e8746ebbef2f90560ab8bf41f6cd`。
- 第一轮实际文件内容受替换的 6 个提交映射如下；其余后代提交仅因父提交变化而产生新的哈希。

| 改写前 | 改写后 |
| --- | --- |
| `419ed6ba1d0693489b9524dde5eba875d2956724` | `79fc50201276e8746ebbef2f90560ab8bf41f6cd` |
| `5d10960eeb86af1bacef4ab83b74eeaf5433d0e9` | `d191416720709ae0eb09abc340946b8392d21fc6` |
| `8644ea3d3acdb6f37f13fe9d5b38231126563bc2` | `6dbf59de88be76655672176de95aefa82d6d7aa9` |
| `a583ffe5907c2f64b543b2cf4953060a9745dcf0` | `c91ce79ef47da9be297503c98974580ca2ae2c75` |
| `b7adf93bf679b3211bbf56043eb51a9555aebaff` | `f945fd5f6bb61735716b5219d143a89f7c7ce15c` |
| `c31c40bf27e145f1672415291da24ad20a36a89e` | `cda198382820e26305bbe9ec468f38e2c5885e2d` |

- 第二轮补充识别正则转义形式，并在独立安全镜像保护下完成净化；实际内容变化点及映射如下。

| 第二轮改写前 | 第二轮改写后 |
| --- | --- |
| `51ae04e57b26d7d8c8a9bf9ade884066a90f356e` | `06626a844cf9f655ffe21875a23ad4ab8195adf6` |
| `6dbf59de88be76655672176de95aefa82d6d7aa9` | `459cbabd5791baf742e63757a3f77c40c14894d2` |

- 净化分支是后续公开分发阶段的唯一输入；本次未创建公开仓库，也未推送 GHCR、Release 或 Pages。

## 剩余风险

- 公开 GitHub 仓库身份和 GHCR owner 尚未确认，因此 `registry.example.com` 只是不可部署的保留示例，不能作为正式镜像地址。
- `npm audit` 的 4 个依赖漏洞已完成调用路径与暴露面评估；当前均有修复版本，外部 beta 发布前仍应优先升级并复验，不能直接运行破坏性自动修复。
- 历史重写已改变提交哈希；后续若发布该分支，旧克隆不能直接续接旧历史，应按公开仓库重新克隆。
- 本报告不是法律意见，也不替代第三方依赖许可证和运行环境安全审查。
