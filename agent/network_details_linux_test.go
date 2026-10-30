//go:build linux

package agent

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestParseLinuxLspciDeviceName(t *testing.T) {
	assert.Equal(
		t,
		"Intel Corporation Ethernet Controller I225-V",
		parseLinuxLspciDeviceName([]byte("02:00.0 Ethernet controller: Intel Corporation Ethernet Controller I225-V (rev 03)\n")),
	)
	assert.Equal(
		t,
		"Intel Corporation Wi-Fi 6 AX200",
		parseLinuxLspciDeviceName([]byte("0000:03:00.0 Network controller: Intel Corporation Wi-Fi 6 AX200 (rev 1a)\n")),
	)
	assert.Equal(t, "", parseLinuxLspciDeviceName(nil))
}
