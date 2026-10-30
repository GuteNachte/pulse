# Pulse 1.0.5 更新说明

发布日期：2026-06-23

`1.0.5` 是 `1.0.4` 之后的上线级收口版本，重点是把机器接入、Agent 安装、真实采集、客户端/详情页视觉、操作审计、安全权限、Android App 和发布验证流程统一到可正式交付的状态。

## 升级重点

- Hub 发布版本：`registry.example.com/infra/pulse-hub:1.0.5`。
- Linux / NAS / Unraid Agent 镜像：`registry.example.com/infra/pulse-agent:1.0.5`。
- Windows Agent 安装包：`pulse-agent_windows_amd64.exe`，版本 `1.0.5`。
- Android App 版本：`1.0.5`，`versionCode=10005`。
- Web、Hub、Agent、Android App、Dockerfile、Compose 模板、安装模板、发布脚本和文档固定到同一个显式版本号。

## Web / Hub

- 添加机器流程改为一次性配对：生成配对码不会提前创建机器记录，Agent 安装、上线并完成身份确认后才进入客户端列表。
- 客户端资产卡片和机器详情页重做为更紧凑的运维工作台样式，降低无效信息密度，保留真实状态、IP、硬件、网络、容器和告警入口。
- 机器详情页新增身份详情弹窗，展示显示名、真实主机名、目标 IP、连接 IP、上报 IP、指纹摘要和 Agent Profile。
- 硬件标签改为只使用真实采集来源：CPU 厂商、内存 DDR 类型、磁盘 SSD/HDD/NVMe、GPU 核显/独显、温度归属、网卡速率和 IP 获取方式都不再用前端占位推断。
- 系统详情设备能力条按 Agent 上报的 `collection_results` / `diagnostics` 展示能力状态，旧 Agent 或未上报诊断时显示未知，不再用前端列表数据反推“可用”。
- Unraid、Hub、NAS 等机器类型标签优先读取真实系统身份和 OS 信息，不再把 Unraid 误显示为通用 `Linux 容器版`。
- 网站监控页重做桌面双栏和手机卡片视图，详情页固定展示内网/外网入口，外网未配置时显示“未配置”。
- 操作记录和操作审计拆分：机器详情能看到相关操作记录，设置页提供全局操作审计、系统日志、告警历史、备份和用户管理入口。
- Hub 增加登录失败限速、只读角色写入拦截、Token 默认脱敏、审计敏感文本脱敏、历史数据保留上限和清理任务摘要日志。

## Agent

- Windows 主机版补齐完整安装模板，支持一行命令和完整 PowerShell 脚本，可视化配置安装目录、数据目录、日志目录、清理旧数据、NSSM、启动服务和防火墙规则。
- Linux 安装方式拆分为通用 Linux、飞牛 / NAS 和 Unraid：
  - 通用 Linux 默认数据目录 `/opt/pulse-agent/data`。
  - 飞牛 / NAS 默认数据目录 `/vol1/1000/docker/pulse-agent/data`，支持下载 Compose 文件。
  - Unraid 使用 root 直连下载命令，把 XML 模板写入 `/boot/config/plugins/dockerMan/templates-user/pulse-agent-unraid.xml`。
- Linux / 飞牛 / Unraid 模板默认开启基础指标、Docker / Podman、宿主机根目录、DMI、`/dev/mem` 和 GPU 采集入口；权限不足时由能力诊断显示真实原因。
- 修复 Unraid / Linux 重装后“装上了但检测不到”的问题：首次配对显式写入 `/var/lib/pulse-agent/paired.code`，标记不匹配时清理旧凭据再重新配对。
- 修复 Unraid `/dev/mem` 设备映射语法，不再使用卷挂载专用 `:ro` 模式。
- 网络采集收敛为真实物理网卡，过滤虚拟网卡；客户端卡片优先显示真实上行 / 下行速率。
- Windows Agent 补齐网卡详情、内存条、GPU、服务/软件监控等采集路径；Linux 容器 Agent 保持容器、SMART、GPU、虚拟化和网络详情边界。

## 移动端 / Android App

- Android App 与 Web / Hub / Agent 固定使用 `1.0.5` 同版本。
- 移动端首页、客户端、机器详情、网站、容器、告警、设置、用户、备份、日志和关于页统一为触控优先布局。
- 关键按钮、筛选、弹窗、Sheet、表格行操作和分页补齐 40px 级触控区域。
- 移动端支持首次配置 Hub、登录、MFA、离线只读缓存和内网 Hub 访问。

## 视觉与交互

- 按 Cal 风格统一全局颜色、圆角、按钮、卡片、输入框、徽章、Tabs、Select、Table、桌面导航和移动底栏。
- 非状态类胶囊标签统一收敛为 8px 圆角对象；真实在线点、告警状态、进度条、开关滑块继续保留语义样式。
- 全站空态、加载态、弹窗、Toast、Tooltip、Dropdown、命令面板类浮层、Sheet 和 Dialog 统一浅灰 surface + 白底对象层级。
- 图表底部安全间距修正，避免图例或时间轴贴到边框。

## 部署 / 发布

正式部署仍推荐 FlyNAS / Linux / NAS 使用 Hub + Hub 同机 Agent 的同机 Compose，默认 `network_mode: host`。

```yaml
services:
  pulse-hub:
    image: registry.example.com/infra/pulse-hub:1.0.5
    container_name: pulse-hub
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./pulse_data:/pulse_data
    command: ["serve", "--dir=/pulse_data", "--http=0.0.0.0:8090"]

  pulse-agent:
    image: registry.example.com/infra/pulse-agent:1.0.5
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
    devices:
      - /dev/mem:/dev/mem
      - /dev/dri:/dev/dri
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

## 验收状态

- 本地前端检查、前端构建、Android 同步、Android Debug 构建、Hub / Agent 测试、版本一致性检查和本地发布产物验证均已有历史证据记录在 `docs/production-readiness-checklist.md` 与 `docs/production-acceptance-evidence.md`。
- 本次固定版本时重新执行的验证命令记录以当前终端输出为准。
- Harbor 推送和 FlyNAS 正式部署由部署执行人完成后，再按 `docs/release-deployment-runbook.md` 补充运行态证据。

## 已知注意事项

- macOS Agent 不纳入 `1.0.5`，后续版本单独规划。
- 正式部署前必须确认 Harbor 中 `pulse-hub:1.0.5` 和 `pulse-agent:1.0.5` 都存在。
- FlyNAS 上线前必须先备份 `pulse_data`，并保留回滚到 `1.0.4` 的 Compose tag 和验证命令。
- Android 远程系统通知不作为 `1.0.5` 第一版承诺范围；App 存活状态下的站内/本地通知能力保留。
