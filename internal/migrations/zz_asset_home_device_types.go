package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

var homeDeviceAssetTypes = []string{
	"ups",
	"game_console",
	"handheld",
	"ebook",
	"wearable",
	"tv",
	"speaker",
	"smarthome_gateway",
	"sensor",
	"light",
	"plug",
	"lock",
	"vacuum",
}

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("assets")
		if err != nil {
			return err
		}
		field := collection.Fields.GetByName("type")
		selectField, ok := field.(*core.SelectField)
		if !ok {
			return nil
		}
		selectField.Values = appendMissingSelectValues(selectField.Values, homeDeviceAssetTypes...)
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("assets")
		if err != nil {
			return err
		}
		field := collection.Fields.GetByName("type")
		selectField, ok := field.(*core.SelectField)
		if !ok {
			return nil
		}
		selectField.Values = removeSelectValues(selectField.Values, homeDeviceAssetTypes...)
		return app.Save(collection)
	})
}
