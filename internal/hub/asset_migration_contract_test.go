package hub

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAssetMigrationContractDeclaresRestorableCollectionOrder(t *testing.T) {
	require.Equal(t, "pulse.asset-center.package.v1", assetPackageSchemaV1)
	require.Equal(t, []string{
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
	}, assetMigrationCollections)
}

func TestAssetMigrationAssetMatchingUsesOnlyStableIdentity(t *testing.T) {
	existing := []migrationAssetIdentity{
		{ID: "origin", OriginInstance: "source-a", OriginRecord: "asset-1"},
		{ID: "tag", AssetTag: "ASSET-0001"},
		{ID: "serial", SerialNumber: "SN-1", Vendor: "Minisforum", Model: "UM690"},
		{ID: "ip-only", Name: "NAS", ManagementIP: "192.168.1.30"},
	}

	tests := []struct {
		name     string
		incoming migrationAssetIdentity
		want     string
	}{
		{name: "origin", incoming: migrationAssetIdentity{OriginInstance: "source-a", OriginRecord: "asset-1"}, want: "origin"},
		{name: "tag", incoming: migrationAssetIdentity{AssetTag: "asset-0001"}, want: "tag"},
		{name: "serial", incoming: migrationAssetIdentity{SerialNumber: "sn-1", Vendor: "MINISFORUM", Model: "um690"}, want: "serial"},
		{name: "ip is warning only", incoming: migrationAssetIdentity{Name: "NAS", ManagementIP: "192.168.1.30"}, want: ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := matchMigrationAsset(test.incoming, existing)
			require.NoError(t, err)
			require.Equal(t, test.want, got)
		})
	}
}

func TestAssetMigrationAssetMatchingRejectsAmbiguousStableIdentity(t *testing.T) {
	existing := []migrationAssetIdentity{{ID: "a", AssetTag: "ASSET-1"}, {ID: "b", AssetTag: "ASSET-1"}}
	_, err := matchMigrationAsset(migrationAssetIdentity{AssetTag: "ASSET-1"}, existing)
	require.ErrorContains(t, err, "ambiguous asset_tag")
}
