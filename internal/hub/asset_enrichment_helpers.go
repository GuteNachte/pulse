package hub

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type assetEnrichmentSuggestionInput struct {
	TargetCollection string
	TargetRecord     string
	TargetField      string
	TargetLabel      string
	CurrentValue     string
	CollectedValue   string
	OnlineValue      string
	RecommendedValue string
	Source           string
	Confidence       int
	Conflict         bool
	Notes            string
	Metadata         map[string]any
}

var errAssetEnrichmentStale = errors.New("asset enrichment suggestion stale")

func assetEnrichmentSourcesFromSuggestionMetadata(metadata map[string]any) []assetOnlineSource {
	if sources := assetEnrichmentSourceRowsFromSuggestionMetadata(metadata); len(sources) > 0 {
		return sources
	}
	sourceURLs := stringSliceFromMap(metadata, "source_urls")
	sourceTypes := stringSliceFromMap(metadata, "source_types")
	sourceTitles := stringSliceFromMap(metadata, "source_titles")
	maxLen := maxInt(len(sourceURLs), len(sourceTypes), len(sourceTitles))
	result := make([]assetOnlineSource, 0, maxLen)
	for index := 0; index < maxLen; index++ {
		source := assetOnlineSource{
			URL:   stringAt(sourceURLs, index),
			Type:  stringAt(sourceTypes, index),
			Title: stringAt(sourceTitles, index),
		}
		if source.Type == "" && source.URL != "" {
			source.Type = classifyAssetOnlineURL(source.URL)
		}
		if source.ImageURL == "" && isLikelyImageURL(source.URL) {
			source.ImageURL = source.URL
		}
		if source.URL == "" && source.ImageURL == "" {
			continue
		}
		result = append(result, source)
	}
	return result
}

func assetEnrichmentSourceRowsFromSuggestionMetadata(metadata map[string]any) []assetOnlineSource {
	raw, ok := metadata["sources"]
	if !ok || raw == nil {
		return nil
	}
	switch typed := raw.(type) {
	case []assetOnlineSource:
		return normalizeAssetEnrichmentSources(typed)
	case []map[string]any:
		result := make([]assetOnlineSource, 0, len(typed))
		for _, row := range typed {
			if source, ok := assetEnrichmentSourceFromMetadataMap(row); ok {
				result = append(result, source)
			}
		}
		return result
	case []any:
		result := make([]assetOnlineSource, 0, len(typed))
		for _, item := range typed {
			if row, ok := item.(map[string]any); ok {
				if source, ok := assetEnrichmentSourceFromMetadataMap(row); ok {
					result = append(result, source)
				}
			}
		}
		return result
	default:
		return nil
	}
}

func normalizeAssetEnrichmentSources(sources []assetOnlineSource) []assetOnlineSource {
	result := make([]assetOnlineSource, 0, len(sources))
	for _, source := range sources {
		source.Provider = strings.TrimSpace(source.Provider)
		source.Type = strings.TrimSpace(source.Type)
		source.Title = strings.TrimSpace(source.Title)
		source.URL = strings.TrimSpace(source.URL)
		source.ImageURL = strings.TrimSpace(source.ImageURL)
		if source.Type == "" && source.URL != "" {
			source.Type = classifyAssetOnlineURL(source.URL)
		}
		if source.ImageURL == "" && isLikelyImageURL(source.URL) {
			source.ImageURL = source.URL
		}
		if source.URL == "" && source.ImageURL == "" {
			continue
		}
		result = append(result, source)
	}
	return result
}

func assetEnrichmentSourceFromMetadataMap(row map[string]any) (assetOnlineSource, bool) {
	source := assetOnlineSource{
		Provider:   stringFromMap(row, "provider"),
		Type:       stringFromMap(row, "type"),
		Title:      stringFromMap(row, "title"),
		URL:        stringFromMap(row, "url"),
		ImageURL:   stringFromMap(row, "image_url"),
		Confidence: intFromMap(row, "confidence"),
	}
	if source.Type == "" && source.URL != "" {
		source.Type = classifyAssetOnlineURL(source.URL)
	}
	if source.ImageURL == "" && isLikelyImageURL(source.URL) {
		source.ImageURL = source.URL
	}
	if source.URL == "" && source.ImageURL == "" {
		return assetOnlineSource{}, false
	}
	return source, true
}

