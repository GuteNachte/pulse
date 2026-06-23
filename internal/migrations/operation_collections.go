package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "opactions000001",
		"listRule": "@request.auth.id != \"\" && system.users.id ?= @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && system.users.id ?= @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "operation_actions",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"2hz5ncl8tizk5nx","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"system","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":false,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"action","presentable":false,"required":true,"system":false,"type":"select","values":["refresh_services","start_monitored_service","stop_monitored_service","restart_monitored_service","start_container","stop_container","restart_container","update_container_image","start_container_stack","stop_container_stack","restart_container_stack","update_container_stack_images","update_agent"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":0,"min":0,"name":"target","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json3616895705","maxSize":2000000,"name":"params","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"select2744374011","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["pending","running","succeeded","failed"]},
			{"hidden":false,"id":"select1604732516","maxSelect":1,"name":"stage","presentable":false,"required":false,"system":false,"type":"select","values":["queued","validating","executing","completed"]},
			{"hidden":false,"id":"select1408625456","maxSelect":1,"name":"failure_code","presentable":false,"required":false,"system":false,"type":"select","values":["offline","agent_disconnected","timeout","protected","unsupported","denied","invalid_request","not_found","failed"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925876","max":0,"min":0,"name":"result","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1900231140","max":0,"min":0,"name":"error","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number3589068740","max":600,"min":1,"name":"timeout_seconds","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"date2421235361","max":"","min":"","name":"started_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date3437794982","max":"","min":"","name":"completed_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"number4065851497","max":null,"min":0,"name":"duration_ms","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_operation_actions_system` + "`" + ` ON ` + "`" + `operation_actions` + "`" + ` (` + "`" + `system` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_operation_actions_status` + "`" + ` ON ` + "`" + `operation_actions` + "`" + ` (` + "`" + `status` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_operation_actions_stage` + "`" + ` ON ` + "`" + `operation_actions` + "`" + ` (` + "`" + `stage` + "`" + `)"
		]
	},
	{
		"id": "scripts00000001",
		"listRule": "@request.auth.id != \"\"",
		"viewRule": "@request.auth.id != \"\"",
		"createRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"updateRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"deleteRule": "@request.auth.id != \"\" && @request.auth.role = \"admin\"",
		"name": "script_templates",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":0,"min":0,"name":"name","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"platform","presentable":false,"required":true,"system":false,"type":"select","values":["all","linux","windows","darwin","android"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"body","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"json2744374011","maxSize":2000000,"name":"params_schema","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"number3051925876","max":300,"min":1,"name":"timeout_seconds","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"bool1900231140","name":"enabled","presentable":false,"required":false,"system":false,"type":"bool"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_script_templates_enabled` + "`" + ` ON ` + "`" + `script_templates` + "`" + ` (` + "`" + `enabled` + "`" + `)"
		]
	},
	{
		"id": "opaudit00000001",
		"listRule": "@request.auth.id != \"\" && (system = \"\" || system.users.id ?= @request.auth.id)",
		"viewRule": "@request.auth.id != \"\" && (system = \"\" || system.users.id ?= @request.auth.id)",
		"createRule": null,
		"updateRule": null,
		"deleteRule": null,
		"name": "operation_audit",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":false,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":false,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"2hz5ncl8tizk5nx","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"system","presentable":false,"required":false,"system":false,"type":"relation"},
			{"cascadeDelete":false,"collectionId":"opactions000001","hidden":false,"id":"relation1303255574","maxSelect":1,"minSelect":0,"name":"operation","presentable":false,"required":false,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":0,"min":0,"name":"action","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"target","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"select2744374011","maxSelect":1,"name":"result","presentable":false,"required":true,"system":false,"type":"select","values":["success","failed"]},
			{"hidden":false,"id":"select2408625456","maxSelect":1,"name":"failure_code","presentable":false,"required":false,"system":false,"type":"select","values":["offline","agent_disconnected","timeout","protected","unsupported","denied","invalid_request","not_found","failed"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925876","max":0,"min":0,"name":"detail","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1900231140","max":0,"min":0,"name":"ip","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_operation_audit_system` + "`" + ` ON ` + "`" + `operation_audit` + "`" + ` (` + "`" + `system` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_operation_audit_operation` + "`" + ` ON ` + "`" + `operation_audit` + "`" + ` (` + "`" + `operation` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_operation_audit_created` + "`" + ` ON ` + "`" + `operation_audit` + "`" + ` (` + "`" + `created` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
