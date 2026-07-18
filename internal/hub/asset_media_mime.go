package hub

import (
	"net/http"
	"strings"
)

func detectAssetMediaMimeType(content []byte) string {
	detected := strings.ToLower(strings.TrimSpace(http.DetectContentType(content)))
	switch detected {
	case "image/jpeg", "image/png", "image/webp", "image/gif":
		return detected
	default:
		return ""
	}
}
