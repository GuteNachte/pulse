package migrations

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNormalizeInternetMetadataUsesOnlyDeterministicLegacyValues(t *testing.T) {
	metadata := map[string]any{"access_mode": "家庭光纤 FTTH / PPPoE 拨号", "legacy_note": "保留"}

	require.True(t, normalizeInternetMetadata(metadata))
	require.Equal(t, "ftth", metadata["access_technology"])
	require.Equal(t, "pppoe", metadata["auth_mode"])
	require.Equal(t, "保留", metadata["legacy_note"])
	require.False(t, normalizeInternetMetadata(metadata))

	unknown := map[string]any{"access_mode": "家庭线路"}
	require.False(t, normalizeInternetMetadata(unknown))
	require.NotContains(t, unknown, "access_technology")
	require.NotContains(t, unknown, "auth_mode")
}

func TestNormalizeInternetProviderAlias(t *testing.T) {
	require.Equal(t, "中国联通", normalizeInternetProviderAlias("联通"))
	require.Equal(t, "中国电信", normalizeInternetProviderAlias("中国电信"))
	require.Equal(t, "未知运营商", normalizeInternetProviderAlias("未知运营商"))
}
