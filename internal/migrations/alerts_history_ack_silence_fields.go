package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("alerts_history")
		if err != nil {
			return err
		}

		for _, name := range []string{"acknowledged_at", "silenced_until"} {
			if collection.Fields.GetByName(name) == nil {
				collection.Fields.Add(&core.DateField{Name: name})
			}
		}
		usersCollection, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		for _, name := range []string{"acknowledged_by", "silenced_by"} {
			if collection.Fields.GetByName(name) == nil {
				collection.Fields.Add(&core.RelationField{
					Name:         name,
					CollectionId: usersCollection.Id,
					MaxSelect:    1,
				})
			}
		}
		if collection.Fields.GetByName("silence_reason") == nil {
			collection.Fields.Add(&core.TextField{Name: "silence_reason", Max: 256})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("alerts_history")
		if err != nil {
			return err
		}
		for _, name := range []string{
			"acknowledged_at",
			"acknowledged_by",
			"silenced_until",
			"silenced_by",
			"silence_reason",
		} {
			if field := collection.Fields.GetByName(name); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}
		return app.Save(collection)
	})
}
