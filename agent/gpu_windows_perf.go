//go:build windows || testing

package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"gutenacht.site/pulse/agent/utils"
	"gutenacht.site/pulse/internal/entities/system"
)

const windowsGPUCounterInterval = 4 * time.Second

var (
	windowsGPUPhysPattern   = regexp.MustCompile(`(?i)(?:^|_)phys_([^_\\)]+)`)
	windowsGPUEnginePattern = regexp.MustCompile(`(?i)(?:^|_)engtype_([^_\\)]+)`)
)

type windowsGPUCounterPayload struct {
	CounterSamples []windowsGPUCounterSample `json:"CounterSamples"`
}

type windowsGPUCounterSample struct {
	Path         string  `json:"Path"`
	InstanceName string  `json:"InstanceName"`
	CookedValue  float64 `json:"CookedValue"`
}

type windowsGPUSample struct {
	name        string
	gpuType     string
	usage       float64
	engines     map[string]float64
	memoryUsed  float64
	memoryTotal float64
}

type windowsGPUMemorySample struct {
	dedicatedUsage float64
	sharedUsage    float64
	totalCommitted float64
	total          float64
}

type windowsVideoController struct {
	Name        string `json:"Name"`
	AdapterRAM  uint64 `json:"AdapterRAM"`
	PNPDeviceID string `json:"PNPDeviceID"`
}

func (gm *GPUManager) startWindowsPerformanceCounterCollector() bool {
	go func() {
		failures := 0
		for {
			if err := gm.collectWindowsGPUStats(); err != nil {
				failures++
				if failures > maxFailureRetries {
					break
				}
				slog.Warn("Error collecting Windows GPU performance counters", "err", err)
			} else {
				failures = 0
			}
			time.Sleep(windowsGPUCounterInterval)
		}
	}()
	return true
}

func (gm *GPUManager) collectWindowsGPUStats() error {
	names := windowsGPUDisplayNames()
	// 2026-10-22 Agent 2.0：优先走 PDH 常驻句柄直读（零进程创建）；
	// PDH 打开失败或采样异常时回退到 PowerShell Get-Counter 作为安全网。
	if rawSamples, err := collectWindowsGPUStatsPDH(); err == nil {
		samples, ok := aggregateWindowsGPUSamples(rawSamples, names)
		if ok {
			gm.updateWindowsGPUFromSamples(samples)
			return nil
		}
		return errNoValidData
	} else {
		slog.Debug("Windows GPU PDH collection, falling back to PowerShell", "err", err)
	}
	output, err := runPowerShellCommand(
		context.Background(),
		`Get-Counter '\GPU Engine(*)\Utilization Percentage' | Select-Object -ExpandProperty CounterSamples | Select-Object Path,InstanceName,CookedValue | ConvertTo-Json -Compress`,
	)
	if err != nil {
		return err
	}
	samples, ok := parseWindowsGPUCounterDataWithNames(output, names)
	if !ok {
		return errNoValidData
	}
	if memoryOutput, memoryErr := runPowerShellCommand(
		context.Background(),
		`Get-Counter '\GPU Adapter Memory(*)\Shared Usage','\GPU Adapter Memory(*)\Dedicated Usage','\GPU Adapter Memory(*)\Total Committed' | Select-Object -ExpandProperty CounterSamples | Select-Object Path,InstanceName,CookedValue | ConvertTo-Json -Compress`,
	); memoryErr == nil {
		mergeWindowsGPUMemorySamples(samples, parseWindowsGPUMemoryCounterData(memoryOutput, names, windowsGPUMemoryTotals()))
	} else {
		slog.Debug("Windows GPU memory counters", "err", memoryErr)
	}
	gm.updateWindowsGPUFromSamples(samples)
	return nil
}

func parseWindowsGPUCounterDataWithNames(output []byte, names map[string]string) (map[string]windowsGPUSample, bool) {
	trimmed := strings.TrimSpace(string(output))
	if trimmed == "" || strings.EqualFold(trimmed, "null") {
		return nil, false
	}

	var samples []windowsGPUCounterSample
	var wrapped windowsGPUCounterPayload
	if err := json.Unmarshal([]byte(trimmed), &wrapped); err == nil && len(wrapped.CounterSamples) > 0 {
		samples = wrapped.CounterSamples
	} else if err := json.Unmarshal([]byte(trimmed), &samples); err != nil {
		var single windowsGPUCounterSample
		if singleErr := json.Unmarshal([]byte(trimmed), &single); singleErr != nil || single.CookedValue == 0 && single.InstanceName == "" && single.Path == "" {
			return nil, false
		}
		samples = []windowsGPUCounterSample{single}
	}

	return aggregateWindowsGPUSamples(samples, names)
}

