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
		if collection.Fields.GetByName("pairing_confirmed") == nil {
			collection.Fields.Add(&core.BoolField{Name: "pairing_confirmed"})
		}
		if err := app.Save(collection); err != nil {
			return err
		}
		_, err = app.DB().NewQuery(`
			UPDATE systems
			SET pairing_confirmed = true
			WHERE pairing_confirmed = false
		`).Execute()
		return err
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("pairing_confirmed"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
