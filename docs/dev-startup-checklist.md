# 开发前必读清单

> 这是本项目每次开发前的固定校准清单。先读这些，再动代码、跑测试或改 UI。

## 1. 先读全局记忆

```powershell
Get-Content C:\Users\Nacht\.codex\AGENTS.md -Raw -Encoding UTF8
Get-Content C:\Users\Nacht\.codex\memories\memory_summary.md -Raw -Encoding UTF8
Get-Content C:\Users\Nacht\.codex\memories\MEMORY.md -Raw -Encoding UTF8
```

需要更深上下文时，再读：

```powershell
Get-Content C:\Users\Nacht\.codex\memories\raw_memories.md -Raw -Encoding UTF8
Get-ChildItem C:\Users\Nacht\.codex\memories\extensions\ad_hoc\notes
```

## 2. 再读项目上下文

```powershell
Get-Content AGENTS.md -Raw -Encoding UTF8
Get-Content docs\local-dev-runbook.md -Raw -Encoding UTF8
Get-Content docs\release-notes-next.md -Raw -Encoding UTF8
```

按任务加读：

- 部署 / 镜像 / FlyNAS / Harbor：`docs\flynas-compose-checklist.md`、`docs\agent-1.0-install.md`、`docs\current-dev-inventory.md`
- Agent 能力 / 采集 / 操作边界：`docs\agent-capability-boundary.md`、`docs\pulse-roadmap.md`
- UI 精修 / 组件替换：先读相关页面代码，再按项目设计语言和成熟组件优先原则执行
- Windows Agent 需要重新生成内置 `smartctl.exe` 时，先确认本地已有 `agent\smartmontools\smartctl.exe`；如果没有，需要显式提供 `PULSE_SMARTCTL_URL`，不要在代码里硬编码外部旧域名。

## 3. 开发环境固定规则

- 本地源码预览：`powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-dev.ps1`
- 强制重启本地开发服务：`powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-dev.ps1 -Restart`
- Hub 入口固定：`http://localhost:8090`
- Agent 可达地址必须使用真实局域网 IP：`AGENT_HUB_URL`
- 本地 Docker 只用于发布前等价测试，不作为默认开发方式

## 4. 每次开发结束必须做

- 跑与改动匹配的最小验证。
- 用浏览器检查用户能看到的页面变化。
- 把改动追加到 `docs\release-notes-next.md`；已经发布的版本说明不再回填新开发改动。
- 同步更新设置页“关于”里的下一版本开发记录，按 Web / Hub、移动端 / Android、Agent / 部署等端口分开记录。
- 如果这次是版本更新或发布收敛，同时更新正式发布说明和设置页“关于”里的版本更新记录，写清楚该版本详细更新了什么、修改了什么；Web、Hub、Agent、Android App 必须保持同一个显式版本号，即使某个端本次没有功能改动也要跟随升版。
- 最终回复里说明：
  - 已完成什么
  - 改了哪些文件
  - 怎么验证
  - 下次可以复用什么


