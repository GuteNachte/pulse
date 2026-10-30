package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "alertpolicies01",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "alert_policies",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation3928514475","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"name","presentable":false,"required":true,"system":false,"type":"select","values":["Status","CPU","Memory","Disk","Temperature","Bandwidth","GPU","LoadAvg1","LoadAvg5","LoadAvg15","Battery"]},
			{"hidden":false,"id":"number2744374011","max":null,"min":null,"name":"value","onlyInt":false,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"number1900231140","max":60,"min":1,"name":"min","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_alert_policies_user_name` + "`" + ` ON ` + "`" + `alert_policies` + "`" + ` (` + "`" + `user` + "`" + `, ` + "`" + `name` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
