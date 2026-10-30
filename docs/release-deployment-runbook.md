# Pulse 发布、部署与回滚手册

> 目标：确认发布产物、Harbor 镜像、FlyNAS 运行态和回滚路径都能被验证。不要只看构建成功，也不要用 `latest` 判断版本。
>
> 2026-10-24 核实：飞牛上的 Hub 部署（7 月 `1.0.8-beta.6`）已退役，当前飞牛仅运行独立 Agent 容器（1.0.8，`HUB_URL` 指向本机 Hub），全屋四台 Agent 与本机 Hub 均为 1.0.8；FlyNAS 当前实际状态与维护访问方式以 `docs/flynas-compose-checklist.md` 开头为准，本章 FlyNAS 部署流程仅作为将来重新部署 Hub 时的手册保留。

当前实际试用部署：`1.0.8-beta.6` 已于 2026-07-30 部署到 `/vol1/1000/docker/pulse`，Hub 地址为 `http://192.168.1.30:8090`；升级前实际运行的是 `1.0.8-beta.5`。文中的 `1.0.8` 命令仍是下一正式版本示例。

当前 `beta.6` Hub / Agent 镜像在 GHCR 与 Harbor 的摘要分别固定为 `sha256:72e341710c2e4ea17aa8c2ca00eca7fbdb68bec0bae8731407f9504b34f9f755` 和 `sha256:b83a1694fa5a2aed1ddb49228fcb4dba7d4f0220bd1ed5e6a6d3f600b0773afb`。升级前回滚包位于 `/vol1/1000/Pulse/Pulse-Secrets/Deployment-Backups/pre-beta6-20260730-193157`，其 Windows 映射路径为 `Z:\Pulse-Secrets\Deployment-Backups\pre-beta6-20260730-193157`。

## 1. 发布前准备

1. 确认工作区改动已经完成本地验证：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run android:sync
go test -tags=testing -count=1 -timeout=240s ./...
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.8
```

2. 备份当前正式数据。FlyNAS 标准目录：

```bash
cd /vol1/1000/docker/pulse
tar -czf "pulse_data-backup-$(date +%Y%m%d-%H%M%S).tgz" pulse_data
```

首次从其他主机迁入 FlyNAS 时，必须先在源 Hub 创建 `pulse.instance.backup.v1` 完整实例备份，校验外层清单、全部载荷 SHA256 和内部 PocketBase ZIP，并将副本保存到可信 NAS 敏感目录。不要在源 Hub 仍有写入时直接压缩 `data.db`、`-wal` 和 `-shm` 代替一致性备份。

3. 记录当前线上镜像，方便回滚：

```bash
cd /vol1/1000/docker/pulse
docker compose images
docker compose ps
```

## 2. 统一发布

正式发布只走统一入口，同一版本同步构建 Hub、Agent、Web 前端和 Android App：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\publish-release-v1.ps1 -Version 1.0.8
```

正式发布不要使用 `-SkipPush`、`-SkipAgentBuild`、`-SkipLinuxAgentImageBuild` 或 `-SkipAndroidAppBuild`。这些跳过项只允许和 `-DryRun` 一起用于本地演练。

## 3. 发布产物验证

发布完成后先在本机验证产物和远端镜像 tag：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.8
```

如果只想在本地演练、还没有推 Harbor，可临时跳过 registry：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.8 -SkipRegistry
```

