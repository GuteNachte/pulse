package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if err := ensureAssetRelationKinds(app); err != nil {
			return err
		}
		if _, err := app.FindCollectionByNameOrId("asset_maintenance"); err == nil {
			return nil
		}
		jsonData := `[
	{
		"id": "assetmaint00001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "asset_maintenance",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["purchase","online","maintenance","repair","upgrade","replacement","warranty","retire","note"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":160,"min":0,"name":"title","pattern":"","presentable":true,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"date1579384328","max":"","min":"","name":"event_date","presentable":false,"required":false,"system":false,"type":"date"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":160,"min":0,"name":"actor","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":160,"min":0,"name":"cost","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_maintenance_user` + "`" + ` ON ` + "`" + `asset_maintenance` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_maintenance_asset` + "`" + ` ON ` + "`" + `asset_maintenance` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_maintenance_event_date` + "`" + ` ON ` + "`" + `asset_maintenance` + "`" + ` (` + "`" + `event_date` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_maintenance")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	})
}

func ensureAssetRelationKinds(app core.App) error {
	collection, err := app.FindCollectionByNameOrId("asset_relations")
	if err != nil {
		return err
	}
	field := collection.Fields.GetByName("kind")
	selectField, ok := field.(*core.SelectField)
	if !ok || selectField == nil {
		return nil
	}
	selectField.Values = mergeSelectValues(selectField.Values, []string{"located_in", "powered_by"})
	return app.Save(collection)
}

func mergeSelectValues(current []string, additions []string) []string {
	seen := make(map[string]bool, len(current)+len(additions))
	merged := make([]string, 0, len(current)+len(additions))
	for _, value := range current {
		if seen[value] {
			continue
		}
		seen[value] = true
		merged = append(merged, value)
	}
	for _, value := range additions {
		if seen[value] {
			continue
		}
		seen[value] = true
		merged = append(merged, value)
	}
	return merged
}
