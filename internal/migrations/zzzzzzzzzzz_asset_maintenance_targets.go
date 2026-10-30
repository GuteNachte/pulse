package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-07 计算设备⑤（docs/pc-asset-design.md 六）：维护按对象分层——
// 维护记录新增关联对象：target_kind（asset 整机 / group 硬件组 / component 配件）+ target_ref
// （group=参数分组 id；component=asset_components 记录 id）。旧记录无值按整机（asset）处理。

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_maintenance")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("target_kind") != nil {
			return nil
		}
		collection.Fields.Add(
			&core.SelectField{
				Id:          "select910257001",
				Name:        "target_kind",
				MaxSelect:   1,
				Values:      []string{"asset", "group", "component"},
				Presentable: false,
			},
			&core.TextField{
				Id:   "text910257002",
				Name: "target_ref",
				Max:  40,
			},
		)
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_maintenance")
		if err != nil {
			return nil
		}
		kindField := collection.Fields.GetByName("target_kind")
		if kindField != nil {
			collection.Fields.RemoveByName("target_kind")
		}
		refField := collection.Fields.GetByName("target_ref")
		if refField != nil {
			collection.Fields.RemoveByName("target_ref")
		}
		return app.Save(collection)
	})
}
