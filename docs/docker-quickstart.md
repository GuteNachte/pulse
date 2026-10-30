# 用 Docker 快速部署 Pulse

本指南面向**第一次接触 Pulse 的人**：从零用 Docker Compose 起一套完整的 Hub + Agent，全程只用公开镜像，不需要源码、不需要自建镜像仓库。

## 先决条件

- 一台常开的 Linux 主机或 NAS（群晖、飞牛、UNRAID、普通 Debian/Ubuntu 都行），已装 Docker 与 Docker Compose v2
- 至少 1 GB 内存；Hub 数据目录会随采集时长增长
- 拿到一个端口给 Hub（默认 `8090`）

## 方式一：同机一体化（推荐首次部署）

Hub 和 Agent 跑在同一个 Compose 项目里，最适合单机试用。

```bash
mkdir -p ~/pulse && cd ~/pulse
```

新建 `docker-compose.yml`：

```yaml
services:
  pulse-hub:
    image: ghcr.io/gutenachte/pulse-hub:1.0.8
    container_name: pulse-hub
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./pulse_data:/pulse_data
    command: ["serve", "--dir=/pulse_data", "--http=0.0.0.0:8090"]
    environment:
      # 让 Hub 生成的 Agent 安装命令指向可用的公共镜像
      PULSE_AGENT_IMAGE: ghcr.io/gutenachte/pulse-agent:1.0.8

  pulse-agent:
    image: ghcr.io/gutenachte/pulse-agent:1.0.8
    container_name: pulse-agent
    restart: unless-stopped
    network_mode: host
    privileged: true
    depends_on:
      - pulse-hub
    security_opt:
      - systempaths=unconfined
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /:/host:ro
      - /sys/firmware/dmi:/sys/firmware/dmi:ro
      - ./pulse_agent_data:/var/lib/pulse-agent
    cap_add:
      - CAP_PERFMON
      - CAP_SYS_RAWIO
    environment:
      HUB_URL: "http://127.0.0.1:8090"
      INSTALL_METHOD: docker
      RUN_MODE: docker
      AGENT_PROFILE: linux-container
```

启动：

```bash
docker compose up -d
docker compose logs -f pulse-hub   # 看到 listening on 0.0.0.0:8090 即成功
```

打开 `http://<这台机器的局域网IP>:8090`，首次进入按提示创建管理员账号。

## 方式二：Hub 独立 + 其他机器装 Agent

Hub 装在常开的 NAS 上，其它机器（Windows 台式机、另一台 NAS）分别装 Agent。

1. 只启动上面的 `pulse-hub` 服务。
2. 浏览器进入 Hub → **设置 → Agent 管理**，页面会给出对应平台的安装命令，复制到目标机器执行。
3. Hub 生成的镜像地址来自它自己的配置：容器部署时由 `PULSE_AGENT_IMAGE` 环境变量决定，默认使用 `ghcr.io/gutenachte/pulse-agent:1.0.8`。

## 可选：换成你自己的镜像仓库

Pulse 的镜像是标准 OCI 镜像，可以自己构建、自己托管：

```bash
# 在源码仓库根目录
docker build -f internal/dockerfile_hub   -t <你的仓库>/pulse-hub:1.0.8   .
docker build -f internal/dockerfile_agent -t <你的仓库>/pulse-agent:1.0.8 .
docker push <你的仓库>/pulse-hub:1.0.8
docker push <你的仓库>/pulse-agent:1.0.8
```

然后把 Hub 容器里的 `PULSE_AGENT_IMAGE` 改成你自己的地址，安装命令就会自动跟着变。

## 端口与网络

- Hub 默认 `8090`，`network_mode: host` 下直接监听宿主机端口。
- 需要从局域网其它设备访问时，放行 `8090`；**不建议把 Hub 直接暴露到公网**，如需外网访问请走 VPN 或反向代理并强制 HTTPS。
- Agent 主动连 Hub（WebSocket），不需要在 Agent 侧开端口。

## 数据与备份

- Hub 数据全部在挂载的 `./pulse_data` 里（SQLite + 上传文件），备份这个目录即可。
- 也可以在 Hub 界面 **设置 → 备份管理** 创建完整备份包。

## 升级

```bash
# 把 compose 里的 1.0.8 改成新版本号，然后
docker compose pull && docker compose up -d
```

Hub 自带 Agent 受控升级：在 **设置 → Agent 管理** 里对每台机器点更新即可，不需要登录目标机器。

## 常见问题

**Hub 起不来，日志报端口占用**：改 `--http=0.0.0.0:<端口>` 和 compose 的端口映射。

**Agent 显示离线**：确认 `HUB_URL` 是 Hub 的**局域网 IP**而不是 `localhost`（跨机器时 localhost 指向 Agent 自己）。

**看不到容器 / SMART / GPU 数据**：容器版 Agent 需要挂载 `/var/run/docker.sock`、`privileged: true`；GPU 采集还需按宿主情况加 `devices: /dev/dri`。

**内存条型号、主板信息为空**：需要 `security_opt: systempaths=unconfined` 与 `/sys/firmware/dmi` 映射，部分 NAS 内核不允许读取，属正常现象。
