package hub

import (
	"crypto/sha256"
	"fmt"
	"path"

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
	})

	return assetMediaEditResult{Media: media, Version: version, ObjectKey: objectKey}
}

func (h *Hub) createEditedAssetMedia(
	asset *core.Record,
	sourceMedia *core.Record,
	sourceVersion *core.Record,
	placement assetMediaPlacement,
	ratio string,
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
