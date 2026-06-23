# 物理网卡收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 只保留真实物理网卡采集结果，并把 Linux / Windows 的物理判定收成最少的入口。

**Architecture:** `agent/network.go` 只负责调用统一过滤入口，不再自己堆叠多层候选规则。Linux 和 Windows 各自保留一个物理网卡识别函数，返回 `map[string]struct{}`，其余逻辑只消费过滤后的结果。测试覆盖三类核心行为：真实物理网卡保留、虚拟网卡剔除、`NICS` 白名单不放回虚拟网卡。

**Tech Stack:** Go, gopsutil, testify

---

### Task 1: 收紧网卡过滤入口

**Files:**
- Modify: `agent/network.go`
- Modify: `agent/network_details_linux.go`
- Modify: `agent/network_details_windows.go`
- Modify: `agent/network_details_windows_physical.go`
- Modify: `agent/network_details_unsupported.go`

- [ ] **Step 1: 保留一个统一过滤入口**

```go
func filterNetworkInterfaces(netIO []psutilNet.IOCountersStat, nicCfg *NicConfig, physical map[string]struct{}) []psutilNet.IOCountersStat {
	filtered := make([]psutilNet.IOCountersStat, 0, len(netIO))
	for _, nic := range netIO {
		if skipNetworkInterface(nic, nicCfg, physical) {
			continue
		}
		filtered = append(filtered, nic)
	}
	return filtered
}
```

- [ ] **Step 2: 让 Linux / Windows 的物理判定只输出物理接口集合**

```go
func physicalNetworkInterfaces() map[string]struct{} {
	// Linux: 通过真实设备路径判断
	// Windows: 通过 HardwareInterface && !Virtual 判断
}
```

- [ ] **Step 3: 保持 unsupported 平台返回 nil，避免引入伪分支**

```go
func physicalNetworkInterfaces() map[string]struct{} { return nil }
```

- [ ] **Step 4: 跑现有测试确认逻辑收口后仍能编译通过**

Run: `go test -tags=testing ./agent`
Expected: PASS

### Task 2: 收敛测试面

**Files:**
- Modify: `agent/network_test.go`
- Modify: `agent/network_physical_linux_test.go`
- Modify: `agent/network_physical_windows_test.go`
- Modify: `agent/network_details_windows_shared_test.go`

- [ ] **Step 1: 保留核心行为测试**

```go
func TestSkipNetworkInterface(t *testing.T) {
	// 保留：loopback / docker / veth / bridge / whitelist / blacklist
}
```

- [ ] **Step 2: 保留 Linux 物理路径判定测试**

```go
func TestIsLinuxPhysicalNetworkDevicePath(t *testing.T) {
	assert.True(t, isLinuxPhysicalNetworkDevicePath("/sys/devices/pci0000:00/0000:00:1f.6/net/eth0"))
	assert.False(t, isLinuxPhysicalNetworkDevicePath("/sys/devices/virtual/net/docker0"))
}
```

- [ ] **Step 3: 保留 Windows 物理适配器过滤测试**

```go
func TestFilterWindowsPhysicalAdapters(t *testing.T) {
	// 保留 HardwareInterface=true 且 Virtual=false 的接口
}
```

- [ ] **Step 4: 跑测试确认没有回退**

Run: `go test -tags=testing ./agent -run 'Test(SkipNetworkInterface|IsLinuxPhysicalNetworkDevicePath|FilterWindowsPhysicalAdapters)' -v`
Expected: PASS

### Task 3: 版本记录同步

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 把本次收口写入开发记录**

```markdown
- Agent 网络采集继续收口为真实物理网卡，过滤入口和平台物理判定不再向外扩散；虚拟网卡、桥接、容器、隧道和 TAP/TUN 继续剔除，`NICS` 只负责显式黑白名单。
```

- [ ] **Step 2: 对齐 About 页开发记录**

```ts
"Agent 网络采集继续收口为真实物理网卡，过滤入口和平台物理判定不再向外扩散；虚拟网卡、桥接、容器、隧道和 TAP/TUN 继续剔除，NICS 只负责显式黑白名单。"
```

- [ ] **Step 3: 确认记录内容与代码一致**

Run: `go test -tags=testing ./agent && git diff -- docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts`
Expected: 仅出现这次网卡收口对应的条目增量
