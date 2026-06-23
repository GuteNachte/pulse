//go:build windows

package agent

import (
	"context"
	"strings"
	"time"

	psutilNet "github.com/shirou/gopsutil/v4/net"
	"gutenacht.site/pulse/internal/entities/system"
)

func detectNetworkInterfaceDetails(valid map[string]struct{}) []system.NetworkInterfaceDetails {
	rows := filterWindowsPhysicalAdapters(getWindowsNetAdapters(valid))
	byName, byMac := buildWindowsAdapterLookups(rows)

	interfaces, _ := psutilNet.Interfaces()
	details := make([]system.NetworkInterfaceDetails, 0, len(valid))
	for name := range valid {
		mac := normalizeWindowsHardwareAddress(findInterfaceMac(interfaces, name))
		row, matched := findWindowsAdapterForInterface(name, mac, byName, byMac)
		displayName := strings.TrimSpace(row.InterfaceDescription)
		if displayName == "" {
			displayName = strings.TrimSpace(row.Name)
		}
		if displayName == "" {
			displayName = name
		}
		if mac == "" && matched {
			mac = normalizeWindowsHardwareAddress(row.MacAddress)
		}
		details = append(details, makeNetworkInterfaceDetails(
			name,
			displayName,
			mac,
			parseWindowsLinkSpeed(row.LinkSpeed),
			strings.TrimSpace(row.Status),
			normalizeWindowsIPMethod(row.Dhcp),
			normalizeStringList(row.IPv4),
			normalizeStringList(row.IPv6),
			normalizeStringList(row.Gateways),
			normalizeStringList(row.DNSServers),
		))
	}
	return details
}

func getWindowsNetAdapters(valid map[string]struct{}) []windowsNetAdapterRow {
	if len(valid) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
	defer cancel()

	out, err := runPowerShellCommand(ctx, buildWindowsNetAdapterCommand(valid))
	if err != nil || len(out) == 0 {
		return nil
	}
	rows, err := parseWindowsNetAdapterRows(out)
	if err != nil {
		return nil
	}
	return rows
}

func findInterfaceMac(interfaces []psutilNet.InterfaceStat, name string) string {
	for _, iface := range interfaces {
		if strings.EqualFold(iface.Name, name) {
			return iface.HardwareAddr
		}
	}
	return ""
}
