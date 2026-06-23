package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("system_details")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("container_runtime_name") == nil {
			collection.Fields.Add(&core.TextField{
				Name: "container_runtime_name",
			})
		}
		if collection.Fields.GetByName("container_runtime_version") == nil {
			collection.Fields.Add(&core.TextField{
				Name: "container_runtime_version",
			})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("system_details")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("container_runtime_name"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		if field := collection.Fields.GetByName("container_runtime_version"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
