//go:build testing

package hub

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAssetEnrichmentDomainFiltersOfficialColorFocus(t *testing.T) {
	suggestions := []assetEnrichmentSuggestionInput{
		{TargetField: "metadata.colors_available", RecommendedValue: "墨羽黑"},
		{TargetField: "metadata.official_image_url", RecommendedValue: "https://mi.com/phone.png"},
		{TargetField: "metadata.cpu_model", RecommendedValue: "天玑 8100"},
	}

	focus := normalizeAssetEnrichmentReportFocus("colors")
	filtered := filterAssetEnrichmentSuggestionsByFocus(suggestions, focus)
	require.Equal(t, "official_colors", normalizeAssetEnrichmentReportFocus("device_colors"))
	require.Len(t, filtered, 2)
	require.Equal(t, "metadata.colors_available", filtered[0].TargetField)
	require.Equal(t, "metadata.official_image_url", filtered[1].TargetField)
}

func TestAssetEnrichmentDomainDedupesAndPrioritizesConflicts(t *testing.T) {
	suggestions := dedupeEnrichmentSuggestions([]assetEnrichmentSuggestionInput{
		{TargetCollection: "assets", TargetField: "metadata.cpu_model", RecommendedValue: "天玑 8100", Confidence: 99},
		{TargetCollection: "assets", TargetField: "metadata.cpu_model", RecommendedValue: " 天玑 8100 ", Confidence: 80},
		{TargetCollection: "assets", TargetField: "metadata.memory_gb", RecommendedValue: "12", Confidence: 70, Conflict: true},
		{TargetCollection: "assets", TargetField: "metadata.empty", RecommendedValue: ""},
	})

	require.Len(t, suggestions, 2)
	require.True(t, suggestions[0].Conflict)
	require.Equal(t, "12", suggestions[0].RecommendedValue)
	require.Equal(t, 99, suggestions[1].Confidence)
}

func TestAssetEnrichmentDomainSelectsHardwareStrategy(t *testing.T) {
	require.Equal(t, "staged_hardware_identification", assetEnrichmentStrategy("physical_host").ID)
	require.Equal(t, "fixed_spec_model_match", assetEnrichmentStrategy("phone").ID)
}

func TestAssetEnrichmentProfileFieldAllowlistMatchesAssetType(t *testing.T) {
	phoneFields := assetEnrichmentAllowedMetadataFieldSet("phone")
	require.True(t, phoneFields["rear_main_camera"])
	require.True(t, phoneFields["battery_capacity_mah"])

	televisionFields := assetEnrichmentAllowedMetadataFieldSet("tv")
	require.True(t, televisionFields["screen_size"])
	require.True(t, televisionFields["hdr_support"])
	require.False(t, televisionFields["rear_main_camera"])
	require.False(t, televisionFields["battery_capacity_mah"])

	switchFields := assetEnrichmentAllowedMetadataFieldSet("switch")
	require.True(t, switchFields["port_count"])
	require.True(t, switchFields["vlan_note"])
	require.False(t, switchFields["wifi_standard"])

	accessPointFields := assetEnrichmentAllowedMetadataFieldSet("ap")
	require.True(t, accessPointFields["wifi_standard"])
	require.True(t, accessPointFields["ssid_note"])

	internetFields := assetEnrichmentAllowedMetadataFieldSet("internet")
	require.True(t, internetFields["down_mbps"])
	require.True(t, internetFields["public_ipv4"])
	require.False(t, internetFields["internal_model"])
	require.False(t, internetFields["official_image_url"])
}
