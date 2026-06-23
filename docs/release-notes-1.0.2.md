# Pulse 1.0.2 更新说明

发布日期：2026-06-08

`1.0.2` 是 `1.0.1` 之后的收敛版本，重点是把 Hub 同机 Agent、Agent 手动更新、机器模型、网站从属关系、容器 / 服务 / 网站告警，以及近期全局稳定性修复整理成一个可发布版本。

## 升级重点

- Hub 镜像：`registry.example.com/infra/pulse-hub:1.0.2`。
- Linux / NAS Agent 镜像：`registry.example.com/infra/pulse-agent:1.0.2`。
- Windows Agent 安装包版本：`1.0.2`。
- 继续使用明确版本号，不使用 `latest` 标签。

## Web / Hub

- 添加 / 编辑机器的信息模型拆分为“机器名称 / 机器类型 / 主要用途 / 说明”：机器名称由 Agent 上报的真实主机名生成，添加时不再手动填写名称。
- “机器类型”收敛为物理机、虚拟机两个固定选项；旧的服务器、工作站、NAS、mini PC、路由网关、自定义等历史属性会统一归为物理机。
- “主要用途”改为主力机、生产服务、开发调试、容器承载、网站服务、存储备份、下载任务、网络服务等固定选项，不再保留“自定义 / 其他”。
- 新增 `systems.primary_use` 字段并迁移旧 `custom` 用途记录，避免列表继续显示含糊的“自定义”。
- 客户端卡片将机器类型和主要用途移动到机器名称后方展示，并隐藏“属性 / 主要用途”前缀；说明行只显示机器说明内容。
- 统一机器类型、主要用途和离线不告警标签样式：详情页顶部、客户端卡片和表格说明列改用同一组件。
- 编辑已有机器时不再显示 Windows / Linux 容器双系统切换，只按当前 Agent 上报的安装方式显示对应编辑入口。
- 添加 / 编辑机器弹窗顶部移除重复说明文案；“离线时发送告警”改为单行展示；“说明”从多行文本框改为单行输入框。
- 设备详情页顶部指标概览固定为 CPU、内存、磁盘、网络、GPU、容器六张卡片；Linux / NAS 没有采集到 GPU 时也保留 GPU 卡片并显示“未发现”。
- 机器类型为“虚拟机”时，虚拟化类型、角色和识别结果移动到“设备能力”卡片右侧展示；原概览图表区域不再单独插入大块虚拟化信息卡。
- 网站监控从属关系第一阶段闭环：全局网站监控页新增按归属机器筛选，支持通过 `?system=<id>&add=1` 从机器详情直接打开添加弹窗并预选当前机器。
- 机器详情页新增“网站监控”入口，展示当前机器下属网站的状态、地址数量、响应时间和检测状态条。
- 删除客户端时同步清理该机器下属的网站监控和网站检测历史，避免删除机器后留下孤儿网站记录；`website_monitors.system` 增加索引。
- 单独删除某个网站监控时，Hub 会同步删除该监控的检测历史，并把对应未恢复告警标记为已恢复。
- 网站监控告警接入告警中心：归属到机器的网站检测异常时，会按 `网站：监控名` 写入告警记录，并在恢复后自动标记恢复。
- 容器 / 编排告警接入告警中心：Hub 在每次 Agent 新鲜上报容器状态并完成 `containers` 入库后同步告警记录。
- 独立容器异常按 `容器：名称` 写入，Compose 编排内的异常容器按 `编排：项目名` 聚合写入，恢复运行后自动标记恢复。
- Windows 服务 / 软件监控告警接入告警中心；删除或禁用某个服务、软件监控规则时，Hub 会立刻把对应未恢复告警标记恢复。
- 告警中心改为默认只展示告警记录；全局告警规则设置移动到页面右上角“告警设置”独立入口，通过右侧抽屉打开。
- 移除重点监控概念，容器默认进入容器监控和告警体系；软件与服务监控只保留在 Windows 机器详情页。
- 增强顶栏当前页面选中状态，优化容器监控页系统筛选卡、编排卡层级、分区标题和独立容器空状态。
- 修正容器编排展开行的交互结构，避免详情入口和启动 / 停止 / 更新按钮互相嵌套导致潜在黑屏或误触。
- 修复客户端列表表格视图行高异常：表格视图不再使用虚拟列表的固定行高估算，改为普通表格加横向滚动和粘性表头。
- 客户端列表新增明确的初次加载态和加载失败态，避免系统列表还在读取时短暂显示“未找到系统”。
- 告警中心空记录、系统日志分页、百分比图表负刻度、按钮默认 `type="button"`、添加系统弹窗挂载等全局测试问题完成修复。
- Hub 后台系统轮询遇到 Agent WebSocket 未连接、连接关闭这类预期离线状态时，不再每分钟写入 `System updater tick failed` / `System down` 系统日志。
- 设置页“关于”的版本更新记录改为长期保留历史版本记录，并同步展示 `1.0.2` 和既有历史版本的详细记录。
- 关于页版本更新记录改为折叠卡片显示，默认展开最新版，旧版本默认收起，减少页面初始长度。

