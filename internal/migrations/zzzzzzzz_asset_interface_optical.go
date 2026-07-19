package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_interfaces")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if !ensureSelectFieldValue(collection, "kind", "optical") {
			return nil
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_interfaces")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		field, ok := collection.Fields.GetByName("kind").(*core.SelectField)
		if !ok || field == nil {
			return nil
		}
		values := make([]string, 0, len(field.Values))
		for _, value := range field.Values {
			if value != "optical" {
				values = append(values, value)
			}
		}
		if len(values) == len(field.Values) {
			return nil
		}
		field.Values = values
		return app.Save(collection)
	})
}
