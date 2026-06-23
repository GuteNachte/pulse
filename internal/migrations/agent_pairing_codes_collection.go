package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "agentpaircodes",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"name": "agent_pairing_codes",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text2744374011","max":16,"min":6,"name":"code","pattern":"^[0-9A-Z-]+$","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"date2744374012","max":"","min":"","name":"expires_at","presentable":false,"required":true,"system":false,"type":"date"},
			{"hidden":false,"id":"bool2744374013","name":"used","presentable":false,"required":false,"system":false,"type":"bool"},
			{"cascadeDelete":true,"collectionId":"2hz5ncl8tizk5nx","hidden":false,"id":"relation2744374014","maxSelect":1,"minSelect":0,"name":"system","presentable":false,"required":false,"system":false,"type":"relation"},
			{"hidden":false,"id":"date2744374015","max":"","min":"","name":"used_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"autogeneratePattern":"","hidden":false,"id":"text2744374016","max":128,"min":0,"name":"used_by","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text2744374017","max":64,"min":0,"name":"expected_ip","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_agent_pairing_codes_code` + "`" + ` ON ` + "`" + `agent_pairing_codes` + "`" + ` (` + "`" + `code` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_agent_pairing_codes_user` + "`" + ` ON ` + "`" + `agent_pairing_codes` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_agent_pairing_codes_expires` + "`" + ` ON ` + "`" + `agent_pairing_codes` + "`" + ` (` + "`" + `expires_at` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
