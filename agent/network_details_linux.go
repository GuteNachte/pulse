//go:build linux

package agent

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	psutilNet "github.com/shirou/gopsutil/v4/net"
	"gutenacht.site/pulse/internal/entities/system"
)

func detectNetworkInterfaceDetails(valid map[string]struct{}) []system.NetworkInterfaceDetails {
	interfaces, _ := psutilNet.Interfaces()
	details := make([]system.NetworkInterfaceDetails, 0, len(valid))
	for name := range valid {
		displayName := readLinuxNetworkHardwareName(name)
		if displayName == "" {
			displayName = name
		}
		ipv4, ipv6 := networkInterfaceAddresses(interfaces, name)
		details = append(details, makeNetworkInterfaceDetails(name, displayName, findInterfaceMac(interfaces, name), readLinuxLinkSpeed(name), readLinuxOperState(name), "", ipv4, ipv6, nil, nil))
	}
	return details
}

func physicalNetworkInterfaces() map[string]struct{} {
	if runtime.GOOS != "linux" {
		return nil
	}
	interfaces, err := psutilNet.Interfaces()
	if err != nil {
		return nil
	}
	physical := make(map[string]struct{}, len(interfaces))
	for _, iface := range interfaces {
		if !isLinuxPhysicalNetworkDevicePath(readLinuxNetworkDevicePath(iface.Name)) {
			continue
		}
		physical[iface.Name] = struct{}{}
	}
	return physical
}

func readLinuxNetworkHardwareName(name string) string {
	slot := readLinuxNetworkPciSlot(name)
	if slot == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "lspci", "-s", slot).Output()
	if err != nil || len(out) == 0 {
		return ""
	}
	return parseLinuxLspciDeviceName(out)
}

func readLinuxNetworkDevicePath(name string) string {
	path, err := filepath.EvalSymlinks(filepath.Join("/sys/class/net", name, "device"))
	if err != nil {
		return ""
	}
	return path
}

func isLinuxPhysicalNetworkDevicePath(devicePath string) bool {
	if devicePath == "" {
		return false
	}
	normalized := filepath.ToSlash(devicePath)
	if strings.Contains(normalized, "/virtual/") {
		return false
	}
	return strings.Contains(normalized, "/devices/pci") ||
		strings.Contains(normalized, "/devices/pnp") ||
		strings.Contains(normalized, "/devices/platform") ||
		strings.Contains(normalized, "/devices/usb")
}

func readLinuxNetworkPciSlot(name string) string {
	slot := filepath.Base(readLinuxNetworkDevicePath(name))
	if strings.Count(slot, ":") < 2 || !strings.Contains(slot, ".") {
		return ""
	}
	return slot
}

func parseLinuxLspciDeviceName(output []byte) string {
	line := strings.TrimSpace(strings.SplitN(string(output), "\n", 2)[0])
	if line == "" {
		return ""
	}
	_, name, ok := strings.Cut(line, ": ")
	if !ok {
		return ""
	}
	name = strings.TrimSpace(name)
	if before, _, ok := strings.Cut(name, " (rev "); ok {
		name = strings.TrimSpace(before)
	}
	return name
}

func readLinuxLinkSpeed(name string) uint64 {
	raw, err := os.ReadFile(filepath.Join("/sys/class/net", name, "speed"))
	if err != nil {
		return 0
	}
	mbps, err := strconv.ParseUint(strings.TrimSpace(string(raw)), 10, 64)
	if err != nil || mbps == 0 {
		return 0
	}
	return mbps * 1_000_000
}

func readLinuxOperState(name string) string {
	raw, err := os.ReadFile(filepath.Join("/sys/class/net", name, "operstate"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func findInterfaceMac(interfaces []psutilNet.InterfaceStat, name string) string {
	for _, iface := range interfaces {
		if iface.Name == name {
			return iface.HardwareAddr
		}
	}
	return ""
}
