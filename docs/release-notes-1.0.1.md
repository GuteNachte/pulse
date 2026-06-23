# Pulse 1.0.1 更新说明

发布日期：2026-06-05

`1.0.1` 是 `1.0.0` 首个正式版之后的收敛更新，重点是把 Agent 接入、容器编排、GPU / 硬件采集、告警设置、网站监控、登录和本地开发环境整理成一个可发布版本。

## 升级重点

- Hub 镜像：`registry.example.com/infra/pulse-hub:1.0.1`。
- Linux / NAS Agent 镜像：`registry.example.com/infra/pulse-agent:1.0.1`。
- Windows Agent 安装包版本：`1.0.1`。
- 继续使用明确版本号，不使用 `latest` 标签。

## Web / Hub

- 新增 `/api/pulse/public-info`，About 页面、前端初始化和安装命令复制都从同一个运行时接口读取 Hub 版本和 Agent Hub 地址。
- 安装命令不再使用浏览器当前地址推断 Hub，改为读取 Agent 实际可访问的 Hub 地址，避免复制到其他机器后仍指向 `localhost`。
- 设置新增“关于”页面，展示 Hub 版本、Agent 基线版本、当前 Hub 地址和版本更新记录。
- 关于页 Hub 地址展示 Agent / 其他机器实际可访问的 Hub 地址，不再显示 `localhost`。
- 登录页收敛为 `Pulse` 字标和登录 / 创建账户表单，去掉多余说明与其他登录方式。
- 修复本地开发登录链路：Vite 深层路由不再把当前页面路径拼进 PocketBase 认证接口。
- 登录态刷新逻辑收敛：只有明确 `401/403` 才提示重新登录，开发服务短暂中断不再弹红色错误提示。
- 修复语言包激活时序导致登录页刷新后校验文案崩溃的问题。
- 容器监控页合并“容器 / 堆栈”视图：上方展示编排，下方展示未归属编排的独立容器，避免同一个容器重复出现。
- “堆栈”统一改名为“编排”，Compose 配置按钮改为“Compose详情”。
- 编排卡片支持整卡点击展开 / 收起，末尾保留折叠箭头；操作按钮不会误触发展开。
- 编排下的容器列表改为带表头的表格，补充端口、镜像、状态、更新时间等信息。
- 编排内单个容器支持启动、重启、停止、更新镜像，并保留点击查看详情。
- 修复 Docker label 读取串标签问题，避免 `pulse-agent` 被错误显示到 Harbor 编排里。
- 容器实时记录入库会清理同一机器本轮未出现的旧容器 ID，容器删除、重建或换 ID 后不再残留到旧编排里。
- 容器控制超时放宽并按操作上下文管理，Harbor 等多容器编排重启更稳定。
- 容器监控页机器名称加载逻辑加固，不再把 PocketBase 内部机器 ID 当作名称短暂显示。
- 告警入口收敛到“告警中心”，移除单台机器上的单独告警按钮。
- 告警中心新增“告警设置 / 告警记录”页签，资源阈值规则作为全局策略统一管理。
- 新增 `alert_policies` 集合和 `/api/pulse/alert-policies` API；全局资源告警会同步维护每台机器上的实际告警记录。
- 新增机器会自动继承当前用户已有的全局资源告警策略。
- 网站监控支持归属机器，添加 / 编辑网站时可以选择网站属于哪台机器。
- 网站监控支持一个服务配置多个检测地址，并区分内网 / 外网、IPv4 / IPv6。
- 独立 `/services` 页面取消，软件与服务监控只保留在 Windows 机器详情页。
- Windows 机器详情页的软件与服务区域补齐空状态入口，没有规则时也能直接添加软件或服务。
- Linux / NAS / 容器版机器不再显示软件与服务入口和能力标签。
- 移除用户侧“重点监控”概念：容器采集后默认进入容器监控和告警体系；软件和服务保留为每台机器里的手动监控规则。
- 站点品牌名统一为短英文 `Pulse`，浏览器标题、PWA 名称、登录页和导航字标统一。
- 顶部导航收敛：容器监控放回主导航并靠近网站监控，账户菜单保留告警中心、系统设置和退出。
- 顶部 `Pulse` 字标去掉图标，保持纯文字，鼠标悬停时只切换为简洁蓝色。
- 首页、客户端、告警中心、网站监控、容器监控等页面完成多轮交互优化：卡片 hover、按钮高度、触控面积、暗色模式阴影、Tabs 动画和空状态都做了收敛。
- 容器监控页机器筛选卡片改为紧凑样式。
- 网站监控页新增页面说明区、客户端入口、未选中空状态和更清晰的添加 / 编辑弹窗布局。

## 移动端 / Android App

- 本版本尚未包含独立 Android App 功能改动；移动端版本号随 Hub / Agent / Web 口径保持一致。

## Agent

