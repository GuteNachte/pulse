//go:build windows

package agent

import (
	"context"
	"log/slog"
	"time"

	"github.com/yusufpapurcu/wmi"
)

const windowsStorageNamespace = `root\Microsoft\Windows\Storage`

const windowsReliabilityCommand = `Get-PhysicalDisk | ForEach-Object { $d = $_; try { $c = $d | Get-StorageReliabilityCounter } catch { $c = $null }; [PSCustomObject]@{ DeviceId = [string]$d.DeviceId; Temperature = $(if ($c) { $c.Temperature } else { $null }); PowerOnHours = $(if ($c) { $c.PowerOnHours } else { $null }); StartStopCycleCount = $(if ($c) { $c.StartStopCycleCount } else { $null }) } } | ConvertTo-Json -Compress`

// queryWindowsPhysicalDisks reads the Windows Storage Management inventory.
// DeviceId, FriendlyName, and the other fields intentionally match the WMI
// property names; the client resolves properties by the struct field name.
func queryWindowsPhysicalDisks() []windowsPhysicalDisk {
	var disks []windowsPhysicalDisk
	query := "SELECT DeviceId, FriendlyName, Model, SerialNumber, FirmwareVersion, MediaType, BusType, Size, HealthStatus FROM MSFT_PhysicalDisk"
	if err := wmi.QueryNamespace(query, &disks, windowsStorageNamespace); err != nil {
		slog.Debug("windows physical disk query failed", "err", err)
		return nil
	}
	return disks
}

func windowsPhysicalDiskDevices() ([]*DeviceInfo, map[string]windowsDiskEntry) {
	devices, entries := convertWindowsPhysicalDisks(queryWindowsPhysicalDisks())
	enrichWindowsDiskReliability(entries)
	return devices, entries
}

// enrichWindowsDiskReliability adds temperature, power-on hours, and power
// cycles when the storage driver exposes them. Failures are non-fatal: the
// inventory above still reports model, capacity, and health.
func enrichWindowsDiskReliability(entries map[string]windowsDiskEntry) {
	if len(entries) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	output, err := runPowerShellCommand(ctx, windowsReliabilityCommand)
	if err != nil {
		slog.Debug("windows storage reliability query failed", "err", err)
		return
	}
	applyWindowsReliability(entries, parseWindowsReliabilityCounters(output))
}
