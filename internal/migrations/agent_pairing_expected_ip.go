package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("agent_pairing_codes")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("expected_ip") == nil {
			collection.Fields.Add(&core.TextField{
				Name: "expected_ip",
				Max:  64,
			})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("agent_pairing_codes")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("expected_ip"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		return app.Save(collection)
	})
}
