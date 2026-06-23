//go:build linux

package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsLinuxPhysicalNetworkDevicePath(t *testing.T) {
	assert.True(t, isLinuxPhysicalNetworkDevicePath("/sys/devices/pci0000:00/0000:00:1f.6/net/eth0"))
	assert.True(t, isLinuxPhysicalNetworkDevicePath("/sys/devices/pci0000:00/0000:03:00.0/ieee80211/phy0/net/wlan0"))
	assert.False(t, isLinuxPhysicalNetworkDevicePath("/sys/devices/virtual/net/docker0"))
	assert.False(t, isLinuxPhysicalNetworkDevicePath(""))
}
