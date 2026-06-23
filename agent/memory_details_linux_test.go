//go:build linux

package agent

import (
	"encoding/binary"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseDmidecodeMemoryModules(t *testing.T) {
	output := `
Handle 0x0038, DMI type 17, 92 bytes
Memory Device
	Size: 16 GB
	Locator: DIMM 0
	Bank Locator: P0 CHANNEL A
	Type: DDR5
	Speed: 5600 MT/s
	Configured Memory Speed: 5600 MT/s
	Manufacturer: Kingston
	Part Number: KF556S40-16

Handle 0x0039, DMI type 17, 92 bytes
Memory Device
	Size: No Module Installed
	Locator: DIMM 1

Handle 0x003A, DMI type 17, 92 bytes
Memory Device
	Size: 16 GB
	Locator: DIMM 2
	Type: DDR5
	Speed: 5600 MT/s
	Configured Memory Speed: 5200 MT/s
	Manufacturer: Kingston
	Part Number: KF556S40-16
`
	modules := parseDmidecodeMemoryModules(output)

	require.Len(t, modules, 2)
	assert.Equal(t, "DIMM 0", modules[0].Locator)
	assert.Equal(t, uint64(16*1024*1024*1024), modules[0].Capacity)
	assert.Equal(t, "DDR5", modules[0].MemoryType)
	assert.Equal(t, uint64(5600), modules[0].SpeedMhz)
	assert.Equal(t, uint64(5600), modules[0].ConfiguredMhz)
	assert.Equal(t, uint64(5200), modules[1].ConfiguredMhz)
}

func TestParseLinuxMemorySize(t *testing.T) {
	assert.Equal(t, uint64(16*1024*1024*1024), parseLinuxMemorySize("16 GB"))
	assert.Equal(t, uint64(8192*1024*1024), parseLinuxMemorySize("8192 MB"))
	assert.Equal(t, uint64(0), parseLinuxMemorySize("No Module Installed"))
}

func TestParseLinuxDmiMemoryModuleRaw(t *testing.T) {
	raw := makeLinuxDmiMemoryRaw(16*1024, 26, 3200, 3200, []string{
		"DIMM 0",
		"ChannelA",
		"Kingston",
		"KF432S20IB/16",
	})

	module := parseLinuxDmiMemoryModuleRaw(raw)

	assert.Equal(t, "DIMM 0", module.Locator)
	assert.Equal(t, uint64(16*1024*1024*1024), module.Capacity)
	assert.Equal(t, "DDR4", module.MemoryType)
	assert.Equal(t, uint64(3200), module.SpeedMhz)
	assert.Equal(t, uint64(3200), module.ConfiguredMhz)
	assert.Equal(t, "Kingston", module.Manufacturer)
	assert.Equal(t, "KF432S20IB/16", module.PartNumber)
}

func makeLinuxDmiMemoryRaw(sizeMb uint16, memoryType byte, speed uint16, configuredSpeed uint16, strings []string) []byte {
	raw := make([]byte, 40)
	raw[0] = 17
	raw[1] = 40
	binary.LittleEndian.PutUint16(raw[12:14], sizeMb)
	raw[16] = 1
	raw[17] = 2
	raw[18] = memoryType
	binary.LittleEndian.PutUint16(raw[21:23], speed)
	raw[23] = 3
	raw[26] = 4
	binary.LittleEndian.PutUint16(raw[32:34], configuredSpeed)
	for _, value := range strings {
		raw = append(raw, []byte(value)...)
		raw = append(raw, 0)
	}
	raw = append(raw, 0)
	return raw
}
