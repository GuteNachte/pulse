//go:build linux

package agent

import (
	"context"
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/entities/system"
)

var linuxDmiMemoryRoot = "/sys/devices/virtual/dmi/id"
var linuxDmiEntryRoot = "/sys/firmware/dmi/entries"

func detectMemoryModuleDetails() []system.MemoryModuleDetails {
	if modules := detectMemoryModuleDetailsFromDmidecode(); len(modules) > 0 {
		return modules
	}
	if modules := detectMemoryModuleDetailsFromDmiEntries(); len(modules) > 0 {
		return modules
	}

	entries, err := os.ReadDir(linuxDmiMemoryRoot)
	if err != nil {
		return nil
	}
	modules := make([]system.MemoryModuleDetails, 0)
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "memory") {
			continue
		}
		module := readLinuxMemoryModule(filepath.Join(linuxDmiMemoryRoot, entry.Name()))
		if module.Capacity == 0 && module.MemoryType == "" && module.SpeedMhz == 0 && module.ConfiguredMhz == 0 {
			continue
		}
		modules = append(modules, module)
	}
	return modules
}

func detectMemoryModuleDetailsFromDmiEntries() []system.MemoryModuleDetails {
	entries, err := os.ReadDir(linuxDmiEntryRoot)
	if err != nil {
		return nil
	}
	modules := make([]system.MemoryModuleDetails, 0)
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "17-") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(linuxDmiEntryRoot, entry.Name(), "raw"))
		if err != nil {
			continue
		}
		module := parseLinuxDmiMemoryModuleRaw(raw)
		if module.Capacity == 0 {
			continue
		}
		modules = append(modules, module)
	}
	return modules
}

func detectMemoryModuleDetailsFromDmidecode() []system.MemoryModuleDetails {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "dmidecode", "--type", "memory").Output()
	if err != nil || len(out) == 0 {
		return nil
	}
	return parseDmidecodeMemoryModules(string(out))
}

func parseDmidecodeMemoryModules(output string) []system.MemoryModuleDetails {
	blocks := strings.Split(output, "\nHandle ")
	modules := make([]system.MemoryModuleDetails, 0)
	for _, block := range blocks {
		if !strings.Contains(block, "Memory Device") {
			continue
		}
		fields := parseDmidecodeBlockFields(block)
		size := parseLinuxMemorySize(fields["Size"])
		if size == 0 {
			continue
		}
		modules = append(modules, system.MemoryModuleDetails{
			Locator:       cleanMemoryText(firstNonEmpty(fields["Locator"], fields["Bank Locator"])),
			Capacity:      size,
			MemoryType:    normalizeLinuxMemoryType(firstNonEmpty(fields["Type"], fields["Memory Technology"])),
			SpeedMhz:      parseMemorySpeedMhz(fields["Speed"]),
			ConfiguredMhz: parseMemorySpeedMhz(fields["Configured Memory Speed"]),
			Manufacturer:  cleanMemoryText(fields["Manufacturer"]),
			PartNumber:    cleanMemoryText(fields["Part Number"]),
		})
	}
	return modules
}

func parseDmidecodeBlockFields(block string) map[string]string {
	fields := make(map[string]string)
	for _, line := range strings.Split(block, "\n") {
		line = strings.TrimSpace(line)
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		fields[strings.TrimSpace(key)] = strings.TrimSpace(value)
	}
	return fields
}

func readLinuxMemoryModule(path string) system.MemoryModuleDetails {
	module := system.MemoryModuleDetails{
		Locator:       readLinuxMemoryText(path, "locator"),
		MemoryType:    normalizeLinuxMemoryType(readLinuxMemoryText(path, "type")),
		SpeedMhz:      parseMemorySpeedMhz(readLinuxMemoryText(path, "speed")),
		ConfiguredMhz: parseMemorySpeedMhz(readLinuxMemoryText(path, "configured_speed")),
		Manufacturer:  cleanMemoryText(readLinuxMemoryText(path, "manufacturer")),
		PartNumber:    cleanMemoryText(readLinuxMemoryText(path, "part_number")),
	}
	module.Capacity = parseLinuxMemorySize(readLinuxMemoryText(path, "size"))
	return module
}

func readLinuxMemoryText(path string, name string) string {
	raw, err := os.ReadFile(filepath.Join(path, name))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(raw))
}

