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
		if collection.Fields.GetByName("cpu_frequency_mhz") == nil {
			collection.Fields.Add(&core.NumberField{
				Name: "cpu_frequency_mhz",
				Min:  nil,
			})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("system_details")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("cpu_frequency_mhz"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
