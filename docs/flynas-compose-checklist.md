# 飞牛 / NAS Compose 部署检查清单

## 当前实际状态（2026-10-24 核实）

- **飞牛上已没有 Hub 容器**：7 月的 `1.0.8-beta.6` Hub 部署已退役，8090 端口无服务；本文后续的 Hub 部署流程仅作为将来在飞牛重新部署 Hub 时的操作手册保留。
- 飞牛当前只运行**独立 Agent 容器**：目录 `/vol1/1000/docker/pulse-agent`，镜像 `registry.example.com:443/infra/pulse-agent:1.0.8`，`HUB_URL=http://192.168.1.10:8090`（本机开发机 Hub）。
- 全屋版本统一基准（2026-10-24）：本机 / 主力机 / UNRAID / 飞牛四台 Agent 均为 `1.0.8`，正式 Hub 职责由本机承担；本机 Docker 仅用于发布产物构建与等价测试。

## 当前部署约定（Hub 部署模板口径，历史参考）

- 2026-07-30 曾试用部署 `1.0.8-beta.6` 于 `/vol1/1000/docker/pulse`（已退役）。下面的 `1.0.8` 示例表示下一正式版本模板，不要据此把运行中的标签静默改成未发布标签。
- Hub 镜像：`registry.example.com:443/infra/pulse-hub:1.0.8`
- Agent 镜像：`registry.example.com:443/infra/pulse-agent:1.0.8`
- 每次发布新版本时，Hub 和 Agent 必须同步更新为同一个版本号。不要只更新 Hub 镜像，也不要复用旧 Agent 镜像，避免 Agent 采集、更新、容器控制等改动没有部署上。
- Linux / 飞牛 / NAS 只使用 Docker 容器版 Agent。
- 通用 Linux / 飞牛 / NAS 使用 Docker Compose 作为标准部署方式；Unraid 使用 root 直连下载命令把 XML 写入 Unraid 的模板目录，不走 Compose。
- Hub 标准部署默认包含同机 Agent，安装 Hub 的机器会一起纳入监控。
- Hub 和容器版 Agent 默认都使用 `network_mode: host`。
- Hub 同机 Agent 必须通过部署目录 `.env` 中的 `PULSE_LOCAL_AGENT_TOKEN` 与 Hub 共享随机 Token，文件权限固定为 `600`；不要把 Token 原文写入 Compose、文档、命令输出或仓库。
- Agent 通过 WebSocket 主动连接 Hub；首次接入使用 Hub 地址和网页生成的 6 位长期机器连接码，配对成功后由 Hub 自动发放机器独立连接凭据，不再使用人工 Token。
- 外部机器 Agent 必须使用 Hub 实际监听的局域网地址（Hub 部署在飞牛时为 `http://192.168.1.30:8090`）；Hub 同机 Agent 必须保留 `http://127.0.0.1:8090`。不能为了形式统一把同机 Agent 改成局域网地址，否则会破坏 loopback-only Token 和 `Hub` 机器身份边界。
- FlyNAS 同机 Agent 页面应显示宿主机物理网卡局域网地址 `192.168.1.30`，而不是连接通道的 `127.0.0.1` 或 Docker 网桥 `172.17.0.1`；这由 Agent 物理网卡采集和 Hub 身份地址选择完成，不通过修改 `HUB_URL` 实现。
- 飞牛单独 Agent 推荐下载设置页生成的 `pulse-agent-flynas.yml`，Agent 数据目录固定为 `/vol1/1000/docker/pulse-agent/data`。
- 默认模板会同时挂载 Docker socket、宿主机根目录、DMI 和 GPU 入口；如果后续目标机器权限更严格，再在设置页里按需关闭单项能力。
- 复制飞牛 yml 时，配对安装会用 YAML 原生块标量承载启动脚本，并通过 `PAIR_CODE` 在容器内展开；不要手动把 shell 单引号版 `entrypoint` 再塞回 YAML。
- Unraid 入口是下载命令，命令运行后会把 XML 模板写入 `/boot/config/plugins/dockerMan/templates-user/pulse-agent-unraid.xml`。

## 当前维护访问（2026-10-24 更新）

