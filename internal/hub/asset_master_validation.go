package hub

import (
	"encoding/json"
	"strconv"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func (h *Hub) bindAssetMasterValidationHooks() {
	h.App.OnRecordCreateRequest("assets").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetParentRequest(e); err != nil {
			return err
		}
		if err := h.validateAssetRequiredProfileRequest(e); err != nil {
			return err
		}
		if err := h.validateAssetDuplicateRequest(e); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordUpdateRequest("assets").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetParentRequest(e); err != nil {
			return err
		}
		if err := h.validateAssetRequiredProfileRequest(e); err != nil {
			return err
		}
		if err := h.validateAssetDuplicateRequest(e); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordCreateRequest("asset_interfaces").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetScopedRecordRequest(e, "asset"); err != nil {
			return err
		}
		if err := h.validateAssetInterfaceDuplicateRequest(e); err != nil {
			return err
		}
		if err := e.Next(); err != nil {
			return err
		}
		return h.normalizePrimaryAssetInterface(e.Record)
	})
	h.App.OnRecordUpdateRequest("asset_interfaces").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetScopedRecordRequest(e, "asset"); err != nil {
			return err
		}
		if err := h.validateAssetInterfaceDuplicateRequest(e); err != nil {
			return err
		}
		if err := e.Next(); err != nil {
			return err
		}
		return h.normalizePrimaryAssetInterface(e.Record)
	})
	h.App.OnRecordCreateRequest("asset_maintenance").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetScopedRecordRequest(e, "asset"); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordUpdateRequest("asset_maintenance").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetScopedRecordRequest(e, "asset"); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordCreateRequest("asset_attachments").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetScopedRecordRequest(e, "asset"); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordUpdateRequest("asset_attachments").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetScopedRecordRequest(e, "asset"); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordCreateRequest("asset_relations").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetRelationRequest(e); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordUpdateRequest("asset_relations").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetRelationRequest(e); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordCreateRequest("asset_locations").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetLocationParentRequest(e); err != nil {
			return err
		}
		return e.Next()
	})
	h.App.OnRecordUpdateRequest("asset_locations").BindFunc(func(e *core.RecordRequestEvent) error {
		if err := h.validateAssetLocationParentRequest(e); err != nil {
			return err
		}
		return e.Next()
	})
}

func (h *Hub) validateAssetParentRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}
	parentID := strings.TrimSpace(e.Record.GetString("parent_asset"))
	if parentID == "" {
		return nil
	}
	if parentID == e.Record.Id {
		return e.BadRequestError("父级资产不能指向自身。", nil)
	}
	parentRecord, err := h.FindRecordById("assets", parentID)
	if err != nil {
		return e.BadRequestError("父级资产不存在。", err)
	}
	if !sameRecordUser(e.Record, parentRecord) {
		return e.BadRequestError("父级资产不属于当前用户。", nil)
	}
	if h.assetParentChainContains(parentRecord, e.Record.Id) {
		return e.BadRequestError("父级资产不能形成循环关系。", nil)
	}
	return nil
}

func (h *Hub) validateAssetRequiredProfileRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}
	if strings.TrimSpace(e.Record.GetString("type")) != "phone" {
		return nil
	}
	if !recordMetadataPositiveNumber(e.Record, "memory_gb") {
		return e.BadRequestError("手机资产必须填写运行内存。", nil)
	}
	if !recordMetadataPositiveNumber(e.Record, "storage_gb") {
		return e.BadRequestError("手机资产必须填写存储容量。", nil)
	}
	return nil
}

