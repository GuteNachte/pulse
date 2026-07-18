//go:build testing

package hub_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

type assetMediaImportAPIResponse struct {
	Media struct {
		ID          string `json:"id"`
		SourceTitle string `json:"source_title"`
		State       string `json:"state"`
	} `json:"media"`
	Version struct {
		ID string `json:"id"`
	} `json:"version"`
}

func TestImportAssetVisualCandidateRestoresDeletedMedia(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-media-import-restore@example.com")
	fixture.asset.Set("name", "Redmi K50")
	require.NoError(t, fixture.hub.Save(fixture.asset))

	imageBytes := solidAssetMediaJPEG(t, 80, 80, color.RGBA{R: 210, G: 30, B: 45, A: 255})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(imageBytes)
	}))
	t.Cleanup(server.Close)

	visual := createAssetVisualImportCandidate(t, fixture, server.URL)
	firstStatus, first := importAssetVisualCandidateForTest(t, fixture, visual.Id, 0)
	require.Equal(t, http.StatusCreated, firstStatus)
	require.NotEmpty(t, first.Media.ID)
	require.NotEmpty(t, first.Version.ID)
	require.Equal(t, "Redmi K50-01", first.Media.SourceTitle)

	secondStatus, second := importAssetVisualCandidateForTest(t, fixture, visual.Id, 0)
	require.Equal(t, http.StatusOK, secondStatus)
	require.Equal(t, first.Media.ID, second.Media.ID)
	require.Equal(t, first.Version.ID, second.Version.ID)

	placement, err := pulseTests.CreateRecord(fixture.hub, "asset_media_placements", map[string]any{
		"user": fixture.user.Id, "asset": fixture.asset.Id, "media": first.Media.ID,
		"version": first.Version.ID, "role": "gallery", "visible": true,
	})
	require.NoError(t, err)
	require.NotEmpty(t, placement.Id)

	deleted := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodDelete,
		fmt.Sprintf("/api/pulse/assets/%s/media/%s", fixture.asset.Id, first.Media.ID),
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, deleted.Status, deleted.Body)

	_, err = pulseTests.CreateRecord(fixture.hub, "asset_media", map[string]any{
		"user": fixture.user.Id, "asset": fixture.asset.Id, "source_kind": "upload",
		"source_title": "Redmi K50-01", "content_hash": "different-image", "state": "library",
	})
	require.NoError(t, err)

	restoredStatus, restored := importAssetVisualCandidateForTest(t, fixture, visual.Id, 0)
	require.Equal(t, http.StatusOK, restoredStatus)
	require.Equal(t, first.Media.ID, restored.Media.ID)
	require.Equal(t, first.Version.ID, restored.Version.ID)
	require.Equal(t, "library", restored.Media.State)
	require.Equal(t, "Redmi K50-02", restored.Media.SourceTitle)

	record, err := fixture.hub.FindRecordById("asset_media", first.Media.ID)
	require.NoError(t, err)
	require.Equal(t, "library", record.GetString("state"))
	require.Equal(t, "Redmi K50-02", record.GetString("source_title"))
	placements, err := fixture.hub.FindRecordsByFilter(
		"asset_media_placements",
		"media = {:media}",
		"id",
		100,
		0,
		map[string]any{"media": first.Media.ID},
	)
	require.NoError(t, err)
	require.Empty(t, placements)
}

func TestImportAssetVisualCandidateRejectsMissingExistingObject(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-media-import-missing-object@example.com")
	imageBytes := solidAssetMediaJPEG(t, 80, 80, color.RGBA{R: 35, G: 90, B: 210, A: 255})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(imageBytes)
	}))
	t.Cleanup(server.Close)

	visual := createAssetVisualImportCandidate(t, fixture, server.URL)
	status, imported := importAssetVisualCandidateForTest(t, fixture, visual.Id, 0)
	require.Equal(t, http.StatusCreated, status)
	version, err := fixture.hub.FindRecordById("asset_media_versions", imported.Version.ID)
	require.NoError(t, err)
	objectPath := filepath.Join(
		fixture.hub.DataDir(),
		"asset_media",
		filepath.FromSlash(version.GetString("object_key")),
	)
	require.NoError(t, os.Remove(objectPath))

	retryStatus, _ := importAssetVisualCandidateForTest(t, fixture, visual.Id, 0)
	require.Equal(t, http.StatusInternalServerError, retryStatus)
}

func createAssetVisualImportCandidate(t testing.TB, fixture assetEnrichmentFixture, sourceURL string) *core.Record {
	t.Helper()
	visual, err := pulseTests.CreateRecord(fixture.hub, "asset_visuals", map[string]any{
		"user":        fixture.user.Id,
		"asset":       fixture.asset.Id,
		"kind":        "official_reference",
		"status":      "ready",
		"primary":     false,
		"frame_count": 1,
		"frames": []map[string]any{{
			"index":            0,
			"label":            "候选 1",
			"source_image_url": sourceURL,
			"source_provider":  "official_url",
		}},
	})
	require.NoError(t, err)
	return visual
}

func importAssetVisualCandidateForTest(
	t testing.TB,
	fixture assetEnrichmentFixture,
	visualID string,
	frameIndex int,
) (int, assetMediaImportAPIResponse) {
	t.Helper()
	body, err := json.Marshal(map[string]any{"visual_id": visualID, "frame_index": frameIndex})
	require.NoError(t, err)
	response := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		fmt.Sprintf("/api/pulse/assets/%s/media/import-visual", fixture.asset.Id),
		strings.NewReader(string(body)),
		fixture.headers,
	)
	var result assetMediaImportAPIResponse
	require.NoError(t, json.Unmarshal([]byte(response.Body), &result), response.Body)
	return response.Status, result
}

func solidAssetMediaJPEG(t testing.TB, width, height int, fill color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, fill)
		}
	}
	var output bytes.Buffer
	require.NoError(t, jpeg.Encode(&output, img, &jpeg.Options{Quality: 92}))
	return output.Bytes()
}
