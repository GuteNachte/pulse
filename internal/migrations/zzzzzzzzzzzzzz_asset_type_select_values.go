package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-20 用户把光猫(ont)改成 ONT(smart_ont) 保存失败：
// assets.type 的 select 允许值一直是建表时的旧清单，前端类型固化后新增的
// smart_ont / subscription / domain_name / cloud_host / smart_switch / vm 从未入库，
// PocketBase 直接返回 Invalid value。这里以追加方式补齐，不删除任何历史值。
var assetTypeSelectValues = []string{
	"internet",
	"physical_host",
	"nas",
	"server",
	"mini_pc",
	"router",
	"switch",
	"ap",
	"gateway",
	"ont",
	"smart_ont",
	"subscription",
	"domain_name",
	"cloud_host",
	"firewall",
	"phone",
	"tablet",
	"camera",
	"printer",
	"ups",
	"game_console",
	"handheld",
	"ebook",
	"wearable",
	"tv",
	"speaker",
	"smarthome_gateway",
	"sensor",
	"light",
	"plug",
	"smart_switch",
	"lock",
	"vacuum",
	"iot",
	"vm",
	"web_endpoint",
	"custom",
}

func ensureAssetTypeSelectValues(collection *core.Collection) bool {
	if collection == nil {
		return false
	}
	field, ok := collection.Fields.GetByName("type").(*core.SelectField)
	if !ok || field == nil {
		return false
	}
	values := appendMissingSelectValues(field.Values, assetTypeSelectValues...)
	if len(values) == len(field.Values) {
		return false
	}
	field.Values = values
	return true
}

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("assets")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if !ensureAssetTypeSelectValues(collection) {
			return nil
		}
		return app.Save(collection)
	}, func(app core.App) error {
		// 允许值扩展是向前兼容的；已有记录可能正在使用新增类型，回滚不能把它们变成非法值。
		return nil
	})
}
