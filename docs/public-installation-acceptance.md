# Pulse 1.0.6-beta.1 公开安装验收

验收日期：2026-07-27

## 验收边界

本轮从 GitHub Release 重新下载公开附件，在仓库构建目录之外的全新临时目录执行，避免复用本地构建产物。Docker Hub 使用独立数据目录和 `127.0.0.1:18090` 临时端口，不触碰现有开发实例，不部署 FlyNAS。

## 已通过项目

| 项目 | 结果 |
| --- | --- |
| Release 下载 | 8 个附件均可从公开 Release 直接下载 |
| 文件完整性 | `SHA256SUMS` 中 7 个受校验文件全部匹配 |
| 发布清单 | schema、版本、提交、时间、6 个产物和两份 GHCR 镜像地址正确 |
| Windows Agent | 下载版执行 `--version` 返回 `pulse-agent 1.0.6-beta.1` |
| Android APK | 包名 `site.gutenacht.pulse`，`versionName=1.0.6-beta.1`，`versionCode=10006`，v2 签名验证通过且无签名错误 |
| Compose | Hub + Agent 与独立 Agent 两份 YAML 均可由 `docker compose config` 完整解析，镜像为公开 GHCR 显式版本 |
| GHCR | Hub / Agent 镜像均可直接 `docker pull`，digest 与 Release 记录一致 |
| Agent 容器 | `docker run --rm ... --version` 返回 `pulse-agent 1.0.6-beta.1` |
| Hub 容器 | 隔离端口启动后持续 `running / healthy`，首页和 `/api/health` 返回 HTTP 200，`/api/pulse/public-info` 返回 `1.0.6-beta.1` |
| 数据目录 | 临时 Hub 使用独立持久化目录，容器重启后健康检查继续通过 |

Hub 镜像 digest：

```text
sha256:0311e01b1c64f96eeaa2ba9b31b036095dcef0911ffef71f8e624dfb0d390fe3
```

Agent 镜像 digest：

```text
sha256:b45773f36fd5fc8db85973056848dfe3fb841729fdae91fb9505b44a9e70cc3a
```

## 发现并修复

Windows Docker CLI 直连 GHCR token 端点时，`docker manifest inspect` 可能返回 `EOF`，即使同一镜像可以正常拉取和运行。发布验证器现在保留原检查，并在失败时回退到 `docker buildx imagetools inspect`；两种方式都失败时仍然阻断验收。回归测试覆盖直接成功、回退成功和全部失败三条路径，并接入 Quality 与公开发布工作流。

Docker Desktop 首次启动过程中会切换引擎，切换时创建的临时容器可能以 `255` 退出。等待引擎稳定后重启同一容器，连续 45 秒保持 `running / healthy` 且 HTTP 始终为 200，确认不是 Pulse 镜像崩溃。普通用户应先确认 `docker info` 成功，再执行 Compose 部署。

## 已知限制

- Windows Agent 当前没有 Authenticode 数字签名，普通用户可能看到 SmartScreen 提示；程序版本和 SHA256 已验证，但这不能替代代码签名。
- Android APK 使用 v2 签名且签名本身有效，但证书是通用 `Android Debug` 测试证书，应用也带 `debuggable` 标记。后续切换正式发布证书时，Android 通常不能直接覆盖升级，测试用户可能需要卸载 `1.0.6-beta.1` 后重新安装。
- 本机没有连接 Android 真机，因此没有执行实际 `adb install`、启动和登录验证。
- 为避免修改当前 Windows 服务，没有执行 Windows Agent 的管理员服务安装；本轮只验证下载、哈希、签名状态和程序版本。
- 本轮没有部署 FlyNAS，也没有在独立 Linux / NAS 主机上执行原始 host-network Compose；公开镜像、Compose 解析和隔离 Hub 运行态已经验证。

## 下一版本门禁

1. 在 `1.0.6-beta.2` 或后续公开版本前建立专用 Android release keystore，并通过受保护的 GitHub Environment Secrets 注入；私钥和口令不得提交仓库。
2. 将 APK 构建从 debug 产物切换为 release 产物，自动验证 `debuggable=false`、签名证书指纹、版本号和可升级性。
3. 评估 Windows Authenticode 代码签名；未签名前继续明确 SmartScreen 风险，不把“哈希正确”描述成“系统信任”。
4. 使用干净 Windows 虚拟机、Android 真机或模拟器、独立 Linux 主机各完成一次安装、首次登录、Agent 配对和升级演练。
