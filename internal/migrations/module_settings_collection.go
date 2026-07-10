package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "moduleset0001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": null,
		"name": "module_settings",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":80,"min":0,"name":"module_id","pattern":"^[a-z0-9-]+$","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"bool2239755522","name":"enabled","presentable":false,"required":false,"system":false,"type":"bool"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"settings","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"json832282225","maxSize":2000000,"name":"health","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_module_settings_user_module` + "`" + ` ON ` + "`" + `module_settings` + "`" + ` (` + "`" + `user` + "`" + `, ` + "`" + `module_id` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
