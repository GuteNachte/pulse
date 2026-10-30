package hub

import (
	"crypto/sha256"
	"fmt"
	"net/http"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type assetMediaEditResult struct {
	Media     *core.Record
	Version   *core.Record
	ObjectKey string
}

func assetMediaEditedObjectKey(assetID, mediaID, versionID string) string {
	return path.Join("originals", assetID, mediaID, versionID+".jpg")
}

func newAssetMediaEditedRecords(
	mediaCollection *core.Collection,
	versionCollection *core.Collection,
	asset *core.Record,
	userID string,
	sourceMediaID string,
	sourceVersionID string,
	placement assetMediaPlacement,
	ratio string,
	adjustments assetMediaAdjustments,
	rendered []byte,
	number int,
) assetMediaEditResult {
	media := core.NewRecord(mediaCollection)
	media.Id = core.GenerateDefaultRandomId()
	version := core.NewRecord(versionCollection)
	version.Id = core.GenerateDefaultRandomId()
	objectKey := assetMediaEditedObjectKey(asset.Id, media.Id, version.Id)
	digest := fmt.Sprintf("%x", sha256.Sum256(rendered))

	media.Set("user", userID)
	media.Set("asset", asset.Id)
	media.Set("source_kind", "edit")
	media.Set("source_title", assetMediaLibraryName(asset, number))
	media.Set("content_hash", digest)
	media.Set("state", "library")
	media.Set("active_version", version.Id)

	version.Set("user", userID)
	version.Set("asset", asset.Id)
	version.Set("media", media.Id)
	version.Set("kind", "original")
	version.Set("object_key", objectKey)
	version.Set("mime_type", "image/jpeg")
	version.Set("bytes", len(rendered))
	version.Set("width", assetMediaOutputWidth(ratio))
	version.Set("height", assetMediaOutputHeight(ratio))
	version.Set("recipe", map[string]any{
		"source_media":   sourceMediaID,
		"source_version": sourceVersionID,
		"placement":      placement,
		"ratio":          ratio,
		"brightness":     adjustments.Brightness,
		"contrast":       adjustments.Contrast,
	})

	return assetMediaEditResult{Media: media, Version: version, ObjectKey: objectKey}
}

func (h *Hub) createEditedAssetMedia(
	asset *core.Record,
	sourceMedia *core.Record,
	sourceVersion *core.Record,
	placement assetMediaPlacement,
	ratio string,
	adjustments assetMediaAdjustments,
	rendered []byte,
) (assetMediaEditResult, error) {
	mediaCollection, err := h.FindCachedCollectionByNameOrId("asset_media")
	if err != nil {
		return assetMediaEditResult{}, err
	}
	versionCollection, err := h.FindCachedCollectionByNameOrId("asset_media_versions")
	if err != nil {
		return assetMediaEditResult{}, err
	}
	existing, err := h.FindRecordsByFilter(
		"asset_media",
		"asset = {:asset} && user = {:user}",
		"id",
		500,
		0,
		map[string]any{"asset": asset.Id, "user": sourceMedia.GetString("user")},
	)
	if err != nil {
		return assetMediaEditResult{}, err
	}
	result := newAssetMediaEditedRecords(
		mediaCollection,
		versionCollection,
		asset,
		sourceMedia.GetString("user"),
		sourceMedia.Id,
		sourceVersion.Id,
		placement,
		ratio,
		adjustments,
		rendered,
		nextAssetMediaLibraryNumber(asset, existing),
	)
	store := newAssetMediaStore(h.assetMediaStoreRoot())
	if _, err := store.write(result.ObjectKey, rendered); err != nil {
		return assetMediaEditResult{}, err
	}

	result.Media.Set("active_version", "")
	if err := h.Save(result.Media); err != nil {
		_ = store.remove(result.ObjectKey)
		return assetMediaEditResult{}, err
	}
	if err := h.Save(result.Version); err != nil {
		_ = h.Delete(result.Media)
		_ = store.remove(result.ObjectKey)
		return assetMediaEditResult{}, err
	}
	result.Media.Set("active_version", result.Version.Id)
	if err := h.Save(result.Media); err != nil {
		_ = h.Delete(result.Version)
		_ = h.Delete(result.Media)
		_ = store.remove(result.ObjectKey)
		return assetMediaEditResult{}, err
	}
	return result, nil
}

// 2026-10-10 图片编辑专项：一键还原原图——把编辑图的展示位（封面/图库）原样转移回源图，
// 编辑图移出图片库；源图文件从未改动，转移后详情页展示与编辑前一致。
func (h *Hub) restoreAssetMediaOriginal(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	media, err := h.FindFirstRecordByFilter("asset_media", "id = {:id} && asset = {:asset} && user = {:user}", map[string]any{"id": e.Request.PathValue("mediaId"), "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Media not found.", err)
	}
	version, err := h.FindFirstRecordByFilter("asset_media_versions", "id = {:id} && media = {:media}", map[string]any{"id": media.GetString("active_version"), "media": media.Id})
	if err != nil {
		return e.BadRequestError("编辑版本缺失，无法还原。", nil)
	}
	var recipe struct {
		SourceMedia   string `json:"source_media"`
		SourceVersion string `json:"source_version"`
	}
	if err := version.UnmarshalJSONField("recipe", &recipe); err != nil || strings.TrimSpace(recipe.SourceMedia) == "" {
		return e.BadRequestError("该图片不是编辑生成的版本，没有可还原的原图。", nil)
	}
	sourceMedia, err := h.FindFirstRecordByFilter("asset_media", "id = {:id} && asset = {:asset} && user = {:user} && state = 'library'", map[string]any{"id": recipe.SourceMedia, "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.BadRequestError("原图已不在图片库，无法还原。", nil)
	}
	sourceVersion, err := h.FindFirstRecordByFilter("asset_media_versions", "id = {:id} && media = {:media}", map[string]any{"id": recipe.SourceVersion, "media": sourceMedia.Id})
	if err != nil {
		return e.BadRequestError("原图版本缺失，无法还原。", nil)
	}
	placements, _ := h.FindRecordsByFilter("asset_media_placements", "asset = {:asset} && media = {:media}", "sort_order", 100, 0, map[string]any{"asset": asset.Id, "media": media.Id})
	// 先清掉源图已有摆放位，避免转移后出现重复封面/画廊位
	sourcePlacements, _ := h.FindRecordsByFilter("asset_media_placements", "asset = {:asset} && media = {:media}", "", 100, 0, map[string]any{"asset": asset.Id, "media": sourceMedia.Id})
	for _, placement := range sourcePlacements {
		if err := h.Delete(placement); err != nil {
			return e.InternalServerError("Failed to clear source placements.", err)
		}
	}
	for _, placement := range placements {
		placement.Set("media", sourceMedia.Id)
		placement.Set("version", sourceVersion.Id)
		if err := h.Save(placement); err != nil {
			return e.InternalServerError("Failed to move placement to original media.", err)
		}
	}
	media.Set("state", "deleted")
	if err := h.Save(media); err != nil {
		return e.InternalServerError("Unable to remove edited media.", err)
	}
	return e.JSON(http.StatusOK, map[string]any{"media": sourceMedia, "restored": true})
}