如果要验证某个正在运行的 Hub：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.8 -HubUrl http://127.0.0.1:8090
```

验证点：

- Web / Hub / Agent / Android / Compose / 文档版本一致。
- Windows Agent 可执行文件存在，`--version` 返回目标版本。
- Agent manifest 存在，且 Windows Agent SHA256 与实际文件一致。
- Android APK metadata 的 `versionName` 是 `1.0.8`，`versionCode` 是 `10006`。
- Harbor 上 `pulse-hub:1.0.8` 和 `pulse-agent:1.0.8` 可被 `docker manifest inspect` 读取。
- 可选 Hub URL 返回 `/api/health` 正常，`/api/pulse/public-info` 版本为 `1.0.8`。

## 4. Harbor 手动确认

```powershell
docker manifest inspect registry.example.com:443/infra/pulse-hub:1.0.8
docker manifest inspect registry.example.com:443/infra/pulse-agent:1.0.8
```

两条命令都必须成功。任一镜像不存在时，不要部署 FlyNAS。

## 5. FlyNAS 部署

在 FlyNAS 上执行：

```bash
cd /vol1/1000/docker/pulse
docker compose pull
docker compose up -d --force-recreate
docker compose ps
```

升级或迁移已有 Agent 前先确认它的 Compose 项目名：

```bash
docker inspect pulse-agent --format '{{index .Config.Labels "com.docker.compose.project"}}'
```

后续 `stop`、`rm` 或回滚命令必须带同一个 `-p <project>`。旧 FlyNAS Agent 曾使用项目名 `agent`，只按目录默认项目名执行不会命中旧容器。

运行态验证：

```bash
curl http://127.0.0.1:8090/api/health
curl http://127.0.0.1:8090/api/pulse/public-info
docker inspect pulse-hub --format '{{json .Config.Image}} {{json .HostConfig.NetworkMode}}'
docker inspect pulse-agent --format '{{json .Config.Image}} {{json .HostConfig.NetworkMode}}'
docker logs --tail=100 pulse-hub
docker logs --tail=100 pulse-agent
```

预期：

- `/api/health` 返回成功。
- `/api/pulse/public-info` 的 `v` 是 `1.0.8`。
- `pulse-hub` 镜像是 `registry.example.com:443/infra/pulse-hub:1.0.8`。
- `pulse-agent` 镜像是 `registry.example.com:443/infra/pulse-agent:1.0.8`。
- 两个容器都是 `host` 网络。
- 页面 About 显示 Hub / Web / Android / Agent 目标版本为 `1.0.8`。
- Hub 所在机器在线，显示真实机器名并带 `Hub` 标签。

部署后还要从 `systems.info.cap.agent_version`（兼容旧字段 `systems.info.agent_version`）核对每台已接入 Agent 的真实上报版本。只看容器镜像不能证明外部 Windows Agent 已升级；`beta.6` 验收时 FlyNAS 同机 Agent 与 `UM-690` Windows Agent 均已上报 `1.0.8-beta.6`，并继续复用原系统 ID。

如果 Hub 日志出现 `modernc.org/sqlite` 与 PocketBase 预期版本不同的警告，不要在线替换运行容器中的依赖。先记录实际依赖图、核对数据库完整性和业务运行状态，再在下一统一版本中按 PocketBase 测试版本修复并执行 Go、备份和恢复回归；`1.0.8-beta.6` 当前为 SQLite `v1.53.0`，PocketBase `v0.39.4` 预期 `v1.52.0`。

## 5b. 本地部署（开发机容器）升级与回滚

2026-10-01 起本地运行环境为开发机上的 `pulse-hub` 容器（`run-hub-local.ps1 -PublishLan -BackupMount "D:\Pulse-Backups\auto"` 部署，数据目录与开发共用 `pulse_data`，容器时区 `Asia/Shanghai`）。升级与回滚按本章执行；FlyNAS 部分不适用。

### 升级到新版本

1. 确认新版本镜像已发布到 Harbor（第 3、4 章验证过）。
2. 创建升级前备份：设置 -> 备份管理 ->"立即执行一次"，或确认最近一次自动备份存在且恢复演练通过。**没有可恢复的备份不要升级。**
3. 记录当前镜像摘要作为回滚锚点：

```powershell
docker inspect pulse-hub --format '{{index .RepoDigests 0}}'
```

4. 重建容器到新版本（脚本会自动删除并重建 `pulse-hub` 容器，数据目录不变）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-local.ps1 -Image "registry.example.com:443/infra/pulse-hub:<新版本>" -SkipBuild -PublishLan -BackupMount "D:\Pulse-Backups\auto"
```

5. 验证：`/api/health` 200；`/api/pulse/public-info` 版本为新版本；本机 Agent 自动重连（客户端监控页面在线）；设置 -> 关于版本更新；自动备份配置仍在（备份管理页卡片状态正常）。

