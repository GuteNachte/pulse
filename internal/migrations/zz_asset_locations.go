package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("asset_locations"); err == nil {
			return nil
		}
		jsonData := `[
	{
		"id": "assetloc0000001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "asset_locations",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":120,"min":0,"name":"name","pattern":"","presentable":true,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["room","area","rack","cabinet","desk","zone","custom"]},
			{"cascadeDelete":false,"collectionId":"assetloc0000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"parent_location","presentable":false,"required":false,"system":false,"type":"relation"},
			{"hidden":false,"id":"number2744374011","max":1000000,"min":0,"name":"sort_order","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_locations_user` + "`" + ` ON ` + "`" + `asset_locations` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_locations_kind` + "`" + ` ON ` + "`" + `asset_locations` + "`" + ` (` + "`" + `kind` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_locations_parent` + "`" + ` ON ` + "`" + `asset_locations` + "`" + ` (` + "`" + `parent_location` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_locations")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	})
}
