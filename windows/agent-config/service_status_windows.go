//go:build windows

package main

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

func readAgentServiceStatus() string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	command := `(Get-Service -Name 'pulse-agent' -ErrorAction SilentlyContinue).Status`
	out, err := exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command).Output()
	if err != nil {
		return "未安装"
	}
	switch strings.TrimSpace(string(out)) {
	case "Running":
		return "运行中"
	case "Stopped":
		return "已停止"
	case "StartPending":
		return "正在启动"
	case "StopPending":
		return "正在停止"
	default:
		return "暂时无法获取"
	}
}
