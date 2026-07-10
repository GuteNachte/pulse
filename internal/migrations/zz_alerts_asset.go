package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		assets, err := app.FindCollectionByNameOrId("assets")
		if err != nil {
			return err
		}
		return addAssetRelationField(app, "alerts", assets.Id, false)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("alerts")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("asset"); field != nil {
			collection.Fields.RemoveById(field.GetId())
			return app.Save(collection)
		}
		return nil
	})
}
