//go:build testing

package hub_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

// 2026-10-09 图片专项：摆放位互斥语义集成测试——
// 设为封面时旧封面自动降级进图库、该图自身图库位移出；取消封面时图片回到图库不消失。

type assetMediaPlacementState struct {
	ID      string
	Media   string
	Version string
	Role    string
	Visible bool
}

func createAssetMediaWithPlacement(t *testing.T, fixture assetEnrichmentFixture, role string, order int) (string, string) {
	t.Helper()
	media, err := pulseTests.CreateRecord(fixture.hub, "asset_media", map[string]any{
		"user": fixture.user.Id, "asset": fixture.asset.Id, "state": "library", "source_kind": "upload",
	})
	require.NoError(t, err)
	version, err := pulseTests.CreateRecord(fixture.hub, "asset_media_versions", map[string]any{
		"user": fixture.user.Id, "asset": fixture.asset.Id, "media": media.Id, "kind": "original",
		"object_key": "originals/test/" + media.Id, "mime_type": "image/jpeg", "bytes": 1,
	})
	require.NoError(t, err)
	placement, err := pulseTests.CreateRecord(fixture.hub, "asset_media_placements", map[string]any{
		"user": fixture.user.Id, "asset": fixture.asset.Id, "media": media.Id,
		"version": version.Id, "role": role, "sort_order": order, "visible": true,
	})
	require.NoError(t, err)
	require.NotEmpty(t, placement.Id)
	return media.Id, version.Id
}

func fetchAssetMediaPlacements(t *testing.T, fixture assetEnrichmentFixture) []assetMediaPlacementState {
	t.Helper()
	records, err := fixture.hub.FindRecordsByFilter(
		"asset_media_placements",
		"asset = {:asset}",
		"sort_order,id", 200, 0,
		map[string]any{"asset": fixture.asset.Id},
	)
	require.NoError(t, err)
	result := make([]assetMediaPlacementState, 0, len(records))
	for _, record := range records {
		result = append(result, assetMediaPlacementState{
			ID:      record.Id,
			Media:   record.GetString("media"),
			Version: record.GetString("version"),
			Role:    record.GetString("role"),
			Visible: record.GetBool("visible"),
		})
	}
	return result
}

func visiblePlacementsForMedia(placements []assetMediaPlacementState, mediaID string) []assetMediaPlacementState {
	visible := make([]assetMediaPlacementState, 0, 2)
	for _, placement := range placements {
		if placement.Media == mediaID && placement.Visible {
			visible = append(visible, placement)
		}
	}
	return visible
}

func postAssetMediaPlacement(t *testing.T, fixture assetEnrichmentFixture, mediaID string, versionID string, role string, visible bool, order int) {
	t.Helper()
	rawBody, err := json.Marshal(map[string]any{"version": versionID, "role": role, "visible": visible, "sort_order": order})
	require.NoError(t, err)
	response := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		fmt.Sprintf("/api/pulse/assets/%s/media/%s/placements", fixture.asset.Id, mediaID),
		bytes.NewReader(rawBody),
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
}

func TestAssetMediaPlacementCoverSwitchKeepsSingleVisiblePlacementPerMedia(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-media-placement-cover@example.com")
	mediaA, _ := createAssetMediaWithPlacement(t, fixture, "cover", 0)
	mediaB, versionB := createAssetMediaWithPlacement(t, fixture, "gallery", 1)

	// 把 B 设为封面：B 的图库位应移出；A（旧封面）应自动降级进图库而不是消失
	postAssetMediaPlacement(t, fixture, mediaB, versionB, "cover", true, 0)

	placements := fetchAssetMediaPlacements(t, fixture)
	visibleA := visiblePlacementsForMedia(placements, mediaA)
	visibleB := visiblePlacementsForMedia(placements, mediaB)
	require.Len(t, visibleA, 1, "旧封面应保留一个可见位: %+v", placements)
	require.Equal(t, "gallery", visibleA[0].Role, "旧封面应降级为图库位: %+v", placements)
	require.Len(t, visibleB, 1, "新封面不能同时出现在图库: %+v", placements)
	require.Equal(t, "cover", visibleB[0].Role, "新封面应只有封面位: %+v", placements)

	// 取消 B 的封面：B 应回到图库（仍有可见位），而不是凭空消失
	postAssetMediaPlacement(t, fixture, mediaB, versionB, "cover", false, 0)

	placements = fetchAssetMediaPlacements(t, fixture)
	visibleB = visiblePlacementsForMedia(placements, mediaB)
	require.Len(t, visibleB, 1, "取消封面后图片应回到图库: %+v", placements)
	require.Equal(t, "gallery", visibleB[0].Role)
}

func TestAssetMediaPlacementGalleryAddMovesCoverDown(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-media-placement-gallery@example.com")
	mediaA, versionA := createAssetMediaWithPlacement(t, fixture, "cover", 0)

	// 对封面图执行"加入图库"：同图不能两位并存，封面位应移出、只留图库位
	postAssetMediaPlacement(t, fixture, mediaA, versionA, "gallery", true, 0)

	placements := fetchAssetMediaPlacements(t, fixture)
	visible := visiblePlacementsForMedia(placements, mediaA)
	require.Len(t, visible, 1, "同一张图只能有一个可见位: %+v", placements)
	require.Equal(t, "gallery", visible[0].Role)
}
