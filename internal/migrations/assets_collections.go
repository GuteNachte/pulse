package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		jsonData := `[
	{
		"id": "assets000000001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "assets",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":160,"min":0,"name":"name","pattern":"","presentable":true,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"type","presentable":false,"required":true,"system":false,"type":"select","values":["internet","physical_host","nas","server","mini_pc","router","switch","ap","gateway","ont","firewall","phone","tablet","camera","printer","ups","game_console","handheld","ebook","wearable","tv","speaker","smarthome_gateway","sensor","light","plug","lock","vacuum","iot","web_endpoint","custom"]},
			{"hidden":false,"id":"select2844932857","maxSelect":1,"name":"status","presentable":false,"required":false,"system":false,"type":"select","values":["active","inactive","retired","planned"]},
			{"cascadeDelete":false,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"parent_asset","presentable":false,"required":false,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":160,"min":0,"name":"vendor","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":180,"min":0,"name":"model","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":180,"min":0,"name":"serial_number","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895708","max":160,"min":0,"name":"management_ip","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895709","max":160,"min":0,"name":"location","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895710","max":180,"min":0,"name":"role","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895711","max":0,"min":0,"name":"notes","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"tags","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"json832282225","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_assets_user` + "`" + ` ON ` + "`" + `assets` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_assets_type` + "`" + ` ON ` + "`" + `assets` + "`" + ` (` + "`" + `type` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_assets_parent` + "`" + ` ON ` + "`" + `assets` + "`" + ` (` + "`" + `parent_asset` + "`" + `)"
		]
	},
	{
		"id": "assetif00000001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "asset_interfaces",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":120,"min":0,"name":"name","pattern":"","presentable":true,"primaryKey":false,"required":true,"system":false,"type":"text"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["ethernet","wifi","wan","lan","management","virtual","custom"]},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895705","max":80,"min":0,"name":"mac","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895706","max":500,"min":0,"name":"ipv4","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"autogeneratePattern":"","hidden":false,"id":"text3616895707","max":500,"min":0,"name":"ipv6","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"number2744374011","max":1000000,"min":0,"name":"speed_mbps","onlyInt":true,"presentable":false,"required":false,"system":false,"type":"number"},
			{"hidden":false,"id":"bool2239755522","name":"connected","presentable":false,"required":false,"system":false,"type":"bool"},
			{"hidden":false,"id":"bool2239755523","name":"primary","presentable":false,"required":false,"system":false,"type":"bool"},
			{"hidden":false,"id":"select2844932857","maxSelect":1,"name":"source","presentable":false,"required":false,"system":false,"type":"select","values":["manual","agent","snmp","import"]},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_interfaces_user` + "`" + ` ON ` + "`" + `asset_interfaces` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_interfaces_asset` + "`" + ` ON ` + "`" + `asset_interfaces` + "`" + ` (` + "`" + `asset` + "`" + `)"
		]
	},
	{
		"id": "assetrel0000001",
		"listRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"viewRule": "@request.auth.id != \"\" && user = @request.auth.id",
		"createRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"updateRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"deleteRule": "@request.auth.id != \"\" && user = @request.auth.id && @request.auth.role != \"readonly\"",
		"name": "asset_relations",
		"type": "base",
		"system": false,
		"fields": [
			{"autogeneratePattern":"[a-z0-9]{15}","hidden":false,"id":"text3208210256","max":15,"min":15,"name":"id","pattern":"^[a-z0-9]+$","presentable":false,"primaryKey":true,"required":true,"system":true,"type":"text"},
			{"cascadeDelete":true,"collectionId":"_pb_users_auth_","hidden":false,"id":"relation2375276105","maxSelect":1,"minSelect":0,"name":"user","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271179","maxSelect":1,"minSelect":0,"name":"source_asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"cascadeDelete":true,"collectionId":"assets000000001","hidden":false,"id":"relation3377271180","maxSelect":1,"minSelect":0,"name":"target_asset","presentable":false,"required":true,"system":false,"type":"relation"},
			{"hidden":false,"id":"select2844932856","maxSelect":1,"name":"kind","presentable":false,"required":true,"system":false,"type":"select","values":["hosted_on","connected_to","monitors","depends_on","owns","located_in","powered_by","custom"]},
			{"autogeneratePattern":"","hidden":false,"id":"text1579384326","max":160,"min":0,"name":"label","pattern":"","presentable":false,"primaryKey":false,"required":false,"system":false,"type":"text"},
			{"hidden":false,"id":"json832282224","maxSize":2000000,"name":"metadata","presentable":false,"required":false,"system":false,"type":"json"},
			{"hidden":false,"id":"autodate2990389176","name":"created","onCreate":true,"onUpdate":false,"presentable":false,"system":false,"type":"autodate"},
			{"hidden":false,"id":"autodate3332085495","name":"updated","onCreate":true,"onUpdate":true,"presentable":false,"system":false,"type":"autodate"}
		],
		"indexes": [
			"CREATE INDEX ` + "`" + `idx_asset_relations_user` + "`" + ` ON ` + "`" + `asset_relations` + "`" + ` (` + "`" + `user` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_relations_source` + "`" + ` ON ` + "`" + `asset_relations` + "`" + ` (` + "`" + `source_asset` + "`" + `)",
			"CREATE INDEX ` + "`" + `idx_asset_relations_target` + "`" + ` ON ` + "`" + `asset_relations` + "`" + ` (` + "`" + `target_asset` + "`" + `)"
		]
	}
]`
		return app.ImportCollectionsByMarshaledJSON([]byte(jsonData), false)
	}, nil)
}
