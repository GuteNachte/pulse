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
		if collection.Fields.GetByName("cpu_vendor") == nil {
			collection.Fields.Add(&core.TextField{
				Name: "cpu_vendor",
				Max:  64,
			})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("system_details")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("cpu_vendor"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
