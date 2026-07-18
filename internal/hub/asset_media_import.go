package hub

import (
	"fmt"
	"os"

	"github.com/pocketbase/pocketbase/core"
)

type assetMediaImportResult struct {
	Media   *core.Record
	Version *core.Record
	Created bool
}

func (h *Hub) resolveExistingImportedAssetMedia(
	asset *core.Record,
	media *core.Record,
	userID string,
) (assetMediaImportResult, error) {
	version, err := h.FindFirstRecordByFilter(
		"asset_media_versions",
		"id = {:id} && media = {:media} && asset = {:asset} && user = {:user}",
		map[string]any{
			"id": media.GetString("active_version"), "media": media.Id,
			"asset": asset.Id, "user": userID,
		},
	)
	if err != nil {
		return assetMediaImportResult{}, fmt.Errorf("图片版本不存在: %w", err)
	}

	objectPath, err := newAssetMediaStore(h.assetMediaStoreRoot()).pathFor(version.GetString("object_key"))
	if err != nil {
		return assetMediaImportResult{}, err
	}
	if _, err := os.Stat(objectPath); err != nil {
		return assetMediaImportResult{}, fmt.Errorf("图片对象不存在: %w", err)
	}

	if media.GetString("state") == "deleted" {
		placements, err := h.FindRecordsByFilter(
			"asset_media_placements",
			"asset = {:asset} && media = {:media}",
			"id",
			100,
			0,
			map[string]any{"asset": asset.Id, "media": media.Id},
		)
		if err != nil {
			return assetMediaImportResult{}, fmt.Errorf("读取图片展示关系失败: %w", err)
		}
		for _, placement := range placements {
			if err := h.Delete(placement); err != nil {
				return assetMediaImportResult{}, fmt.Errorf("清理图片展示关系失败: %w", err)
			}
		}
		media.Set("source_title", h.nextAssetMediaLibraryName(asset, userID))
		media.Set("state", "library")
		if err := h.Save(media); err != nil {
			return assetMediaImportResult{}, fmt.Errorf("恢复图片库记录失败: %w", err)
		}
	}

	return assetMediaImportResult{Media: media, Version: version}, nil
}
