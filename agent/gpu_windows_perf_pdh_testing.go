//go:build !windows && testing

package agent

import "errors"

// collectWindowsGPUStatsPDH 在非 Windows 测试构建下提供桩实现：
// gpu_windows_perf.go（windows || testing）的去重测试只需要 suppressWindowsPerfDuplicatesLocked，
// 真实 PDH 采样仅在 windows 构建中存在。
func collectWindowsGPUStatsPDH() ([]windowsGPUCounterSample, error) {
	return nil, errors.New("windows PDH collector is not available in testing builds")
}
