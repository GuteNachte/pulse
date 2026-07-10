//go:build testing

package hub_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

func TestAssetChangesAreCreatedFromAssetRequests(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-changes@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	createResponse := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/assets/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","name":"验收资产","type":"physical_host","status":"active"}`, user.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, createResponse.Status, createResponse.Body)
	assetID := decodeRecordID(t, createResponse.Body)

	changes, err := hub.FindRecordsByFilter("asset_changes", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": assetID,
	})
	require.NoError(t, err)
	require.Len(t, changes, 1)
	assert.Equal(t, "create", changes[0].GetString("action"))
	assert.Equal(t, "assets", changes[0].GetString("source_collection"))
	assert.Contains(t, changes[0].GetString("summary"), "新增资产档案")

	updateResponse := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPatch,
		fmt.Sprintf("/api/collections/assets/records/%s", assetID),
		strings.NewReader(`{"location":"书房"}`),
		headers,
	)
	require.Equal(t, http.StatusOK, updateResponse.Status, updateResponse.Body)

	changes, err = hub.FindRecordsByFilter("asset_changes", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": assetID,
	})
	require.NoError(t, err)
	require.Len(t, changes, 2)
	updateChange := findAssetChangeByAction(changes, "update")
	require.NotNil(t, updateChange)
	assert.Equal(t, "assets", updateChange.GetString("source_collection"))
	assert.Contains(t, updateChange.GetString("summary"), "更新资产档案")
}

func TestAssetRelationChangesAreRecordedForBothAssets(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-relation-changes@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	source, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "路由器",
		"type":   "router",
		"status": "active",
	})
	require.NoError(t, err)
	target, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":   user.Id,
		"name":   "交换机",
		"type":   "switch",
		"status": "active",
	})
	require.NoError(t, err)

	response := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_relations/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","source_asset":"%s","target_asset":"%s","kind":"connected_to","label":"LAN -> 上联"}`, user.Id, source.Id, target.Id)),
		headers,
	)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	for _, assetID := range []string{source.Id, target.Id} {
		changes, err := hub.FindRecordsByFilter("asset_changes", "asset = {:asset} && source_collection = 'asset_relations'", "-created", -1, 0, map[string]any{
			"asset": assetID,
		})
		require.NoError(t, err)
		require.Len(t, changes, 1)
		assert.Equal(t, "create", changes[0].GetString("action"))
		assert.Contains(t, changes[0].GetString("summary"), "新增资产关系")
	}
}

func TestAssetChangesCannotBeCreatedThroughApi(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	defer hub.Cleanup()

	user, err := pulseTests.CreateUser(hub, "asset-change-forge@example.com", "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	asset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user": user.Id,
		"name": "不可伪造资产",
		"type": "custom",
	})
	require.NoError(t, err)

	response := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/collections/asset_changes/records",
		strings.NewReader(fmt.Sprintf(`{"user":"%s","asset":"%s","source_collection":"assets","action":"create","summary":"伪造历史"}`, user.Id, asset.Id)),
		map[string]string{"Authorization": token},
	)
	require.Equal(t, http.StatusForbidden, response.Status, response.Body)

	changes, err := hub.FindRecordsByFilter("asset_changes", "asset = {:asset}", "", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	assert.Empty(t, changes)
}

func decodeRecordID(t testing.TB, body string) string {
	t.Helper()
	var record struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal([]byte(body), &record))
	require.NotEmpty(t, record.ID)
	return record.ID
}

func findAssetChangeByAction(changes []*core.Record, action string) *core.Record {
	for _, change := range changes {
		if change.GetString("action") == action {
			return change
		}
	}
	return nil
}
