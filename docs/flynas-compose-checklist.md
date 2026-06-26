# 飞牛 / NAS Compose 部署检查清单

## 当前部署约定

- Hub 镜像：`registry.example.com/infra/pulse-hub:1.0.6`
- Agent 镜像：`registry.example.com/infra/pulse-agent:1.0.6`
- 每次发布新版本时，Hub 和 Agent 必须同步更新为同一个版本号。不要只更新 Hub 镜像，也不要复用旧 Agent 镜像，避免 Agent 采集、更新、容器控制等改动没有部署上。
- Linux / 飞牛 / NAS 只使用 Docker 容器版 Agent。
- 通用 Linux / 飞牛 / NAS 使用 Docker Compose 作为标准部署方式；Unraid 使用 root 直连下载命令把 XML 写入 Unraid 的模板目录，不走 Compose。
- Hub 标准部署默认包含同机 Agent，安装 Hub 的机器会一起纳入监控。
- Hub 和容器版 Agent 默认都使用 `network_mode: host`。
- Agent 通过 WebSocket 主动连接 Hub，接入信息只需要 `TOKEN` 和 `HUB_URL`。
- 飞牛单独 Agent 推荐下载设置页生成的 `pulse-agent-flynas.yml`，Agent 数据目录固定为 `/vol1/1000/docker/pulse-agent/data`。
- 默认模板会同时挂载 Docker socket、宿主机根目录、DMI 和 GPU 入口；如果后续目标机器权限更严格，再在设置页里按需关闭单项能力。
- 复制飞牛 yml 时，配对安装会用 YAML 原生块标量承载启动脚本，并通过 `PAIR_CODE` 在容器内展开；不要手动把 shell 单引号版 `entrypoint` 再塞回 YAML。
- Unraid 入口是下载命令，命令运行后会把 XML 模板写入 `/boot/config/plugins/dockerMan/templates-user/pulse-agent-unraid.xml`。

## 部署前

1. 确认 NAS 能访问 Harbor：

```bash
curl -I https://registry.example.com/v2/
```

2. 如果 Harbor 是 HTTP 仓库，确认 NAS Docker 已配置 insecure registry：

```json
{
  "insecure-registries": ["192.168.1.35:5000"]
}
```

3. 确认镜像可以拉取：

```bash
docker pull registry.example.com/infra/pulse-hub:1.0.6
docker pull registry.example.com/infra/pulse-agent:1.0.6
```

两个 `docker pull` 必须使用同一个目标版本号；如果任一镜像不存在，停止部署并回到本机发布流程重新执行统一发布脚本。

发布前还必须按 `docs/release-deployment-runbook.md` 完成本机发布产物验证、FlyNAS 数据备份和回滚路径确认；不要只确认镜像能拉取就直接覆盖正式容器。

4. 确认 Compose 文件使用 host 网络：

```yaml
network_mode: host
```

这条约定只适用于飞牛 / Linux / NAS 正式部署。Windows Docker Desktop 本机开发不要使用 `network_mode: host`，本机开发固定使用 `supplemental/scripts/run-hub-local.ps1` 或 `supplemental/docker/local-dev/docker-compose.yml` 的端口映射方式。

5. 确认 Compose 文件中的接入信息：

- `TOKEN`
- `HUB_URL`

## 推荐 Compose 文件

Hub + Hub 同机 Agent 标准部署：

```text
supplemental/docker/hub/docker-compose.yml
```

同机部署副本：

```text
supplemental/docker/same-system/docker-compose.yml
```

Agent 单独部署只用于给其他 Linux / NAS 机器接入已有 Hub：

```text
supplemental/docker/agent/docker-compose.yml
```

首次部署时不用先在 Hub 页面添加 Hub 所在机器；标准 Compose 会用 loopback-only Hub 同机 Token 自动注册 Hub 同机 Agent，页面显示真实机器名并带 `Hub` 标签，且这条 Hub 机器记录不能删除：

```bash
export PULSE_AGENT_HUB_URL="http://127.0.0.1:8090"
docker compose up -d
```

## Agent 权限

容器监控和控制需要读写 Docker socket：

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
  - /vol1/1000/docker/pulse-agent/data:/var/lib/pulse-agent
```

内存条型号、安装容量、频率等硬件详情需要读取宿主机 DMI 信息：

```yaml
privileged: true
security_opt:
  - systempaths=unconfined

volumes:
  - /sys/firmware/dmi:/sys/firmware/dmi:ro

devices:
  - /dev/mem:/dev/mem

cap_add:
  - CAP_SYS_RAWIO
```

如果只读挂载，容器状态可以采集，但启动、停止、重启会失败。

如果当前 SSH 用户没有 Docker 权限，先确认是否能在 NAS 的 root / 管理终端里执行 `docker compose`；如果只能通过普通用户 SSH，直接报 permission denied 是正常现象，不代表镜像或模板本身坏了。

核显监控按需开启：

```yaml
devices:
  - /dev/dri:/dev/dri
cap_add:
  - CAP_PERFMON
```

如果宿主机权限不足，GPU 指标可能不可用，这是可接受状态，不影响基础监控和容器监控。

## 部署命令

```bash
docker compose pull
docker compose up -d
docker compose ps
```

如果部署后需要回滚，按 `docs/release-deployment-runbook.md` 将 Hub 和 Agent 镜像 tag 同时回到上一稳定版本，再执行 `docker compose pull && docker compose up -d --force-recreate`。

## 验收

1. Hub 健康检查：

```bash
curl http://127.0.0.1:8090/api/health
```

2. Hub 容器网络：

```bash
docker exec pulse /pulse health --url http://127.0.0.1:8090
docker inspect pulse-hub --format '{{json .HostConfig.NetworkMode}}'
```

3. Agent 日志：

```bash
docker logs --tail=100 pulse-agent
```

4. 页面确认：

- Hub 所在机器已作为一台 Linux / NAS Docker Agent 上线。
- Hub 与 Hub 同机 Agent 显示为同一个新版本。
- 设备上线。
- Agent profile 显示 `linux-container`。
- 容器数量正常。
- 容器页面能看到同机容器。
- 容器启动、停止、重启可用。
- Compose 堆栈操作只对带 Compose 标签的容器显示。
- 网站监控里的外网 IPv6 地址能正常检测。




