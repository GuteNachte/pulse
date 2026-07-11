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
