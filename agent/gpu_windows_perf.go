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

func parseWindowsGPUCounterData(output []byte) (map[string]windowsGPUSample, bool) {
	return parseWindowsGPUCounterDataWithNames(output, nil)
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
		entry.engines[engine] = clampGPUPercent(entry.engines[engine] + sample.CookedValue)
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

func windowsGPUMemoryTotals() map[string]float64 {
	output, err := runPowerShellCommand(
		context.Background(),
		`Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,PNPDeviceID | ConvertTo-Json -Compress`,
	)
	if err != nil {
		slog.Debug("Windows GPU memory total lookup", "err", err)
		return nil
	}
	return parseWindowsVideoControllerMemoryTotals(output)
}

func windowsGPUDisplayNames() map[string]string {
	output, err := runPowerShellCommand(
		context.Background(),
		`Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,PNPDeviceID | ConvertTo-Json -Compress`,
	)
	if err != nil {
		slog.Debug("Windows GPU video controller lookup", "err", err)
		return nil
	}
	return parseWindowsVideoControllerNames(output)
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

func clampGPUPercent(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return utils.TwoDecimals(value)
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