func parseLinuxDmiMemoryModuleRaw(raw []byte) system.MemoryModuleDetails {
	if len(raw) < 2 || raw[0] != 17 {
		return system.MemoryModuleDetails{}
	}
	formattedLength := int(raw[1])
	if formattedLength > len(raw) || formattedLength < 21 {
		return system.MemoryModuleDetails{}
	}

	formatted := raw[:formattedLength]
	stringsTable := parseDmiStrings(raw[formattedLength:])
	getString := func(index byte) string {
		if index == 0 || int(index) > len(stringsTable) {
			return ""
		}
		return cleanMemoryText(stringsTable[index-1])
	}

	return system.MemoryModuleDetails{
		Locator:       getString(readDmiByte(formatted, 0x10)),
		Capacity:      parseDmiMemorySizeBytes(readDmiUint16(formatted, 0x0c), readDmiUint32(formatted, 0x1c)),
		MemoryType:    dmiMemoryTypeLabel(readDmiByte(formatted, 0x12)),
		SpeedMhz:      uint64(readDmiUint16(formatted, 0x15)),
		ConfiguredMhz: uint64(readDmiUint16(formatted, 0x20)),
		Manufacturer:  getString(readDmiByte(formatted, 0x17)),
		PartNumber:    getString(readDmiByte(formatted, 0x1a)),
	}
}

func parseDmiStrings(raw []byte) []string {
	stringsTable := make([]string, 0)
	for len(raw) > 0 {
		if raw[0] == 0 {
			break
		}
		end := 0
		for end < len(raw) && raw[end] != 0 {
			end++
		}
		stringsTable = append(stringsTable, string(raw[:end]))
		if end >= len(raw) {
			break
		}
		raw = raw[end+1:]
	}
	return stringsTable
}

func readDmiByte(raw []byte, offset int) byte {
	if offset >= len(raw) {
		return 0
	}
	return raw[offset]
}

func readDmiUint16(raw []byte, offset int) uint16 {
	if offset+2 > len(raw) {
		return 0
	}
	return binary.LittleEndian.Uint16(raw[offset : offset+2])
}

func readDmiUint32(raw []byte, offset int) uint32 {
	if offset+4 > len(raw) {
		return 0
	}
	return binary.LittleEndian.Uint32(raw[offset : offset+4])
}

func parseDmiMemorySizeBytes(size uint16, extendedSize uint32) uint64 {
	if size == 0 || size == 0xffff {
		return 0
	}
	if size == 0x7fff {
		return uint64(extendedSize) * 1024 * 1024
	}
	if size&0x8000 != 0 {
		return uint64(size&0x7fff) * 1024
	}
	return uint64(size) * 1024 * 1024
}

func dmiMemoryTypeLabel(value byte) string {
	switch value {
	case 0x12:
		return "DDR"
	case 0x13:
		return "DDR2"
	case 0x18:
		return "DDR3"
	case 0x1a:
		return "DDR4"
	case 0x1b:
		return "LPDDR"
	case 0x1c:
		return "LPDDR2"
	case 0x1d:
		return "LPDDR3"
	case 0x1e:
		return "LPDDR4"
	case 0x22:
		return "DDR5"
	case 0x23:
		return "LPDDR5"
	default:
		return ""
	}
}

func normalizeLinuxMemoryType(value string) string {
	value = cleanMemoryText(value)
	if strings.EqualFold(value, "unknown") || strings.EqualFold(value, "other") {
		return ""
	}
	return strings.ToUpper(value)
}

func parseLinuxMemorySize(value string) uint64 {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || strings.Contains(value, "no module") {
		return 0
	}
	parts := strings.Fields(value)
	if len(parts) < 2 {
		return 0
	}
	number, err := strconv.ParseFloat(parts[0], 64)
	if err != nil || number <= 0 {
		return 0
	}
	switch parts[1] {
	case "kb", "kib":
		return uint64(number * 1024)
	case "mb", "mib":
		return uint64(number * 1024 * 1024)
	case "gb", "gib":
		return uint64(number * 1024 * 1024 * 1024)
	case "tb", "tib":
		return uint64(number * 1024 * 1024 * 1024 * 1024)
	}
	return 0
}

func parseMemorySpeedMhz(value string) uint64 {
	value = strings.TrimSpace(strings.ToLower(value))
	if value == "" || strings.Contains(value, "unknown") {
		return 0
	}
	parts := strings.Fields(value)
	if len(parts) == 0 {
		return 0
	}
	number, err := strconv.ParseFloat(parts[0], 64)
	if err != nil || number <= 0 {
		return 0
	}
	return uint64(number)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
