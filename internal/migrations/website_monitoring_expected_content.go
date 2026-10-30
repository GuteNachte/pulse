package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("expected_content") == nil {
			collection.Fields.Add(&core.TextField{Name: "expected_content", Max: 512})
			return app.Save(collection)
		}
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("expected_content"); field != nil {
			collection.Fields.RemoveById(field.GetId())
			return app.Save(collection)
		}
		return nil
	})
}
