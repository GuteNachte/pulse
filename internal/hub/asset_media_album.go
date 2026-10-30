package hub

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// 2026-10-07 计算设备⑥（docs/pc-asset-design.md 五）：图库相册分组——
// asset_media.album 合法值与归组规则在这里收口；上传/URL 导入透传 album，
// 已入库图片通过 /album 端点改相册；空值 = 未分组（旧数据不动）。

var assetMediaAlbumValues = map[string]bool{
	"whole":       true,
	"cpu":         true,
	"motherboard": true,
	"memory":      true,
	"storage":     true,
	"gpu":         true,
	"psu":         true,
	"case":        true,
	"cooler":      true,
	"nic":         true,
	"other":       true,
}

// normalizeAssetMediaAlbum 校验并归一化相册值；非法值返回空（未分组）
func normalizeAssetMediaAlbum(value string) string {
	album := strings.TrimSpace(value)
	if album == "" {
		return ""
	}
	if assetMediaAlbumValues[album] {
		return album
	}
	return ""
}

// setAssetMediaAlbum POST /assets/{id}/media/{mediaId}/album —— 修改已入库图片的相册分组
func (h *Hub) setAssetMediaAlbum(e *core.RequestEvent) error {
	asset, err := h.findUserAssetRecord(strings.TrimSpace(e.Request.PathValue("id")), e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	var req struct {
		Album string `json:"album"`
	}
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}
	media, err := h.FindFirstRecordByFilter(
		"asset_media",
		"id = {:id} && asset = {:asset} && user = {:user}",
		map[string]any{"id": strings.TrimSpace(e.Request.PathValue("mediaId")), "asset": asset.Id, "user": e.Auth.Id},
	)
	if err != nil {
		return e.NotFoundError("Media not found.", err)
	}
	media.Set("album", normalizeAssetMediaAlbum(req.Album))
	if err := h.Save(media); err != nil {
		return e.InternalServerError("Unable to update album.", err)
	}
	return e.JSON(http.StatusOK, map[string]any{"media": media})
}
