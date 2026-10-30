package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-07 计算设备⑥（docs/pc-asset-design.md 五）：图库相册分组——
// asset_media 新增 album select（whole 整机 + 配件分类同名词）；空 = 未分组（旧数据不动）。
// 配件图自动归组：入库时按上下文带 album（整机/外观=whole，配件图=对应配件分类）。

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_media")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("album") != nil {
			return nil
		}
		collection.Fields.Add(&core.SelectField{
			Id:          "select910258001",
			Name:        "album",
			MaxSelect:   1,
			Values:      []string{"whole", "cpu", "motherboard", "memory", "storage", "gpu", "psu", "case", "cooler", "nic", "other"},
			Presentable: false,
		})
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_media")
		if err != nil {
			return nil
		}
		if collection.Fields.GetByName("album") != nil {
			collection.Fields.RemoveByName("album")
		}
		return app.Save(collection)
	})
}
