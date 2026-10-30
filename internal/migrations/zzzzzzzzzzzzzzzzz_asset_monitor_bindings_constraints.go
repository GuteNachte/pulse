package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-21 统一接入约束：同一资产只能有一条 provider 记录；
// 资产删除前必须先删除监控目标，因此 systems.asset 不再级联删除。
func init() {
	m.Register(func(app core.App) error {
		if err := ensureMonitorAssetUniqueness(app); err != nil {
			return err
		}
		if err := disableSystemsAssetCascade(app); err != nil {
			return err
		}
		if err := backfillAssetMonitorBindings(app); err != nil {
			return err
		}
		return nil
	}, func(app core.App) error {
		restoreSystemsAssetCascade(app)
		collection, err := app.FindCollectionByNameOrId("systems")
		if err == nil {
			collection.Indexes = removeIndex(collection.Indexes, "idx_systems_asset_unique")
			_ = app.Save(collection)
		}
		collection, err = app.FindCollectionByNameOrId("website_monitors")
		if err == nil {
			collection.Indexes = removeIndex(collection.Indexes, "idx_website_monitors_asset_unique")
			_ = app.Save(collection)
		}
		return nil
	})
}
