package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-20 拓扑编辑器按网段拆画布：布局记录增加 canvases 定义。
// nodes 继续保存各画布的节点位置/隐藏/显示设置，旧记录没有 canvasId 时由前端按资产网段归一。
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("network_topology_layouts")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("canvases") != nil {
			return nil
		}
		collection.Fields.Add(&core.JSONField{
			Name:    "canvases",
			MaxSize: 200000,
		})
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("network_topology_layouts")
		if err != nil {
			return nil
		}
		if field := collection.Fields.GetByName("canvases"); field != nil {
			collection.Fields.RemoveById(field.GetId())
			return app.Save(collection)
		}
		return nil
	})
}
