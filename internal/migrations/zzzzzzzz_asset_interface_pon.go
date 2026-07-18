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
		if !ensureSelectFieldValue(collection, "kind", "pon") {
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
			if value != "pon" {
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

func ensureSelectFieldValue(collection *core.Collection, fieldName string, value string) bool {
	field, ok := collection.Fields.GetByName(fieldName).(*core.SelectField)
	if !ok || field == nil || value == "" {
		return false
	}
	for _, existing := range field.Values {
		if existing == value {
			return false
		}
	}
	field.Values = append(field.Values, value)
	return true
}