## 移动端 / Android App

- 本版本尚未包含独立 Android App 功能改动；移动端版本号随 Hub / Agent / Web 口径保持一致。

## Agent

- Hub 标准部署方式改为 Hub 和本机 Linux Docker Agent 一起安装，正式 Linux / 飞牛 / NAS 部署时 Hub 所在机器会一起纳入监控。
- 同机 Agent 默认通过 `http://127.0.0.1:8090` 连接 Hub，并通过 loopback-only 本机 Token 自动注册为“本机”，不再需要先添加系统复制 Token。
- 本机 Agent 记录新增 `is_local` 标记，Hub 会固定显示为“本机”，并阻止从自定义删除接口和 PocketBase collection 删除路径删除这条记录。
- 修复本机 Agent 记录在后续系统详情采集时被真实 hostname 覆盖的问题；`is_local=true` 的系统记录会保持并自愈为“本机”。
- 如果本机 Agent 指纹已经对应旧系统记录，Hub 会原地升级为本机记录，避免重复生成机器。
- Agent 管理页改为 Windows 主机版和 Linux / NAS Docker 容器版左右双栏管理，每栏独立展示安装模板、支持功能、更新状态和版本仓库。
- 移除手动登记版本入口，版本仓库改为只读展示；Agent 版本只由发布流程生成并保存。
- Windows PowerShell 模板和 Linux / NAS Docker Compose 模板改为点击展开，默认收起。
- Agent 更新统一收口到设置页 Agent 管理；机器详情页不再保留单机 Agent 管理卡片。
- 移除 Agent 自动更新交互，Windows 主机版和 Linux / NAS Docker 容器版都改为手动点击更新。
- Agent 更新改为按版本号执行：目标版本不高于当前版本时，Agent 只回报“已是最新版”，不会强制重新下载、重新安装或重建容器。
- Linux / NAS 容器版 Agent 新增受控手动更新能力：通过 Docker / Podman socket 拉取目标镜像，并以原容器配置重建自身容器。
- Agent 管理页在当前版本等于目标版本时不再显示“可更新”，改为“已最新 / 无需更新”，并禁用更新按钮。
- Agent 和 Hub 版本保留策略统一收敛为最多保留最新 2 个版本，发布和本地测试脚本会同步清理旧文件与旧镜像 tag。

## 部署 / 发布

- 标准 Compose 默认仍使用 `network_mode: host`。
- `/dev/dri` 和 `/dev/mem` 设备映射改为按需启用，避免没有这些设备的 NAS 默认启动失败。

### Hub + 本机 Agent 标准部署