// aggregateWindowsGPUSamples 把 PDH/PowerShell 两条采集链的原始样本
// 按“物理 GPU → 引擎”聚合，解析规则两条链完全一致。
func aggregateWindowsGPUSamples(samples []windowsGPUCounterSample, names map[string]string) (map[string]windowsGPUSample, bool) {
	result := make(map[string]windowsGPUSample)
	for _, sample := range samples {
		instance := sample.InstanceName
		if instance == "" {
			instance = sample.Path
		}
		engine := normalizeWindowsGPUEngine(instance)
		if engine == "" {
			continue
		}
		phys := normalizeWindowsGPUPhys(instance)
		name, gpuType := readableWindowsGPUInfo(phys, names)
		if name == "" {
			continue
		}
		id := "w" + phys
		entry := result[id]
		if entry.name == "" {
			entry.name = name
			entry.gpuType = gpuType
			entry.engines = make(map[string]float64)
		}
		entry.engines[engine] = utils.TwoDecimals(clampPercent(entry.engines[engine] + sample.CookedValue))
		if entry.engines[engine] > entry.usage {
			entry.usage = entry.engines[engine]
		}
		result[id] = entry
	}
	if len(result) == 0 {
		return nil, false
	}
	return result, true
}

func parseWindowsGPUMemoryCounterData(output []byte, names map[string]string, totals map[string]float64) map[string]windowsGPUMemorySample {
	trimmed := strings.TrimSpace(string(output))
	if trimmed == "" || strings.EqualFold(trimmed, "null") {
		return nil
	}

	var samples []windowsGPUCounterSample
	var wrapped windowsGPUCounterPayload
	if err := json.Unmarshal([]byte(trimmed), &wrapped); err == nil && len(wrapped.CounterSamples) > 0 {
		samples = wrapped.CounterSamples
	} else if err := json.Unmarshal([]byte(trimmed), &samples); err != nil {
		var single windowsGPUCounterSample
		if singleErr := json.Unmarshal([]byte(trimmed), &single); singleErr != nil || single.CookedValue == 0 && single.InstanceName == "" && single.Path == "" {
			return nil
		}
		samples = []windowsGPUCounterSample{single}
	}

	return aggregateWindowsGPUMemorySamples(samples, names, totals)
}

// aggregateWindowsGPUMemorySamples 把显存计数器原始样本按物理 GPU 聚合。
func aggregateWindowsGPUMemorySamples(samples []windowsGPUCounterSample, names map[string]string, totals map[string]float64) map[string]windowsGPUMemorySample {
	result := make(map[string]windowsGPUMemorySample)
	for _, sample := range samples {
		instance := sample.InstanceName
		if instance == "" {
			instance = sample.Path
		}
		phys := normalizeWindowsGPUPhys(instance)
		if readableWindowsGPUName(phys, names) == "" {
			continue
		}
		id := "w" + phys
		entry := result[id]
		switch {
		case strings.Contains(strings.ToLower(sample.Path), "dedicated usage"):
			entry.dedicatedUsage += sample.CookedValue
		case strings.Contains(strings.ToLower(sample.Path), "shared usage"):
			entry.sharedUsage += sample.CookedValue
		case strings.Contains(strings.ToLower(sample.Path), "total committed"):
			entry.totalCommitted += sample.CookedValue
		}
		if total := totals[phys]; total > entry.total {
			entry.total = total
		}
		result[id] = entry
	}
	return result
}

func mergeWindowsGPUMemorySamples(samples map[string]windowsGPUSample, memorySamples map[string]windowsGPUMemorySample) {
	if len(samples) == 0 || len(memorySamples) == 0 {
		return
	}
	for id, memory := range memorySamples {
		sample, ok := samples[id]
		if !ok {
			continue
		}
		usedBytes := memory.totalCommitted
		if usedBytes <= 0 {
			usedBytes = memory.dedicatedUsage + memory.sharedUsage
		}
		sample.memoryUsed = utils.BytesToMegabytes(usedBytes)
		sample.memoryTotal = utils.BytesToMegabytes(memory.total)
		samples[id] = sample
	}
}

