package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "monitoredsvc001",
		"listRule": "@request.auth.id != \"\" && system.users.id ?= @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && system.users.id ?= @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "monitored_services",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"2hz5ncl8tizk5nx","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"system","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"platform","presentable":false,"required":true,"system":false,"type":"select","values":["windows","linux","darwin","android"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":0,"min":0,"name":"name","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"display_name","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number2744374011","max":6,"min":0,"name":"state","onlyInt":true,"presentable":false,"required":true,"system":false,"type":"number"},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925876","max":0,"min":0,"name":"start_type","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number1900231140","max":0,"min":0,"name":"updated","onlyInt":true,"presentable":false,"required":true,"system":false,"type":"number"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_monitored_services_system` + "`" + ` ON ` + "`" + `monitored_services` + "`" + ` (` + "`" + `system` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_monitored_services_updated` + "`" + ` ON ` + "`" + `monitored_services` + "`" + ` (` + "`" + `updated` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
