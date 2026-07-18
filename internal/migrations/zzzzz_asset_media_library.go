package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("asset_media"); err == nil {
			return nil
		}
		return app.ImportCollectionsByMarshaledJSON([]byte(assetMediaCollectionsJSON), false)
	}, func(app core.App) error {
		for _, name := range []string{"asset_media_placements", "asset_media_versions", "asset_media"} {
			if collection, err := app.FindCollectionByNameOrId(name); err == nil {
				if err := app.Delete(collection); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

const assetMediaCollectionsJSON = `[
{"id":"assetmedia00001","name":"asset_media","type":"base","listRule":"@request.auth.id != \"\" && user = @request.auth.id","viewRule":"@request.auth.id != \"\" && user = @request.auth.id","createRule":null,"updateRule":null,"deleteRule":null,"fields":[{"name":"user","type":"relation","collectionId":"_pb_users_auth_","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"asset","type":"relation","collectionId":"assets000000001","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"source_kind","type":"select","required":true,"maxSelect":1,"values":["search","upload","url_import","legacy_visual","edit"]},{"name":"source_url","type":"text","max":0},{"name":"source_title","type":"text","max":160},{"name":"source_provider","type":"text","max":80},{"name":"content_hash","type":"text","max":64},{"name":"state","type":"select","required":true,"maxSelect":1,"values":["candidate","library","archived","deleted"]},{"name":"active_version","type":"relation","collectionId":"assetmediav0001","maxSelect":1},{"name":"metadata","type":"json","maxSize":2000000}],"indexes":["CREATE INDEX idx_asset_media_asset ON asset_media (asset)","CREATE INDEX idx_asset_media_hash ON asset_media (asset, content_hash)" ]},
{"id":"assetmediav0001","name":"asset_media_versions","type":"base","listRule":"@request.auth.id != \"\" && user = @request.auth.id","viewRule":"@request.auth.id != \"\" && user = @request.auth.id","createRule":null,"updateRule":null,"deleteRule":null,"fields":[{"name":"user","type":"relation","collectionId":"_pb_users_auth_","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"asset","type":"relation","collectionId":"assets000000001","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"media","type":"relation","collectionId":"assetmedia00001","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"parent_version","type":"relation","collectionId":"assetmediav0001","maxSelect":1},{"name":"kind","type":"select","required":true,"maxSelect":1,"values":["original","render"]},{"name":"object_key","type":"text","required":true,"max":255},{"name":"thumbnail_keys","type":"json","maxSize":2000000},{"name":"mime_type","type":"text","max":80},{"name":"width","type":"number","onlyInt":true},{"name":"height","type":"number","onlyInt":true},{"name":"bytes","type":"number","onlyInt":true},{"name":"recipe","type":"json","maxSize":2000000},{"name":"label","type":"text","max":120}]},
{"id":"assetmediap0001","name":"asset_media_placements","type":"base","listRule":"@request.auth.id != \"\" && user = @request.auth.id","viewRule":"@request.auth.id != \"\" && user = @request.auth.id","createRule":null,"updateRule":null,"deleteRule":null,"fields":[{"name":"user","type":"relation","collectionId":"_pb_users_auth_","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"asset","type":"relation","collectionId":"assets000000001","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"media","type":"relation","collectionId":"assetmedia00001","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"version","type":"relation","collectionId":"assetmediav0001","required":true,"maxSelect":1,"cascadeDelete":true},{"name":"role","type":"select","required":true,"maxSelect":1,"values":["cover","gallery"]},{"name":"visible","type":"bool"},{"name":"sort_order","type":"number","onlyInt":true}],"indexes":["CREATE INDEX idx_asset_media_placements_asset ON asset_media_placements (asset, role, sort_order)"]}
]`