FlyNAS / Linux / NAS 正式部署推荐使用 Hub 和本机 Agent 同机 Compose：

```yaml
services:
  pulse-hub:
    image: registry.example.com/infra/pulse-hub:1.0.2
    container_name: pulse-hub
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./pulse_data:/pulse_data
    command: ["serve", "--dir=/pulse_data", "--http=0.0.0.0:8090"]

  pulse-agent:
    image: registry.example.com/infra/pulse-agent:1.0.2
    container_name: pulse-agent
    restart: unless-stopped
    network_mode: host
    privileged: true
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /:/host:ro
      - /sys/firmware/dmi:/sys/firmware/dmi:ro
      - ./pulse_agent_data:/var/lib/pulse-agent
    environment:
      TOKEN: "${PULSE_LOCAL_AGENT_TOKEN:-pulse-local-agent}"
      HUB_URL: "${PULSE_AGENT_HUB_URL:-http://127.0.0.1:8090}"
      INSTALL_METHOD: docker
      RUN_MODE: docker
      AGENT_PROFILE: linux-container
```

执行：

```bash
docker compose pull
docker compose up -d --force-recreate
```

### 单独 Linux / NAS Agent

更新 Compose 镜像：

```yaml
image: registry.example.com/infra/pulse-agent:1.0.2
```

执行：

```bash
docker compose pull
docker compose up -d --force-recreate
```

### Windows Agent

Windows 主机版在设置页 Agent 管理中点击更新；如果客户端返回当前已经是目标版本，页面会提示“已是最新版”，不会重新安装。

## 版本规则 / 验证

- 正式部署仍使用显式版本号，不使用 `latest`。
- Linux / NAS 容器控制需要读写挂载 `/var/run/docker.sock`；只读挂载只能监控，不能控制。
- GPU、SMART、DMI 内存详情依赖宿主机设备暴露和容器权限；采集不到时页面按“无”或“未发现”处理。
- 本机 Docker Desktop 的 `network_mode: host` 不能代表正式 Linux / NAS host 网络效果。
- Windows 服务控制、Agent 自更新和 GPU 采集仍应继续在真实 Windows 设备上回归观察。
- 已完成本地前端构建：`npm.cmd --prefix internal/site run build`。
- 已完成 Hub 系统相关测试：`go test ./internal/hub/systems -tags testing -count=1`。
- 已完成 Hub 关键本机记录测试：`go test ./internal/hub -tags testing -run "TestFindOrCreateLocalSystem|TestDeleteSystemRejectsLocalSystem" -count=1`。
- 已完成 Compose 配置校验：`docker compose -f supplemental\docker\hub\docker-compose.yml config` 和 `docker compose -f supplemental\docker\same-system\docker-compose.yml config` 均通过，并确认默认镜像为 `1.0.2`。
- 已完成 FlyNAS 真实 Linux host 网络临时验证：`1.0.2` Hub + `1.0.2` Agent 在 `/tmp/pulse-local-agent-check` 使用 `18090` 临时端口启动后，本机 Agent 自动注册为“本机”，`is_local=true`，状态为 `up`，删除接口返回“本机记录不能删除”；验证完成后已停止并清理临时容器和数据目录。
- Harbor 镜像已准备：`registry.example.com/infra/pulse-hub:1.0.2`、`registry.example.com/infra/pulse-agent:1.0.2`。
- 已完成飞牛 `192.168.1.30` 正式部署更新：正式目录 `/vol1/1000/docker/pulse` 已切换到 Hub + 本机 Agent 同机 Compose，`pulse-hub` 和 `pulse-agent` 均为 `1.0.2`，状态 healthy，`network_mode` 均为 `host`。
- 已验证正式 Hub 健康检查返回 `200`，`/api/pulse/public-info` 返回 `v=1.0.2` 和 `agent_hub_url=http://192.168.1.30:8090`，本机 Agent 日志显示 WebSocket 已连接。
