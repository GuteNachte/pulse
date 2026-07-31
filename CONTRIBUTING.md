# 参与 Pulse 开发

感谢你愿意改进 Pulse。提交代码前，请先在 Issue 或 Discussion 中确认问题边界；小型缺陷、文档修正和测试补充可以直接提交 Pull Request，大型功能应先说明使用场景、模块归属和兼容性影响。

参与即表示你同意遵守 [行为准则](CODE_OF_CONDUCT.md)。使用帮助请走 [Discussions](https://github.com/GuteNachte/pulse/discussions)，安全问题必须通过 [Private Vulnerability Reporting](https://github.com/GuteNachte/pulse/security/advisories/new) 私密提交。

## 开发环境

基础要求：Git、Go、Node.js、npm；Android 改动还需要 JDK 与 Android SDK。请使用 Fork 或独立分支，不要直接在 `main` 上开发。

Windows：

```powershell
git clone https://github.com/GuteNachte/pulse.git
Set-Location pulse
npm.cmd --prefix internal/site ci
.\Start-Pulse-Dev.cmd
```

Linux / macOS：

```bash
git clone https://github.com/GuteNachte/pulse.git
cd pulse
npm --prefix internal/site ci
npm --prefix internal/site run dev
```

本地源码预览使用 Hub `8090` 和 Vite `5173`。更完整的启动、Hub 构建和 Docker 等价测试见 [docs/local-dev-runbook.md](docs/local-dev-runbook.md)。

## 模块地图

| 范围 | 主要位置 | 责任 |
| --- | --- | --- |
| 资产中心 | `internal/site/src/modules/asset-center/` | 资产档案、参数、图片、接口、关系和迁移 |
| 网络拓扑 | `internal/site/src/modules/network-topology/` | 拓扑领域模型、布局、画布与持久化 |
| 客户端监控 | `internal/site/src/modules/client-monitoring/` | Agent 客户端列表和状态展示 |
| 维护模块 | `internal/site/src/modules/maintenance/` | 备份、升级与维护能力边界 |
| Hub | `internal/hub/` | PocketBase 基座、API、认证、告警、审计和数据服务 |
| Agent | `internal/agent/` | 系统、硬件、网络、容器、服务和软件采集 |

新增功能应归入明确模块，提供 manifest 与开关语义，并能在设置页观察启用状态。不要为单个页面复制领域逻辑，也不要用前端文案掩盖后端或采集源的错误。

## 修改与测试

先为缺陷或新行为补充最小回归测试，再实现修改。按影响范围运行测试，提交前至少执行：

```powershell
npm.cmd --prefix internal/site run test
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
go test -tags=testing -count=1 -timeout=240s ./...
git diff --check
```

影响公开演示时还要执行：

```powershell
npm.cmd --prefix internal/site run test:demo
npm.cmd --prefix internal/site run build:demo
npx --prefix internal/site playwright test --config=playwright.demo.config.ts
pwsh -NoProfile -File supplemental/scripts/verify-demo-artifacts.ps1
```

不要提交生成目录、本地数据库、备份、日志、`.vercel/`、真实配置或测试凭据。

## 版本记录规则

每次用户可见行为、Hub、Web、Android、Agent、部署或文档口径的变化，都必须同步：

1. 追加 `docs/release-notes-next.md`。
2. 更新 `internal/site/src/components/routes/settings/release-history.ts` 中 About 页记录。
3. 按 Web / Hub、移动端 / Android、Agent / 部署、文档 / 规则分端说明；没有运行时变化也要明确写出。
4. 不修改已发布 tag，不把新改动回填到已经固定的版本记录。

## 隐私与安全检查

提交前确认源码、测试、fixture、截图、日志和 Git 历史中不存在：

- Token、密码、Cookie、私钥或恢复码；
- 真实域名、IP、MAC、邮箱、账号和家庭资产名称；
- 数据库、备份、运行日志、设备图片或 NAS / Registry 地址；
- 可以推断真实家庭拓扑、住址、人员或设备身份的信息。

演示数据必须独立虚构，IPv4 公网示例使用 RFC 5737 文档地址，域名使用 `example.com`，MAC 使用本地管理地址。提交前运行：

```powershell
pwsh -NoProfile -File supplemental/scripts/audit-public-repository.ps1
```

## Pull Request 流程

1. 保持修改聚焦，说明问题、根因、方案和兼容性影响。
2. 列出实际运行的测试及结果，不要只写“已测试”。
3. 说明对公开 Demo、数据格式、部署和升级的影响。
4. 提供必要的回滚办法；涉及 UI 时只上传已经脱敏的截图。
5. 确认发布说明、About、隐私审计和文档已经同步。
6. 等待 CI 与审查通过；合并方式由维护者根据提交历史决定。

贡献代码按仓库 [MIT License](LICENSE) 分发，并保留适用的上游与第三方许可证义务。
