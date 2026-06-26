# Pulse 发布、部署与回滚手册

> 目标：确认发布产物、Harbor 镜像、FlyNAS 运行态和回滚路径都能被验证。不要只看构建成功，也不要用 `latest` 判断版本。

## 1. 发布前准备

1. 确认工作区改动已经完成本地验证：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run android:sync
go test -tags=testing -count=1 -timeout=240s ./...
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.6
```

2. 备份当前正式数据。FlyNAS 标准目录：

```bash
cd /vol1/1000/docker/pulse
tar -czf "pulse_data-backup-$(date +%Y%m%d-%H%M%S).tgz" pulse_data
```

3. 记录当前线上镜像，方便回滚：

```bash
cd /vol1/1000/docker/pulse
docker compose images
docker compose ps
```

## 2. 统一发布

正式发布只走统一入口，同一版本同步构建 Hub、Agent、Web 前端和 Android App：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\publish-release-v1.ps1 -Version 1.0.6
```

正式发布不要使用 `-SkipPush`、`-SkipAgentBuild`、`-SkipLinuxAgentImageBuild` 或 `-SkipAndroidAppBuild`。这些跳过项只允许和 `-DryRun` 一起用于本地演练。

## 3. 发布产物验证

发布完成后先在本机验证产物和远端镜像 tag：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.6
```

如果只想在本地演练、还没有推 Harbor，可临时跳过 registry：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.6 -SkipRegistry
```

如果要验证某个正在运行的 Hub：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.6 -HubUrl http://127.0.0.1:8090
```

验证点：

- Web / Hub / Agent / Android / Compose / 文档版本一致。
- Windows Agent 可执行文件存在，`--version` 返回目标版本。
- Agent manifest 存在，且 Windows Agent SHA256 与实际文件一致。
- Android APK metadata 的 `versionName` 是 `1.0.6`，`versionCode` 是 `10006`。
- Harbor 上 `pulse-hub:1.0.6` 和 `pulse-agent:1.0.6` 可被 `docker manifest inspect` 读取。
- 可选 Hub URL 返回 `/api/health` 正常，`/api/pulse/public-info` 版本为 `1.0.6`。

## 4. Harbor 手动确认

```powershell
docker manifest inspect registry.example.com/infra/pulse-hub:1.0.6
docker manifest inspect registry.example.com/infra/pulse-agent:1.0.6
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
- `/api/pulse/public-info` 的 `v` 是 `1.0.6`。
- `pulse-hub` 镜像是 `registry.example.com/infra/pulse-hub:1.0.6`。
- `pulse-agent` 镜像是 `registry.example.com/infra/pulse-agent:1.0.6`。
- 两个容器都是 `host` 网络。
- 页面 About 显示 Hub / Web / Android / Agent 目标版本为 `1.0.6`。
- Hub 所在机器在线，显示真实机器名并带 `Hub` 标签。

## 6. 回滚

如果 `1.0.6` 部署后健康检查、登录、Agent 连接或核心页面异常，先回滚到上一稳定版本 `1.0.4`。

1. 修改 FlyNAS Compose 镜像 tag：

```bash
cd /vol1/1000/docker/pulse
cp docker-compose.yml "docker-compose.yml.rollback-$(date +%Y%m%d-%H%M%S)"
sed -i 's#registry.example.com/infra/pulse-hub:1.0.6#registry.example.com/infra/pulse-hub:1.0.4#g' docker-compose.yml
sed -i 's#registry.example.com/infra/pulse-agent:1.0.6#registry.example.com/infra/pulse-agent:1.0.4#g' docker-compose.yml
```

2. 拉取并重建：

```bash
docker compose pull
docker compose up -d --force-recreate
```

3. 验证回滚：

```bash
curl http://127.0.0.1:8090/api/health
curl http://127.0.0.1:8090/api/pulse/public-info
docker inspect pulse-hub --format '{{json .Config.Image}}'
docker inspect pulse-agent --format '{{json .Config.Image}}'
docker logs --tail=100 pulse-hub
docker logs --tail=100 pulse-agent
```

预期：

- Hub 健康检查恢复。
- `/api/pulse/public-info` 的 `v` 回到 `1.0.4`。
- Hub 和 Agent 镜像 tag 都回到 `1.0.4`。

## 7. 发布失败时不要做什么

- 不要把镜像 tag 改成 `latest`。
- 不要只重建 Hub、不重建 Agent。
- 不要只看 `docker compose up -d` 成功就认为发布完成。
- 不要在未确认备份可用时清理 `pulse_data`。
