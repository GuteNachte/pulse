package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("smart_devices")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("media_type") == nil {
			collection.Fields.Add(&core.TextField{
				Name: "media_type",
				Max:  32,
			})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("smart_devices")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("media_type"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