func updateAssetEnrichmentReportStatusWithApp(app core.App, reportID string) error {
	if strings.TrimSpace(reportID) == "" {
		return nil
	}
	report, err := app.FindRecordById("asset_enrichment_reports", reportID)
	if err != nil {
		return err
	}
	suggestions, err := app.FindRecordsByFilter("asset_enrichment_suggestions", "report = {:report}", "", -1, 0, dbx.Params{"report": reportID})
	if err != nil {
		return err
	}
	if len(suggestions) == 0 {
		report.Set("status", "ready")
		return app.Save(report)
	}
	counts := map[string]int{}
	for _, suggestion := range suggestions {
		counts[suggestion.GetString("status")]++
	}
	status := "ready"
	if counts["pending"] == 0 {
		if counts["accepted"] > 0 && counts["rejected"] == 0 && counts["stale"] == 0 {
			status = "applied"
		} else if counts["accepted"] > 0 {
			status = "partially_applied"
		} else if counts["rejected"] == len(suggestions) {
			status = "dismissed"
		}
	} else if counts["accepted"] > 0 || counts["rejected"] > 0 || counts["stale"] > 0 {
		status = "partially_applied"
	}
	report.Set("status", status)
	metadata := recordJSONMap(report, "metadata")
	metadata["pending_suggestions"] = counts["pending"]
	metadata["accepted_suggestions"] = counts["accepted"]
	metadata["rejected_suggestions"] = counts["rejected"]
	metadata["stale_suggestions"] = counts["stale"]
	report.Set("metadata", metadata)
	return app.Save(report)
}

func currentAssetEnrichmentFieldValue(record *core.Record, field string) string {
	if strings.HasPrefix(field, "metadata.") {
		return metadataValueString(record, strings.TrimPrefix(field, "metadata."))
	}
	if value := record.Get(field); value != nil {
		switch typed := value.(type) {
		case string:
			return strings.TrimSpace(typed)
		case int:
			return strconv.Itoa(typed)
		case int64:
			return strconv.FormatInt(typed, 10)
		case float64:
			return formatSuggestionNumber(typed)
		}
	}
	return strings.TrimSpace(record.GetString(field))
}

func recordJSONMap(record *core.Record, field string) map[string]any {
	if record == nil {
		return map[string]any{}
	}
	if raw, ok := record.Get(field).(map[string]any); ok {
		copy := make(map[string]any, len(raw))
		for key, value := range raw {
			copy[key] = value
		}
		return copy
	}
	var result map[string]any
	if err := record.UnmarshalJSONField(field, &result); err != nil || result == nil {
		return map[string]any{}
	}
	return result
}

func metadataValueString(record *core.Record, key string) string {
	metadata := recordJSONMap(record, "metadata")
	value, ok := metadata[key]
	if !ok || value == nil {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case float64:
		return formatSuggestionNumber(typed)
	case json.Number:
		return typed.String()
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func recordNumberString(record *core.Record, field string) string {
	value := record.Get(field)
	switch typed := value.(type) {
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case float64:
		return formatSuggestionNumber(typed)
	default:
		return strings.TrimSpace(record.GetString(field))
	}
}

func formatSuggestionNumber(value float64) string {
	if !isFiniteNumber(value) || value == 0 {
		return ""
	}
	if math.Trunc(value) == value {
		return strconv.FormatInt(int64(value), 10)
	}
	return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(value, 'f', 2, 64), "0"), ".")
}

func stringFromMap(values map[string]any, key string) string {
	value, ok := values[key]
	if !ok || value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return strings.TrimSpace(text)
	}
	return strings.TrimSpace(fmt.Sprint(value))
}

func stringSliceFromMap(values map[string]any, key string) []string {
	value, ok := values[key]
	if !ok || value == nil {
		return nil
	}
	switch typed := value.(type) {
	case []string:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if trimmed := strings.TrimSpace(item); trimmed != "" {
				result = append(result, trimmed)
			}
		}
		return result
	case []any:
		result := make([]string, 0, len(typed))
		for _, item := range typed {
			if trimmed := strings.TrimSpace(fmt.Sprint(item)); trimmed != "" {
				result = append(result, trimmed)
			}
		}
		return result
	case string:
		if trimmed := strings.TrimSpace(typed); trimmed != "" {
			return []string{trimmed}
		}
	}
	return nil
}

func stringAt(values []string, index int) string {
	if index < 0 || index >= len(values) {
		return ""
	}
	return strings.TrimSpace(values[index])
}

func maxInt(values ...int) int {
	maximum := 0
	for _, value := range values {
		if value > maximum {
			maximum = value
		}
	}
	return maximum
}

func intFromMap(values map[string]any, key string) int {
	value, ok := values[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	case json.Number:
		number, _ := typed.Int64()
		return int(number)
	default:
		number, _ := strconv.Atoi(strings.TrimSpace(fmt.Sprint(typed)))
		return number
	}
}

func nonEmptyStrings(values ...string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func isFiniteNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
