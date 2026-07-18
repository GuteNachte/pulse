package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_media")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if !ensureAssetMediaEditSourceKind(collection) {
			return nil
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_media")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		field, ok := collection.Fields.GetByName("source_kind").(*core.SelectField)
		if !ok || field == nil {
			return nil
		}
		field.Values = removeSelectValues(field.Values, "edit")
		return app.Save(collection)
	})
}

func ensureAssetMediaEditSourceKind(collection *core.Collection) bool {
	field, ok := collection.Fields.GetByName("source_kind").(*core.SelectField)
	if !ok || field == nil {
		return false
	}
	previous := len(field.Values)
	field.Values = appendMissingSelectValues(field.Values, "edit")
	return len(field.Values) != previous
}
