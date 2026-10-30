package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if err := ensureAssetChangeSourceCollections(app, []string{"asset_attachments"}); err != nil {
			return err
		}
		if _, err := app.FindCollectionByNameOrId("asset_attachments"); err == nil {
			return nil
		}
		jsonData := `[
	{
		"id": "assetatt000001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "asset_attachments",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["photo","invoice","warranty","manual","config","document","other"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":160,"min":0,"name":"title","pattern":"","presentable":true,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"file2468953101","maxSelect":5,"maxSize":20971520,"mimeTypes":["image/jpeg","image/png","image/webp","image/gif","application/pdf","text/plain","application/json","application/zip","application/x-zip-compressed","application/x-yaml","text/yaml"],"name":"files","presentable":false,"protected":true,"required":true,"system":false,"thumbs":["320x240f","80x80f"],"type":"file"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_attachments_user` + "`" + ` ON ` + "`" + `asset_attachments` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_attachments_asset` + "`" + ` ON ` + "`" + `asset_attachments` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_attachments_kind` + "`" + ` ON ` + "`" + `asset_attachments` + "`" + ` (` + "`" + `kind` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_attachments")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	})
}

func ensureAssetChangeSourceCollections(app core.App, additions []string) error {
	collection, err := app.FindCollectionByNameOrId("asset_changes")
	if err != nil {
		return nil
	}
	field := collection.Fields.GetByName("source_collection")
	selectField, ok := field.(*core.SelectField)
	if !ok || selectField == nil {
		return nil
	}
	selectField.Values = mergeSelectValues(selectField.Values, additions)
	return app.Save(collection)
}
