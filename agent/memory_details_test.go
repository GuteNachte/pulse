package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gutenacht.site/pulse/internal/entities/system"
)

func TestRefreshMemoryModuleDetailsMarksDirtyWhenDetailsChange(t *testing.T) {
	previous := detectMemoryModuleDetailsFunc
	defer func() { detectMemoryModuleDetailsFunc = previous }()

	detectMemoryModuleDetailsFunc = func() []system.MemoryModuleDetails {
		return []system.MemoryModuleDetails{
			{Locator: "DIMM 0", Capacity: 16 * 1024 * 1024 * 1024, MemoryType: "DDR5", ConfiguredMhz: 5600},
		}
	}

	a := &Agent{}
	a.refreshMemoryModuleDetails()

	require.Len(t, a.systemDetails.MemoryModules, 1)
	assert.Equal(t, "DDR5", a.systemDetails.MemoryModules[0].MemoryType)
	assert.Equal(t, uint64(16*1024*1024*1024), a.systemDetails.MemoryTotal)
	assert.True(t, a.detailsDirty)

	a.detailsDirty = false
	a.refreshMemoryModuleDetails()
	assert.False(t, a.detailsDirty, "unchanged memory module details should not force another details sync")
}

func TestRefreshMemoryModuleDetailsUsesInstalledTotal(t *testing.T) {
	previous := detectMemoryModuleDetailsFunc
	defer func() { detectMemoryModuleDetailsFunc = previous }()

	detectMemoryModuleDetailsFunc = func() []system.MemoryModuleDetails {
		return []system.MemoryModuleDetails{
			{Locator: "DIMM 0", Capacity: 16 * 1024 * 1024 * 1024},
			{Locator: "DIMM 1", Capacity: 16 * 1024 * 1024 * 1024},
		}
	}

	a := &Agent{}
	a.systemDetails.MemoryTotal = 27 * 1024 * 1024 * 1024

	a.refreshMemoryModuleDetails()

	assert.Equal(t, uint64(32*1024*1024*1024), a.systemDetails.MemoryTotal)
	assert.True(t, a.detailsDirty)
}

func TestInstalledMemoryTotalFromModules(t *testing.T) {
	assert.Equal(t, uint64(0), installedMemoryTotalFromModules(nil))
	assert.Equal(t, uint64(32*1024*1024*1024), installedMemoryTotalFromModules([]system.MemoryModuleDetails{
		{Capacity: 16 * 1024 * 1024 * 1024},
		{Capacity: 16 * 1024 * 1024 * 1024},
	}))
}

func TestCleanMemoryText(t *testing.T) {
	assert.Equal(t, "Kingston Fury", cleanMemoryText(" Kingston   Fury "))
	assert.Equal(t, "", cleanMemoryText("Unknown"))
	assert.Equal(t, "", cleanMemoryText("Not Specified"))
}
