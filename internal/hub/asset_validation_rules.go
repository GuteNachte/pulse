package hub

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func recordMetadataString(record *core.Record, key string) string {
	if record == nil || strings.TrimSpace(key) == "" {
		return ""
	}
	metadata := recordMetadataMap(record.Get("metadata"))
	if len(metadata) == 0 {
		_ = record.UnmarshalJSONField("metadata", &metadata)
	}
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func recordMetadataPositiveNumber(record *core.Record, key string) bool {
	if record == nil || strings.TrimSpace(key) == "" {
		return false
	}
	metadata := recordMetadataMap(record.Get("metadata"))
	if len(metadata) == 0 {
		_ = record.UnmarshalJSONField("metadata", &metadata)
	}
	value, ok := metadata[key]
	if !ok {
		return false
	}
	switch typed := value.(type) {
	case int:
		return typed > 0
	case int64:
		return typed > 0
	case float64:
		return typed > 0
	case json.Number:
		number, err := typed.Float64()
		return err == nil && number > 0
	case string:
		number, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return err == nil && number > 0
	default:
		return false
	}
}

func recordAssetIPValues(record *core.Record) map[string]string {
	values := map[string]string{}
	addAssetIPValue(values, "管理 IP", record.GetString("management_ip"))
	addAssetIPValue(values, "固定 IPv4", recordMetadataString(record, "fixed_ipv4"))
	return values
}

func recordAssetInterfaceIPValues(record *core.Record) map[string]string {
	values := map[string]string{}
	addAssetIPListValues(values, "接口 IPv4", record.GetString("ipv4"))
	addAssetIPListValues(values, "接口 IPv6", record.GetString("ipv6"))
	return values
}

func addAssetIPListValues(values map[string]string, label string, raw string) {
	for _, value := range splitAssetIPList(raw) {
		addAssetIPValue(values, label, value)
	}
}

func addAssetIPValue(values map[string]string, label string, value string) {
	if normalized := normalizeAssetIP(value); normalized != "" {
		values[normalized] = label
	}
}

func duplicateAssetIPLabel(current map[string]string, existing map[string]string) string {
	for value, label := range current {
		if _, ok := existing[value]; ok {
			return label
		}
	}
	return ""
}

func normalizeAssetText(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func normalizeAssetIP(value string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(value), " ", ""))
}

func splitAssetIPList(value string) []string {
	fields := strings.FieldsFunc(value, func(r rune) bool {
		switch r {
		case ',', ';', '\n', '\r', '\t':
			return true
		default:
			return false
		}
	})
	normalized := make([]string, 0, len(fields))
	for _, field := range fields {
		if text := strings.TrimSpace(field); text != "" {
			normalized = append(normalized, text)
		}
	}
	return normalized
}

func normalizeAssetMAC(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	replacer := strings.NewReplacer(":", "", "-", "", ".", "", " ", "")
	return replacer.Replace(value)
}

func recordMetadataMap(raw any) map[string]any {
	switch value := raw.(type) {
	case map[string]any:
		return value
	case map[string]string:
		metadata := make(map[string]any, len(value))
		for key, item := range value {
			metadata[key] = item
		}
		return metadata
	case string:
		var metadata map[string]any
		if strings.TrimSpace(value) == "" {
			return nil
		}
		if err := json.Unmarshal([]byte(value), &metadata); err == nil {
			return metadata
		}
	case []byte:
		var metadata map[string]any
		if len(value) == 0 {
			return nil
		}
		if err := json.Unmarshal(value, &metadata); err == nil {
			return metadata
		}
	}
	return nil
}
