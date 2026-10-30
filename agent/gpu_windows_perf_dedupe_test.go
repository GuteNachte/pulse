package agent

import (
	"testing"

	"gutenacht.site/pulse/internal/entities/system"
)

// 2026-10-24 主力机复现：NVML（nvml0「GeForce RTX 4080」）与 Windows 性能采集
// （w0「NVIDIA GeForce RTX 4080」）同卡双条目。输出端必须清退 w0、只留 nvml0。
func TestSuppressWindowsPerfDuplicates(t *testing.T) {
	gm := &GPUManager{GpuDataMap: map[string]*system.GPUData{}}
	gm.GpuDataMap["nvml0"] = &system.GPUData{Name: "GeForce RTX 4080", Type: gpuTypeDiscrete}
	gm.GpuDataMap["w0"] = &system.GPUData{Name: "NVIDIA GeForce RTX 4080"}

	suppressWindowsPerfDuplicatesLocked(gm)

	if _, ok := gm.GpuDataMap["w0"]; ok {
		t.Fatal("同名 w0 性能条目应被清退")
	}
	if _, ok := gm.GpuDataMap["nvml0"]; !ok {
		t.Fatal("nvml0 详细条目应保留")
	}
}

// 没有详细采集条目时（本机核显等纯 perf 场景），w 条目必须原样保留。
func TestSuppressWindowsPerfDuplicatesKeepsPerfOnly(t *testing.T) {
	gm := &GPUManager{GpuDataMap: map[string]*system.GPUData{}}
	gm.GpuDataMap["w0"] = &system.GPUData{Name: "Intel(R) UHD Graphics 730"}

	suppressWindowsPerfDuplicatesLocked(gm)

	if _, ok := gm.GpuDataMap["w0"]; !ok {
		t.Fatal("无详细条目时 w0 不应被清退")
	}
}

// 名字不同的卡（独显 + 核显混合）互不清退。
func TestSuppressWindowsPerfDuplicatesKeepsDifferentGPUs(t *testing.T) {
	gm := &GPUManager{GpuDataMap: map[string]*system.GPUData{}}
	gm.GpuDataMap["nvml0"] = &system.GPUData{Name: "GeForce RTX 4080", Type: gpuTypeDiscrete}
	gm.GpuDataMap["w1"] = &system.GPUData{Name: "Intel(R) UHD Graphics 730"}

	suppressWindowsPerfDuplicatesLocked(gm)

	if _, ok := gm.GpuDataMap["w1"]; !ok {
		t.Fatal("不同名的核显 w1 不应被清退")
	}
	if len(gm.GpuDataMap) != 2 {
		t.Fatalf("应保留两条，实际 %d", len(gm.GpuDataMap))
	}
}
