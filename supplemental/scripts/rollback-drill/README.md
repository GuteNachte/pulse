# Windows 安装器失败回退演练工具

验证正式安装器在"文件替换阶段失败"时的双程序回退：旧程序恢复、服务恢复运行、连接配置不变。
对应待办：PBL-018。设计依据：`docs/windows-installer-rollback-design.md`。

## 执行顺序

```powershell
# 1. 预检与完整备份（哈希清单保存在备份目录内），记录输出中的 STAMP
powershell -NoProfile -ExecutionPolicy Bypass -File rollback-step1-backup.ps1

# 2. 锁定 agent-config.exe（允许读取、拒绝写入）并静默覆盖安装触发替换失败
#    需要 UAC 管理员确认；已内置 /NOCLOSEAPPLICATIONS，防止 RestartManager 关闭锁进程
powershell -NoProfile -ExecutionPolicy Bypass -File rollback-step2-install.ps1

# 3. 断言验收：程序哈希恢复旧版、data 下配置未变、服务自动恢复运行、日志含恢复证据
powershell -NoProfile -ExecutionPolicy Bypass -File rollback-step3-assert.ps1 ^
  -ManifestPath "D:\Pulse-Backups\pre-rollback-test-<STAMP>\manifest.txt" ^
  -InstallLog "D:\工作空间\Pulse\build\installer-recovery-check\rollback-real-<时间戳>.log"
```

## 预期结果

- 安装器退出码 `5`（替换阶段被锁触发的中止）
- 日志出现 `Rolling back changes` → `restore skipped`（引擎回滚已恢复时）或 `restored from backup` → `Rollback restore verified` → `Service recovery verified: pulse-agent is running.`
- 两份程序 SHA-256 与清单一致；`data\paired.env` 等配置哈希不变；服务 Running / Automatic

## 注意

- 演练会真实停止并恢复本机 `pulse-agent` 服务（约 1~3 分钟采集暂停）
- 当前接入的 Hub 地址决定影响范围；接正式 Hub 前先确认演练时机
- 失败事务的备份目录（`data\rollback\installer-<时间戳>`）按设计保留，不自动删除
- 2026-09-30 本机已完成同版本覆盖 + 替换失败回退验收，验收结论见 PBL-018
