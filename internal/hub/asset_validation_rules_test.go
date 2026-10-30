//go:build testing

package hub

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
)

func TestAssetValidationRulesNormalizeNetworkValues(t *testing.T) {
	require.Equal(t, "192.168.1.10", normalizeAssetIP(" 192.168.1.10 "))
	require.Equal(t, "aabbccddeeff", normalizeAssetMAC("AA:BB-CC.DD EE FF"))
	require.Equal(t, []string{"192.168.1.10", "fe80::1", "10.0.0.2"}, splitAssetIPList("192.168.1.10, fe80::1;10.0.0.2"))
	require.Equal(t, "固定 IPv4", duplicateAssetIPLabel(map[string]string{"192.168.1.10": "固定 IPv4"}, map[string]string{"192.168.1.10": "接口 IPv4"}))
}

func TestAssetValidationRulesReadMetadataValues(t *testing.T) {
	collection := core.NewBaseCollection("assets")
	record := core.NewRecord(collection)
	record.Set("metadata", map[string]any{"memory_gb": "12", "fixed_ipv4": "192.168.1.90"})

	require.Equal(t, "192.168.1.90", recordMetadataString(record, "fixed_ipv4"))
	require.True(t, recordMetadataPositiveNumber(record, "memory_gb"))
	require.False(t, recordMetadataPositiveNumber(record, "missing"))
}
