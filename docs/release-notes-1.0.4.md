# Pulse 1.0.4 更新说明

发布日期：2026-06-13

`1.0.4` 是 `1.0.3` 之后的移动端、容器治理和 Hub / Agent 发布同步版本，重点是把 Android / PWA 基础闭环、移动端 App 化布局、容器操作安全、本机 Hub 标记修复和设置页整理一起发布。

## 升级重点

- Hub 发布版本：`registry.example.com/infra/pulse-hub:1.0.4`。
- Linux / NAS Agent 发布版本：`registry.example.com/infra/pulse-agent:1.0.4`。
- Windows Agent 安装包：`pulse-agent_windows_amd64.exe`，版本 `1.0.4`。
- Android App 版本：`1.0.4`。
- Hub、Agent、前端包、Android App、Dockerfile 默认参数、发布脚本、安装模板和 Compose 模板使用同一个显式版本号。

## Web / Hub

- 容器页补强 Pulse 自身容器保护：`pulse-hub` / `pulse-agent` 等监控系统相关容器不允许通过通用容器页启动、停止、重启或更新镜像。
- 包含 Pulse 自身容器的 Compose 编排会阻止通用操作；Agent 更新统一走设置页 Agent 管理。
- Hub 入库容器数据时会强制清空 Pulse 自身容器的 Compose stack 字段，避免 `pulse-agent` 被错误归入 Harbor 等业务编排。
- 容器页桌面端 Compose 编排行重新整理，标题、状态、操作按钮和展开按钮同排居中，机器名和容器数量不再重复显示。
- 没有独立容器时只显示“无”，不再渲染空表格和说明文案。
- 移除容器页标题区右上角重复的总数徽标，保留机器卡和分组区域内的统计信息。
- 网站监控页移除顶部说明卡片，机器筛选改为搜索框旁下拉，状态统计跟随“监控列表”标题展示。
- 网站监控检测状态条统一视觉尺寸，列表紧凑态和详情态复用同一套高度、内边距和间距规则。
- 告警页移动端使用时间线列表和详情 Sheet，告警设置入口收进右上角操作。
- 设置页整体骨架、常规页列线、Agent Token、通知、日志、用户和关于页继续统一布局节奏。
- 通知设置页改为站内告警、外部通道、失败记录概览加通道列表；新增、编辑、测试和删除统一到清晰操作。
- 系统日志列表只展示时间、级别、事件和重点摘要，完整消息与 JSON 数据改为弹窗查看，并补充中文字段说明。
- 关于页版本更新记录继续长期保留，默认展开最新版本。
- 机器详情、网站监控和容器监控统一机器显示名口径，避免同一台机器在不同页面显示为旧名称或随机 ID。
- 完全移除旧项目兼容残留：旧 API 前缀、旧环境变量 fallback、旧 WebSocket 请求头、旧 Agent 服务名识别、旧容器名保护、旧前端别名、旧 release 包名识别和本地旧数据 / 备份目录继续清理。
- 前端中文翻译目录清理后，`zh-CN` 构建统计缺失翻译降为 `0`，后续构建告警更容易暴露真实问题。
- 前端静态噪音继续收敛，移除登录表单调试输出，补齐部分显式类型，减少无意义 TypeScript / Biome 压制。

## 移动端 / Android App

- 新增 Capacitor Android 壳，手机端继续复用现有 React / Vite 前端，不新增手机 Agent 数据模型。
- Android App 首次打开需要配置 Hub 地址，Hub 地址保存到 App 存储；登录页和关于页都能查看或修改当前 Hub 地址。
- Android WebView 允许访问内网 HTTP Hub，保存 Hub 地址前会检测 `/api/health`，连接失败时在页面内给出明确反馈。
- 新增 PWA manifest、Service Worker、移动端安全区域适配、只读离线快照和 Android 通知桥。
- 手机端底部导航固定为首页、机器、告警、网站、容器，设置、关于、Agent 管理、Token 和日志收进更多 / 设置入口。
- 手机端首页、机器列表、机器详情、告警、网站和容器改为列表优先、详情钻取、底部 Sheet 确认和固定高度图表，减少桌面后台布局压缩到手机后的拥挤感。
- 高分辨率 Android 设备会根据触屏、DPR 和 WebView 视口保持移动端布局，避免 `1080x2400` 这类设备误回桌面版。
- Android 壳启动时会清理旧 WebView 资源缓存，降低 APK 更新后继续显示旧前端的概率。

