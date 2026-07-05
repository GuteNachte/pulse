package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "assetenrichrep",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "asset_enrichment_reports",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"trigger","presentable":false,"required":false,"system":false,"type":"select","values":["manual","asset_create","scheduled","import"]},
			{"hidden":false,"id":"select2844932857","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["draft","ready","partially_applied","applied","dismissed","failed"]},
			{"hidden":false,"id":"number2744374011","max":100,"min":0,"name":"confidence","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"report","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"source_summary","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"json832282225","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_enrichment_reports_user` + "`" + ` ON ` + "`" + `asset_enrichment_reports` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_enrichment_reports_asset` + "`" + ` ON ` + "`" + `asset_enrichment_reports` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_enrichment_reports_created` + "`" + ` ON ` + "`" + `asset_enrichment_reports` + "`" + ` (` + "`" + `created` + "`" + `)"
		]
	},
	{
		"id": "assetenrichsug",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "asset_enrichment_suggestions",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assetenrichrep","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"report","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271180","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"target_collection","presentable":false,"required":true,"system":false,"type":"select","values":["assets","asset_interfaces","asset_relations","asset_maintenance","asset_attachments"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":80,"min":0,"name":"target_record","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":160,"min":0,"name":"target_field","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":160,"min":0,"name":"target_label","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895708","max":0,"min":0,"name":"current_value","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895709","max":0,"min":0,"name":"collected_value","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895710","max":0,"min":0,"name":"online_value","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895711","max":0,"min":0,"name":"recommended_value","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932857","maxSelect":1,"name":"source","presentable":false,"required":true,"system":false,"type":"select","values":["local","online","comparison","manual"]},
			{"hidden":false,"id":"number2744374011","max":100,"min":0,"name":"confidence","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"bool2239755522","name":"conflict","presentable":false,"required":false,"system":false,"type":"bool"},
			{"hidden":false,"id":"select2844932858","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["pending","accepted","rejected","stale"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895712","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_enrichment_suggestions_user` + "`" + ` ON ` + "`" + `asset_enrichment_suggestions` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_enrichment_suggestions_asset` + "`" + ` ON ` + "`" + `asset_enrichment_suggestions` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_enrichment_suggestions_report` + "`" + ` ON ` + "`" + `asset_enrichment_suggestions` + "`" + ` (` + "`" + `report` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_enrichment_suggestions_status` + "`" + ` ON ` + "`" + `asset_enrichment_suggestions` + "`" + ` (` + "`" + `status` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
