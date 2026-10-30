package migrations

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-25 设备在线探测：asset_presence 每条资产一条探测状态记录，
// 由 Hub 内置 ping 引擎（每分钟）写入，拓扑等展示层只读消费。
// status: online / offline / unknown；method 固定 ping（后续可扩展 arp）。
func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("asset_presence"); err == nil {
			return nil
		}
		jsonData := `[
	{
		"id": "assetpresence01",
		"listRule": "@request.auth.id != \"\"",
		"viewRule": "@request.auth.id != \"\"",
		"createRule": null,
		"updateRule": null,
		"deleteRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"name": "asset_presence",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3276610508","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select1846520610","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["online","offline","unknown"]},
			{"hidden":false,"id":"select3096326492","maxSelect":1,"name":"method","presentable":false,"required":false,"system":false,"type":"select","values":["ping"]},
			{"hidden":false,"id":"date1663961387","name":"last_checked","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date2881710829","name":"last_seen","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"number992318841","max":60000,"min":0,"name":"latency_ms","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"number1091883342","max":1000,"min":0,"name":"fail_streak","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_asset_presence_asset` + "`" + ` ON ` + "`" + `asset_presence` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_presence_status` + "`" + ` ON ` + "`" + `asset_presence` + "`" + ` (` + "`" + `status` + "`" + `)"
		]
	}
]`
		if err := app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false); err != nil {
			return err
		}
		return seedAssetPresenceRecords(app)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_presence")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		return app.Delete(collection)
	})
}

// seedAssetPresenceRecords 为存量「有管理 IP 且非手机」的资产生成 unknown 初始记录。
func seedAssetPresenceRecords(app core.App) error {
	records, err := app.FindRecordsByFilter("assets", "management_ip != ''", "name", -1, 0)
	if err != nil {
		return err
	}
	collection, err := app.FindCachedCollectionByNameOrId("asset_presence")
	if err != nil {
		return err
	}
	for _, record := range records {
		if !assetPresenceEligibleMigration(record) {
			continue
		}
		seed := core.NewRecord(collection)
		seed.Set("asset", record.Id)
		seed.Set("status", "unknown")
		seed.Set("method", "ping")
		if err := app.SaveNoValidate(seed); err != nil {
			return err
		}
	}
	return nil
}

func assetPresenceEligibleMigration(record *core.Record) bool {
	assetType := strings.TrimSpace(record.GetString("type"))
	if assetType == "phone" || assetType == "internet" {
		return false
	}
	ip := strings.TrimSpace(record.GetString("management_ip"))
	if ip == "" || strings.ContainsAny(ip, " \t") {
		return false
	}
	return true
}
