package hub

import (
	"sort"
	"strings"

	"gutenacht.site/pulse/internal/assetcatalog"
)

func assetEnrichmentAllowedMetadataFieldSet(assetType string) map[string]bool {
	assetType = strings.TrimSpace(assetType)
	allowed := assetcatalog.MustParameterRegistry().AllowedMetadataKeys(assetType)
	// Official images belong to the media workflow rather than the hardware parameter cards.
	if assetType != "internet" {
		allowed["official_image_url"] = true
	}
	return allowed
}

func assetEnrichmentAllowedMetadataFields(assetType string, focus string) []string {
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	if normalizeAssetEnrichmentReportFocus(focus) == "official_colors" {
		filtered := map[string]bool{}
		for _, field := range []string{"colors_available", "official_image_url"} {
			if allowed[field] {
				filtered[field] = true
			}
		}
		allowed = filtered
	}
	fields := make([]string, 0, len(allowed))
	for field := range allowed {
		fields = append(fields, field)
	}
	sort.Strings(fields)
	return fields
}
