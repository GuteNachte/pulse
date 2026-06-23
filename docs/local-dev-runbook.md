# 本地开发与发布运行手册

## 当前约定

本机用于开发和发布前测试，飞牛 / Linux / NAS 用于正式部署。两边都使用同一套 Hub 镜像和同一套数据目录结构。本机测试分两层：

- 本机浏览器测试：固定访问 `http://127.0.0.1:8090`，使用普通 bridge 网络和端口映射。
- 本机发布前网络等价检查：临时使用 `network_mode: host`，只验证容器内部健康检查。
- 飞牛 / Linux / NAS 正式部署：固定使用 Hub + 本机 Agent 同机 Compose，两个容器都使用 `network_mode: host`，Hub 容器内监听 `0.0.0.0:8090`。

本机测试不要再使用 `8091`，也不要把 Vite dev server 当成 Hub 入口。Windows Docker Desktop 的 host 网络不会稳定暴露给 Windows 浏览器，因此页面验收使用端口映射，正式网络模式用 `-HostCheck` 单独覆盖。

## 本机 Docker 测试

启动或重启本机 Hub：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-local.ps1 -Port 8090
```

如果镜像已经构建过，只重启容器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-local.ps1 -Port 8090 -SkipBuild
```

本机固定使用：

- 镜像：`pulse-hub:1.0.5`
- 容器名：`pulse-hub`
- 数据目录：`.\pulse_data`
- 访问地址：`http://127.0.0.1:8090`
- 端口映射：`127.0.0.1:8090 -> 8090/tcp`

验证命令：

```powershell
Invoke-WebRequest -Uri http://127.0.0.1:8090/api/health -UseBasicParsing
docker port pulse-hub 8090
docker inspect pulse-hub --format "Network={{.HostConfig.NetworkMode}} Ports={{json .NetworkSettings.Ports}}"
```

预期：

- `api/health` 返回 `200`
- `docker port pulse-hub 8090` 显示 `127.0.0.1:8090`
- `Network` 是 `bridge`

发布前再跑一次 host 网络等价检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-local.ps1 -SkipBuild -HostCheck
```

这条命令会临时停止 `pulse-hub`，用 `network_mode: host` 启动临时容器，并在容器内部执行健康检查。检查完成后需要重新启动本机浏览器测试 Hub：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\run-hub-local.ps1 -Port 8090 -SkipBuild
```

## 飞牛 / Linux / NAS 正式部署

正式部署固定使用 Hub + 本机 Agent：

```yaml
services:
  pulse-hub:
    image: registry.example.com/infra/pulse-hub:1.0.5
    container_name: pulse-hub
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./pulse_data:/pulse_data
    command:
      - serve
      - --dir=/pulse_data
      - --http=0.0.0.0:8090

  pulse-agent:
    image: registry.example.com/infra/pulse-agent:1.0.5
    container_name: pulse-agent
    restart: unless-stopped
    network_mode: host
    privileged: true
    depends_on:
      - pulse-hub
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /:/host:ro
      - /sys/firmware/dmi:/sys/firmware/dmi:ro
      - ./pulse_agent_data:/var/lib/pulse-agent
    # 如果宿主机存在核显设备或需要更完整的 DMI 采集，再按需打开下面的映射。
    # devices:
    #   - /dev/dri:/dev/dri
    #   - /dev/mem:/dev/mem
    environment:
      TOKEN: "${PULSE_LOCAL_AGENT_TOKEN:-pulse-local-agent}"
      HUB_URL: "${PULSE_AGENT_HUB_URL:-http://127.0.0.1:8090}"
      INSTALL_METHOD: docker
      RUN_MODE: docker
      AGENT_PROFILE: linux-container
```

正式部署验证：

```bash
curl http://127.0.0.1:8090/api/health
docker inspect pulse-hub --format '{{json .HostConfig.NetworkMode}}'
docker logs --tail=100 pulse-agent
```

预期：

- `api/health` 返回健康状态
- `NetworkMode` 是 `host`
- Hub 所在机器的 Agent 会通过 loopback-only 本机 Token 自动注册为 Hub 机器，页面显示真实机器名并带 `Hub` 标签，容器日志显示 WebSocket 已连接。

## 发布流程

阶段开发完成后：

1. 本机使用浏览器测试环境验证 `http://127.0.0.1:8090`。
2. 本机执行 `-HostCheck`，覆盖正式 host 网络模式。
3. 先执行版本一致性校验，确认 Web、Hub、Agent、Android App、Dockerfile、Compose 模板和发布脚本默认版本都对齐：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5
```

4. 使用同一个显式版本号同步构建 Agent 和 Hub：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\publish-release-v1.ps1 -Version 1.0.5
```

这条统一发布入口会依次构建 Windows Agent、构建并推送 Linux Agent 镜像、写入 Agent release manifest、构建并推送 Hub 镜像，并同步构建 Android App。以后不要只发布 Hub、Web、Android 或 Agent 中的某一端；只要任一端有改动，Hub、Agent、Web 前端和 Android App 都使用同一个显式版本号一起发布，防止版本号和功能说明错位。

5. 确认 Harbor 中同版本 Hub 和 Agent 镜像都存在。
6. 执行发布产物验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.5
```

7. 按 `docs\release-deployment-runbook.md` 在 FlyNAS 执行 `docker compose pull && docker compose up -d --force-recreate`。
8. 验证飞牛 Hub、本机 Agent 上线、Agent release 下载、客户端上线和数据采集；如需回滚，同样按 `docs\release-deployment-runbook.md` 执行上一版本 tag 回滚。

## 避免的坑

- 不要让本机 Hub 跑到 `8091`。
- 不要把 Vite dev server 当正式 Hub 入口。
- 不要用 Windows Docker Desktop 的 `network_mode: host` 判断正式部署效果。
- 同名镜像 tag 更新后，飞牛必须执行 `docker compose pull`，只 `up -d` 可能继续使用旧 digest。




