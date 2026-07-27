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

2026-07-25 首次执行 `npm audit --json` 共报告 4 项。2026-07-26 完成依赖链复核后，仅更新锁文件中的安全补丁版本，没有跨主版本升级或修改业务代码。

| 包 | 原版本 | 修复版本 | 来源与处理结论 |
| --- | --- | --- | --- |
| `tar` | `7.5.16` | `7.5.22` | `@capacitor/cli` 的开发依赖，升级到已修复全部已知公告的补丁版本 |
| `brace-expansion` | `5.0.6` | `5.0.8` | `@capacitor/cli -> rimraf -> glob -> minimatch` 的开发依赖，升级到安全补丁版本 |
| `postcss` | `8.5.15` | `8.5.23` | Vite 的开发依赖，连同其 `nanoid` 锁定版本升级并复验 Web 构建 |
| `valibot` | `1.4.1` | `1.4.2` | 直接运行依赖，升级到修复 `record()` 与 `flatten()` 公告的补丁版本 |

升级后重新执行 `npm audit --json`，结果为 0 项漏洞；该项外部 beta 发布门禁已收口。后续仍需在每次公开发布前重新执行依赖审计，不能把本次结果视为永久豁免。

## Go 依赖与工具链漏洞评估

2026-07-26 首次公开仓库 Actions 暴露两类 `govulncheck` 调用链风险：`golang.org/x/text v0.38.0` 命中 `GO-2026-5970`，本地与 CI 使用的 Go `1.26.4` 命中标准库 `GO-2026-5856`。本轮将模块最低 Go 版本和公开 CI 统一固定为 `1.26.5`，并将 `golang.org/x/text` 升级到 `v0.40.0`；`golang.org/x/sync` 按模块约束同步升级到 `v0.22.0`。

Quality 工作流同时修复干净检出的构建前置：Go vet / test 前先生成 `internal/site/dist`，Web typecheck 前先编译 Lingui 语言包。Linux runner 进一步暴露的时区相关前端断言、GPU 收集器旧预期、AlertManager 测试定时器泄漏和 Agent 接入测试连接循环泄漏也已按根因收口；全仓 Go 测试保留 10 分钟硬上限。公开发布工作流契约会检查生成顺序、测试上限及三个工作流的 Go 安全补丁版本，避免本地已有生成物或不同运行环境再次掩盖远端失败。

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

- 净化分支是公开分发阶段的唯一输入。2026-07-26 已创建公共仓库 `https://github.com/GuteNachte/pulse`，将净化分支与 `main` 推送到同一已审计提交，并把 `main` 设置为默认分支；尚未推送 GHCR、Release 或 Pages。

## 剩余风险

- 公开 GitHub 仓库身份已确认为 `GuteNachte/pulse`，后续 GHCR owner 使用小写 `gutenachte`；当前尚未发布任何 GHCR 包，`registry.example.com` 仍只是不可部署的保留示例，不能作为正式镜像地址。
- 前端依赖已完成安全补丁升级，本次 `npm audit --json` 为 0 项漏洞；Go 工具链与调用链依赖已升级到已修复版本。后续公开发布仍需重新执行 `npm audit`、`govulncheck` 并复验干净检出构建链路。
- 历史重写已改变提交哈希；后续若发布该分支，旧克隆不能直接续接旧历史，应按公开仓库重新克隆。
- 本报告不是法律意见，也不替代第三方依赖许可证和运行环境安全审查。
