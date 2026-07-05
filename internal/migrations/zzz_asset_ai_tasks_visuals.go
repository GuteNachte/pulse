package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "assetaitasks01",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "ai_tasks",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":false,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["asset_enrichment","asset_visual"]},
			{"hidden":false,"id":"select2844932857","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["queued","running","ready","failed","applied"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":80,"min":0,"name":"provider","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":120,"min":0,"name":"model","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"input_summary","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"json832282225","maxSize":2000000,"name":"output_summary","presentable":false,"required":false,"system":false,"type":"json"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":0,"min":0,"name":"error","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282226","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_ai_tasks_user` + "`" + ` ON ` + "`" + `ai_tasks` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_ai_tasks_asset` + "`" + ` ON ` + "`" + `ai_tasks` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_ai_tasks_status` + "`" + ` ON ` + "`" + `ai_tasks` + "`" + ` (` + "`" + `status` + "`" + `)"
		]
	},
	{
		"id": "assetvisuals01",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "asset_visuals",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":false,"collectionId":"assetaitasks01","hidden":false,"id":"relation3377271180","maxSelect":1,"minSelect":0,"name":"task","presentable":false,"required":false,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["official_reference","ai_turntable","manual"]},
			{"hidden":false,"id":"select2844932857","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["draft","ready","accepted","rejected","failed"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":160,"min":0,"name":"title","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":80,"min":0,"name":"color","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number2744374011","max":24,"min":0,"name":"frame_count","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"bool2239755522","name":"primary","presentable":false,"required":false,"system":false,"type":"bool"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"frames","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"json832282225","maxSize":2000000,"name":"sources","presentable":false,"required":false,"system":false,"type":"json"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":0,"min":0,"name":"prompt","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282226","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_visuals_user` + "`" + ` ON ` + "`" + `asset_visuals` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_visuals_asset` + "`" + ` ON ` + "`" + `asset_visuals` + "`" + ` (` + "`" + `asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_visuals_status` + "`" + ` ON ` + "`" + `asset_visuals` + "`" + ` (` + "`" + `status` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