// Win32_VideoController 返回的是静态硬件信息（型号、显存），无需随采集周期刷新；
// 进程级缓存按 TTL 复用同一次查询结果，避免每个 GPU 采集周期重复 spawn PowerShell。
const windowsVideoControllerCacheTTL = 10 * time.Minute

var windowsVideoControllerCache = struct {
	sync.Mutex
	names   map[string]string
	totals  map[string]float64
	fetched time.Time
	loaded  bool
}{}

func loadWindowsVideoControllerInfo() (map[string]string, map[string]float64) {
	windowsVideoControllerCache.Lock()
	defer windowsVideoControllerCache.Unlock()
	if windowsVideoControllerCache.loaded &&
		time.Since(windowsVideoControllerCache.fetched) < windowsVideoControllerCacheTTL {
		return windowsVideoControllerCache.names, windowsVideoControllerCache.totals
	}
	output, err := runPowerShellCommand(
		context.Background(),
		`Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,PNPDeviceID | ConvertTo-Json -Compress`,
	)
	if err != nil {
		slog.Debug("Windows GPU video controller lookup", "err", err)
		return windowsVideoControllerCache.names, windowsVideoControllerCache.totals
	}
	windowsVideoControllerCache.names = parseWindowsVideoControllerNames(output)
	windowsVideoControllerCache.totals = parseWindowsVideoControllerMemoryTotals(output)
	windowsVideoControllerCache.fetched = time.Now()
	windowsVideoControllerCache.loaded = true
	return windowsVideoControllerCache.names, windowsVideoControllerCache.totals
}

func windowsGPUMemoryTotals() map[string]float64 {
	_, totals := loadWindowsVideoControllerInfo()
	return totals
}

func windowsGPUDisplayNames() map[string]string {
	names, _ := loadWindowsVideoControllerInfo()
	return names
}

func parseWindowsVideoControllerNames(output []byte) map[string]string {
	trimmed := strings.TrimSpace(string(output))
	if trimmed == "" || strings.EqualFold(trimmed, "null") {
		return nil
	}

	var rows []windowsVideoController
	if err := json.Unmarshal([]byte(trimmed), &rows); err != nil {
		var row windowsVideoController
		if singleErr := json.Unmarshal([]byte(trimmed), &row); singleErr != nil {
			return nil
		}
		rows = []windowsVideoController{row}
	}

	names := make(map[string]string)
	physicalIndex := 0
	for _, row := range rows {
		if isVirtualWindowsVideoController(row) {
			continue
		}
		name := simplifyWindowsGPUName(row.Name)
		if detectedName := detectIntegratedWindowsGPUName(row.PNPDeviceID, name); detectedName != "" {
			name = detectedName
		}
		if name == "" {
			physicalIndex++
			continue
		}
		names[fmt.Sprint(physicalIndex)] = name
		physicalIndex++
	}
	if len(names) == 0 {
		return nil
	}
	return names
}

func parseWindowsVideoControllerMemoryTotals(output []byte) map[string]float64 {
	trimmed := strings.TrimSpace(string(output))
	if trimmed == "" || strings.EqualFold(trimmed, "null") {
		return nil
	}

	var rows []windowsVideoController
	if err := json.Unmarshal([]byte(trimmed), &rows); err != nil {
		var row windowsVideoController
		if singleErr := json.Unmarshal([]byte(trimmed), &row); singleErr != nil {
			return nil
		}
		rows = []windowsVideoController{row}
	}

	totals := make(map[string]float64)
	physicalIndex := 0
	for _, row := range rows {
		if isVirtualWindowsVideoController(row) {
			continue
		}
		name := simplifyWindowsGPUName(row.Name)
		if detectedName := detectIntegratedWindowsGPUName(row.PNPDeviceID, name); detectedName != "" {
			name = detectedName
		}
		if name == "" {
			physicalIndex++
			continue
		}
		if row.AdapterRAM > 0 {
			totals[fmt.Sprint(physicalIndex)] = float64(row.AdapterRAM)
		}
		physicalIndex++
	}
	return totals
}

