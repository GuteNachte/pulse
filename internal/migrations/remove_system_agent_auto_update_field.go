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
		field := collection.Fields.GetByName("agent_auto_update")
		if field == nil {
			return nil
		}
		collection.Fields.RemoveById(field.GetId())
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("agent_auto_update") == nil {
			collection.Fields.Add(&core.BoolField{Name: "agent_auto_update"})
		}
		return app.Save(collection)
	})
}