### 回滚

新版本运行过之后数据库迁移可能已推进，**不能直接把新数据交给旧版二进制**。回滚 = 上一版本镜像 + 升级前备份恢复：

1. 停止并删除当前容器：

```powershell
docker rm -f pulse-hub
```

2. 恢复升级前备份到 `pulse_data`（设置页不可用，手动恢复）：解包备份 zip 取出 `pocketbase.zip`，再取出其中的 `data.db` / `auxiliary.db` 覆盖 `pulse_data` 下同名文件（先备份现有 `pulse_data` 供排查，不删除）。
3. 用上一版本镜像重建：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-local.ps1 -Image "registry.example.com:443/infra/pulse-hub:<上一版本>" -SkipBuild -PublishLan -BackupMount "D:\Pulse-Backups\auto"
```

4. 重新验证第 4 步升级清单的全部项目。

### 源码模式与容器模式切换注意

两种模式共用 `pulse_data`，同一时间只能运行一个：启动源码 Hub 前先 `docker rm -f pulse-hub`，部署容器前确认 8090 未被源码进程占用。切换后检查设置 -> 备份管理的备份目录：容器模式为 `/pulse_backups`（挂载到宿主 `D:\Pulse-Backups\auto`），源码模式为 Windows 路径 `D:\Pulse-Backups\auto`，不符时在设置页改回。

### PocketBase 升级专项

遵循 `pocketbase-foundation-audit.md` 的原则：PocketBase 升级独立成提交、先读官方 release notes、升级后必跑 Go 全量测试 + 首个管理员/登录/权限/备份恢复回归 + 浏览器实查；`OnServe` 初始化假设（`internal/hub/hub.go`）是升级第一个要验证的点。

## 6. 回滚

不要把新版本写过的 `pulse_data` 直接交给更老 Hub 二进制。普通升级回滚必须同时使用“上一已验证的 Hub / Agent 显式标签”和升级前完整数据备份；先停止当前 Compose，再恢复备份，最后以同一旧版本号重建 Hub / Agent。

首次从外部 Hub 迁入 FlyNAS 失败时，优先恢复迁移前拓扑，而不是在新目录里降级数据库：

1. 在 `/vol1/1000/docker/pulse` 执行 `docker compose down`，禁止附加 `-v`。
2. 保留新目录和 `pulse_data` 供排查，不删除迁移数据。
3. 恢复迁移前 Compose 文件，并使用其真实项目名启动；2026-07-29 的旧 FlyNAS Agent 使用 `docker compose -p agent up -d`。
4. 确认旧 Agent 重新连接原 Hub，源 Hub 数据仍可访问后再结束回滚。

无论哪种回滚，都要重新验证健康接口、明确版本、两个容器的 `host` 网络、Agent WebSocket 和核心数据数量。

## 7. 发布失败时不要做什么

- 不要把镜像 tag 改成 `latest`。
- 不要只重建 Hub、不重建 Agent。
- 不要只看 `docker compose up -d` 成功就认为发布完成。
- 不要在未确认备份可用时清理 `pulse_data`。

## 正式部署数据迁移

1. 在源实例“设置 -> 备份管理”创建 Pulse 完整实例备份并下载。
2. 在目标实例先完成同版本 Hub 启动和管理员初始化，再上传备份并执行预检。
3. 外置设备图片存在时，填写目标主机上的绝对目录；不要沿用源机器绝对路径。
4. 确认预检无阻断后开始恢复。Hub 会先创建目标实例安全备份，再恢复数据库并重启，启动后继续放置设备图片和核验核心集合。
5. 恢复成功后使用备份中的管理员账号重新登录，核对资产、关系、拓扑、监控、附件和图片。
6. 逐台把外部 Agent 的 `HUB_URL` 改为新 Hub 的局域网地址，并重启 Agent；保留原配对身份后确认原系统 ID 恢复在线且没有重复记录。Hub 同机 Agent 不参与这一步，继续使用 `http://127.0.0.1:8090` 和专用本机 Token。

完整备份包含账号、Token 和通知配置，传输与归档必须加密。升级和恢复期间不得删除 `pulse_data`。