## Agent

- Hub 同机 Agent 页面显示真实机器名，不再显示“本机”或追加括号，统一通过 `Hub` 标签标识。
- 只有安装 Hub 的机器会随部署自动加入 Hub 同机 Agent；删除保护继续由后端 `is_local` 字段控制。
- Hub 启动时会校验 `is_local` 系统记录是否绑定当前 Hub 同机 Agent token，自动清理旧 fingerprint 或普通 Agent token 导致的历史误标。
- 非 Hub 机器不会再因为历史 `is_local` 残留错误显示 `Hub` 标签。
- NAS 标签识别补回，存储备份用途或名称 / 说明包含 NAS、FNOS、飞牛时显示 NAS 标签。
- 单容器和 Compose 编排操作确认后显示执行中进度、当前操作说明和旋转状态，避免耗时操作看起来无响应。

## 部署 / 发布

正式部署目录继续使用 `/vol1/1000/docker/pulse`。

```yaml
services:
  pulse-hub:
    image: registry.example.com/infra/pulse-hub:1.0.4
    container_name: pulse-hub
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./pulse_data:/pulse_data
    command: ["serve", "--dir=/pulse_data", "--http=0.0.0.0:8090"]

  pulse-agent:
    image: registry.example.com/infra/pulse-agent:1.0.4
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

- 前端构建已通过：`npm.cmd --prefix internal/site run build`，`zh-CN` 缺失翻译为 `0`。
- Hub / Agent 关键测试已通过：`go test -tags testing ./internal/hub -run "AgentRelease|RepairLocalSystemMarkers|LocalAgent|SystemDelete|PublicInfo"`。
- Android 构建已通过：`npm.cmd --prefix internal/site run android:sync` 和 `internal/site/android/gradlew.bat -p internal/site/android assembleDebug -PpulseVersionName=1.0.4 -PpulseVersionCode=10004`。
- Android Debug APK 输出：`internal/site/android/app/build/outputs/apk/debug/app-debug.apk`，大小 `5362872` 字节。
- Windows Agent 安装包已生成：`build/releases/agent/1.0.4/pulse-agent_windows_amd64.exe`，大小 `9837568` 字节，sha256 为 `9a0f1a31376168a2c9e700b92baf440f854cdda6daac29866f876a83a562c8d2`。
- Agent release manifest 已生成：`build/releases/agent/1.0.4/manifest.json` 和 `pulse_data/agent-releases/1.0.4/manifest.json`。
- Harbor 已验证可拉取 `registry.example.com/infra/pulse-hub:1.0.4`，digest 为 `sha256:c2e3c9c948ccf0cfceff484a4d61c37cdb004ca2bb842d4553a73c66e67d8215`。
- Harbor 已验证可拉取 `registry.example.com/infra/pulse-agent:1.0.4`，digest 为 `sha256:85e743aa353f74bcce0c97e076c4b257455a6edf624208c50293fd5187125280`。
- 飞牛正式目录 `/vol1/1000/docker/pulse/docker-compose.yml` 已更新为 `1.0.4` 镜像 tag。
- 飞牛当前运行服务尚未完成容器重建：`http://192.168.1.30:8090/api/pulse/public-info` 仍返回 `v=1.0.3`；当前 SSH 用户无法访问 Docker socket，`sudo docker` 需要交互密码。

## 已知注意事项

- Android App 使用 App 存活通知桥，不引入完整远程推送服务；App 被系统完全杀掉时不承诺收到系统通知。
- Android WebView 以 `https://localhost` 加载内置页面时访问内网 `http://<LAN-IP>:8090` Hub 仍可能产生 Mixed Content 日志噪音，后续需要单独收敛。
- 本次本机 Docker 构建 Linux 镜像时访问 Docker Hub token 接口超时，Hub / Agent 镜像改用 Harbor VM 远程构建；远程 Docker 没有 buildx，临时构建目录使用 legacy builder 兼容补丁并设置 `GOPROXY=https://goproxy.cn,direct`。
- 飞牛容器重建需要具备 Docker 权限的 SSH 用户或一次性 sudo 密码，待执行 `docker compose pull && docker compose up -d --force-recreate` 后再验证运行版本为 `1.0.4`。
