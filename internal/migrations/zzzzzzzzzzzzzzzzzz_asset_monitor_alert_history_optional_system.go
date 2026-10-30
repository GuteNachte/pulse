package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// 2026-10-21 网站监控允许只绑定资产、不绑定宿主机器；此时告警历史必须允许 system 为空，
// 否则 createWebsiteMonitorAlertHistory 无法写入资产级告警。
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("alerts_history")
		if err != nil {
			return nil
		}
		field, ok := collection.Fields.GetByName("system").(*core.RelationField)
		if !ok || !field.Required {
			return nil
		}
		field.Required = false
		return app.Save(collection)
	}, func(app core.App) error {
		return nil
	})
}
