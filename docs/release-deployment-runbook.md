# Pulse 发布、部署与回滚手册

> 公开 GitHub prerelease、GHCR 与外部授权门禁另见 `docs/public-release-runbook.md`；本手册继续负责私有镜像发布和 FlyNAS 部署。

> 目标：确认发布产物、Harbor 镜像、FlyNAS 运行态和回滚路径都能被验证。不要只看构建成功，也不要用 `latest` 判断版本。

## 1. 发布前准备

1. 确认工作区改动已经完成本地验证：

```powershell
npm.cmd --prefix internal/site run check -- --max-diagnostics=200
npm.cmd --prefix internal/site run build
npm.cmd --prefix internal/site run android:sync
go test -tags=testing -count=1 -timeout=240s ./...
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.6-beta.5
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

### Android Release 签名门禁

- 固定证书 SHA-256 为 `BF114B3A8EA33125893B5B1E6865B43BFE8DAC89E1BE154F7E48A91D93D51374`，仓库以 `internal/site/android/release-certificate.sha256` 为唯一公开校验值。
- 签名属性和 PKCS12 必须位于仓库外；密钥、密码、恢复清单和 Base64 内容不得进入 Git、日志、Issue 或聊天记录。
- `1.0.6-beta.1` 使用 Debug 证书，切换到正式签名版本时需要卸载一次；之后所有版本固定复用同一证书，禁止重新生成或更换密钥。

内部发布者先用受控的仓库外属性构建并验证：

```powershell
pwsh -NoProfile -File supplemental\scripts\build-android-release.ps1 `
  -Version 1.0.6-beta.5 `
  -SigningPropertiesPath '<仓库外 signing.properties 的绝对路径>'
```

脚本必须确认包名 `site.gutenacht.pulse`、`versionName=1.0.6-beta.5`、`versionCode=1000605`、`debuggable=false`、v2 签名有效且证书指纹完全匹配。普通贡献者和验证 job 不需要也不应接触密钥。

## 2. 统一发布

正式发布只走统一入口，同一版本同步构建 Hub、Agent、Web 前端和 Android App：

```powershell
pwsh -NoProfile -File supplemental\scripts\publish-release-v1.ps1 -Version 1.0.6-beta.5 -AndroidSigningPropertiesPath '<仓库外 signing.properties 的绝对路径>'
```

正式发布不要使用 `-SkipPush`、`-SkipAgentBuild`、`-SkipLinuxAgentImageBuild` 或 `-SkipAndroidAppBuild`。这些跳过项只允许和 `-DryRun` 一起用于本地演练。

## 3. 发布产物验证

发布完成后先在本机验证产物和远端镜像 tag：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.6-beta.5
```

如果只想在本地演练、还没有推 Harbor，可临时跳过 registry：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.6-beta.5 -SkipRegistry
```

如果要验证某个正在运行的 Hub：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.6-beta.5 -HubUrl http://127.0.0.1:8090
```

验证点：

- Web / Hub / Agent / Android / Compose / 文档版本一致。
- Windows Agent 可执行文件存在，`--version` 返回目标版本。
- Agent manifest 存在，且 Windows Agent SHA256 与实际文件一致。
- Android APK metadata 的 `versionName` 是 `1.0.6-beta.5`，`versionCode` 是 `1000605`，应用不可调试，v2 签名有效，证书 SHA-256 与仓库固定值一致。
- Harbor 上 `pulse-hub:1.0.6-beta.5` 和 `pulse-agent:1.0.6-beta.5` 可被 `docker manifest inspect` 读取。
- 可选 Hub URL 返回 `/api/health` 正常，`/api/pulse/public-info` 版本为 `1.0.6-beta.5`。

## 4. Harbor 手动确认

```powershell
docker manifest inspect registry.example.com/infra/pulse-hub:1.0.6-beta.5
docker manifest inspect registry.example.com/infra/pulse-agent:1.0.6-beta.5
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
- `/api/pulse/public-info` 的 `v` 是 `1.0.6-beta.5`。
- `pulse-hub` 镜像是 `registry.example.com/infra/pulse-hub:1.0.6-beta.5`。
- `pulse-agent` 镜像是 `registry.example.com/infra/pulse-agent:1.0.6-beta.5`。
- 两个容器都是 `host` 网络。
- 页面 About 显示 Hub / Web / Android / Agent 目标版本为 `1.0.6-beta.5`。
- Hub 所在机器在线，显示真实机器名并带 `Hub` 标签。

## 6. 回滚

如果 `1.0.6-beta.5` 部署后健康检查、登录、Agent 连接或核心页面异常，先回滚到上一稳定版本 `1.0.5`。

1. 修改 FlyNAS Compose 镜像 tag：

```bash
cd /vol1/1000/docker/pulse
cp docker-compose.yml "docker-compose.yml.rollback-$(date +%Y%m%d-%H%M%S)"
sed -i 's#registry.example.com/infra/pulse-hub:1.0.6-beta.5#registry.example.com/infra/pulse-hub:1.0.5#g' docker-compose.yml
sed -i 's#registry.example.com/infra/pulse-agent:1.0.6-beta.5#registry.example.com/infra/pulse-agent:1.0.5#g' docker-compose.yml
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
- `/api/pulse/public-info` 的 `v` 回到 `1.0.5`。
- Hub 和 Agent 镜像 tag 都回到 `1.0.5`。

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

完整备份包含账号、Token 和通知配置，传输与归档必须加密。升级和恢复期间不得删除 `pulse_data`。
