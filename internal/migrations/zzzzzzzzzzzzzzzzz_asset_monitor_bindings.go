package migrations

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-21 资产接入监控：一条资产对应一条统一接入记录。
// systems / website_monitors 仍是真实配置和监控数据源，binding 只做注册与状态投影。
func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("asset_monitor_bindings"); err == nil {
			return nil
		}
		jsonData := `[
	{
		"id": "assetmonitor001",
		"listRule": "@request.auth.id != \"\"",
		"viewRule": "@request.auth.id != \"\"",
		"createRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"updateRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"deleteRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"name": "asset_monitor_bindings",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3276610508","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select1846520610","maxSelect":1,"name":"provider","presentable":false,"required":true,"system":false,"type":"select","values":["agent","website"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3964950831","max":64,"min":1,"name":"target_id","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select3096326492","maxSelect":1,"name":"state","presentable":false,"required":true,"system":false,"type":"select","values":["pending","healthy","error","paused"]},
			{"hidden":false,"id":"date1663961387","name":"last_checked","presentable":false,"required":false,"system":false,"type":"date"},
			{"autogeneratePattern":"","hidden":false,"id":"text3907552251","max":500,"min":0,"name":"last_error","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":200000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_asset_monitor_bindings_asset` + "`" + ` ON ` + "`" + `asset_monitor_bindings` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE UNIQUE INDEX ` + "`" + `idx_asset_monitor_bindings_target` + "`" + ` ON ` + "`" + `asset_monitor_bindings` + "`" + ` (` + "`" + `provider` + "`" + `, ` + "`" + `target_id` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_monitor_bindings_state` + "`" + ` ON ` + "`" + `asset_monitor_bindings` + "`" + ` (` + "`" + `state` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_monitor_bindings_user` + "`" + ` ON ` + "`" + `asset_monitor_bindings` + "`" + ` (` + "`" + `user` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_monitor_bindings")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		return app.Delete(collection)
	})
}

func ensureMonitorAssetUniqueness(app core.App) error {
	for _, spec := range []struct {
		collection string
		label      string
	}{
		{collection: "systems", label: "客户端监控"},
		{collection: "website_monitors", label: "网站监控"},
	} {
		collection, err := app.FindCollectionByNameOrId(spec.collection)
		if err != nil {
			return err
		}
		var duplicates []struct {
			Asset string `db:"asset"`
			Count int    `db:"count"`
		}
		if err := app.DB().NewQuery(
			"SELECT asset, COUNT(*) AS count FROM " + spec.collection + " WHERE asset != '' GROUP BY asset HAVING COUNT(*) > 1",
		).All(&duplicates); err != nil {
			return err
		}
		if len(duplicates) > 0 {
			ids := make([]string, 0, len(duplicates))
			for _, item := range duplicates {
				ids = append(ids, item.Asset)
			}
			return fmt.Errorf("%s存在同一资产多条接入记录，请先处理资产 %s 后重试迁移", spec.label, strings.Join(ids, ", "))
		}
		indexName := "idx_" + spec.collection + "_asset_unique"
		if hasIndex(collection.Indexes, indexName) {
			continue
		}
		if spec.collection == "systems" {
			collection.Indexes = append(collection.Indexes,
				"CREATE UNIQUE INDEX `idx_systems_asset_unique` ON `systems` (`asset`) WHERE `asset` != ''",
			)
		} else {
			collection.Indexes = append(collection.Indexes,
				"CREATE UNIQUE INDEX `idx_website_monitors_asset_unique` ON `website_monitors` (`asset`) WHERE `asset` != ''",
			)
		}
		if err := app.Save(collection); err != nil {
			return err
		}
	}
	return nil
}

func disableSystemsAssetCascade(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("systems")
	if err != nil {
		return err
	}
	field, ok := collection.Fields.GetByName("asset").(*core.RelationField)
	if !ok || !field.CascadeDelete {
		return nil
	}
	field.CascadeDelete = false
	return app.Save(collection)
}

func restoreSystemsAssetCascade(app core.App) {
	collection, err := app.FindCollectionByNameOrId("systems")
	if err != nil {
		return
	}
	field, ok := collection.Fields.GetByName("asset").(*core.RelationField)
	if !ok {
		return
	}
	field.CascadeDelete = true
	_ = app.Save(collection)
}

func backfillAssetMonitorBindings(app core.App) error {
	if _, err := app.FindCollectionByNameOrId("asset_monitor_bindings"); err != nil {
		return nil
	}
	var conflicts []struct {
		Asset string `db:"asset"`
	}
	if err := app.DB().NewQuery(`
		SELECT s.asset AS asset
		FROM systems s
		JOIN website_monitors w ON w.asset = s.asset
		WHERE s.asset != '' AND w.asset != ''
		GROUP BY s.asset
	`).All(&conflicts); err != nil {
		return err
	}
	if len(conflicts) > 0 {
		ids := make([]string, 0, len(conflicts))
		for _, item := range conflicts {
			ids = append(ids, item.Asset)
		}
		return fmt.Errorf("资产同时存在 Agent 和网站监控记录：%s", strings.Join(ids, ", "))
	}
	if _, err := app.DB().NewQuery(`
		INSERT INTO asset_monitor_bindings (id, user, asset, provider, target_id, state, last_checked, last_error, metadata, created, updated)
		SELECT substr(lower(hex(randomblob(8))), 1, 15), a.user, s.asset, 'agent', s.id,
			CASE
				WHEN s.status = 'paused' THEN 'paused'
				WHEN s.status = 'up' AND s.pairing_confirmed = 1 THEN 'healthy'
				WHEN s.status = 'down' THEN 'error'
				ELSE 'pending'
			END,
			s.updated, '', '{}', s.created, s.updated
		FROM systems s
		JOIN assets a ON a.id = s.asset
		WHERE s.asset != ''
	`).Execute(); err != nil {
		return err
	}
	if _, err := app.DB().NewQuery(`
		INSERT INTO asset_monitor_bindings (id, user, asset, provider, target_id, state, last_checked, last_error, metadata, created, updated)
		SELECT substr(lower(hex(randomblob(8))), 1, 15), user, asset, 'website', id,
			CASE
				WHEN enabled = 0 THEN 'paused'
				WHEN last_status = 'up' THEN 'healthy'
				WHEN last_status = 'down' THEN 'error'
				ELSE 'pending'
			END,
			last_checked, COALESCE(last_error, ''), '{}', created, updated
		FROM website_monitors
		WHERE asset != ''
	`).Execute(); err != nil {
		return err
	}
	return nil
}

func hasIndex(indexes []string, name string) bool {
	for _, index := range indexes {
		if strings.Contains(index, "`"+name+"`") {
			return true
		}
	}
	return false
}

func removeIndex(indexes []string, name string) []string {
	filtered := make([]string, 0, len(indexes))
	for _, index := range indexes {
		if !strings.Contains(index, "`"+name+"`") {
			filtered = append(filtered, index)
		}
	}
	return filtered
}