- SSH 用户：`gutenacht`（Docker 已免 sudo 可用）。
- 专用部署私钥：`C:\Users\Gute\.ssh\pulse-flynas-ed25519`（2026-10-24 新生成并已装入飞牛 `authorized_keys`，免密登录可用）。
- 公钥指纹：`ssh-keygen -lf C:\Users\Gute\.ssh\pulse-flynas-ed25519.pub` 查看；旧 `C:\Users\Nacht` 路径与 Z 盘公钥备份已失效。
- 不得把私钥、Token、`.env` 内容或口令复制到仓库、文档和命令输出。

## 部署前

1. 确认 NAS 能访问 Harbor：

```bash
curl -I https://registry.example.com:443/v2/
```

2. 如果 Harbor 是 HTTP 仓库，确认 NAS Docker 已配置 insecure registry：

```json
{
  "insecure-registries": ["192.168.1.35:5000"]
}
```

3. 确认镜像可以拉取：

```bash
docker pull registry.example.com:443/infra/pulse-hub:1.0.8
docker pull registry.example.com:443/infra/pulse-agent:1.0.8
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

升级前先创建停写一致性回滚包并校验 `SHA256SUMS`。`beta.6` 的已验证回滚包位于 `/vol1/1000/Pulse/Pulse-Secrets/Deployment-Backups/pre-beta6-20260730-193157`，Windows 映射路径为 `Z:\Pulse-Secrets\Deployment-Backups\pre-beta6-20260730-193157`。

```bash
docker compose pull
docker compose up -d
docker compose ps
```

维护历史容器前先确认 Compose 项目标签：

```bash
docker inspect pulse-agent --format '{{index .Config.Labels "com.docker.compose.project"}}'
```

如果输出不是当前目录默认项目名，停止或移除旧容器时必须使用相同的 `-p <project>`；2026-07-29 迁移前的旧 FlyNAS Agent 项目名是 `agent`。只运行不带 `-p` 的 `docker compose rm` 可能显示“没有容器”，但同名旧容器仍会阻挡新部署。

如果部署后需要回滚，按 `docs/release-deployment-runbook.md` 同时恢复升级前完整数据备份，并将 Hub / Agent 镜像 tag 一起回到上一已验证版本；禁止把新版本写过的 `pulse_data` 直接交给旧 Hub 二进制。完成后再执行 `docker compose pull && docker compose up -d --force-recreate` 并核对健康、版本、Agent WebSocket 和核心数据数量。

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
- Hub、FlyNAS 同机 Agent 和外部 Windows Agent 上报的版本均为 `1.0.8-beta.6`，系统记录仍为原来的两台，没有生成重复机器。
- 核心数据计数与升级前一致：资产 `18`、接口 `36`、关系 `15`、系统 `2`、用户 `1`。

`1.0.8-beta.6` 当前有一条已知启动警告：PocketBase `v0.39.4` 测试的是 `modernc.org/sqlite v1.52.0`，发布构建解析到 `v1.53.0`。当前健康检查、数据一致性和运行日志无实际错误；下一版本源码已恢复 PocketBase 测试的 `sqlite v1.52.0` / `libc v1.72.3` 组合并加入依赖与备份恢复契约，等待完整回归和统一版本部署，不在运行中的正式容器内临时替换。

从其他 Hub 恢复完整实例备份后，还要逐台修改外部 Agent 的 `HUB_URL`，因为备份只迁移 Hub 数据，不会远程改写已安装 Agent 的服务配置。保留原配对凭据并改到新 Hub 局域网地址后，应确认原系统 ID 恢复在线且没有新增重复机器；2026-07-29 的 Windows `UM-690` 已按此方式从 `http://192.168.1.10:8090` 改到 `http://192.168.1.30:8090` 并重新上线。





## 数据持久化与恢复检查

- Hub 必须保留 `./pulse_data:/pulse_data` 绑定挂载；升级镜像、重建容器或执行恢复时都不得删除宿主机 `pulse_data`。
- 禁止使用匿名卷替换 `/pulse_data`，也不要在 `docker compose down` 时附加 `-v`。
- 正式迁移前创建并下载 Pulse 完整实例备份；恢复外置设备图片时填写 FlyNAS 上实际可写的绝对目录。
- 恢复完成后重新登录并核对资产数量、接口与关系、两套网络拓扑、监控记录、附件和设备图片，再进行旧实例下线。
