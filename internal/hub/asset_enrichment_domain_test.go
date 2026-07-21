//go:build testing

package hub

import (
	"testing"

	"github.com/pocketbase/pocketbase/core"
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

func TestAssetEnrichmentDomainKeepsLocalAndOnlineSourcesForSameCandidate(t *testing.T) {
	suggestions := dedupeEnrichmentSuggestions([]assetEnrichmentSuggestionInput{
		{
			TargetCollection: "assets",
			TargetField:      "metadata.cpu_model",
			RecommendedValue: "AMD Ryzen 9 6900HX",
			CollectedValue:   "AMD Ryzen 9 6900HX",
			Source:           "local",
			Confidence:       86,
		},
		{
			TargetCollection: "assets",
			TargetField:      "metadata.cpu_model",
			RecommendedValue: "AMD Ryzen 9 6900HX",
			OnlineValue:      "AMD Ryzen 9 6900HX",
			Source:           "online",
			Confidence:       74,
		},
	})

	require.Len(t, suggestions, 1)
	require.Equal(t, "AMD Ryzen 9 6900HX", suggestions[0].CollectedValue)
	require.Equal(t, "AMD Ryzen 9 6900HX", suggestions[0].OnlineValue)
	require.Equal(t, "local", suggestions[0].Source)
}

func TestAssetEnrichmentDomainSelectsHardwareStrategy(t *testing.T) {
	require.Equal(t, "staged_hardware_identification", assetEnrichmentStrategy("physical_host").ID)
	require.Equal(t, "fixed_spec_model_match", assetEnrichmentStrategy("phone").ID)
}

func TestAssetEnrichmentProfileFieldAllowlistMatchesAssetType(t *testing.T) {
	phoneFields := assetEnrichmentAllowedMetadataFieldSet("phone")
	require.True(t, phoneFields["internal_model"])
	require.True(t, phoneFields["official_url"])
	require.False(t, phoneFields["support_url"])
	require.False(t, phoneFields["product_url"])
	require.True(t, phoneFields["rear_main_camera"])
	require.True(t, phoneFields["battery_capacity_mah"])

	televisionFields := assetEnrichmentAllowedMetadataFieldSet("tv")
	require.False(t, televisionFields["internal_model"])
	require.True(t, televisionFields["screen_size"])
	require.True(t, televisionFields["hdr_support"])
	require.False(t, televisionFields["rear_main_camera"])
	require.False(t, televisionFields["battery_capacity_mah"])

	switchFields := assetEnrichmentAllowedMetadataFieldSet("switch")
	require.False(t, switchFields["internal_model"])
	require.True(t, switchFields["ethernet_port_count"])
	require.True(t, switchFields["vlan_status"])
	require.False(t, switchFields["wifi_standard"])
	require.False(t, switchFields["fixed_ipv6"])

	accessPointFields := assetEnrichmentAllowedMetadataFieldSet("ap")
	require.True(t, accessPointFields["wifi_standard"])
	require.True(t, accessPointFields["ssid_note"])

	internetFields := assetEnrichmentAllowedMetadataFieldSet("internet")
	require.True(t, internetFields["down_mbps"])
	require.True(t, internetFields["public_ipv4"])
	require.True(t, internetFields["access_technology"])
	require.True(t, internetFields["auth_mode"])
	require.True(t, internetFields["package_name"])
	require.True(t, internetFields["auto_renew"])
	require.False(t, internetFields["internal_model"])
	require.False(t, internetFields["official_image_url"])

	ontFields := assetEnrichmentAllowedMetadataFieldSet("ont")
	require.True(t, ontFields["pon_standard"])
	require.True(t, ontFields["wifi_standard"])
	require.True(t, ontFields["power_spec"])
	require.False(t, ontFields["ssid"])
	require.False(t, ontFields["wifi_password"])
	require.False(t, ontFields["credential"])
}

func TestParseAssetOnlineAISuggestionsDropsONTCredentials(t *testing.T) {
	asset := core.NewRecord(core.NewBaseCollection("assets"))
	asset.Set("type", "ont")
	const sourceURL = "https://consumer.huawei.com/cn/routers/example"
	content := `{"suggestions":[
		{"field":"pon_standard","label":"PON 标准","value":"10G-EPON","confidence":90,"source_urls":["https://consumer.huawei.com/cn/routers/example"]},
		{"field":"ssid","label":"Wi-Fi 名称","value":"redacted","confidence":90,"source_urls":["https://consumer.huawei.com/cn/routers/example"]},
		{"field":"wifi_password","label":"Wi-Fi 密码","value":"redacted","confidence":90,"source_urls":["https://consumer.huawei.com/cn/routers/example"]}
	]}`
	suggestions := (&Hub{}).parseAssetOnlineAISuggestions(asset, content, []assetOnlineSource{{
		Provider:   "manual",
		Type:       "official",
		Title:      "Huawei product page",
		URL:        sourceURL,
		Confidence: 95,
	}})
	require.Len(t, suggestions, 1)
	require.Equal(t, "metadata.pon_standard", suggestions[0].TargetField)
}
