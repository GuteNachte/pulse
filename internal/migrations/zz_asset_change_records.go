package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("asset_changes"); err == nil {
			return nil
		}
		jsonData := `[
	{
		"id": "assetchg000001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "asset_changes",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"source_collection","presentable":false,"required":true,"system":false,"type":"select","values":["assets","asset_interfaces","asset_relations","asset_maintenance"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":80,"min":0,"name":"source_record","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932857","maxSelect":1,"name":"action","presentable":false,"required":true,"system":false,"type":"select","values":["create","update","delete"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":220,"min":0,"name":"summary","pattern":"","presentable":true,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"diff","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_changes_user` + "`" + ` ON ` + "`" + `asset_changes` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_changes_asset` + "`" + ` ON ` + "`" + `asset_changes` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_changes_created` + "`" + ` ON ` + "`" + `asset_changes` + "`" + ` (` + "`" + `created` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_changes")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	})
}
