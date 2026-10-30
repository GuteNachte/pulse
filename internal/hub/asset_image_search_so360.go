package hub

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// 2026-10-09 图片专项：360 图片搜索（image.so.com JSON 接口）——
// 返回稳定 JSON（list[].img/title/link），国内访问快，作为必应之外的第二个图源。
// 搜狗图片反爬严重（数据全在 JS 内），不采用。

type assetSo360ImageResult struct {
	Items     []map[string]any
	LastError string
}

// 2026-10-09 图片专项：翻页支持——page 从 0 起，sn = page*12。
func (h *Hub) fetchSo360ImageCandidatesPage(query string, page int) []map[string]any {
	result := assetSo360ImageResult{}
	searchURL := "https://image.so.com/j?q=" + url.QueryEscape(query) + "&src=srp&pn=0&sn=" + fmt.Sprintf("%d", page*12)
	req, err := http.NewRequest(http.MethodGet, searchURL, nil)
	if err != nil {
		result.LastError = err.Error()
		return nil
	}
	req.Header.Set("User-Agent", bingImageSearchUserAgent)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Referer", "https://image.so.com/")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		result.LastError = err.Error()
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		result.LastError = fmt.Sprintf("360 图片接口返回 %d", resp.StatusCode)
		return nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil {
		result.LastError = err.Error()
		return nil
	}
	var payload struct {
		List []struct {
			Image string `json:"img"`
			Title string `json:"title"`
			Link  string `json:"link"`
		} `json:"list"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		result.LastError = "360 图片接口返回的不是预期 JSON"
		return nil
	}
	result.Items = make([]map[string]any, 0, len(payload.List))
	for _, item := range payload.List {
		imageURL := strings.TrimSpace(item.Image)
		if imageURL == "" || !isLikelyAssetVisualImageURL(imageURL) {
			continue
		}
		result.Items = append(result.Items, map[string]any{
			"title":        firstNonEmpty(cleanOnlineText(item.Title), "360 图片候选"),
			"source_title": firstNonEmpty(cleanOnlineText(item.Title), "360 图片候选"),
			"url":          strings.TrimSpace(item.Link),
			"source_url":   strings.TrimSpace(item.Link),
			"image_url":    imageURL,
			"provider":     "so360_images",
			"type":         "so360_image",
			"search_query": strings.TrimSpace(query),
			"confidence":   60,
		})
	}
	return result.Items
}
