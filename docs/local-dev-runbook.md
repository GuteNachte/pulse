# 本地开发与发布运行手册

## 当前约定

本机用于开发和发布前测试，飞牛 / Linux / NAS 用于正式部署。两边都使用同一套 Hub 镜像和同一套数据目录结构。本机测试分两层：

- Windows 日常一键启动：双击项目根目录 `Start-Pulse-Dev.cmd`。启动器优先调用 PowerShell 7，未安装时回退到 Windows PowerShell 5.1；它只复用标准源码启动脚本，健康检查通过后才打开 `http://localhost:5173`。运行 `pwsh -NoProfile -File supplemental\scripts\install-dev-shortcut.ps1` 可在当前用户桌面创建或更新“Pulse 开发环境”快捷方式。
- 本地源码联调：运行 `supplemental\scripts\run-hub-dev.ps1`，Hub 固定监听 `0.0.0.0:8090`，Vite 固定监听 `0.0.0.0:5173`；本机使用 `http://localhost:5173`，同一局域网设备使用脚本自动输出的 `http://<本机局域网 IPv4>:5173`。前端 API 与实时连接继续走 Vite 同源代理，不需要在浏览器端写死 Hub 地址。
- 本机浏览器测试：固定访问 `http://127.0.0.1:8090`，使用普通 bridge 网络和端口映射。
- 本机发布前网络等价检查：临时使用 `network_mode: host`，只验证容器内部健康检查。
- 飞牛 / Linux / NAS 正式部署：固定使用 Hub + Hub 同机 Agent 的同机 Compose，两个容器都使用 `network_mode: host`，Hub 容器内监听 `0.0.0.0:8090`。

本机测试不要再使用 `8091`，也不要把 Vite dev server 当成 Hub 入口。Windows Docker Desktop 的 host 网络不会稳定暴露给 Windows 浏览器，因此页面验收使用端口映射，正式网络模式用 `-HostCheck` 单独覆盖。

源码联调需要局域网访问时，Windows 防火墙仅允许对 `5173` 和 `8090` 放行本地子网；不要直接对公网地址开放开发端口。启动脚本不会自动修改系统防火墙。

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

- 镜像：`pulse-hub:1.0.6-beta.5`
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

正式部署固定使用 Hub + Hub 同机 Agent：

```yaml
services:
  pulse-hub:
    image: registry.example.com/infra/pulse-hub:1.0.6-beta.5
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
    image: registry.example.com/infra/pulse-agent:1.0.6-beta.5
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
- Hub 所在机器的 Agent 会通过 loopback-only Hub 同机 Token 自动注册为 Hub 机器，页面显示真实机器名并带 `Hub` 标签，容器日志显示 WebSocket 已连接。

## 发布流程

阶段开发完成后：

1. 本机使用浏览器测试环境验证 `http://127.0.0.1:8090`。
2. 本机执行 `-HostCheck`，覆盖正式 host 网络模式。
3. 先执行版本一致性校验，确认 Web、Hub、Agent、Android App、Dockerfile、Compose 模板和发布脚本默认版本都对齐：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.6-beta.5
```

4. 使用同一个显式版本号同步构建 Agent 和 Hub：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\publish-release-v1.ps1 -Version 1.0.6-beta.5
```

这条统一发布入口会依次构建 Windows Agent、构建并推送 Linux Agent 镜像、写入 Agent release manifest、构建并推送 Hub 镜像，并同步构建 Android App。以后不要只发布 Hub、Web、Android 或 Agent 中的某一端；只要任一端有改动，Hub、Agent、Web 前端和 Android App 都使用同一个显式版本号一起发布，防止版本号和功能说明错位。

5. 确认 Harbor 中同版本 Hub 和 Agent 镜像都存在。
6. 执行发布产物验证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.6-beta.5
```

7. 按 `docs\release-deployment-runbook.md` 在 FlyNAS 执行 `docker compose pull && docker compose up -d --force-recreate`。
8. 验证飞牛 Hub、Hub 同机 Agent 上线、Agent release 下载、客户端上线和数据采集；如需回滚，同样按 `docs\release-deployment-runbook.md` 执行上一版本 tag 回滚。

## 避免的坑

- 不要让本机 Hub 跑到 `8091`。
- 不要把 Vite dev server 当正式 Hub 入口。
- 不要用 Windows Docker Desktop 的 `network_mode: host` 判断正式部署效果。
- 同名镜像 tag 更新后，飞牛必须执行 `docker compose pull`，只 `up -d` 可能继续使用旧 digest。





## 资产迁移与完整备份

- 资产中心“导出”生成 `.pulse-assets.zip`，用于选择性迁移当前账号的资产主数据、附件和设备图片；导入前必须先看预检结果，再选择仅新增、合并补全或覆盖匹配项。
- 设置 -> 备份管理生成完整实例备份，适合从开发环境迁移到正式部署。完整备份包含管理员账号、用户设置、资产与拓扑、监控历史、PocketBase 文件；设备图片目录在 `pulse_data` 外时也会一并封装。
- 完整备份包含 Token、通知配置和其他敏感信息，只能存放在可信位置。恢复会覆盖目标实例，开始前 Hub 会自动创建安全备份。
- 本地恢复演练只能使用 `%TEMP%` 下的新数据目录，不得将测试恢复指向仓库当前 `pulse_data`。
