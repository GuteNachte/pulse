# Android 正式签名与可升级发布设计

## 目标

为 Pulse Android App 建立唯一、长期、可恢复的正式发布身份。从下一公开测试版开始，所有私有发布和 GitHub Release 使用同一张 Release 证书，APK 必须是不可调试的 `release` 构建，并在发布前自动核对版本、签名方案和证书指纹。

`1.0.6-beta.1` 已使用 Android Debug 证书，无法与新证书形成覆盖升级关系。测试用户需要卸载一次旧版本；首个正式签名版本之后，后续版本必须始终复用本设计生成的密钥。

## 范围

本轮包含：

- 生成一次性的 Pulse Android PKCS12 Release 密钥。
- 建立本机工作副本、NAS 恢复副本和 GitHub Environment Secrets 三层保管。
- 将本地统一发布脚本从 `assembleDebug` 切换到受控的 `assembleRelease`。
- 将公开发布工作流改为验证阶段不接触密钥、人工批准后才构建签名 APK。
- 自动验证 `applicationId`、`versionName`、`versionCode`、`debuggable=false`、APK 签名和证书 SHA-256 指纹。
- 同步维护私有主开发仓库和公开净化仓库中的可公开构建规则、版本记录和运行手册。

本轮不包含 Windows Authenticode、Google Play App Signing、Play Store 上架、Android 功能改造或正式发布新版本。

## 仓库职责

`C:\Users\Nacht\Documents\PL` 继续作为包含私有部署口径的主开发仓库。`C:\Users\Nacht\Documents\Pulse-public-distribution-sanitized-20260725` 是公开 GitHub 发布仓库，两者历史不直接合并。

签名构建脚本、Gradle 配置、回归测试和证书指纹在两边保持同一行为；内部 Harbor、FlyNAS 和私有地址仍只存在于主开发仓库。密钥、密码、临时属性文件和恢复材料不得进入任一仓库。

## 密钥与备份

### 密钥身份

- 格式：PKCS12。
- 别名：`pulse-release`。
- 算法：RSA 4096。
- 有效期：100 年，覆盖项目长期升级周期。
- 口令：使用系统加密随机数生成，不手工复用账号密码。
- 证书 SHA-256 指纹：作为公开身份写入仓库，由构建和验收脚本固定校验。

### 三层保管

1. 本机工作副本位于用户私有目录，不放在项目目录；目录 ACL 只允许当前 Windows 用户和 SYSTEM。
2. NAS 恢复副本位于 `Z:\Pulse-Secrets\Android`；包含 PKCS12 密钥、由 OpenSSL AES-256 + PBKDF2 加密的凭据恢复包、恢复说明和证书导出文件，不与公开安装包混放。恢复包记录 store password、key password 和 alias，但没有恢复口令就不能解密。
3. GitHub `public-release` Environment 保存 Base64 密钥和口令。Secrets 只对人工批准后的发布 job 可用，不开放给 Pull Request、普通 Quality 或只验证运行。

恢复包使用独立的高强度恢复口令。恢复口令写入当前 Windows 用户的凭据管理器，并生成一次性离线恢复单；用户确认已打印或抄写到离线介质后，才能删除临时明文恢复单。恢复口令不得与 Android 密钥口令相同，也不得写入 GitHub 或项目仓库。

生成后必须分别核对本机与 NAS 密钥副本、凭据恢复包的 SHA-256，并实际执行一次临时目录解密与 `keytool -list` 恢复演练。普通恢复说明只记录用途、别名、指纹、备份校验值和恢复步骤，不输出任何口令。

## 本地构建架构

新增一个单一职责的 Android Release 构建脚本：

1. 接收版本和一个仓库外的签名属性文件路径。
2. 执行现有 Web / Capacitor 同步。
3. 将签名属性通过临时文件提供给 Gradle，不把口令放进命令行。
4. 执行 `assembleRelease`。
5. 使用 Android SDK 的 `apksigner` 和 `aapt2` 验证签名、证书指纹、包名、版本和不可调试状态。
6. 将标准产物复制为固定的 Release APK 路径，并在 `finally` 中清理临时签名材料。

Gradle 只在签名属性完整时配置 Release signingConfig；缺字段、密钥不存在或指纹不匹配时必须失败，不允许自动回退到 Debug 密钥。

`publish-release-v1.ps1` 的真实发布路径必须调用该脚本。`-DryRun` 可以显式跳过签名构建，但不得把 Debug APK包装成正式发布产物。