func (h *Hub) validateAssetDuplicateRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}
	userID := strings.TrimSpace(e.Record.GetString("user"))
	if userID == "" {
		return nil
	}
	records, err := h.FindRecordsByFilter(
		"assets",
		"user = {:user} && id != {:id}",
		"",
		-1,
		0,
		map[string]any{"user": userID, "id": e.Record.Id},
	)
	if err != nil {
		return err
	}
	currentName := normalizeAssetText(e.Record.GetString("name"))
	currentType := strings.TrimSpace(e.Record.GetString("type"))
	currentSerial := normalizeAssetText(e.Record.GetString("serial_number"))
	currentIPs := recordAssetIPValues(e.Record)
	currentMAC := normalizeAssetMAC(recordMetadataString(e.Record, "mac"))
	for _, existing := range records {
		existingName := normalizeAssetText(existing.GetString("name"))
		if currentName != "" && currentType != "" && currentType == strings.TrimSpace(existing.GetString("type")) && currentName == existingName {
			return e.BadRequestError("同类型同名资产已存在，请不要重复添加。", nil)
		}
		if currentSerial != "" && currentSerial == normalizeAssetText(existing.GetString("serial_number")) {
			return e.BadRequestError("资产序列号已存在，请不要重复添加。", nil)
		}
		if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetIPValues(existing)); duplicateLabel != "" {
			return e.BadRequestError(duplicateLabel+" 已被其他资产使用，请不要重复添加。", nil)
		}
		if currentMAC != "" && currentMAC == normalizeAssetMAC(recordMetadataString(existing, "mac")) {
			return e.BadRequestError("资产 MAC 已存在，请不要重复添加。", nil)
		}
	}
	if len(currentIPs) > 0 || currentMAC != "" {
		interfaces, err := h.FindRecordsByFilter(
			"asset_interfaces",
			"user = {:user}",
			"",
			-1,
			0,
			map[string]any{"user": userID},
		)
		if err != nil {
			return err
		}
		for _, existingInterface := range interfaces {
			if strings.TrimSpace(existingInterface.GetString("asset")) == e.Record.Id {
				continue
			}
			if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetInterfaceIPValues(existingInterface)); duplicateLabel != "" {
				return e.BadRequestError(duplicateLabel+" 已被其他资产接口使用，请不要重复添加。", nil)
			}
			if currentMAC != "" && currentMAC == normalizeAssetMAC(existingInterface.GetString("mac")) {
				return e.BadRequestError("资产 MAC 已被其他资产接口使用，请不要重复添加。", nil)
			}
		}
	}
	return nil
}

func (h *Hub) validateAssetInterfaceDuplicateRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}
	userID := strings.TrimSpace(e.Record.GetString("user"))
	assetID := strings.TrimSpace(e.Record.GetString("asset"))
	if userID == "" || assetID == "" {
		return nil
	}
	currentIPs := recordAssetInterfaceIPValues(e.Record)
	currentMAC := normalizeAssetMAC(e.Record.GetString("mac"))
	if len(currentIPs) == 0 && currentMAC == "" {
		return nil
	}

	interfaces, err := h.FindRecordsByFilter(
		"asset_interfaces",
		"user = {:user} && id != {:id}",
		"",
		-1,
		0,
		map[string]any{"user": userID, "id": e.Record.Id},
	)
	if err != nil {
		return err
	}
	for _, existing := range interfaces {
		if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetInterfaceIPValues(existing)); duplicateLabel != "" {
			return e.BadRequestError(duplicateLabel+" 已被其他接口使用，请不要重复添加。", nil)
		}
		if currentMAC != "" && currentMAC == normalizeAssetMAC(existing.GetString("mac")) {
			return e.BadRequestError("接口 MAC 已被其他接口使用，请不要重复添加。", nil)
		}
	}

	assets, err := h.FindRecordsByFilter(
		"assets",
		"user = {:user} && id != {:asset}",
		"",
		-1,
		0,
		map[string]any{"user": userID, "asset": assetID},
	)
	if err != nil {
		return err
	}
	for _, existingAsset := range assets {
		if duplicateLabel := duplicateAssetIPLabel(currentIPs, recordAssetIPValues(existingAsset)); duplicateLabel != "" {
			return e.BadRequestError(duplicateLabel+" 已被其他资产使用，请不要重复添加。", nil)
		}
		if currentMAC != "" && currentMAC == normalizeAssetMAC(recordMetadataString(existingAsset, "mac")) {
			return e.BadRequestError("接口 MAC 已被其他资产使用，请不要重复添加。", nil)
		}
	}
	return nil
}

