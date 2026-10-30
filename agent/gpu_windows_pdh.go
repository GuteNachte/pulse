//go:build windows

package agent

import (
	"fmt"
	"strings"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

// 2026-10-22 Agent 2.0 阶段一：GPU 占用/显存采样从“每 4 秒 spawn 2 个 PowerShell
// 执行 Get-Counter”改为 PDH 性能计数器常驻句柄直读（与任务管理器同源），
// 稳态零进程创建。聚合/去重逻辑不变，仍复用 windowsGPUCounterSample 解析链。

const (
	windowsGPUEngineCounterPath = `\GPU Engine(*)\Utilization Percentage`
	windowsPDHReopenInterval    = 5 * time.Minute

	pdhFmtDouble   = 0x00000200
	pdhMoreData    = -2147481646 // 0x800007D2
	pdhExpandFlags = 0
)

var (
	pdhDLL                          = windows.NewLazySystemDLL("pdh.dll")
	procPdhOpenQueryW               = pdhDLL.NewProc("PdhOpenQueryW")
	procPdhCloseQuery               = pdhDLL.NewProc("PdhCloseQuery")
	procPdhAddEnglishCounterW       = pdhDLL.NewProc("PdhAddEnglishCounterW")
	procPdhCollectQueryData         = pdhDLL.NewProc("PdhCollectQueryData")
	procPdhGetFormattedCounterValue = pdhDLL.NewProc("PdhGetFormattedCounterValue")
	procPdhExpandWildCardPathW      = pdhDLL.NewProc("PdhExpandWildCardPathW")
)

type pdhFmtCounterValue struct {
	CStatus uint32
	_       uint32
	Double  float64
}

type pdhQuery struct {
	handle   uintptr
	paths    []string
	counters []uintptr
}

func pdhCall(proc *windows.LazyProc, name string, args ...uintptr) (uintptr, error) {
	status, _, _ := proc.Call(args...)
	if int32(status) != 0 {
		return status, fmt.Errorf("%s failed: 0x%08X", name, int32(status))
	}
	return status, nil
}

func pdhExpandWildCardPath(pattern string) ([]string, error) {
	patternPtr, err := windows.UTF16PtrFromString(pattern)
	if err != nil {
		return nil, err
	}
	size := uint32(2048)
	for attempt := 0; attempt < 4; attempt++ {
		buffer := make([]uint16, size)
		status, callErr := pdhCall(
			procPdhExpandWildCardPathW,
			"PdhExpandWildCardPathW",
			0,
			uintptr(unsafe.Pointer(patternPtr)),
			uintptr(unsafe.Pointer(&buffer[0])),
			uintptr(unsafe.Pointer(&size)),
			pdhExpandFlags,
		)
		if callErr == nil {
			return pdhMultizToStrings(buffer), nil
		}
		if int32(status) != pdhMoreData {
			return nil, callErr
		}
	}
	return nil, fmt.Errorf("PdhExpandWildCardPathW: PDH_MORE_DATA repeated for %s", pattern)
}

func pdhMultizToStrings(buffer []uint16) []string {
	values := make([]string, 0, 8)
	start := 0
	for index, value := range buffer {
		if value != 0 {
			continue
		}
		if index > start {
			values = append(values, windows.UTF16ToString(buffer[start:index]))
		}
		if index+1 < len(buffer) && buffer[index+1] == 0 {
			break
		}
		start = index + 1
	}
	return values
}

func openPdhQuery(paths []string) (*pdhQuery, error) {
	if len(paths) == 0 {
		return nil, fmt.Errorf("pdh: no counter paths")
	}
	var handle uintptr
	if _, err := pdhCall(procPdhOpenQueryW, "PdhOpenQueryW", 0, 0, uintptr(unsafe.Pointer(&handle))); err != nil {
		return nil, err
	}
	query := &pdhQuery{handle: handle, paths: paths}
	for _, path := range paths {
		pathPtr, err := windows.UTF16PtrFromString(path)
		if err != nil {
			query.close()
			return nil, err
		}
		var counter uintptr
		if _, err := pdhCall(procPdhAddEnglishCounterW, "PdhAddEnglishCounterW", handle, uintptr(unsafe.Pointer(pathPtr)), 0, uintptr(unsafe.Pointer(&counter))); err != nil {
			query.close()
			return nil, err
		}
		query.counters = append(query.counters, counter)
	}
	// 差值型计数器需要两次采样才有有效值，这里先做第一次。
	if _, err := pdhCall(procPdhCollectQueryData, "PdhCollectQueryData", handle); err != nil {
		query.close()
		return nil, err
	}
	return query, nil
}

func (q *pdhQuery) close() {
	if q == nil || q.handle == 0 {
		return
	}
	_, _ = pdhCall(procPdhCloseQuery, "PdhCloseQuery", q.handle)
	q.handle = 0
}

func (q *pdhQuery) collect() error {
	_, err := pdhCall(procPdhCollectQueryData, "PdhCollectQueryData", q.handle)
	return err
}

func (q *pdhQuery) readDouble(index int) (float64, error) {
	var value pdhFmtCounterValue
	if _, err := pdhCall(
		procPdhGetFormattedCounterValue,
		"PdhGetFormattedCounterValue",
		q.counters[index],
		pdhFmtDouble,
		0,
		uintptr(unsafe.Pointer(&value)),
	); err != nil {
		return 0, err
	}
	// PDH_CSTATUS_VALID_DATA=0 / PDH_CSTATUS_NEW_DATA=1 之外视为该计数器本轮无效。
	if value.CStatus != 0 && value.CStatus != 1 {
		return 0, fmt.Errorf("pdh: counter status 0x%08X for %s", value.CStatus, q.paths[index])
	}
	return value.Double, nil
}

// windowsPDHGPUCollector 维护 GPU Engine 与 Adapter Memory 两个常驻查询。
// GPU Engine 实例随进程增减变化，每 5 分钟重开一次查询以纳入新进程。
type windowsPDHGPUCollector struct {
	mu        sync.Mutex
	utilQuery *pdhQuery
	memQuery  *pdhQuery
	openedAt  time.Time
}

var windowsPDHCollector = &windowsPDHGPUCollector{}

func windowsGPUMemoryCounterPatterns() []string {
	return []string{
		`\GPU Adapter Memory(*)\Dedicated Usage`,
		`\GPU Adapter Memory(*)\Shared Usage`,
		`\GPU Adapter Memory(*)\Total Committed`,
	}
}

func (c *windowsPDHGPUCollector) ensureQueries() error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.utilQuery != nil && c.memQuery != nil && time.Since(c.openedAt) < windowsPDHReopenInterval {
		return nil
	}
	c.closeLocked()
	utilPaths, err := pdhExpandWildCardPath(windowsGPUEngineCounterPath)
	if err != nil {
		return err
	}
	utilQuery, err := openPdhQuery(utilPaths)
	if err != nil {
		return err
	}
	// 利用率是差值型计数器：openPdhQuery 已做第一次采样，这里补第二次。
	if err := utilQuery.collect(); err != nil {
		utilQuery.close()
		return err
	}
	memoryPaths := make([]string, 0, 32)
	for _, pattern := range windowsGPUMemoryCounterPatterns() {
		expanded, err := pdhExpandWildCardPath(pattern)
		if err != nil {
			utilQuery.close()
			return err
		}
		memoryPaths = append(memoryPaths, expanded...)
	}
	memQuery, err := openPdhQuery(memoryPaths)
	if err != nil {
		utilQuery.close()
		return err
	}
	c.utilQuery = utilQuery
	c.memQuery = memQuery
	c.openedAt = time.Now()
	return nil
}