func detectIntegratedWindowsGPUName(deviceID string, fallbackName string) string {
	lowerDeviceID := strings.ToLower(deviceID)
	deviceMatch := regexp.MustCompile(`(?i)(?:^|\\|&)dev_([0-9a-f]{4})(?:\\|&)`).FindStringSubmatch(deviceID)
	if len(deviceMatch) < 2 {
		return ""
	}
	device := strings.ToLower(deviceMatch[1])
	switch {
	case strings.Contains(lowerDeviceID, "ven_1002"):
		switch device {
		case "1681":
			return "AMD Radeon 680M"
		}
		if isGenericIntegratedAmdWindowsGPUName(fallbackName) {
			return fallbackName
		}
	case strings.Contains(lowerDeviceID, "ven_8086"):
		if isIntegratedWindowsGPUName(fallbackName) {
			return fallbackName
		}
	}
	return ""
}

func isVirtualWindowsVideoController(row windowsVideoController) bool {
	name := strings.ToLower(row.Name)
	deviceID := strings.ToLower(row.PNPDeviceID)
	return strings.Contains(name, "virtual") ||
		strings.Contains(name, "remote") ||
		strings.Contains(name, "basic display") ||
		strings.HasPrefix(deviceID, "root\\") ||
		strings.HasPrefix(deviceID, "swd\\")
}

func readableWindowsGPUName(phys string, names map[string]string) string {
	name, _ := readableWindowsGPUInfo(phys, names)
	return name
}

func readableWindowsGPUInfo(phys string, names map[string]string) (string, string) {
	if name := strings.TrimSpace(names[phys]); name != "" {
		return name, classifyGpuType(name)
	}
	return "", ""
}

func isIntegratedWindowsGPUName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	if lower == "" {
		return false
	}
	if strings.Contains(lower, "nvidia") ||
		strings.Contains(lower, "geforce") ||
		strings.Contains(lower, "rtx") ||
		strings.Contains(lower, "gtx") ||
		strings.Contains(lower, "quadro") ||
		strings.Contains(lower, "tesla") {
		return false
	}
	if strings.Contains(lower, "intel") ||
		strings.Contains(lower, "iris") ||
		strings.Contains(lower, "uhd") ||
		isGenericIntegratedAmdWindowsGPUName(lower) ||
		strings.Contains(lower, "radeon 610m") ||
		strings.Contains(lower, "radeon 660m") ||
		strings.Contains(lower, "radeon 680m") ||
		strings.Contains(lower, "radeon 740m") ||
		strings.Contains(lower, "radeon 760m") ||
		strings.Contains(lower, "radeon 780m") ||
		strings.Contains(lower, "radeon 840m") ||
		strings.Contains(lower, "radeon 860m") ||
		strings.Contains(lower, "radeon 880m") ||
		strings.Contains(lower, "radeon 890m") ||
		strings.Contains(lower, "radeon vega") {
		return true
	}
	return false
}

func isGenericIntegratedAmdWindowsGPUName(name string) bool {
	lower := strings.ToLower(strings.TrimSpace(name))
	return strings.Contains(lower, "radeon(tm)") ||
		strings.Contains(lower, "amd radeon graphics")
}

func simplifyWindowsGPUName(name string) string {
	name = strings.TrimSpace(name)
	name = strings.TrimPrefix(name, "Microsoft ")
	replacements := []string{
		" with Radeon Graphics",
		" Graphics",
	}
	for _, suffix := range replacements {
		if strings.HasSuffix(name, suffix) && len(name) > len(suffix) {
			name = strings.TrimSpace(strings.TrimSuffix(name, suffix))
			break
		}
	}
	if name == "" {
		return ""
	}
	return name
}

func normalizeWindowsGPUPhys(instance string) string {
	match := windowsGPUPhysPattern.FindStringSubmatch(instance)
	if len(match) < 2 || strings.TrimSpace(match[1]) == "" {
		return "0"
	}
	return strings.TrimSpace(match[1])
}

func normalizeWindowsGPUEngine(instance string) string {
	match := windowsGPUEnginePattern.FindStringSubmatch(instance)
	if len(match) < 2 {
		return ""
	}
	switch strings.ToLower(strings.TrimSpace(match[1])) {
	case "3d":
		return "3D"
	case "copy":
		return "Copy"
	case "compute":
		return "Compute"
	case "videodecode":
		return "Video Decode"
	case "videoencode":
		return "Video Encode"
	case "videoprocessing":
		return "Video Processing"
	default:
		return strings.TrimSpace(match[1])
	}
}

