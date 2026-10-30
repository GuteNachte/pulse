//go:build windows

package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseWindowsPhysicalMemoryRows(t *testing.T) {
	input := []byte(`[
		{"BankLabel":"BANK 0","DeviceLocator":"DIMM 0","Capacity":17179869184,"SMBusMemoryType":34,"MemoryType":0,"Speed":5600,"ConfiguredClockSpeed":5200,"Manufacturer":"Kingston","PartNumber":"KF556S40-16"},
		{"BankLabel":"BANK 1","DeviceLocator":"DIMM 1","Capacity":17179869184,"SMBusMemoryType":34,"MemoryType":0,"Speed":5600,"ConfiguredClockSpeed":5200,"Manufacturer":"Kingston","PartNumber":"KF556S40-16"}
	]`)

	modules := parseWindowsPhysicalMemoryRows(input)

	require.Len(t, modules, 2)
	assert.Equal(t, "BANK 0 DIMM 0", modules[0].Locator)
	assert.Equal(t, uint64(17179869184), modules[0].Capacity)
	assert.Equal(t, "DDR5", modules[0].MemoryType)
	assert.Equal(t, uint64(5600), modules[0].SpeedMhz)
	assert.Equal(t, uint64(5200), modules[0].ConfiguredMhz)
}
