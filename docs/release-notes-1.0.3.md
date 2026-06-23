# Pulse 1.0.3 更新说明

发布日期：2026-06-10

`1.0.3` 是 `1.0.2` 之后的归属收敛和发布部署版本，重点是把项目外显信息、设置页、通知日志、Agent 发布链路、容器保护和飞牛正式部署目录统一到 Pulse 口径。

## 升级重点

- Hub 发布版本：`registry.example.com/infra/pulse-hub:1.0.3`。
- Linux / NAS Agent 发布版本：`registry.example.com/infra/pulse-agent:1.0.3`。
- Windows Agent 安装包：`pulse-agent_windows_amd64.exe`，版本 `1.0.3`。
- Hub 与 Agent 已按同一个显式版本号同步构建、同步推送、同步部署。
- 飞牛正式部署目录统一为 `/vol1/1000/docker/pulse`。

## Web / Hub

- 前端运行时、关于页、安装模板、Compose 模板、本地开发脚本、发布脚本和 Docker 镜像命名统一使用 Pulse / `pulse-hub` / `pulse-agent` / `pulse_data`。
- Go module 路径迁移为 `gutenacht.site/pulse`，根包、Hub / Agent 版本变量、构建 ldflags、心跳和网站监控 User-Agent 统一改为 Pulse 口径。
- 前端包名和构建输出改为 `pulse@1.0.3`，README、Issue / Discussion / PR 模板和安全说明改为 Pulse 项目说明。
- 删除不再使用的旧上游 GitHub release 自更新器，API 前缀、环境变量和 Agent 请求头统一为 Pulse 口径。
- 设置页整体骨架重新整理，左侧导航、右侧内容、标题区、分隔线和常规表单列线统一对齐。
- 常规设置页定位为用户显示偏好，新增界面偏好分组，图表选项、单位偏好和阈值输入使用一致列宽。
- 通知设置页重做为站内告警、外部通道、失败记录概览加通道列表；新增、编辑、测试和删除都收口到清晰操作。
- 系统日志页列表只显示时间、级别、事件和重点摘要，完整消息与 JSON 数据改为弹窗查看。
- 关于页版本更新记录改为折叠卡片，并长期保留全部历史版本记录。
- 网站监控页移除顶部说明卡片，机器筛选改为搜索框旁下拉，状态统计跟随“监控列表”标题展示。
- 客户端页移除表格视图，只保留卡片视图；监控大屏卡片去掉“客户端”兜底字样，并补充机器标签。
- 全站机器标签改为低饱和 pill 风格，白天和夜间模式都更协调。
- 修复夜间模式折线图 / 面积图内部淡蓝色背景块问题，公共图表容器和 hover 层统一透明。

## 移动端 / Android App

- 本版本尚未包含独立 Android App 功能改动；移动端版本号随 Hub / Agent / Web 口径保持一致。

## Agent

- Agent 管理页版本状态进一步收敛：已是最新版时不再显示“可更新”，按钮禁用为“无需更新”。
- Agent 更新请求发出后，在目标 Agent 真正上报到目标版本前显示“更新中”，避免容器重建期间误判失败。
- `publish-agent-v1.ps1` 在 `-SkipPush` 时不再把未推送的 Linux 镜像写入 Agent 版本仓库，避免页面提示可更新但远端镜像不存在。
- Agent 版本仓库和本地发布产物继续最多保留最新 2 个版本。
- Windows 传感器辅助程序改为 `pulse_lhm`，Agent 临时目录、S.M.A.R.T. 辅助解包目录和代理环境变量改为 Pulse 命名。
- 容器页只保护 Pulse 自身相关容器和包含 Pulse 容器的 Compose 编排，Harbor 编排保留正常操作能力。
- 单容器和 Compose 编排操作确认后增加“执行中”状态、旋转图标和不确定进度条，避免耗时操作看起来无响应。
- Windows 软件与服务监控闭环继续验证：软件搜索、Windows 服务搜索、规则保存、Agent 采集回传和详情页展示可用。
- 删除或禁用软件 / 服务监控规则后，Hub 会同步清理对应状态记录，避免规则已移除但状态表残留。
- Windows 受保护服务控制边界已验证，受保护服务不会被下发启动、停止或重启。
- Windows 软件监控排除 Docker、containerd、Podman 等容器运行时，避免容器运行时被当作普通软件监控。
- 修复非本机机器名称被 Agent 真实 hostname 覆盖的问题，只在本机记录自愈或历史“本机”名称迁移时自动改名。
- 网站监控检测状态条统一视觉尺寸，避免绿色 / 红色检测块与蓝色选中边框错位。

## 部署 / 发布

本次已完成飞牛 `192.168.1.30` 正式部署：

- `publish-release-v1.ps1` 作为统一发布入口，后续每个新版本都必须同步构建并推送 Hub、Linux Agent 镜像和 Windows Agent 安装包。
- Harbor 宿主机启用 `harbor-compose-recover.service`，Docker 启动后自动恢复 `/opt/harbor` 编排，降低 Harbor 重启后只剩 `harbor-log` 的复发风险。
- 正式目录：`/vol1/1000/docker/pulse`。
- 数据目录：`/vol1/1000/docker/pulse/pulse_data`。
- Agent 数据目录：`/vol1/1000/docker/pulse/pulse_agent_data`。

当前 Compose：

```yaml
services:
  pulse-hub:
    image: registry.example.com/infra/pulse-hub:1.0.3
    container_name: pulse-hub
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./pulse_data:/pulse_data
    command: ["serve", "--dir=/pulse_data", "--http=0.0.0.0:8090"]

  pulse-agent:
    image: registry.example.com/infra/pulse-agent:1.0.3
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
      TOKEN: "${PULSE_LOCAL_AGENT_TOKEN:-pulse-local-agent}"
      HUB_URL: "${PULSE_AGENT_HUB_URL:-http://127.0.0.1:8090}"
      INSTALL_METHOD: docker
      RUN_MODE: docker
      AGENT_PROFILE: linux-container
```

## 发布验收

- Harbor 已验证可拉取 `registry.example.com/infra/pulse-hub:1.0.3`，digest 为 `sha256:c3bc7d4be1bdfb6b7bc80ce3c94e631e5e8c2c1c09b733cec4b74430430d9c16`。
- Harbor 已验证可拉取 `registry.example.com/infra/pulse-agent:1.0.3`，digest 为 `sha256:fc99f4400cafcfda7b3a5caa04adb107ed30920fd3033d8fde20d4dc2f143132`。
- 飞牛 `docker compose ps` 已确认 `pulse-hub` 与 `pulse-agent` 均为 `Up ... (healthy)`。
- 飞牛 Hub 健康检查 `http://127.0.0.1:8090/api/health` 返回 `200`。
- 飞牛 `http://127.0.0.1:8090/api/pulse/public-info` 返回 `v=1.0.3`，`agent_hub_url=http://192.168.1.30:8090`。
- 飞牛容器内版本检查：`pulse version 1.0.3`，`pulse-agent 1.0.3`。
- 飞牛 Agent 日志显示 `WebSocket connected host=127.0.0.1:8090`。

## 已知注意事项

- 本地 Docker Desktop 当前不可用，本次镜像使用 Harbor VM 远程构建发布；Harbor VM 没有 buildx，远程临时构建目录使用 Docker builder 处理。
- 远程构建时使用 `GOPROXY=https://goproxy.cn,direct`，避免 `proxy.golang.org` 网络超时。
- 前端构建仍提示 `zh-CN` 目录有 7 条缺失翻译，需要后续单独清理。
