package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "agentreleases01",
		"listRule": "@request.auth.id != \"\"",
		"viewRule": "@request.auth.id != \"\"",
		"createRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"updateRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"deleteRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"name": "agent_releases",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":64,"min":0,"name":"version","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"channel","presentable":false,"required":true,"system":false,"type":"select","values":["stable","beta","dev"]},
			{"hidden":false,"id":"select3616895705","maxSelect":1,"name":"platform","presentable":false,"required":true,"system":false,"type":"select","values":["all","windows","linux","darwin","android","freebsd"]},
			{"autogeneratePattern":"","hidden":false,"id":"text2744374011","max":64,"min":0,"name":"arch","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925876","max":0,"min":0,"name":"download_url","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1900231140","max":256,"min":0,"name":"checksum","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925877","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"bool1900231141","name":"enabled","presentable":false,"required":false,"system":false,"type":"bool"},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925878","max":0,"min":0,"name":"disabled_reason","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_agent_releases_unique` + "`" + ` ON ` + "`" + `agent_releases` + "`" + ` (` + "`" + `version` + "`" + `, ` + "`" + `channel` + "`" + `, ` + "`" + `platform` + "`" + `, ` + "`" + `arch` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_agent_releases_enabled` + "`" + ` ON ` + "`" + `agent_releases` + "`" + ` (` + "`" + `enabled` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
