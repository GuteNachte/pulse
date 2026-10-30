package hub

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/pocketbase/pocketbase/core"
)

// 2026-10-05 图片专项：媒体导入串行化——并行的多张导入会同时取名导致图库编号撞号
var assetMediaImportMu sync.Mutex

type assetMediaPlacementRequest struct {
	Version   string `json:"version"`
	Role      string `json:"role"`
	Visible   *bool  `json:"visible"`
	SortOrder int    `json:"sort_order"`
}
type assetMediaVersionRequest struct {
	ParentVersion string               `json:"parent_version"`
	Crop          assetMediaCrop       `json:"crop"`
	Placement     *assetMediaPlacement `json:"placement"`
	Ratio         string               `json:"ratio"`
	// 2026-10-10 图片编辑专项：亮度/对比度（-100~100，0 = 不调节）
	Brightness int `json:"brightness"`
	Contrast   int `json:"contrast"`
}

func (h *Hub) listAssetMedia(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	media, err := h.FindRecordsByFilter("asset_media", assetMediaLibraryFilter(), "id", 500, 0, map[string]any{"asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.InternalServerError("Failed to load asset media.", err)
	}
	versions, _ := h.FindRecordsByFilter("asset_media_versions", "asset = {:asset} && user = {:user}", "", 1000, 0, map[string]any{"asset": asset.Id, "user": e.Auth.Id})
	if err := h.repairLegacyAssetMediaVersions(versions); err != nil {
		h.Logger().Warn("Failed to repair legacy asset media versions", "asset", asset.Id, "err", err)
	}
	placements, _ := h.FindRecordsByFilter("asset_media_placements", "asset = {:asset} && user = {:user}", "sort_order", 1000, 0, map[string]any{"asset": asset.Id, "user": e.Auth.Id})
	return e.JSON(http.StatusOK, map[string]any{"media": media, "versions": versions, "placements": placements})
}

func (h *Hub) adoptAssetMedia(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	media, err := h.FindFirstRecordByFilter("asset_media", "id = {:id} && asset = {:asset} && user = {:user}", map[string]any{"id": strings.TrimSpace(e.Request.PathValue("mediaId")), "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Media not found.", err)
	}
	media.Set("state", "library")
	if err := h.Save(media); err != nil {
		return e.InternalServerError("Failed to add media to library.", err)
	}
	return e.JSON(http.StatusOK, media)
}

func (h *Hub) upsertAssetMediaPlacement(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	media, err := h.FindFirstRecordByFilter("asset_media", "id = {:id} && asset = {:asset} && user = {:user}", map[string]any{"id": e.Request.PathValue("mediaId"), "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Media not found.", err)
	}
	var req assetMediaPlacementRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid placement.", err)
	}
	if req.Role != "cover" && req.Role != "gallery" {
		return e.BadRequestError("Invalid placement role.", nil)
	}
	version, err := h.FindFirstRecordByFilter("asset_media_versions", "id = {:id} && media = {:media} && asset = {:asset}", map[string]any{"id": req.Version, "media": media.Id, "asset": asset.Id})
	if err != nil {
		return e.BadRequestError("Version not found.", err)
	}
	visible := req.Visible == nil || *req.Visible
	// 2026-10-09 图片专项：写入前整理关联摆放位——设为封面时旧封面降级进图库、
	// 该图自身图库位移出；取消封面/加入图库时保证图片保留在底部图库（不会重复也不会消失）。
	if err := h.reconcileAssetMediaPlacementVisibility(asset, media, version, req.Role, visible); err != nil {
		return e.InternalServerError("Failed to reconcile media placement.", err)
	}
	existing, err := h.FindRecordsByFilter("asset_media_placements", "asset = {:asset} && media = {:media} && version = {:version} && role = {:role}", "id", 100, 0, map[string]any{"asset": asset.Id, "media": media.Id, "version": version.Id, "role": req.Role})
	if err != nil {
		return e.InternalServerError("Failed to load media placement.", err)
	}
	if len(existing) > 0 {
		setAssetMediaPlacementsVisible(existing, visible, req.SortOrder)
		for _, placement := range existing {
			if err := h.Save(placement); err != nil {
				return e.InternalServerError("Failed to update placement.", err)
			}
		}
		return e.JSON(http.StatusOK, existing[0])
	}
	if !visible {
		return e.JSON(http.StatusOK, map[string]any{"visible": false})
	}
	collection, err := h.FindCachedCollectionByNameOrId("asset_media_placements")
	if err != nil {
		return e.InternalServerError("Media placement unavailable.", err)
	}
	placement := core.NewRecord(collection)
	placement.Set("user", e.Auth.Id)
	placement.Set("asset", asset.Id)
	placement.Set("media", media.Id)
	placement.Set("version", version.Id)
	placement.Set("role", req.Role)
	placement.Set("sort_order", req.SortOrder)
	placement.Set("visible", visible)
	if err := h.Save(placement); err != nil {
		return e.InternalServerError("Failed to save placement.", err)
	}
	return e.JSON(http.StatusOK, placement)
}

