# Agent 1.0 安装方式

当前只保留两种 Agent：

- Windows 主机版：安装为 Windows Service。
- Linux / 飞牛 / NAS / Unraid 容器版：通用 Linux 和飞牛使用 Docker Compose，Unraid 使用 root 直连下载命令把 XML 写入 Unraid 的模板目录。

两种 Agent 都通过 WebSocket 主动连接 Hub，接入信息只需要 `TOKEN` 和 `HUB_URL`。

## Windows 主机版

适合 Windows 设备。支持基础指标、Windows 服务监控/控制、手动添加的软件运行状态监控、Docker Desktop / Engine 容器监控/控制、Agent 手动更新，以及核显型号和占用率采集。

要求：

- 使用管理员 PowerShell 执行安装命令。
- Hub 下载 `pulse-agent_windows_amd64.exe` 并安装到 `ProgramData\pulse-agent`。
- 服务通过 NSSM 管理；缺失时安装命令会尝试通过 WinGet 安装 NSSM。
- 安装脚本会写入 `HUB_URL`、`DATA_DIR`、`INSTALL_METHOD`、`RUN_MODE`、`AGENT_PROFILE`；Token 接入时写入 `TOKEN`，一次性配对接入时先执行 `agent pair --url ... --code ...` 并把凭据保存到 `DATA_DIR`。
- 设置页 Agent 管理支持在“一行命令”和“完整 PowerShell 脚本”之间切换，并可调整安装目录、数据目录、日志目录、重装是否清理旧数据、是否自动安装 NSSM、安装后是否启动服务、是否添加出站防火墙规则。
- 默认安装目录是 `$env:ProgramData\pulse-agent`，默认数据目录是 `$env:WINDIR\System32\config\systemprofile\AppData\Roaming\pulse-agent`，默认日志目录是 `$env:ProgramData\pulse-agent\logs`。

## Linux / 飞牛 / NAS / Unraid Docker 容器版

适合 Linux、飞牛、NAS 和 Unraid。重点是低负担基础监控、Docker / Podman 容器采集，以及控制同一台机器上的容器和 Compose 堆栈。

容器版可在设置页 Agent 管理中手动更新。Agent 会通过 Docker / Podman socket 拉取目标镜像并重建自身容器；如果当前版本已经是目标版本，只回报“已是最新版”，不会重新拉取或重建。

要求：

- 宿主机需要 Docker 或兼容运行时。
- 如果需要监控并控制同机容器，必须读写挂载 `/var/run/docker.sock`。
- 如果需要 Intel / AMD 核显指标，可按需映射 `/dev/dri`；不再默认依赖宿主机 `video/render` 组名。
- 容器镜像默认从 HTTPS Harbor 拉取：`registry.example.com/infra/pulse-agent:1.0.5`。
- Agent 必须使用专用数据目录保存配对凭据和本地状态，不再建议使用当前目录下的临时相对路径。

当前安装入口拆成三类：

- 通用 Linux：Docker Compose，默认数据目录 `/opt/pulse-agent/data`。
- 飞牛 / NAS：Docker Compose，可直接下载 `pulse-agent-flynas.yml`，默认数据目录 `/vol1/1000/docker/pulse-agent/data`。
- Unraid：模板下载命令，可直接把 `pulse-agent-unraid.xml` 写入 `/boot/config/plugins/dockerMan/templates-user`，默认数据目录 `/mnt/user/appdata/pulse-agent`。

默认示例会同时开放宿主机根目录、DMI、/dev/mem 和 GPU 入口，方便安装后直接获得完整采集能力；如果目标机器权限更严格，也可以在设置页里按需关闭单项能力。

示例：

```yaml
services:
  pulse-agent:
    image: registry.example.com/infra/pulse-agent:1.0.5
    container_name: pulse-agent
    restart: unless-stopped
    network_mode: host
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /opt/pulse-agent/data:/var/lib/pulse-agent
    environment:
      TOKEN: "YOUR_AGENT_TOKEN"
      HUB_URL: "http://YOUR_HUB:8090"
      INSTALL_METHOD: docker
      RUN_MODE: docker
      AGENT_PROFILE: linux-container
```

配对安装时，生成的 Compose 预览会把一次性配对逻辑写成 YAML 块标量，并通过 `PAIR_CODE` 环境变量在容器内展开，避免把 shell 单引号直接嵌进 `entrypoint` 后把 YAML 结构弄坏。

按需增强采集时再补：

- `/:/host:ro`
- `/sys/firmware/dmi:/sys/firmware/dmi:ro`
- `/dev/dri:/dev/dri`
- `/dev/mem:/dev/mem`
- `--security-opt systempaths=unconfined`
- `CAP_PERFMON`
- `CAP_SYS_RAWIO`

如果当前 SSH 用户没有 Docker 权限，先用有权限的 root / 管理终端执行，或手动改成 `sudo docker compose ...`。`sudo` 需要交互密码时，命令仍会停在终端里等待输入，这是权限问题，不是镜像问题。

Unraid 模板安装说明：

- Unraid 的主入口是下载命令，命令会把 XML 模板写入 `/boot/config/plugins/dockerMan/templates-user/pulse-agent-unraid.xml`。
- 直接执行时默认按 `root` 权限写入；如果 SSH 已经是 root，就不需要再手动加 `sudo`。
- 写入后的 XML 仍然保留 `Network=host`、`Privileged=true`、`ExtraParams`、`Config`、`PostArgs` 等原有模板语义。
- 一次性配对模板通过 `PostArgs` 执行 `agent pair`，并额外写入 `/var/lib/pulse-agent/paired.code` 作为首次安装标记；如果旧的 `token` / `paired.env` / `pairing.json` 残留，模板会先清理再重新配对，避免重装后检测不到新机器。

## Hub 标准部署

Linux / 飞牛 / NAS 上部署 Hub 时，标准方式是 Hub 和 Hub 同机 Agent 一起安装。这样 Hub 所在机器会自动进入监控范围，也能采集和控制同机容器。

推荐使用：

```text
supplemental/docker/hub/docker-compose.yml
```

首次部署不用先在 Hub 页面添加 Hub 所在机器；标准 Compose 会用 loopback-only Hub 同机 Token 自动注册 Hub 同机 Agent，页面显示真实机器名并带 `Hub` 标签，且这条 Hub 机器记录不能删除：

```bash
export PULSE_AGENT_HUB_URL="http://127.0.0.1:8090"
docker compose pull
docker compose up -d
```

同机 Agent 的 `HUB_URL` 默认可以写 `http://127.0.0.1:8090`；如果要让模板更明确，也可以写 Hub 所在机器的局域网地址。

## 后续维护

- 发布新版本时，Hub 和 Agent 必须同步升级到同一个显式版本号。即使本次主要修改 Hub，也要重新构建并发布同版本 Agent 镜像和 Windows 安装包，避免 Agent 端采集、更新、容器控制等改动没有跟上。
- Windows 主机版：在设置页 Agent 管理中点击更新；如果版本已最新，只回报“已是最新版”。
- Linux 容器版：在设置页 Agent 管理中点击更新；需要容器挂载 Docker / Podman socket 才能拉取镜像并重建自身容器。
- 两种模式都只依赖 `TOKEN` 和 `HUB_URL` 完成接入。




