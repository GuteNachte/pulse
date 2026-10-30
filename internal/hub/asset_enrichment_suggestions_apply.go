package hub

import (
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type assetEnrichmentSuggestionApplication struct {
	Suggestion       *core.Record
	Record           *core.Record
	TargetCollection string
	TargetField      string
	AssetID          string
}

func (h *Hub) prepareAssetEnrichmentBatchApplications(userID string, suggestions []*core.Record) ([]assetEnrichmentSuggestionApplication, map[string]*core.Record, error) {
	records := map[string]*core.Record{}
	fieldSeen := map[string]bool{}
	applications := make([]assetEnrichmentSuggestionApplication, 0, len(suggestions))
	for _, suggestion := range suggestions {
		application, err := h.prepareAssetEnrichmentSuggestionApplication(userID, suggestion, records)
		if err != nil {
			return nil, nil, err
		}
		fieldKey := strings.Join([]string{application.TargetCollection, application.Record.Id, application.TargetField}, "\x00")
		if fieldSeen[fieldKey] {
			return nil, nil, fmt.Errorf("同一批次里存在重复目标字段：%s.%s", application.TargetCollection, application.TargetField)
		}
		fieldSeen[fieldKey] = true
		applications = append(applications, application)
	}
	recordKeys := sortedStringKeys(records)
	for _, key := range recordKeys {
		record := records[key]
		if err := h.validateAssetEnrichmentDuplicateBeforeSave(userID, record.Collection().Name, record); err != nil {
			return nil, nil, err
		}
	}
	return applications, records, nil
}

func (h *Hub) prepareAssetEnrichmentSuggestionApplication(userID string, suggestion *core.Record, records map[string]*core.Record) (assetEnrichmentSuggestionApplication, error) {
	targetCollection := suggestion.GetString("target_collection")
	targetField := suggestion.GetString("target_field")
	targetRecordID := firstNonEmpty(suggestion.GetString("target_record"), suggestion.GetString("asset"))
	recordKey := targetCollection + ":" + targetRecordID
	record := records[recordKey]
	if record == nil {
		loaded, err := h.FindRecordById(targetCollection, targetRecordID)
		if err != nil {
			return assetEnrichmentSuggestionApplication{}, fmt.Errorf("目标记录不存在")
		}
		record = loaded.Clone()
		records[recordKey] = record
	}
	assetID := suggestion.GetString("asset")
	if err := h.validateAssetEnrichmentTargetOwnership(userID, assetID, targetCollection, record); err != nil {
		return assetEnrichmentSuggestionApplication{}, err
	}
	if !isAllowedAssetEnrichmentField(record.GetString("type"), targetCollection, targetField) {
		return assetEnrichmentSuggestionApplication{}, fmt.Errorf("字段不允许通过当前资产类型的补全建议写入：%s.%s", targetCollection, targetField)
	}
	current := currentAssetEnrichmentFieldValue(record, targetField)
	if strings.TrimSpace(current) != strings.TrimSpace(suggestion.GetString("current_value")) {
		return assetEnrichmentSuggestionApplication{}, errAssetEnrichmentStale
	}
	value, err := h.parseAssetEnrichmentRecommendedValue(suggestion)
	if err != nil {
		return assetEnrichmentSuggestionApplication{}, err
	}
	if err := validateAssetEnrichmentRecommendedValue(targetCollection, targetField, value, suggestion); err != nil {
		return assetEnrichmentSuggestionApplication{}, err
	}
	if strings.HasPrefix(targetField, "metadata.") {
		metadata := recordJSONMap(record, "metadata")
		metadata[strings.TrimPrefix(targetField, "metadata.")] = value
		record.Set("metadata", metadata)
	} else {
		record.Set(targetField, value)
	}
	return assetEnrichmentSuggestionApplication{
		Suggestion:       suggestion,
		Record:           record,
		TargetCollection: targetCollection,
		TargetField:      targetField,
		AssetID:          assetID,
	}, nil
}

func (h *Hub) saveAssetEnrichmentBatchApplications(userID string, applications []assetEnrichmentSuggestionApplication, records map[string]*core.Record) error {
	reportIDs := map[string]bool{}
	return h.RunInTransaction(func(txApp core.App) error {
		for _, key := range sortedStringKeys(records) {
			if err := txApp.Save(records[key]); err != nil {
				return err
			}
		}
		for _, application := range applications {
			suggestion := application.Suggestion
			if err := createAssetChangeWithApp(
				txApp,
				userID,
				application.AssetID,
				application.TargetCollection,
				application.Record.Id,
				"update",
				"确认补全建议："+suggestion.GetString("target_label"),
				map[string]any{
					"source_collection": "asset_enrichment_suggestions",
					"source_record":     suggestion.Id,
					"field":             application.TargetField,
					"previous":          suggestion.GetString("current_value"),
					"recommended":       suggestion.GetString("recommended_value"),
					"source":            suggestion.GetString("source"),
					"confidence":        suggestion.GetInt("confidence"),
				},
			); err != nil {
				return err
			}
			suggestion.Set("status", "accepted")
			if err := txApp.Save(suggestion); err != nil {
				return err
			}
			if reportID := strings.TrimSpace(suggestion.GetString("report")); reportID != "" {
				reportIDs[reportID] = true
			}
		}
		for _, reportID := range sortedBoolMapKeys(reportIDs) {
			if err := updateAssetEnrichmentReportStatusWithApp(txApp, reportID); err != nil {
				return err
			}
		}
		return nil
	})
}

func (h *Hub) validateAssetEnrichmentTargetOwnership(userID string, assetID string, targetCollection string, record *core.Record) error {
	if record.GetString("user") != userID {
		return fmt.Errorf("目标记录不属于当前用户")
	}
	switch targetCollection {
	case "assets":
		if record.Id != assetID {
			return fmt.Errorf("目标资产和建议资产不一致")
		}
	case "asset_interfaces", "asset_maintenance", "asset_attachments":
		if record.GetString("asset") != assetID {
			return fmt.Errorf("目标记录和建议资产不一致")
		}
	default:
		return fmt.Errorf("当前阶段不支持写入该集合")
	}
	return nil
}

func isAllowedAssetEnrichmentField(assetType string, collection string, field string) bool {
	switch collection {
	case "assets":
		switch field {
		case "name", "vendor", "model", "serial_number", "management_ip", "location", "role":
			return true
		default:
			if !strings.HasPrefix(field, "metadata.") {
				return false
			}
			return assetEnrichmentAllowedMetadataFieldSet(assetType)[strings.TrimPrefix(field, "metadata.")]
		}
	case "asset_interfaces":
		switch field {
		case "mac", "ipv4", "ipv6", "speed_mbps":
			return true
		}
	}
	return false
}

func (h *Hub) parseAssetEnrichmentRecommendedValue(suggestion *core.Record) (any, error) {
	value := strings.TrimSpace(suggestion.GetString("recommended_value"))
	metadata := recordJSONMap(suggestion, "metadata")
	if stringFromMap(metadata, "value_type") == "number" {
		number, err := strconv.ParseFloat(value, 64)
		if err != nil || !isFiniteNumber(number) {
			return nil, fmt.Errorf("建议值不是有效数字")
		}
		if math.Trunc(number) == number {
			return int(number), nil
		}
		return number, nil
	}
	return value, nil
}

func validateAssetEnrichmentRecommendedValue(collection string, field string, value any, suggestion *core.Record) error {
	if collection == "assets" && field == "metadata.official_image_url" {
		text := strings.TrimSpace(fmt.Sprint(value))
		if text != "" && !isLikelyImageURL(text) {
			return fmt.Errorf("官方图片必须是可识别的图片 URL")
		}
		if text != "" && !assetEnrichmentOfficialImageWritebackAllowed(text, suggestion) {
			return fmt.Errorf("官方图片必须来自官方图片来源")
		}
	}
	return nil
}

func assetEnrichmentOfficialImageWritebackAllowed(value string, suggestion *core.Record) bool {
	if classifyAssetOnlineURL(value) == "official_image" {
		return true
	}
	metadata := recordJSONMap(suggestion, "metadata")
	sources := assetEnrichmentSourcesFromSuggestionMetadata(metadata)
	if len(sources) == 0 {
		return false
	}
	return assetOfficialImageSuggestionValueAllowed(value, sources)
}

func (h *Hub) validateAssetEnrichmentDuplicateBeforeSave(userID string, collection string, record *core.Record) error {
	switch collection {
	case "assets":
		currentName := normalizeAssetText(record.GetString("name"))
		currentType := strings.TrimSpace(record.GetString("type"))
		currentSerial := normalizeAssetText(record.GetString("serial_number"))
		currentIPs := recordAssetIPValues(record)
		currentMAC := normalizeAssetMAC(recordMetadataString(record, "mac"))
		assets, err := h.FindRecordsByFilter("assets", "user = {:user} && id != {:id}", "", -1, 0, dbx.Params{"user": userID, "id": record.Id})
		if err != nil {
			return err
		}
		for _, existing := range assets {
			existingName := normalizeAssetText(existing.GetString("name"))
			if currentName != "" && currentType != "" && currentType == strings.TrimSpace(existing.GetString("type")) && currentName == existingName {
				return fmt.Errorf("同类型同名资产已存在，请不要重复添加")
			}
			if currentSerial != "" && currentSerial == normalizeAssetText(existing.GetString("serial_number")) {
				return fmt.Errorf("资产序列号已存在，请不要重复添加")
			}
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他资产使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(recordMetadataString(existing, "mac")) {
				return fmt.Errorf("资产 MAC 已被其他资产使用")
			}
		}
		interfaces, err := h.FindRecordsByFilter("asset_interfaces", "user = {:user}", "", -1, 0, dbx.Params{"user": userID})
		if err != nil {
			return err
		}
		for _, existing := range interfaces {
			if strings.TrimSpace(existing.GetString("asset")) == record.Id {
				continue
			}
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetInterfaceIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他资产接口使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(existing.GetString("mac")) {
				return fmt.Errorf("资产 MAC 已被其他资产接口使用")
			}
		}
	case "asset_interfaces":
		currentIPs := recordAssetInterfaceIPValues(record)
		currentMAC := normalizeAssetMAC(record.GetString("mac"))
		interfaces, err := h.FindRecordsByFilter("asset_interfaces", "user = {:user} && id != {:id}", "", -1, 0, dbx.Params{"user": userID, "id": record.Id})
		if err != nil {
			return err
		}
		for _, existing := range interfaces {
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetInterfaceIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他接口使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(existing.GetString("mac")) {
				return fmt.Errorf("接口 MAC 已被其他接口使用")
			}
		}
		assets, err := h.FindRecordsByFilter("assets", "user = {:user} && id != {:asset}", "", -1, 0, dbx.Params{"user": userID, "asset": record.GetString("asset")})
		if err != nil {
			return err
		}
		for _, existing := range assets {
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetIPValues(existing)); duplicateLabel != "" {
				return fmt.Errorf("%s 已被其他资产使用", duplicateLabel)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(recordMetadataString(existing, "mac")) {
				return fmt.Errorf("接口 MAC 已被其他资产使用")
			}
		}
	}
	return nil
}

func sortedStringKeys[T any](values map[string]T) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedBoolMapKeys(values map[string]bool) []string {
	return sortedStringKeys(values)
}
