//go:build !windows && !testing

package agent

func (gm *GPUManager) startWindowsPerformanceCounterCollector() bool {
	return false
}
