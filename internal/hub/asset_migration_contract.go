package hub

import (
	"fmt"
	"strings"
)

const assetPackageSchemaV1 = "pulse.asset-center.package.v1"

var assetMigrationCollections = []string{
	"asset_locations",
	"assets",
	"asset_interfaces",
	"asset_relations",
	"asset_maintenance",
	"asset_attachments",
	"asset_visuals",
	"asset_media",
	"asset_media_versions",
	"asset_media_placements",
	"asset_enrichment_reports",
	"asset_enrichment_suggestions",
}

type assetPackageManifest struct {
	Schema         string         `json:"schema"`
	PackageID      string         `json:"package_id"`
	PulseVersion   string         `json:"pulse_version"`
	CreatedAt      string         `json:"created_at"`
	SourceInstance string         `json:"source_instance"`
	Scope          string         `json:"scope"`
	Counts         map[string]int `json:"counts"`
	Files          []archiveEntry `json:"files"`
}

type assetPackageRecords struct {
	Collections map[string][]map[string]any `json:"collections"`
}

type assetImportMode string

const (
	assetImportAddOnly        assetImportMode = "add_only"
	assetImportMerge          assetImportMode = "merge"
	assetImportReplaceMatched assetImportMode = "replace_matched"
)

type migrationMessage struct {
	Level   string `json:"level"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type importPlan struct {
	Create  int `json:"create"`
	Merge   int `json:"merge"`
	Replace int `json:"replace"`
	Skip    int `json:"skip"`
}

type assetMigrationPreflight struct {
	UploadID string                         `json:"upload_id"`
	Status   string                         `json:"status"`
	Manifest assetPackageManifest           `json:"manifest"`
	Counts   map[string]int                 `json:"counts"`
	Plans    map[assetImportMode]importPlan `json:"plans"`
	Messages []migrationMessage             `json:"messages"`
	Blockers int                            `json:"blockers"`
}

type assetMigrationResult struct {
	Status   string `json:"status"`
	Created  int    `json:"created"`
	Merged   int    `json:"merged"`
	Replaced int    `json:"replaced"`
	Skipped  int    `json:"skipped"`
	Files    int    `json:"files"`
}

type migrationAssetIdentity struct {
	ID             string
	OriginInstance string
	OriginRecord   string
	AssetTag       string
	SerialNumber   string
	Vendor         string
	Model          string
	Name           string
	ManagementIP   string
}

func matchMigrationAsset(incoming migrationAssetIdentity, existing []migrationAssetIdentity) (string, error) {
	if incoming.OriginInstance != "" && incoming.OriginRecord != "" {
		matches := filterMigrationAssetIdentities(existing, func(candidate migrationAssetIdentity) bool {
			return equalMigrationIdentity(candidate.OriginInstance, incoming.OriginInstance) &&
				equalMigrationIdentity(candidate.OriginRecord, incoming.OriginRecord)
		})
		if len(matches) > 1 {
			return "", fmt.Errorf("ambiguous migration origin")
		}
		if len(matches) == 1 {
			return matches[0].ID, nil
		}
	}
	if strings.TrimSpace(incoming.AssetTag) != "" {
		matches := filterMigrationAssetIdentities(existing, func(candidate migrationAssetIdentity) bool {
			return equalMigrationIdentity(candidate.AssetTag, incoming.AssetTag)
		})
		if len(matches) > 1 {
			return "", fmt.Errorf("ambiguous asset_tag")
		}
		if len(matches) == 1 {
			return matches[0].ID, nil
		}
	}
	if strings.TrimSpace(incoming.SerialNumber) != "" && strings.TrimSpace(incoming.Vendor) != "" && strings.TrimSpace(incoming.Model) != "" {
		matches := filterMigrationAssetIdentities(existing, func(candidate migrationAssetIdentity) bool {
			return equalMigrationIdentity(candidate.SerialNumber, incoming.SerialNumber) &&
				equalMigrationIdentity(candidate.Vendor, incoming.Vendor) &&
				equalMigrationIdentity(candidate.Model, incoming.Model)
		})
		if len(matches) > 1 {
			return "", fmt.Errorf("ambiguous serial identity")
		}
		if len(matches) == 1 {
			return matches[0].ID, nil
		}
	}
	return "", nil
}

func filterMigrationAssetIdentities(values []migrationAssetIdentity, match func(migrationAssetIdentity) bool) []migrationAssetIdentity {
	result := make([]migrationAssetIdentity, 0, 1)
	for _, value := range values {
		if match(value) {
			result = append(result, value)
		}
	}
	return result
}

func equalMigrationIdentity(left, right string) bool {
	return strings.EqualFold(strings.TrimSpace(left), strings.TrimSpace(right))
}