func (h *Hub) archiveAssetMedia(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	media, err := h.FindFirstRecordByFilter("asset_media", "id = {:id} && asset = {:asset} && user = {:user}", map[string]any{"id": e.Request.PathValue("mediaId"), "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Media not found.", err)
	}
	placements, _ := h.FindRecordsByFilter("asset_media_placements", "asset = {:asset} && media = {:media} && visible = true", "", 1, 0, map[string]any{"asset": asset.Id, "media": media.Id})
	if len(placements) > 0 {
		return e.BadRequestError("当前图片正在展示，请先移出封面和图库。", nil)
	}
	media.Set("state", "archived")
	if err := h.Save(media); err != nil {
		return e.InternalServerError("Unable to archive media.", err)
	}
	return e.JSON(http.StatusOK, media)
}

func (h *Hub) deleteAssetMedia(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	media, err := h.FindFirstRecordByFilter("asset_media", "id = {:id} && asset = {:asset} && user = {:user}", map[string]any{"id": e.Request.PathValue("mediaId"), "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Media not found.", err)
	}
	placements, _ := h.FindRecordsByFilter("asset_media_placements", "asset = {:asset} && media = {:media}", "", 100, 0, map[string]any{"asset": asset.Id, "media": media.Id})
	for _, placement := range placements {
		_ = h.Delete(placement)
	}
	media.Set("state", "deleted")
	if err := h.Save(media); err != nil {
		return e.InternalServerError("Unable to delete media.", err)
	}
	return e.JSON(http.StatusOK, media)
}

func (h *Hub) createAssetMediaVersion(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	media, err := h.FindFirstRecordByFilter("asset_media", "id = {:id} && asset = {:asset} && user = {:user}", map[string]any{"id": e.Request.PathValue("mediaId"), "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Media not found.", err)
	}
	var req assetMediaVersionRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid media recipe.", err)
	}
	// 2026-10-04 图片专项：输出比例扩展 4:3 与 1:1（与前端裁剪预设一致）
	if req.Ratio != "16:9" && req.Ratio != "4:3" && req.Ratio != "1:1" {
		return e.BadRequestError("Only 16:9, 4:3 and 1:1 media output is supported.", nil)
	}
	if req.Placement == nil {
		return e.BadRequestError("Image placement is required.", nil)
	}
	parentID := strings.TrimSpace(req.ParentVersion)
	if parentID == "" {
		parentID = media.GetString("active_version")
	}
	if parentID == "" {
		return e.BadRequestError("Original version is required.", nil)
	}
	parent, err := h.FindFirstRecordByFilter("asset_media_versions", "id = {:id} && media = {:media}", map[string]any{"id": parentID, "media": media.Id})
	if err != nil {
		return e.BadRequestError("Source version not found.", err)
	}
	store := newAssetMediaStore(h.assetMediaStoreRoot())
	sourcePath, err := store.pathFor(parent.GetString("object_key"))
	if err != nil {
		return e.InternalServerError("Invalid source object.", err)
	}
	source, err := os.ReadFile(sourcePath)
	if err != nil {
		return e.BadRequestError("Source object is unavailable.", err)
	}
	// 2026-10-10 图片编辑专项：调节参数随 recipe 持久化（修复重渲染可复现）
	adjustments := assetMediaAdjustments{
		Brightness: clampAssetMediaAdjustment(req.Brightness),
		Contrast:   clampAssetMediaAdjustment(req.Contrast),
	}
	rendered, err := renderAssetMediaVersion(source, assetMediaRecipe{
		Placement: req.Placement, OutputWidth: assetMediaOutputWidth(req.Ratio), OutputHeight: assetMediaOutputHeight(req.Ratio),
		Adjustments: adjustments,
	})
	if err != nil {
		return e.BadRequestError("Unable to render image.", err)
	}
	edited, err := h.createEditedAssetMedia(asset, media, parent, *req.Placement, req.Ratio, adjustments, rendered)
	if err != nil {
		return e.InternalServerError("Unable to save edited image.", err)
	}
	return e.JSON(http.StatusCreated, map[string]any{"media": edited.Media, "version": edited.Version})
}

