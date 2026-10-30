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
		if collection.Fields.GetByName("network_interfaces") == nil {
			collection.Fields.Add(&core.JSONField{
				Name:    "network_interfaces",
				MaxSize: 200000,
			})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("system_details")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("network_interfaces"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
