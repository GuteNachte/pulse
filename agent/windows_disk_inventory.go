package agent

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"

	"gutenacht.site/pulse/internal/entities/smart"
)

// windowsPhysicalDisk mirrors the Windows Storage Management API class
// MSFT_PhysicalDisk (root\Microsoft\Windows\Storage). Field names must match
// the WMI property names because the WMI client resolves them by name.
type windowsPhysicalDisk struct {
	DeviceId        string
	FriendlyName    string
	Model           string
	SerialNumber    string
	FirmwareVersion string
	MediaType       uint16
	BusType         uint16
	Size            uint64
	HealthStatus    uint16
}

// windowsDiskEntry is one physical disk reported by the Windows storage stack.
// Key is the stable SMART key used by the Hub (serial when unique, device path
// otherwise); Data carries the fields Windows exposes without raw SMART access.
type windowsDiskEntry struct {
	Key  string
	Data smart.SmartData
}

// windowsReliabilityCounter mirrors the fields read from
// MSFT_StorageReliabilityCounter through Get-StorageReliabilityCounter.
type windowsReliabilityCounter struct {
	DeviceId            string  `json:"DeviceId"`
	Temperature         *uint16 `json:"Temperature"`
	PowerOnHours        *uint64 `json:"PowerOnHours"`
	StartStopCycleCount *uint64 `json:"StartStopCycleCount"`
}

// convertWindowsPhysicalDisks turns Windows storage inventory into the same
// device/data shape used by the smartctl collectors. It never fabricates
// temperature, power-on hours, or attributes: those stay empty when Windows
// does not expose them.
func convertWindowsPhysicalDisks(disks []windowsPhysicalDisk) ([]*DeviceInfo, map[string]windowsDiskEntry) {
	devices := make([]*DeviceInfo, 0, len(disks))
	entries := make(map[string]windowsDiskEntry, len(disks))

	serialCounts := make(map[string]int, len(disks))
	for _, disk := range disks {
		if serial := normalizeWindowsSerial(disk.SerialNumber); serial != "" {
			serialCounts[serial]++
		}
	}

	for _, disk := range disks {
		name := windowsPhysicalDriveName(disk.DeviceId)
		if name == "" {
			continue
		}
		serial := normalizeWindowsSerial(disk.SerialNumber)
		key := serial
		if key == "" || serialCounts[serial] > 1 {
			key = name
		}

		data := smart.SmartData{
			ModelName:       firstNonEmptyString(disk.FriendlyName, disk.Model),
			SerialNumber:    strings.TrimSpace(disk.SerialNumber),
			FirmwareVersion: strings.TrimSpace(disk.FirmwareVersion),
			Capacity:        disk.Size,
			SmartStatus:     windowsDiskHealthStatus(disk.HealthStatus),
			DiskName:        name,
			DiskType:        windowsDiskBusType(disk.BusType),
			MediaType:       windowsDiskMediaType(disk.MediaType),
		}
		entries[name] = windowsDiskEntry{Key: key, Data: data}
		devices = append(devices, &DeviceInfo{
			Name:     name,
			Type:     data.DiskType,
			InfoName: data.ModelName,
			Protocol: data.DiskType,
		})
	}

	return devices, entries
}

func windowsPhysicalDriveName(deviceID string) string {
	id := strings.TrimSpace(deviceID)
	if id == "" {
		return ""
	}
	if number, err := strconv.Atoi(id); err == nil {
		return fmt.Sprintf(`\\.\PHYSICALDRIVE%d`, number)
	}
	return "windows-physicaldisk-" + strings.ToLower(id)
}

// normalizeWindowsSerial rejects placeholder serials made only of zeros,
// separators, and spaces; some USB bridges report those for every disk.
func normalizeWindowsSerial(serial string) string {
	trimmed := strings.TrimSpace(serial)
	if trimmed == "" {
		return ""
	}
	if strings.Trim(trimmed, "0_. ") == "" {
		return ""
	}
	return trimmed
}

func windowsDiskHealthStatus(status uint16) string {
	switch status {
	case 0:
		return "PASSED"
	case 1:
		return "WARNING"
	case 2:
		return "FAILED"
	default:
		return "UNKNOWN"
	}
}

func windowsDiskBusType(bus uint16) string {
	switch bus {
	case 7:
		return "usb"
	case 8:
		return "raid"
	case 10:
		return "sas"
	case 11:
		return "sata"
	case 17:
		return "nvme"
	case 18:
		return "scm"
	case 14, 15, 16:
		return "virtual"
	default:
		return "disk"
	}
}

func windowsDiskMediaType(media uint16) string {
	switch media {
	case 3:
		return "hdd"
	case 4:
		return "ssd"
	case 5:
		return "scm"
	default:
		return ""
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

// applyWindowsReliability merges storage reliability counters into inventory
// entries. Missing counters stay missing; zero or absent values are not
// presented as real measurements.
func applyWindowsReliability(entries map[string]windowsDiskEntry, rows []windowsReliabilityCounter) {
	for _, row := range rows {
		name := windowsPhysicalDriveName(row.DeviceId)
		entry, ok := entries[name]
		if !ok {
			continue
		}
		if row.Temperature != nil && *row.Temperature > 0 {
			entry.Data.Temperature = uint8(min(*row.Temperature, 255))
		}
		var attributes []*smart.SmartAttribute
		if row.PowerOnHours != nil && *row.PowerOnHours > 0 {
			attributes = append(attributes, &smart.SmartAttribute{Name: "Power_On_Hours", RawValue: *row.PowerOnHours})
		}
		if row.StartStopCycleCount != nil && *row.StartStopCycleCount > 0 {
			attributes = append(attributes, &smart.SmartAttribute{Name: "Power_Cycle_Count", RawValue: *row.StartStopCycleCount})
		}
		entry.Data.Attributes = attributes
		entries[name] = entry
	}
}

func parseWindowsReliabilityCounters(output []byte) []windowsReliabilityCounter {
	trimmed := strings.TrimSpace(string(output))
	if trimmed == "" {
		return nil
	}
	if strings.HasPrefix(trimmed, "[") {
		var rows []windowsReliabilityCounter
		if err := json.Unmarshal([]byte(trimmed), &rows); err != nil {
			slog.Debug("windows storage reliability parse failed", "err", err)
			return nil
		}
		return rows
	}
	var row windowsReliabilityCounter
	if err := json.Unmarshal([]byte(trimmed), &row); err != nil {
		slog.Debug("windows storage reliability parse failed", "err", err)
		return nil
	}
	return []windowsReliabilityCounter{row}
}
