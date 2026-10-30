package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-07 计算设备④（docs/pc-asset-design.md 四）：自组装配件清单——
// 配件不是独立资产，是整机资产下的清单；分类固定 10 种，规格按分类存 JSON 键值；
// 规则（登录可读、管理员建、所有者改删）由 collections.go 统一覆盖。
func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("asset_components"); err == nil {
			return nil
		}
		jsonData := `[
	{
		"id": "assetcompon0001",
		"listRule": "@request.auth.id != \"\"",
		"viewRule": "@request.auth.id != \"\"",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "asset_components",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271180","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select284493290","maxSelect":1,"name":"category","presentable":false,"required":true,"system":false,"type":"select","values":["cpu","motherboard","memory","storage","gpu","psu","case","cooler","nic","other"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384330","max":120,"min":0,"name":"vendor","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384331","max":160,"min":0,"name":"model","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282230","maxSize":200000,"name":"spec","presentable":false,"required":false,"system":false,"type":"json"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384332","max":120,"min":0,"name":"serial_number","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"date1579384333","max":"","min":"","name":"purchase_date","presentable":false,"required":false,"system":false,"type":"date"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384334","max":40,"min":0,"name":"purchase_price_cny","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895710","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_components_user` + "`" + ` ON ` + "`" + `asset_components` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_components_asset` + "`" + ` ON ` + "`" + `asset_components` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_components_category` + "`" + ` ON ` + "`" + `asset_components` + "`" + ` (` + "`" + `category` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_components")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	})
}