func (h *Hub) validateAssetScopedRecordRequest(e *core.RecordRequestEvent, assetField string) error {
	if e == nil || e.Record == nil {
		return nil
	}
	assetID := strings.TrimSpace(e.Record.GetString(assetField))
	if assetID == "" {
		return e.BadRequestError("关联资产不能为空。", nil)
	}
	assetRecord, err := h.FindRecordById("assets", assetID)
	if err != nil {
		return e.BadRequestError("关联资产不存在。", err)
	}
	if !sameRecordUser(e.Record, assetRecord) {
		return e.BadRequestError("关联资产不属于当前用户。", nil)
	}
	return nil
}

func (h *Hub) normalizePrimaryAssetInterface(record *core.Record) error {
	if record == nil || !record.GetBool("primary") {
		return nil
	}
	assetID := strings.TrimSpace(record.GetString("asset"))
	if assetID == "" {
		return nil
	}
	records, err := h.FindRecordsByFilter(
		"asset_interfaces",
		"asset = {:asset} && primary = true && id != {:id}",
		"",
		-1,
		0,
		map[string]any{"asset": assetID, "id": record.Id},
	)
	if err != nil {
		return err
	}
	for _, existing := range records {
		existing.Set("primary", false)
		if err := h.Save(existing); err != nil {
			return err
		}
	}
	return nil
}

func (h *Hub) validateAssetRelationRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}
	sourceID := strings.TrimSpace(e.Record.GetString("source_asset"))
	targetID := strings.TrimSpace(e.Record.GetString("target_asset"))
	if sourceID == "" || targetID == "" {
		return e.BadRequestError("资产关系必须选择来源资产和目标资产。", nil)
	}
	if sourceID == targetID {
		return e.BadRequestError("资产关系不能连接同一个资产。", nil)
	}
	sourceRecord, err := h.FindRecordById("assets", sourceID)
	if err != nil {
		return e.BadRequestError("来源资产不存在。", err)
	}
	targetRecord, err := h.FindRecordById("assets", targetID)
	if err != nil {
		return e.BadRequestError("目标资产不存在。", err)
	}
	if !sameRecordUser(e.Record, sourceRecord) || !sameRecordUser(e.Record, targetRecord) {
		return e.BadRequestError("资产关系两端必须属于当前用户。", nil)
	}
	if err := h.validateAssetRelationInterfaceEndpoint(e, "source_interface", sourceID, "来源接口"); err != nil {
		return err
	}
	if err := h.validateAssetRelationInterfaceEndpoint(e, "target_interface", targetID, "目标接口"); err != nil {
		return err
	}
	if h.hasDuplicateAssetRelation(e.Record) {
		return e.BadRequestError("资产关系已存在，请不要重复添加同一条关系。", nil)
	}
	return nil
}

func (h *Hub) validateAssetRelationInterfaceEndpoint(e *core.RecordRequestEvent, metadataKey string, assetID string, label string) error {
	if e == nil || e.Record == nil {
		return nil
	}
	interfaceID := recordMetadataString(e.Record, metadataKey)
	if interfaceID == "" {
		return nil
	}
	interfaceRecord, err := h.FindRecordById("asset_interfaces", interfaceID)
	if err != nil {
		return e.BadRequestError(label+"不存在。", err)
	}
	if !sameRecordUser(e.Record, interfaceRecord) {
		return e.BadRequestError(label+"不属于当前用户。", nil)
	}
	if strings.TrimSpace(interfaceRecord.GetString("asset")) != strings.TrimSpace(assetID) {
		return e.BadRequestError(label+"和关系资产不匹配。", nil)
	}
	return nil
}

