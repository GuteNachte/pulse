package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("custom_role") == nil {
			collection.Fields.Add(&core.TextField{Name: "custom_role"})
		}
		if collection.Fields.GetByName("description") == nil {
			collection.Fields.Add(&core.TextField{Name: "description"})
		}
		if collection.Fields.GetByName("suppress_offline_alerts") == nil {
			collection.Fields.Add(&core.BoolField{Name: "suppress_offline_alerts"})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		for _, name := range []string{"custom_role", "description", "suppress_offline_alerts"} {
			if field := collection.Fields.GetByName(name); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}
		return app.Save(collection)
	})
}
