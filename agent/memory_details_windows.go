//go:build windows

package agent

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/system"
)

type windowsPhysicalMemoryRow struct {
	BankLabel            string
	DeviceLocator        string
	Capacity             uint64
	SMBusMemoryType      uint64
	MemoryType           uint64
	Speed                uint64
	ConfiguredClockSpeed uint64
	Manufacturer         string
	PartNumber           string
}

func detectMemoryModuleDetails() []system.MemoryModuleDetails {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	command := `Get-CimInstance Win32_PhysicalMemory | Select-Object BankLabel,DeviceLocator,Capacity,SMBusMemoryType,MemoryType,Speed,ConfiguredClockSpeed,Manufacturer,PartNumber | ConvertTo-Json -Compress`
	out, err := runPowerShellCommand(ctx, command)
	if err != nil || len(out) == 0 {
		return nil
	}
	return parseWindowsPhysicalMemoryRows(out)
}

func parseWindowsPhysicalMemoryRows(output []byte) []system.MemoryModuleDetails {
	var rows []windowsPhysicalMemoryRow
	if err := json.Unmarshal(output, &rows); err != nil {
		var row windowsPhysicalMemoryRow
		if err := json.Unmarshal(output, &row); err != nil || row.Capacity == 0 {
			return nil
		}
		rows = []windowsPhysicalMemoryRow{row}
	}

	modules := make([]system.MemoryModuleDetails, 0, len(rows))
	for _, row := range rows {
		if row.Capacity == 0 {
			continue
		}
		locator := formatWindowsMemoryLocator(row.BankLabel, row.DeviceLocator)
		modules = append(modules, system.MemoryModuleDetails{
			Locator:       locator,
			Capacity:      row.Capacity,
			MemoryType:    windowsMemoryTypeName(row.SMBusMemoryType, row.MemoryType),
			SpeedMhz:      row.Speed,
			ConfiguredMhz: row.ConfiguredClockSpeed,
			Manufacturer:  cleanMemoryText(row.Manufacturer),
			PartNumber:    cleanMemoryText(row.PartNumber),
		})
	}
	return modules
}

func formatWindowsMemoryLocator(bankLabel string, deviceLocator string) string {
	bankLabel = cleanMemoryText(bankLabel)
	deviceLocator = cleanMemoryText(deviceLocator)
	if bankLabel == "" {
		return deviceLocator
	}
	if deviceLocator == "" || strings.EqualFold(bankLabel, deviceLocator) {
		return bankLabel
	}
	return bankLabel + " " + deviceLocator
}

func windowsMemoryTypeName(smbusType uint64, memoryType uint64) string {
	switch smbusType {
	case 20:
		return "DDR"
	case 21:
		return "DDR2"
	case 24:
		return "DDR3"
	case 26:
		return "DDR4"
	case 34:
		return "DDR5"
	case 35:
		return "LPDDR5"
	}
	switch memoryType {
	case 20:
		return "DDR"
	case 21:
		return "DDR2"
	case 24:
		return "DDR3"
	case 26:
		return "DDR4"
	case 34:
		return "DDR5"
	case 35:
		return "LPDDR5"
	}
	return ""
}
