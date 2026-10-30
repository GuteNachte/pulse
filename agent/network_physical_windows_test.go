//go:build windows

package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFilterWindowsPhysicalAdapters(t *testing.T) {
	rows := []windowsNetAdapterRow{
		{Name: "vEthernet (Default Switch)", HardwareInterface: false, Virtual: true},
		{Name: "蓝牙网络连接", HardwareInterface: false, Virtual: true},
		{Name: "以太网", HardwareInterface: true, Virtual: false},
		{Name: "WLAN", HardwareInterface: true, Virtual: false},
	}

	filtered := filterWindowsPhysicalAdapters(rows)

	require.Len(t, filtered, 2)
	assert.Equal(t, "以太网", filtered[0].Name)
	assert.Equal(t, "WLAN", filtered[1].Name)
}