func (c *windowsPDHGPUCollector) closeLocked() {
	c.utilQuery.close()
	c.memQuery.close()
	c.utilQuery = nil
	c.memQuery = nil
}

// collectWindowsGPUStatsPDH 采样一轮 GPU 占用与显存，输出与 PowerShell
// Get-Counter 同构的 CounterSamples，后续解析链完全复用。
func collectWindowsGPUStatsPDH() ([]windowsGPUCounterSample, error) {
	if err := windowsPDHCollector.ensureQueries(); err != nil {
		return nil, err
	}
	c := windowsPDHCollector
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.utilQuery == nil || c.memQuery == nil {
		return nil, fmt.Errorf("pdh: queries not open")
	}
	if err := c.utilQuery.collect(); err != nil {
		return nil, err
	}
	if err := c.memQuery.collect(); err != nil {
		return nil, err
	}
	samples := make([]windowsGPUCounterSample, 0, len(c.utilQuery.counters)+len(c.memQuery.counters))
	for index, path := range c.utilQuery.paths {
		value, err := c.utilQuery.readDouble(index)
		if err != nil {
			continue // 单计数器失效（进程退出等）跳过，重开查询后恢复
		}
		samples = append(samples, windowsGPUCounterSample{Path: path, InstanceName: pdhInstanceName(path), CookedValue: value})
	}
	for index, path := range c.memQuery.paths {
		value, err := c.memQuery.readDouble(index)
		if err != nil {
			continue
		}
		samples = append(samples, windowsGPUCounterSample{Path: path, InstanceName: pdhInstanceName(path), CookedValue: value})
	}
	if len(samples) == 0 {
		return nil, errNoValidData
	}
	return samples, nil
}

func pdhInstanceName(counterPath string) string {
	start := strings.Index(counterPath, "(")
	end := strings.Index(counterPath, ")")
	if start < 0 || end < start {
		return counterPath
	}
	return counterPath[start+1 : end]
}
