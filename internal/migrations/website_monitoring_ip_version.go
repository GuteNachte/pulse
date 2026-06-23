package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitor_checks")
		if err != nil {
			return nil
		}
		if collection.Fields.GetByName("ip_version") == nil {
			collection.Fields.Add(&core.TextField{Name: "ip_version"})
			return app.Save(collection)
		}
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitor_checks")
		if err != nil {
			return nil
		}
		if field := collection.Fields.GetByName("ip_version"); field != nil {
			collection.Fields.RemoveById(field.GetId())
			return app.Save(collection)
		}
		return nil
	})
}
