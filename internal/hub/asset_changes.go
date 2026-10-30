package hub

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

func (h *Hub) bindAssetChangeHooks() {
	for _, collectionName := range []string{"assets", "asset_interfaces", "asset_relations", "asset_maintenance", "asset_attachments"} {
		h.App.OnRecordCreateRequest(collectionName).BindFunc(func(e *core.RecordRequestEvent) error {
			return h.trackAssetChangeRequest(e, "create")
		})
		h.App.OnRecordUpdateRequest(collectionName).BindFunc(func(e *core.RecordRequestEvent) error {
			return h.trackAssetChangeRequest(e, "update")
		})
		h.App.OnRecordDeleteRequest(collectionName).BindFunc(func(e *core.RecordRequestEvent) error {
			return h.trackAssetChangeRequest(e, "delete")
		})
	}
}

func (h *Hub) trackAssetChangeRequest(e *core.RecordRequestEvent, action string) error {
	if err := e.Next(); err != nil {
		return err
	}
	if e == nil || e.Record == nil || e.Auth == nil || e.Auth.Id == "" || e.Auth.Collection().Name != "users" {
		return nil
	}
	collectionName := e.Record.Collection().Name
	assetIDs := assetChangeAssetIDs(collectionName, e.Record)
	if len(assetIDs) == 0 {
		return nil
	}
	summary := assetChangeSummary(collectionName, action, e.Record)
	snapshot := assetChangeSnapshot(collectionName, e.Record)
	for _, assetID := range assetIDs {
		if assetID == "" {
			continue
		}
		if err := h.createAssetChange(e.Auth.Id, assetID, collectionName, e.Record.Id, action, summary, snapshot); err != nil {
			h.Logger().Warn("Failed to create asset change record", "collection", collectionName, "record", e.Record.Id, "asset", assetID, "error", err)
		}
	}
	return nil
}

func (h *Hub) createAssetChange(userID string, assetID string, sourceCollection string, sourceRecord string, action string, summary string, diff map[string]any) error {
	return createAssetChangeWithApp(h.App, userID, assetID, sourceCollection, sourceRecord, action, summary, diff)
}

func createAssetChangeWithApp(app core.App, userID string, assetID string, sourceCollection string, sourceRecord string, action string, summary string, diff map[string]any) error {
	collection, err := app.FindCachedCollectionByNameOrId("asset_changes")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("asset", assetID)
	record.Set("source_collection", sourceCollection)
	record.Set("source_record", sourceRecord)
	record.Set("action", action)
	record.Set("summary", summary)
	record.Set("diff", diff)
	return app.Save(record)
}

func assetChangeAssetIDs(collectionName string, record *core.Record) []string {
	if record == nil {
		return nil
	}
	switch collectionName {
	case "assets":
		return []string{record.Id}
	case "asset_interfaces", "asset_maintenance", "asset_attachments":
		return []string{strings.TrimSpace(record.GetString("asset"))}
	case "asset_relations":
		return uniqueNonEmptyStrings([]string{
			strings.TrimSpace(record.GetString("source_asset")),
			strings.TrimSpace(record.GetString("target_asset")),
		})
	default:
		return nil
	}
}

func assetChangeSummary(collectionName string, action string, record *core.Record) string {
	target := assetChangeTarget(collectionName, record)
	prefix := map[string]map[string]string{
		"assets": {
			"create": "新增资产档案",
			"update": "更新资产档案",
			"delete": "删除资产档案",
		},
		"asset_interfaces": {
			"create": "新增资产接口",
			"update": "更新资产接口",
			"delete": "删除资产接口",
		},
		"asset_relations": {
			"create": "新增资产关系",
			"update": "更新资产关系",
			"delete": "删除资产关系",
		},
		"asset_maintenance": {
			"create": "新增维护记录",
			"update": "更新维护记录",
			"delete": "删除维护记录",
		},
		"asset_attachments": {
			"create": "新增资产附件",
			"update": "更新资产附件",
			"delete": "删除资产附件",
		},
	}
	if collectionPrefixes, ok := prefix[collectionName]; ok {
		if label := collectionPrefixes[action]; label != "" {
			if target != "" {
				return label + "：" + target
			}
			return label
		}
	}
	if target != "" {
		return action + " " + target
	}
	return action + " " + collectionName
}

func assetChangeTarget(collectionName string, record *core.Record) string {
	if record == nil {
		return ""
	}
	switch collectionName {
	case "assets":
		return firstNonEmpty(record.GetString("name"), record.GetString("model"), record.Id)
	case "asset_interfaces":
		return firstNonEmpty(record.GetString("name"), record.GetString("kind"), record.Id)
	case "asset_relations":
		return firstNonEmpty(record.GetString("label"), record.GetString("kind"), record.Id)
	case "asset_maintenance":
		return firstNonEmpty(record.GetString("title"), record.GetString("kind"), record.Id)
	case "asset_attachments":
		return firstNonEmpty(record.GetString("title"), record.GetString("kind"), record.Id)
	default:
		return record.Id
	}
}

func assetChangeSnapshot(collectionName string, record *core.Record) map[string]any {
	if record == nil {
		return nil
	}
	snapshot := map[string]any{
		"id":                record.Id,
		"source_collection": collectionName,
	}
	for _, fieldName := range assetChangeSnapshotFields(collectionName) {
		value := record.Get(fieldName)
		if value == nil {
			continue
		}
		snapshot[fieldName] = value
	}
	return snapshot
}

func assetChangeSnapshotFields(collectionName string) []string {
	switch collectionName {
	case "assets":
		return []string{"name", "type", "status", "parent_asset", "vendor", "model", "serial_number", "management_ip", "location", "role", "notes", "tags", "metadata"}
	case "asset_interfaces":
		return []string{"asset", "name", "kind", "mac", "ipv4", "ipv6", "speed_mbps", "connected", "primary", "source", "metadata"}
	case "asset_relations":
		return []string{"source_asset", "target_asset", "kind", "label", "metadata"}
	case "asset_maintenance":
		return []string{"asset", "kind", "title", "event_date", "actor", "cost", "notes", "metadata"}
	case "asset_attachments":
		return []string{"asset", "kind", "title", "files", "notes", "metadata"}
	default:
		return nil
	}
}

func uniqueNonEmptyStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}
