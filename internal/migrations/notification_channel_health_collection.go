package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "notifhealth0001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"name": "notification_channel_health",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text2744374011","max":64,"min":64,"name":"fingerprint","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"target","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["unknown","healthy","failed"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":0,"min":0,"name":"last_title","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925876","max":0,"min":0,"name":"last_error","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number1900231140","max":0,"min":0,"name":"success_count","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"number3589068740","max":0,"min":0,"name":"failure_count","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"date1445205182","max":"","min":"","name":"last_checked_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date1205824187","max":"","min":"","name":"last_success_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date1351719312","max":"","min":"","name":"last_failure_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date3895540841","max":"","min":"","name":"last_test_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_notification_channel_health_user_fp` + "`" + ` ON ` + "`" + `notification_channel_health` + "`" + ` (` + "`" + `user` + "`" + `, ` + "`" + `fingerprint` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_notification_channel_health_updated` + "`" + ` ON ` + "`" + `notification_channel_health` + "`" + ` (` + "`" + `updated` + "`" + `)"
		]
	},
	{
		"id": "alertstate00001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": null,
		"updateRule": null,
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"name": "alert_notification_states",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"2hz5ncl8tizk5nx","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"system","presentable":false,"required":false,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text2744374011","max":64,"min":64,"name":"fingerprint","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":0,"min":0,"name":"alert_id","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":0,"min":0,"name":"title","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"status","presentable":false,"required":true,"system":false,"type":"select","values":["sent","failed","suppressed","resolved"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3051925876","max":0,"min":0,"name":"last_error","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number1900231140","max":0,"min":0,"name":"suppressed_count","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"date2445205182","max":"","min":"","name":"last_attempt_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date2205824187","max":"","min":"","name":"last_sent_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date2351719312","max":"","min":"","name":"last_suppressed_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date4895540841","max":"","min":"","name":"next_allowed_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"date5271992756","max":"","min":"","name":"last_resolved_at","presentable":false,"required":false,"system":false,"type":"date"},
			{"hidden":false,"id":"autodate3990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate4332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_alert_notification_states_user_fp` + "`" + ` ON ` + "`" + `alert_notification_states` + "`" + ` (` + "`" + `user` + "`" + `, ` + "`" + `fingerprint` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_alert_notification_states_next_allowed` + "`" + ` ON ` + "`" + `alert_notification_states` + "`" + ` (` + "`" + `next_allowed_at` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