- Hub、Windows Agent、Linux / NAS Docker Agent 当前发布版本统一为 `1.0.1`。
- Windows 安装命令继续简化为一条 `irm ... | iex`，安装包下载地址会自动替换为真实 Hub 地址。
- Windows 卸载清理命令补齐 NSSM 清理步骤，删除服务、停止进程、清理数据目录和卸载 NSSM 的链路更完整。
- Agent 自动更新逻辑收敛为：自动更新只在发现更高版本号时执行；手动立即更新会强制拉取当前最新版，即使版本号相同也会重新安装。
- 本地 Agent release 同步会按磁盘文件重新计算 `sha256`，避免同版本重新发布后校验值过期导致更新失败。
- Agent 新增优雅停止入口，WebSocket 集成测试会在每轮结束后清理后台连接，避免旧 Agent 重连污染后续用例。
- Windows PowerShell 采集命令增加默认超时保护，避免网卡、GPU、内存、服务、软件等查询异常时长期卡住 Agent 或测试进程。
- Windows GPU 采集收敛为“同一张显卡只保留一个规范数据源”：NVML / `nvidia-smi` 已采集到 NVIDIA 独显时，不再额外生成性能计数器副本。
- Windows GPU Engine 性能计数器作为兜底，仅在没有规范采集源时保留核显或其他 GPU 数据。
- GPU 数据增加显卡类型字段，页面用“独显 / 核显”标签区分。
- GPU 文案统一：`VRAM` 改为“显存”，“使用”改为“负载”，单显卡功耗图标题显示显卡名称。
- GPU 能力展示只按真实采集结果判断：有数据显示“可用”，没有采集到显示“无”，不再按安装方式推断为“可检测”。
- 网络采集和系统顶部网卡展示默认只保留当前实时流量最高的网卡，减少 VPN / 虚拟网卡误显示为主网卡的问题。
- Linux / Windows Agent 增加虚拟化识别能力；只有机器用途选择为虚拟化时，页面才展示 Hyper-V、KVM/QEMU、VMware、VirtualBox 等虚拟化标签。
- Linux 容器版继续支持 DMI 内存条详情采集，安装模板保留 `/sys/firmware/dmi`、`/dev/mem` 和相关权限说明。

## 部署 / 发布

- 本地开发固定使用源码预览：Hub `8090`，Vite `5173`。
- Docker 只用于发布前等价测试和最终镜像打包。
- 新增并收敛 `supplemental/scripts/run-hub-dev.ps1`：启动、重启、停止本地开发环境，固定日志目录，处理端口占用，并避免启动时打开 Windows “此电脑”。
- Vite 开发前端固定把 `/api` 和 `/_/` 代理到本地 Hub `127.0.0.1:8090`。
- 本地开发启动脚本会同步 `build/releases/agent` 到 `pulse_data/agent-releases`，清空数据库后 Windows 安装命令也能下载 Agent。
- Agent 发布脚本会同时把 `manifest.json` 写入 `pulse_data/agent-releases` 和 `build/releases/agent`，确保 Hub 镜像内置的 Windows Agent 下载包不会缺少 manifest。
- Go 依赖下载默认使用 `https://goproxy.cn,direct`。
- 文档新增开发前必读清单、项目协作规则、本地开发运行手册、Agent 能力边界、FlyNAS Compose 检查清单和当前二开盘点。

### Hub

FlyNAS / Linux / NAS 正式部署更新 Compose 镜像：

```yaml
services:
  pulse-hub:
    image: registry.example.com/infra/pulse-hub:1.0.1
    container_name: pulse-hub
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./pulse_data:/pulse_data
    command: ["serve", "--dir=/pulse_data", "--http=0.0.0.0:8090"]
```

执行：

```bash
docker compose pull
docker compose up -d --force-recreate
```

### Linux / NAS Agent

更新 Compose 镜像：

```yaml
image: registry.example.com/infra/pulse-agent:1.0.1
```

执行：

```bash
docker compose pull
docker compose up -d --force-recreate
```

### Windows Agent

Windows 主机版可以在 Agent 管理页登记 `1.0.1` 发布包后，对支持自更新的 Windows Agent 发起更新。手动立即更新会强制拉取当前版本安装包并重新安装。

## 版本规则 / 验证

- 发布仍使用显式版本号，不使用 `latest`。
- Linux / NAS 容器控制需要读写挂载 `/var/run/docker.sock`；只读挂载只能监控，不能控制。
- GPU、SMART、DMI 内存详情依赖宿主机设备暴露和容器权限；采集不到时页面按“无”或不显示处理。
- 本机 Docker Desktop 的 `network_mode: host` 不能代表正式 Linux / NAS host 网络效果；发布前仍使用项目脚本做等价检查。
- Windows 服务控制、Agent 自更新和 GPU 采集应继续在真实 Windows 设备上回归。
- Hub 集成测试同步到新逻辑：首个用户创建请求补齐用户名字段，容器操作超时断言匹配放宽后的真实超时，通用 Token WebSocket 用例等待系统状态落库并清理每轮 Agent。
- Agent 测试收敛：WebSocket / ConnectionManager 用例改为轻量 Agent，Linux GPU 工具模拟用例在 Windows 上跳过，文件不存在断言不再依赖英文错误文案。
- 2026-06-05 已推送 Harbor 镜像 `registry.example.com/infra/pulse-hub:1.0.1` 和 `registry.example.com/infra/pulse-agent:1.0.1`。
- 2026-06-05 已在飞牛 `192.168.1.30` 完成 Hub 和 Agent Compose 更新，两个容器均为 `healthy`。
- 飞牛 Hub `/api/pulse/public-info` 已验证返回 `{"v":"1.0.1","cu":false,"agent_hub_url":"http://192.168.1.30:8090"}`。