func (h *Hub) hasDuplicateAssetRelation(record *core.Record) bool {
	if record == nil {
		return false
	}
	sourceID := strings.TrimSpace(record.GetString("source_asset"))
	targetID := strings.TrimSpace(record.GetString("target_asset"))
	kind := strings.TrimSpace(record.GetString("kind"))
	userID := strings.TrimSpace(record.GetString("user"))
	if sourceID == "" || targetID == "" || kind == "" || userID == "" {
		return false
	}

	filter := "user = {:user} && kind = {:kind} && source_asset = {:source} && target_asset = {:target}"
	params := map[string]any{
		"user":   userID,
		"kind":   kind,
		"source": sourceID,
		"target": targetID,
	}
	if isBidirectionalAssetRelationKind(kind) {
		filter = "user = {:user} && kind = {:kind} && ((source_asset = {:source} && target_asset = {:target}) || (source_asset = {:target} && target_asset = {:source}))"
	}

	records, err := h.FindRecordsByFilter("asset_relations", filter, "", -1, 0, params)
	if err != nil {
		return false
	}
	sourceInterface := recordMetadataString(record, "source_interface")
	targetInterface := recordMetadataString(record, "target_interface")
	for _, existing := range records {
		if existing.Id == record.Id {
			continue
		}
		existingSource := strings.TrimSpace(existing.GetString("source_asset"))
		existingTarget := strings.TrimSpace(existing.GetString("target_asset"))
		existingSourceInterface := recordMetadataString(existing, "source_interface")
		existingTargetInterface := recordMetadataString(existing, "target_interface")
		if existingSource == sourceID && existingTarget == targetID && existingSourceInterface == sourceInterface && existingTargetInterface == targetInterface {
			return true
		}
		if isBidirectionalAssetRelationKind(kind) &&
			existingSource == targetID &&
			existingTarget == sourceID &&
			existingSourceInterface == targetInterface &&
			existingTargetInterface == sourceInterface {
			return true
		}
	}
	return false
}

func isBidirectionalAssetRelationKind(kind string) bool {
	switch strings.TrimSpace(kind) {
	case "connected_to":
		return true
	default:
		return false
	}
}

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

func (h *Hub) validateAssetLocationParentRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}
	parentID := strings.TrimSpace(e.Record.GetString("parent_location"))
	if parentID == "" {
		return nil
	}
	if parentID == e.Record.Id {
		return e.BadRequestError("父级位置不能指向自身。", nil)
	}
	parentRecord, err := h.FindRecordById("asset_locations", parentID)
	if err != nil {
		return e.BadRequestError("父级位置不存在。", err)
	}
	if !sameRecordUser(e.Record, parentRecord) {
		return e.BadRequestError("父级位置不属于当前用户。", nil)
	}
	if h.assetLocationParentChainContains(parentRecord, e.Record.Id) {
		return e.BadRequestError("父级位置不能形成循环关系。", nil)
	}
	return nil
}

func sameRecordUser(left *core.Record, right *core.Record) bool {
	if left == nil || right == nil {
		return false
	}
	return strings.TrimSpace(left.GetString("user")) == strings.TrimSpace(right.GetString("user"))
}

func (h *Hub) assetParentChainContains(record *core.Record, targetID string) bool {
	return h.recordParentChainContains("assets", "parent_asset", record, targetID)
}

func (h *Hub) assetLocationParentChainContains(record *core.Record, targetID string) bool {
	return h.recordParentChainContains("asset_locations", "parent_location", record, targetID)
}

func (h *Hub) recordParentChainContains(collectionName string, parentField string, record *core.Record, targetID string) bool {
	targetID = strings.TrimSpace(targetID)
	if record == nil || targetID == "" {
		return false
	}
	seen := map[string]bool{}
	current := record
	for current != nil {
		if current.Id == targetID {
			return true
		}
		if seen[current.Id] {
			return false
		}
		seen[current.Id] = true
		parentID := strings.TrimSpace(current.GetString(parentField))
		if parentID == "" {
			return false
		}
		next, err := h.FindRecordById(collectionName, parentID)
		if err != nil {
			return false
		}
		current = next
	}
	return false
}
