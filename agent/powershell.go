package agent

import (
	"context"
	"os/exec"
	"strings"
	"sync/atomic"
	"time"
)

// 2026-10-22 Agent 2.0 自观测：统计 PowerShell 进程创建次数，
// 目标是稳态归零（PDH 等原生采集替换后仅剩启动/配置驱动场景）。
var powershellSpawnCount atomic.Uint64

// PowerShellSpawnsTotal 返回进程启动以来 PowerShell 的创建总次数。
func PowerShellSpawnsTotal() uint64 {
	return powershellSpawnCount.Load()
}

func quotePowerShellString(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

func runPowerShellCommand(ctx context.Context, command string) ([]byte, error) {
	powershellSpawnCount.Add(1)
	if _, ok := ctx.Deadline(); !ok {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
	}
	utf8Command := buildUtf8PowerShellCommand(command)
	return exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", utf8Command).Output()
}

func buildUtf8PowerShellCommand(command string) string {
	return "[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Text.UTF8Encoding]::new($false); " + command
}
