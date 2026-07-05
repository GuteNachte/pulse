package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "netdevs000001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "network_devices",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":120,"min":0,"name":"name","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"type","presentable":false,"required":true,"system":false,"type":"select","values":["internet","gateway","router","switch","ap","custom"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":160,"min":0,"name":"model","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":128,"min":0,"name":"management_ip","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":160,"min":0,"name":"role","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895708","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_network_devices_user` + "`" + ` ON ` + "`" + `network_devices` + "`" + ` (` + "`" + `user` + "`" + `)"
		]
	},
	{
		"id": "netports00001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "network_ports",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"netdevs000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"device","presentable":false,"required":false,"system":false,"type":"relation"},
			{"cascadeDelete":false,"collectionId":"2hz5ncl8tizk5nx","hidden":false,"id":"relation3377271180","maxSelect":1,"minSelect":0,"name":"system","presentable":false,"required":false,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":120,"min":0,"name":"name","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"type","presentable":false,"required":true,"system":false,"type":"select","values":["wan","lan","wifi","uplink","downlink","management","system","custom"]},
			{"hidden":false,"id":"number2744374011","max":1000000,"min":0,"name":"speed_mbps","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895708","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_network_ports_user` + "`" + ` ON ` + "`" + `network_ports` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_network_ports_device` + "`" + ` ON ` + "`" + `network_ports` + "`" + ` (` + "`" + `device` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_network_ports_system` + "`" + ` ON ` + "`" + `network_ports` + "`" + ` (` + "`" + `system` + "`" + `)"
		]
	},
	{
		"id": "netlinks00001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "network_links",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"netports00001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"source_port","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"netports00001","hidden":false,"id":"relation3377271180","maxSelect":1,"minSelect":0,"name":"target_port","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["ethernet","wifi","internet","custom"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":160,"min":0,"name":"name","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895708","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_network_links_user` + "`" + ` ON ` + "`" + `network_links` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_network_links_source` + "`" + ` ON ` + "`" + `network_links` + "`" + ` (` + "`" + `source_port` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_network_links_target` + "`" + ` ON ` + "`" + `network_links` + "`" + ` (` + "`" + `target_port` + "`" + `)"
		]
	},
	{
		"id": "netlayout0001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "network_layouts",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":80,"min":0,"name":"key","pattern":"","presentable":false,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"layout","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE UNIQUE INDEX ` + "`" + `idx_network_layouts_user_key` + "`" + ` ON ` + "`" + `network_layouts` + "`" + ` (` + "`" + `user` + "`" + `, ` + "`" + `key` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
