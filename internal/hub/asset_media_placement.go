package hub

import "github.com/pocketbase/pocketbase/core"

func setAssetMediaPlacementsVisible(placements []*core.Record, visible bool, sortOrder int) int {
	updated := 0
	for _, placement := range placements {
		if placement == nil {
			continue
		}
		placement.Set("visible", visible)
		placement.Set("sort_order", sortOrder)
		updated++
	}
	return updated
}

// 2026-10-09 图片专项：摆放位互斥语义——同一张图（media）最多只有一个可见展示位，
// 不能既在大图（封面）又在下面一排（图库）。设为封面时旧封面自动降级进图库、
// 该图自己的图库位移出；取消封面/加入图库时保证图片回到底部图库而不是凭空消失。

// reconcileAssetMediaPlacementVisibility 在写入目标摆放位之前整理关联摆放位，
// 让"封面 ↔ 图库"的切换一次点击完成且不产生重复。
func (h *Hub) reconcileAssetMediaPlacementVisibility(asset *core.Record, media *core.Record, version *core.Record, role string, visible bool) error {
	userID := media.GetString("user")
	if userID == "" {
		userID = asset.GetString("user")
	}
	switch {
	case role == "cover" && visible:
		// 该图自身的可见图库位全部移出：设为封面后它只在大图区出现一次
		if err := h.hideAssetMediaVisiblePlacements(asset, media.Id, "role = 'gallery'"); err != nil {
			return err
		}
		// 其它可见封面自动降级进图库：旧封面回到下面一排
		covers, err := h.FindRecordsByFilter(
			"asset_media_placements",
			"asset = {:asset} && user = {:user} && role = 'cover' && visible = true",
			"sort_order,id", 200, 0,
			map[string]any{"asset": asset.Id, "user": userID},
		)
		if err != nil {
			return err
		}
		for _, placement := range covers {
			if placement.GetString("media") == media.Id {
				// 同一张图在旧版本上的封面位：直接隐藏，不生成图库位（避免一图两位）
				if placement.GetString("version") != version.Id {
					placement.Set("visible", false)
					if err := h.Save(placement); err != nil {
						return err
					}
				}
				continue
			}
			if err := h.demoteAssetMediaPlacementToGallery(asset, placement); err != nil {
				return err
			}
		}
		return nil
	case role == "cover" && !visible:
		// 取消封面：仅当该图确实在封面位时补图库位——图片回到底部一排而不是消失
		visibleCovers, err := h.FindRecordsByFilter(
			"asset_media_placements",
			"asset = {:asset} && media = {:media} && role = 'cover' && visible = true",
			"id", 10, 0,
			map[string]any{"asset": asset.Id, "media": media.Id},
		)
		if err != nil {
			return err
		}
		if len(visibleCovers) == 0 {
			return nil
		}
		return h.ensureAssetMediaGalleryPlacement(asset, userID, media.Id, version.Id)
	case role == "gallery" && visible:
		// 加入图库：同图的可见封面位移出（图片从大图区落到下面一排）
		return h.hideAssetMediaVisiblePlacements(asset, media.Id, "role = 'cover'")
	default:
		return nil
	}
}

// hideAssetMediaVisiblePlacements 隐藏指定媒体在给定角色上的全部可见摆放位。
func (h *Hub) hideAssetMediaVisiblePlacements(asset *core.Record, mediaID string, extraFilter string) error {
	placements, err := h.FindRecordsByFilter(
		"asset_media_placements",
		"asset = {:asset} && media = {:media} && visible = true && "+extraFilter,
		"id", 200, 0,
		map[string]any{"asset": asset.Id, "media": mediaID},
	)
	if err != nil {
		return err
	}
	for _, placement := range placements {
		placement.Set("visible", false)
		if err := h.Save(placement); err != nil {
			return err
		}
	}
	return nil
}

// demoteAssetMediaPlacementToGallery 把旧封面降级成可见图库位（复用已有图库记录，避免重复行）。
func (h *Hub) demoteAssetMediaPlacementToGallery(asset *core.Record, cover *core.Record) error {
	cover.Set("visible", false)
	if err := h.Save(cover); err != nil {
		return err
	}
	return h.ensureAssetMediaGalleryPlacement(asset, cover.GetString("user"), cover.GetString("media"), cover.GetString("version"))
}

// ensureAssetMediaGalleryPlacement 保证指定（媒体 + 版本）存在一个可见图库位；
// 已有图库记录（即使此前不可见）直接恢复，没有才新建。
func (h *Hub) ensureAssetMediaGalleryPlacement(asset *core.Record, userID string, mediaID string, versionID string) error {
	existing, err := h.FindRecordsByFilter(
		"asset_media_placements",
		"asset = {:asset} && media = {:media} && version = {:version} && role = 'gallery'",
		"id", 10, 0,
		map[string]any{"asset": asset.Id, "media": mediaID, "version": versionID},
	)
	if err != nil {
		return err
	}
	if len(existing) > 0 {
		sortOrder := h.nextAssetMediaGallerySortOrder(asset.Id, userID)
		for _, placement := range existing {
			placement.Set("visible", true)
			placement.Set("sort_order", sortOrder)
			if err := h.Save(placement); err != nil {
				return err
			}
		}
		return nil
	}
	collection, err := h.FindCachedCollectionByNameOrId("asset_media_placements")
	if err != nil {
		return err
	}
	placement := core.NewRecord(collection)
	placement.Set("user", userID)
	placement.Set("asset", asset.Id)
	placement.Set("media", mediaID)
	placement.Set("version", versionID)
	placement.Set("role", "gallery")
	placement.Set("sort_order", h.nextAssetMediaGallerySortOrder(asset.Id, userID))
	placement.Set("visible", true)
	return h.Save(placement)
}

// nextAssetMediaGallerySortOrder 追加到图库末尾：现有可见图库位的最大序号 + 1。
func (h *Hub) nextAssetMediaGallerySortOrder(assetID string, userID string) int {
	placements, err := h.FindRecordsByFilter(
		"asset_media_placements",
		"asset = {:asset} && user = {:user} && role = 'gallery' && visible = true",
		"-sort_order", 1, 0,
		map[string]any{"asset": assetID, "user": userID},
	)
	if err != nil || len(placements) == 0 {
		return 0
	}
	return placements[0].GetInt("sort_order") + 1
}
