package migrations

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		records, err := app.FindRecordsByFilter("assets", "type = 'internet'", "", -1, 0)
		if err != nil {
			return err
		}
		for _, record := range records {
			changed := false
			provider := normalizeInternetProviderAlias(record.GetString("vendor"))
			if provider != strings.TrimSpace(record.GetString("vendor")) {
				record.Set("vendor", provider)
				changed = true
			}
			metadata := map[string]any{}
			_ = record.UnmarshalJSONField("metadata", &metadata)
			metadataChanged := false
			if record.Id == "hvpbl3jmc8w02qp" {
				if _, exists := metadata["access_technology"]; !exists {
					metadata["access_technology"] = "ftth"
					metadataChanged = true
				}
				if _, exists := metadata["auth_mode"]; !exists {
					metadata["auth_mode"] = "pppoe"
					metadataChanged = true
				}
			}
			if normalizeInternetMetadata(metadata) {
				metadataChanged = true
			}
			if metadataChanged {
				record.Set("metadata", metadata)
				changed = true
			}
			if changed {
				if err := app.Save(record); err != nil {
					return err
				}
			}
		}
		return nil
	}, nil)
}

func normalizeInternetProviderAlias(value string) string {
	switch strings.TrimSpace(value) {
	case "电信":
		return "中国电信"
	case "联通":
		return "中国联通"
	case "移动":
		return "中国移动"
	default:
		return strings.TrimSpace(value)
	}
}

func normalizeInternetMetadata(metadata map[string]any) bool {
	accessMode, _ := metadata["access_mode"].(string)
	normalized := strings.ToLower(strings.TrimSpace(accessMode))
	if normalized == "" {
		return false
	}
	changed := false
	if _, exists := metadata["access_technology"]; !exists {
		switch {
		case strings.Contains(normalized, "ftth"), strings.Contains(normalized, "家庭光纤"):
			metadata["access_technology"] = "ftth"
			changed = true
		case strings.Contains(normalized, "专线"):
			metadata["access_technology"] = "dedicated_line"
			changed = true
		case strings.Contains(normalized, "4g"), strings.Contains(normalized, "5g"), strings.Contains(normalized, "移动网络"):
			metadata["access_technology"] = "mobile"
			changed = true
		}
	}
	if _, exists := metadata["auth_mode"]; !exists {
		switch {
		case strings.Contains(normalized, "pppoe"), strings.Contains(normalized, "拨号"):
			metadata["auth_mode"] = "pppoe"
			changed = true
		case strings.Contains(normalized, "dhcp"), strings.Contains(normalized, "ipoe"), strings.Contains(normalized, "自动获取"):
			metadata["auth_mode"] = "dhcp"
			changed = true
		case strings.Contains(normalized, "静态"):
			metadata["auth_mode"] = "static"
			changed = true
		}
	}
	return changed
}
