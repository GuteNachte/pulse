package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "webmonitors001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "website_monitors",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":0,"min":0,"name":"name","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":0,"min":0,"name":"description","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"url","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":0,"min":0,"name":"internal_url","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895708","max":0,"min":0,"name":"external_url","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895712","max":0,"min":0,"name":"targets","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895713","max":512,"min":0,"name":"expected_content","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895709","max":0,"min":0,"name":"icon_url","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925876","max":0,"min":0,"name":"group","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number2744374011","max":3600,"min":60,"name":"interval_seconds","onlyInt":true,"presentable":false,"required":true,"system":false,"type":"number"},
			{"hidden":false,"id":"number2744374012","max":60,"min":1,"name":"timeout_seconds","onlyInt":true,"presentable":false,"required":true,"system":false,"type":"number"},
			{"hidden":false,"id":"bool1900231140","name":"enabled","presentable":false,"required":false,"system":false,"type":"bool"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"last_status","presentable":false,"required":false,"system":false,"type":"select","values":["unknown","up","down"]},
			{"hidden":false,"id":"number1900231141","max":599,"min":0,"name":"last_status_code","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"number1900231142","max":null,"min":0,"name":"last_latency_ms","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384327","max":0,"min":0,"name":"last_error","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384329","max":32,"min":0,"name":"last_failure_category","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"date1579384328","max":"","min":"","name":"last_checked","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"number1900231143","max":100,"min":0,"name":"uptime_24h","onlyInt":false,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_website_monitors_user` + "`" + ` ON ` + "`" + `website_monitors` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_website_monitors_enabled` + "`" + ` ON ` + "`" + `website_monitors` + "`" + ` (` + "`" + `enabled` + "`" + `)"
		]
	},
	{
		"id": "webchecks001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "website_monitor_checks",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"webmonitors001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"monitor","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text2844932857","max":0,"min":0,"name":"target","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895710","max":0,"min":0,"name":"url","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895711","max":0,"min":0,"name":"ip_version","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["up","down"]},
			{"hidden":false,"id":"number1900231141","max":599,"min":0,"name":"status_code","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"number1900231142","max":null,"min":0,"name":"latency_ms","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384327","max":0,"min":0,"name":"error","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384329","max":32,"min":0,"name":"failure_category","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_website_checks_monitor_created` + "`" + ` ON ` + "`" + `website_monitor_checks` + "`" + ` (` + "`" + `monitor` + "`" + `, ` + "`" + `created` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_website_checks_user_created` + "`" + ` ON ` + "`" + `website_monitor_checks` + "`" + ` (` + "`" + `user` + "`" + `, ` + "`" + `created` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