## GitHub 发布流程

现有无密钥验证阶段继续运行仓库审计、Go / Web / Android 单元测试和构建契约，但不读取签名 Secrets。

仅当精确版本 tag、`PUBLIC_RELEASE_ENABLED=true` 和 `public-release` Environment 人工批准同时成立时，发布 job 才执行：

1. 将 Base64 密钥写入 runner 临时目录。
2. 将口令写入权限受限的临时属性文件。
3. 构建签名 Release APK。
4. 校验证书指纹、`debuggable=false` 和版本元数据。
5. 使用签名 APK重新生成公开发布包、manifest 和 `SHA256SUMS`。
6. 再次验证完整公开包后发布 GHCR 镜像和 GitHub Prerelease。
7. 无论成功或失败都清理 runner 临时密钥和属性文件。

公开工作流不得在步骤输出、artifact、缓存、Shell trace 或错误消息中打印密钥与口令。

## 配置与接口

签名属性文件统一包含以下键：

```properties
storeFile=C:/absolute/path/pulse-android-release.p12
storePassword=<secret>
keyAlias=pulse-release
keyPassword=<secret>
```

GitHub Secrets 使用：

- `ANDROID_RELEASE_KEYSTORE_BASE64`
- `ANDROID_RELEASE_STORE_PASSWORD`
- `ANDROID_RELEASE_KEY_ALIAS`
- `ANDROID_RELEASE_KEY_PASSWORD`

公开证书指纹作为非敏感常量保存在 `internal/site/android/release-certificate.sha256`，构建脚本只从版本控制读取，不接受属性文件、环境变量或 Secret 覆盖，防止攻击者同时替换密钥和期望值。

## 失败处理

- 任一 Secret 缺失：发布 job 立即失败，不生成 APK。
- Base64 解码失败或密钥打不开：立即失败并清理临时文件。
- APK 仍带 `debuggable`：立即失败。
- 实际证书指纹与固定指纹不同：立即失败。
- NAS 备份写入或校验失败：密钥初始化不得标记完成，也不得配置 GitHub 发布。
- 凭据恢复包不能解密或离线恢复单尚未确认保存：初始化不得标记完成。
- GitHub Secrets 配置失败：保留本机和 NAS 密钥，但不创建版本 tag、不发布 APK。
- 构建失败：不回退到 Debug APK，不覆盖已有 Release 附件。

## 测试策略

按测试先行实施：

- PowerShell 契约测试先证明现有脚本仍引用 `assembleDebug` 和 Debug APK，再改为 Release 路径。
- 使用临时伪 `gradlew`、`apksigner` 和 `aapt2` 覆盖成功、缺少签名配置、证书不匹配、可调试 APK和清理临时材料。
- Gradle 契约测试确认 Release signingConfig 只读取外部属性文件，仓库不存在固定密钥路径和明文口令。
- GitHub 工作流契约测试确认 Secrets 只出现在 `public-release` Environment job，最终打包发生在签名验证之后。
- 本机实际构建后用真实 Android SDK 工具复验 APK。
- 完整质量检查、版本一致性检查、公开仓库审计和 `git diff --check` 必须通过。

## 验收标准

- 两个仓库都不跟踪 `.p12`、`.jks`、签名属性文件、口令或 Base64 密钥。
- 本机和 NAS 密钥文件 SHA-256 一致，NAS 凭据恢复包可在临时目录解密，离线恢复单已确认保存。
- 实际 Release APK 使用固定证书签名，`debuggable=false`，版本号正确。
- 公开发布的 APK、manifest 与 SHA256 均来自签名后的最终包。
- 不批准 `public-release` Environment 时，GitHub 无法读取签名 Secrets 或发布 APK。
- 文档明确 `1.0.6-beta.1` 需要卸载一次；首个正式签名版本之后保持覆盖升级能力。

## 优缺点与风险

优点：私钥可恢复、自动发布可重复、公开与私有 APK 身份一致，外部用户能验证固定证书。

代价：签名发布需要人工审批；主开发仓库和公开净化仓库的非密钥规则需要同步维护。

主要风险是密钥丢失或泄露。NAS 解决单机损坏，GitHub Environment 限制自动化暴露面，固定指纹阻止构建时静默换钥；仍需限制 NAS 共享权限，并避免把恢复材料复制到聊天、Issue、日志或普通云盘。