func (gm *GPUManager) updateWindowsGPUFromSamples(samples map[string]windowsGPUSample) {
	gm.Lock()
	defer gm.Unlock()
	for id, sample := range samples {
		if gm.hasWindowsPerfDuplicate(id, sample) {
			continue
		}
		gpuData, ok := gm.GpuDataMap[id]
		if !ok {
			gpuData = &system.GPUData{Name: sample.name, Type: sample.gpuType, Engines: make(map[string]float64, len(sample.engines))}
			gm.GpuDataMap[id] = gpuData
		}
		if gpuData.Type == "" {
			gpuData.Type = sample.gpuType
		}
		if gpuData.Engines == nil {
			gpuData.Engines = make(map[string]float64, len(sample.engines))
		}
		for name, value := range sample.engines {
			gpuData.Engines[name] += value
		}
		gpuData.MemoryUsed = sample.memoryUsed
		gpuData.MemoryTotal = sample.memoryTotal
		gpuData.Count++
	}
}

func (gm *GPUManager) hasWindowsPerfDuplicate(id string, sample windowsGPUSample) bool {
	phys := strings.TrimPrefix(id, "w")
	for _, candidateID := range []string{"nvml" + phys, phys, "n" + phys} {
		if gpu, ok := gm.GpuDataMap[candidateID]; ok {
			if isDetailedGPUCollectorID(candidateID) && gpu.Type == sample.gpuType {
				return true
			}
			if isSameWindowsPerfGPU(gpu, sample) {
				return true
			}
		}
	}
	for existingID, gpu := range gm.GpuDataMap {
		if strings.HasPrefix(existingID, "w") {
			continue
		}
		if isSameWindowsPerfGPU(gpu, sample) {
			return true
		}
	}
	return false
}

func isDetailedGPUCollectorID(id string) bool {
	if strings.HasPrefix(id, "nvml") || strings.HasPrefix(id, "n") {
		return true
	}
	_, err := strconv.Atoi(id)
	return err == nil
}

// suppressWindowsPerfDuplicatesLocked 清退与详细采集条目（NVML / nvidia-smi）同名的
// Windows 性能采集条目（w* 键）。perf 侧新建时只做单向查重：NVML 启动晚于 perf 首采时
// 两边会各建一条（如 nvml0「GeForce RTX 4080」+ w0「NVIDIA GeForce RTX 4080」），
// 同一块卡被上报成两张。在输出端按归一化名字合并，时序无关。须持 gm 锁调用。
func suppressWindowsPerfDuplicatesLocked(gm *GPUManager) {
	detailedNames := make([]string, 0, len(gm.GpuDataMap))
	for id, gpu := range gm.GpuDataMap {
		if !isDetailedGPUCollectorID(id) {
			continue
		}
		detailedNames = append(detailedNames, normalizeGPUNameForWindowsPerfDedupe(gpu.Name))
	}
	if len(detailedNames) == 0 {
		return
	}
	for id, gpu := range gm.GpuDataMap {
		if !strings.HasPrefix(id, "w") {
			continue
		}
		name := normalizeGPUNameForWindowsPerfDedupe(gpu.Name)
		for _, detailed := range detailedNames {
			if name == detailed {
				delete(gm.GpuDataMap, id)
				slog.Debug("Windows perf GPU duplicate suppressed", "id", id, "name", gpu.Name)
				break
			}
		}
	}
}

func init() {
	suppressWindowsPerfDuplicatesHook = suppressWindowsPerfDuplicatesLocked
}

func isSameWindowsPerfGPU(gpu *system.GPUData, sample windowsGPUSample) bool {
	if gpu == nil {
		return false
	}
	if gpu.Type != "" && sample.gpuType != "" && gpu.Type != sample.gpuType {
		return false
	}
	return normalizeGPUNameForWindowsPerfDedupe(gpu.Name) == normalizeGPUNameForWindowsPerfDedupe(sample.name)
}

func normalizeGPUNameForWindowsPerfDedupe(name string) string {
	normalized := strings.ToLower(strings.TrimSpace(name))
	normalized = strings.TrimPrefix(normalized, "nvidia ")
	normalized = strings.TrimSuffix(normalized, " laptop gpu")
	replacer := strings.NewReplacer(
		"(r)", "",
		"(tm)", "",
		"®", "",
		"™", "",
		"-", " ",
		"_", " ",
	)
	normalized = replacer.Replace(normalized)
	return strings.Join(strings.Fields(normalized), " ")
}
