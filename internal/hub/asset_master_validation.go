package hub

import (
	"reflect"
	"strings"

	validation "github.com/go-ozzo/ozzo-validation/v4"
	"github.com/pocketbase/pocketbase/core"
)

var ontAssetInterfaceAllowedMetadataFields = map[string]bool{
	"enabled": true, "role": true, "band": true, "connection_note": true, "notes": true,
}

func (h *Hub) bindAssetMasterValidationHooks() {
	h.App.OnRecordValidate("asset_interfaces").BindFunc(func(e *core.RecordEvent) error {
		if e == nil || e.Record == nil || e.Record.GetFloat("speed_mbps") >= 0 {
			return e.Next()
		}
		assetRecord, err := h.FindRecordById("assets", strings.TrimSpace(e.Record.GetString("asset")))
		if err != nil || strings.TrimSpace(assetRecord.GetString("type")) != "ont" {
			return e.Next()
		}
		return validation.Errors{
			"speed_mbps": validation.NewError("validation_ont_interface_speed", "接口速率不能小于 0。"),
		}
	})
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
		if err := h.validateAssetInterfaceProfileRequest(e); err != nil {
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
		if err := h.validateAssetInterfaceProfileRequest(e); err != nil {
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

func (h *Hub) validateAssetInterfaceProfileRequest(e *core.RecordRequestEvent) error {
	if e == nil || e.Record == nil {
		return nil
	}
	assetRecord, err := h.FindRecordById("assets", strings.TrimSpace(e.Record.GetString("asset")))
	if err != nil || strings.TrimSpace(assetRecord.GetString("type")) != "ont" {
		return nil
	}
	metadata := recordJSONMap(e.Record, "metadata")
	enabledValue, exists := metadata["enabled"]
	if !exists {
		return e.BadRequestError("ONT 接口必须明确填写启用状态。", nil)
	}
	enabled, ok := enabledValue.(bool)
	if !ok {
		return e.BadRequestError("接口启用状态必须是布尔值。", nil)
	}
	if role := metadataString(metadata, "role"); !stringInSet(role, "uplink", "downlink", "lan", "radio") {
		return e.BadRequestError("接口角色只能选择上联、下联、LAN 或无线频段。", nil)
	}
	if strings.TrimSpace(e.Record.GetString("kind")) == "wifi" &&
		!stringInSet(metadataString(metadata, "band"), "2.4 GHz", "5 GHz") {
		return e.BadRequestError("无线频段只能选择 2.4 GHz 或 5 GHz。", nil)
	}
	if !enabled && e.Record.GetBool("connected") {
		return e.BadRequestError("未启用接口不能标记为当前接入。", nil)
	}
	if speed := e.Record.GetFloat("speed_mbps"); speed < 0 {
		return e.BadRequestError("接口速率不能小于 0。", nil)
	}

	originalMetadata := map[string]any{}
	if original := e.Record.Original(); original != nil {
		originalMetadata = recordJSONMap(original, "metadata")
	}
	for key, value := range metadata {
		if ontAssetInterfaceAllowedMetadataFields[key] {
			continue
		}
		originalValue, existed := originalMetadata[key]
		if !existed || !reflect.DeepEqual(originalValue, value) {
			return e.BadRequestError("字段 "+key+" 不属于 ONT 接口模板。", nil)
		}
	}
	return nil
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
	switch strings.TrimSpace(e.Record.GetString("type")) {
	case "internet":
		return h.validateInternetAssetRecord(e)
	case "ont":
		return h.validateONTAssetRecord(e)
	case "phone":
		if !recordMetadataPositiveNumber(e.Record, "memory_gb") {
			return e.BadRequestError("手机资产必须填写运行内存。", nil)
		}
		if !recordMetadataPositiveNumber(e.Record, "storage_gb") {
			return e.BadRequestError("手机资产必须填写存储容量。", nil)
		}
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
	if err := h.validateInternetAssetRelation(e, sourceRecord, targetRecord); err != nil {
		return err
	}
	if err := h.validateWiFiAssetRelation(e, sourceRecord, targetRecord); err != nil {
		return err
	}
	if h.hasDuplicateAssetRelation(e.Record) {
		return e.BadRequestError("资产关系已存在，请不要重复添加同一条关系。", nil)
	}
	return nil
}

func (h *Hub) validateInternetAssetRelation(e *core.RecordRequestEvent, sourceRecord *core.Record, targetRecord *core.Record) error {
	if e == nil || e.Record == nil || sourceRecord == nil || targetRecord == nil {
		return nil
	}
	kind := strings.TrimSpace(e.Record.GetString("kind"))
	linkKind := recordMetadataString(e.Record, "link_kind")
	sourceIsInternet := strings.TrimSpace(sourceRecord.GetString("type")) == "internet"
	targetIsInternet := strings.TrimSpace(targetRecord.GetString("type")) == "internet"
	if linkKind == "internet" && (!sourceIsInternet || kind != "connected_to") {
		return e.BadRequestError("外网链路必须从互联网接入资源指向内网接入设备。", nil)
	}
	if !sourceIsInternet || kind != "connected_to" {
		if targetIsInternet && linkKind == "internet" {
			return e.BadRequestError("外网链路方向必须从互联网接入指向内网设备。", nil)
		}
		return nil
	}
	if linkKind != "internet" {
		return e.BadRequestError("互联网接入资源只能创建外网接入关系。", nil)
	}
	if recordMetadataString(e.Record, "source_interface") != "" {
		return e.BadRequestError("互联网接入资源没有来源接口。", nil)
	}
	switch strings.TrimSpace(targetRecord.GetString("type")) {
	case "ont", "router", "gateway":
	default:
		return e.BadRequestError("互联网接入只能关联光猫、路由器或网关。", nil)
	}
	targetInterfaceID := recordMetadataString(e.Record, "target_interface")
	if targetInterfaceID == "" {
		return e.BadRequestError("互联网接入关系必须选择目标设备的 PON 或 WAN 接口。", nil)
	}
	targetInterface, err := h.FindRecordById("asset_interfaces", targetInterfaceID)
	if err != nil {
		return e.BadRequestError("目标接口不存在。", err)
	}
	targetInterfaceKind := strings.TrimSpace(targetInterface.GetString("kind"))
	if targetInterfaceKind != "pon" && targetInterfaceKind != "wan" {
		return e.BadRequestError("互联网接入关系必须选择目标设备的 PON 或 WAN 接口。", nil)
	}
	if strings.TrimSpace(targetRecord.GetString("type")) == "ont" && recordMetadataString(targetInterface, "role") != "uplink" {
		return e.BadRequestError("互联网接入关系必须选择目标设备的 PON 或 WAN 上联接口。", nil)
	}
	records, err := h.FindRecordsByFilter(
		"asset_relations",
		"source_asset = {:source} && kind = 'connected_to'",
		"",
		-1,
		0,
		map[string]any{"source": sourceRecord.Id},
	)
	if err != nil {
		return err
	}
	for _, existing := range records {
		if existing.Id != e.Record.Id && recordMetadataString(existing, "link_kind") == "internet" {
			return e.BadRequestError("一条宽带只能关联一个当前接入设备。", nil)
		}
	}
	return nil
}

func (h *Hub) validateWiFiAssetRelation(e *core.RecordRequestEvent, sourceRecord *core.Record, targetRecord *core.Record) error {
	if e == nil || e.Record == nil || sourceRecord == nil || targetRecord == nil {
		return nil
	}
	if recordMetadataString(e.Record, "link_kind") != "wifi" {
		return nil
	}
	if strings.TrimSpace(e.Record.GetString("kind")) != "connected_to" {
		return e.BadRequestError("无线链路必须使用网络连接关系。", nil)
	}
	if !stringInSet(strings.TrimSpace(targetRecord.GetString("type")), "ont", "router", "gateway", "ap") {
		return e.BadRequestError("无线关系必须由终端指向光猫、路由器、网关或 AP。", nil)
	}
	interfaceID := recordMetadataString(e.Record, "target_interface")
	if interfaceID == "" {
		return e.BadRequestError("无线关系必须选择目标设备的 Wi-Fi 接口。", nil)
	}
	interfaceRecord, err := h.FindRecordById("asset_interfaces", interfaceID)
	if err != nil {
		return e.BadRequestError("目标 Wi-Fi 接口不存在。", err)
	}
	if strings.TrimSpace(interfaceRecord.GetString("kind")) != "wifi" {
		return e.BadRequestError("无线关系必须选择 Wi-Fi 接口。", nil)
	}
	if enabled, ok := recordJSONMap(interfaceRecord, "metadata")["enabled"].(bool); ok && !enabled {
		return e.BadRequestError("无线关系不能连接未启用的 Wi-Fi 接口。", nil)
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