// 2026-10-04 图片专项：裁剪输出比例扩展 4:3 与 1:1（与前端裁剪预设一致）；未知比例返回 0 交由上层报错
func assetMediaOutputSize(ratio string) (width int, height int) {
	switch ratio {
	case "4:3":
		return 1200, 900
	case "1:1":
		return 1000, 1000
	case "16:9":
		return 1600, 900
	default:
		return 0, 0
	}
}

func assetMediaOutputWidth(ratio string) int {
	width, _ := assetMediaOutputSize(ratio)
	return width
}

func assetMediaOutputHeight(ratio string) int {
	_, height := assetMediaOutputSize(ratio)
	return height
}

func (h *Hub) uploadAssetMedia(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	if err := e.Request.ParseMultipartForm(8 << 20); err != nil {
		return e.BadRequestError("Invalid image upload.", err)
	}
	file, _, err := e.Request.FormFile("file")
	if err != nil {
		return e.BadRequestError("Image file is required.", err)
	}
	defer file.Close()
	source, err := io.ReadAll(io.LimitReader(file, 8<<20))
	if err != nil || len(source) == 0 {
		return e.BadRequestError("Invalid image file.", err)
	}
	mimeType := detectAssetMediaMimeType(source)
	if mimeType == "" {
		return e.BadRequestError("Unsupported image file.", nil)
	}
	digest := fmt.Sprintf("%x", sha256.Sum256(source))
	if existing, _ := h.FindFirstRecordByFilter(
		"asset_media",
		"asset = {:asset} && user = {:user} && content_hash = {:hash}",
		map[string]any{"asset": asset.Id, "user": e.Auth.Id, "hash": digest},
	); existing != nil {
		result, err := h.resolveExistingImportedAssetMedia(asset, existing, e.Auth.Id)
		if err != nil {
			return e.InternalServerError("Unable to restore existing media.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"media": result.Media, "version": result.Version})
	}
	collection, err := h.FindCachedCollectionByNameOrId("asset_media")
	if err != nil {
		return e.InternalServerError("Media library unavailable.", err)
	}
	media := core.NewRecord(collection)
	media.Set("user", e.Auth.Id)
	media.Set("asset", asset.Id)
	media.Set("source_kind", "upload")
	media.Set("source_title", h.nextAssetMediaLibraryName(asset, e.Auth.Id))
	media.Set("content_hash", digest)
	media.Set("state", "library")
	// 2026-10-07 计算设备⑥：上传时可选相册分组（配件图自动归组）
	media.Set("album", normalizeAssetMediaAlbum(e.Request.FormValue("album")))
	if err := h.Save(media); err != nil {
		return e.InternalServerError("Unable to save media.", err)
	}
	store := newAssetMediaStore(h.assetMediaStoreRoot())
	key := "originals/" + asset.Id + "/" + media.Id + "/original"
	if _, err := store.write(key, source); err != nil {
		return e.InternalServerError("Unable to store image.", err)
	}
	versions, _ := h.FindCachedCollectionByNameOrId("asset_media_versions")
	version := core.NewRecord(versions)
	version.Set("user", e.Auth.Id)
	version.Set("asset", asset.Id)
	version.Set("media", media.Id)
	version.Set("kind", "original")
	version.Set("object_key", key)
	version.Set("mime_type", mimeType)
	version.Set("bytes", len(source))
	if err := h.Save(version); err != nil {
		return e.InternalServerError("Unable to save original version.", err)
	}
	media.Set("active_version", version.Id)
	_ = h.Save(media)
	return e.JSON(http.StatusCreated, map[string]any{"media": media, "version": version})
}

func (h *Hub) importAssetVisualCandidate(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	var req struct {
		VisualID   string `json:"visual_id"`
		FrameIndex int    `json:"frame_index"`
	}
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid visual candidate.", err)
	}
	visual, err := h.FindFirstRecordByFilter("asset_visuals", "id = {:id} && asset = {:asset} && user = {:user}", map[string]any{"id": req.VisualID, "asset": asset.Id, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Visual candidate not found.", err)
	}
	var frames []map[string]any
	_ = visual.UnmarshalJSONField("frames", &frames)
	if req.FrameIndex < 0 || req.FrameIndex >= len(frames) {
		return e.BadRequestError("Visual frame not found.", nil)
	}
	frame := frames[req.FrameIndex]
	sourceURL := stringFromAny(frame["source_image_url"])
	if sourceURL == "" {
		return e.BadRequestError("Visual source is unavailable.", nil)
	}
	return h.importAssetMediaFromSource(e, asset, sourceURL, stringFromAny(frame["source_provider"]), nil)
}

// 2026-10-04 创建流程图墙：按 URL 直接入库（下载 → 内容哈希去重 → asset_media library）。
// 2026-10-09 图片专项：支持裁剪后入库（编辑入库）——先按编辑器的归一化裁剪参数渲染，
// 再把裁剪结果作为原图存储，避免先入原图再编辑产生多余的图库记录。
type assetMediaImportURLRequest struct {
	URL           string               `json:"url"`
	Provider      string               `json:"provider"`
	Album         string               `json:"album"`
	CropPlacement *assetMediaPlacement `json:"crop_placement"`
	CropRatio     string               `json:"crop_ratio"`
	// 2026-10-10 图片编辑专项：编辑入库的亮度/对比度
	CropBrightness int `json:"crop_brightness"`
	CropContrast   int `json:"crop_contrast"`
}

func (h *Hub) importAssetMediaURL(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	var req assetMediaImportURLRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}
	sourceURL := strings.TrimSpace(req.URL)
	if sourceURL == "" {
		return e.BadRequestError("Missing image url.", nil)
	}
	var crop *assetMediaImportCrop
	if req.CropPlacement != nil {
		ratio := strings.TrimSpace(req.CropRatio)
		if assetMediaOutputWidth(ratio) <= 0 {
			return e.BadRequestError("Unsupported crop ratio.", nil)
		}
		crop = &assetMediaImportCrop{
			Placement:   *req.CropPlacement,
			Ratio:       ratio,
			Adjustments: assetMediaAdjustments{Brightness: clampAssetMediaAdjustment(req.CropBrightness), Contrast: clampAssetMediaAdjustment(req.CropContrast)},
		}
	}
	e.Set("assetMediaAlbum", normalizeAssetMediaAlbum(req.Album))
	return h.importAssetMediaFromSource(e, asset, sourceURL, strings.TrimSpace(req.Provider), crop)
}

// assetMediaImportCrop 导入前的裁剪参数（归一化摆放位 + 输出比例 + 亮度/对比度调节）。
type assetMediaImportCrop struct {
	Placement   assetMediaPlacement
	Ratio       string
	Adjustments assetMediaAdjustments
}

func (h *Hub) importAssetMediaFromSource(e *core.RequestEvent, asset *core.Record, sourceURL string, provider string, crop *assetMediaImportCrop) error {
	source, err := h.fetchAssetVisualImage(sourceURL, assetVisualMaxDownloadBytes)
	if err != nil {
		return e.BadRequestError("Unable to read visual source.", err)
	}
	mimeType := detectAssetMediaMimeType(source)
	if mimeType == "" {
		return e.BadRequestError("Visual source is not a supported image.", nil)
	}
	// 2026-10-09 图片专项：编辑入库——先渲染裁剪结果再存为原图（内容哈希也按裁剪结果计算）
	if crop != nil {
		rendered, renderErr := renderAssetMediaVersion(source, assetMediaRecipe{
			Placement:    &crop.Placement,
			OutputWidth:  assetMediaOutputWidth(crop.Ratio),
			OutputHeight: assetMediaOutputHeight(crop.Ratio),
			Adjustments:  crop.Adjustments,
		})
		if renderErr != nil {
			return e.BadRequestError("Unable to render cropped image.", renderErr)
		}
		source = rendered
		mimeType = "image/jpeg"
	}
	digest := fmt.Sprintf("%x", sha256.Sum256(source))
	// 取名到保存全程持锁：并行导入时避免两个请求取到同一个图库编号
	assetMediaImportMu.Lock()
	defer assetMediaImportMu.Unlock()
	if existing, _ := h.FindFirstRecordByFilter(
		"asset_media",
		"asset = {:asset} && user = {:user} && content_hash = {:hash}",
		map[string]any{"asset": asset.Id, "user": e.Auth.Id, "hash": digest},
	); existing != nil {
		result, err := h.resolveExistingImportedAssetMedia(asset, existing, e.Auth.Id)
		if err != nil {
			return e.InternalServerError("Unable to restore existing candidate.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"media": result.Media, "version": result.Version})
	}
	collection, err := h.FindCachedCollectionByNameOrId("asset_media")
	if err != nil {
		return e.InternalServerError("Media library unavailable.", err)
	}
	media := core.NewRecord(collection)
	media.Set("user", e.Auth.Id)
	media.Set("asset", asset.Id)
	media.Set("source_kind", "legacy_visual")
	media.Set("source_url", sourceURL)
	media.Set("source_title", h.nextAssetMediaLibraryName(asset, e.Auth.Id))
	media.Set("source_provider", provider)
	media.Set("content_hash", digest)
	media.Set("state", "library")
	// 2026-10-07 计算设备⑥：URL 导入带相册分组（收集图片入库归组）
	media.Set("album", stringFromAny(e.Get("assetMediaAlbum")))
	if err := h.Save(media); err != nil {
		return e.InternalServerError("Unable to save candidate.", err)
	}
	store := newAssetMediaStore(h.assetMediaStoreRoot())
	key := "originals/" + asset.Id + "/" + media.Id + "/original"
	if _, err := store.write(key, source); err != nil {
		return e.InternalServerError("Unable to store candidate.", err)
	}
	versions, _ := h.FindCachedCollectionByNameOrId("asset_media_versions")
	version := core.NewRecord(versions)
	version.Set("user", e.Auth.Id)
	version.Set("asset", asset.Id)
	version.Set("media", media.Id)
	version.Set("kind", "original")
	version.Set("object_key", key)
	version.Set("mime_type", mimeType)
	version.Set("bytes", len(source))
	if err := h.Save(version); err != nil {
		return e.InternalServerError("Unable to save candidate version.", err)
	}
	media.Set("active_version", version.Id)
	_ = h.Save(media)
	// 2026-10-04 入库即展示：首张自动设封面，其余进画廊，创建完成后详情页立刻可见
	h.autoPlaceAssetMedia(e.Auth.Id, asset, media, version)
	return e.JSON(http.StatusCreated, map[string]any{"media": media, "version": version})
}

func (h *Hub) autoPlaceAssetMedia(userID string, asset *core.Record, media *core.Record, version *core.Record) {
	existingCovers, err := h.FindRecordsByFilter(
		"asset_media_placements",
		"asset = {:asset} && user = {:user} && role = 'cover' && visible = true",
		"id", 1, 0,
		map[string]any{"asset": asset.Id, "user": userID},
	)
	if err != nil {
		return
	}
	role := "gallery"
	if len(existingCovers) == 0 {
		role = "cover"
	}
	collection, err := h.FindCachedCollectionByNameOrId("asset_media_placements")
	if err != nil {
		return
	}
	placement := core.NewRecord(collection)
	placement.Set("user", userID)
	placement.Set("asset", asset.Id)
	placement.Set("media", media.Id)
	placement.Set("version", version.Id)
	placement.Set("role", role)
	placement.Set("sort_order", 0)
	placement.Set("visible", true)
	_ = h.Save(placement)
}

func (h *Hub) getAssetMediaStoreSettings(e *core.RequestEvent) error {
	root := h.assetMediaStoreRoot()
	info, err := os.Stat(root)
	return e.JSON(http.StatusOK, map[string]any{"root": root, "configured": root != filepath.Join(h.DataDir(), "asset_media"), "writable": err == nil && info.IsDir()})
}

func assetMediaLibraryName(asset *core.Record, number int) string {
	if number < 1 {
		number = 1
	}
	return fmt.Sprintf("%s-%02d", strings.TrimSpace(firstNonEmpty(asset.GetString("name"), "资产")), number)
}

func nextAssetMediaLibraryNumber(asset *core.Record, media []*core.Record) int {
	prefix := strings.TrimSpace(firstNonEmpty(asset.GetString("name"), "资产")) + "-"
	used := make(map[int]struct{}, len(media))
	for _, item := range media {
		if item == nil || item.GetString("state") == "deleted" {
			continue
		}
		suffix, ok := strings.CutPrefix(strings.TrimSpace(item.GetString("source_title")), prefix)
		if !ok {
			continue
		}
		number, err := strconv.Atoi(suffix)
		if err == nil && number > 0 {
			used[number] = struct{}{}
		}
	}
	for number := 1; ; number++ {
		if _, exists := used[number]; !exists {
			return number
		}
	}
}

func (h *Hub) nextAssetMediaLibraryName(asset *core.Record, userID string) string {
	media, err := h.FindRecordsByFilter("asset_media", "asset = {:asset} && user = {:user}", "id", 500, 0, map[string]any{"asset": asset.Id, "user": userID})
	if err != nil {
		return assetMediaLibraryName(asset, 1)
	}
	return assetMediaLibraryName(asset, nextAssetMediaLibraryNumber(asset, media))
}

func (h *Hub) assetMediaStoreRoot() string {
	root := filepath.Join(h.DataDir(), "asset_media")
	if record, err := h.FindFirstRecordByFilter("system_settings", "key = 'asset_media_store'", nil); err == nil {
		if settings, ok := record.Get("settings").(map[string]any); ok {
			if value, _ := settings["root"].(string); strings.TrimSpace(value) != "" {
				root = value
			}
		}
	}
	return root
}

func (h *Hub) updateAssetMediaStoreSettings(e *core.RequestEvent) error {
	var body struct {
		Root string `json:"root"`
	}
	if err := json.NewDecoder(e.Request.Body).Decode(&body); err != nil {
		return e.BadRequestError("Invalid media storage settings.", err)
	}
	root := strings.TrimSpace(body.Root)
	if root == "" {
		root = filepath.Join(h.DataDir(), "asset_media")
	}
	if !filepath.IsAbs(root) {
		return e.BadRequestError("Media storage directory must be absolute.", nil)
	}
	if err := os.MkdirAll(root, 0o755); err != nil {
		return e.BadRequestError("Media storage directory is not writable.", err)
	}
	collection, err := h.FindCachedCollectionByNameOrId("system_settings")
	if err != nil {
		return e.InternalServerError("System settings unavailable.", err)
	}
	record, err := h.FindFirstRecordByFilter("system_settings", "key = 'asset_media_store'", nil)
	if err != nil {
		record = core.NewRecord(collection)
		record.Set("key", "asset_media_store")
	}
	record.Set("settings", map[string]any{"root": root})
	if err := h.Save(record); err != nil {
		return e.InternalServerError("Failed to save media storage settings.", err)
	}
	return e.JSON(http.StatusOK, map[string]any{"root": root, "configured": true, "writable": true})
}

func (h *Hub) readAssetMediaObject(e *core.RequestEvent) error {
	versionID := strings.TrimSpace(e.Request.URL.Query().Get("version"))
	if versionID == "" {
		return e.BadRequestError("Media version is required.", nil)
	}
	version, err := h.FindFirstRecordByFilter("asset_media_versions", "id = {:id} && user = {:user}", map[string]any{"id": versionID, "user": e.Auth.Id})
	if err != nil {
		return e.NotFoundError("Media version not found.", err)
	}
	path, err := newAssetMediaStore(h.assetMediaStoreRoot()).pathFor(version.GetString("object_key"))
	if err != nil {
		return e.NotFoundError("Media object not found.", err)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return e.NotFoundError("Media object not found.", err)
	}
	mimeType := firstNonEmpty(detectAssetMediaMimeType(content), version.GetString("mime_type"), "image/jpeg")
	e.Response.Header().Set("Content-Type", mimeType)
	e.Response.Header().Set("Cache-Control", "private, max-age=3600")
	return e.Blob(http.StatusOK, mimeType, content)
}
