package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_visuals")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if !ensureAssetVisualFileLimit(collection, 15) {
			return nil
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("asset_visuals")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if !ensureAssetVisualFileLimit(collection, 10) {
			return nil
		}
		return app.Save(collection)
	})
}

func ensureAssetVisualFileLimit(collection *core.Collection, maxSelect int) bool {
	field, ok := collection.Fields.GetByName("files").(*core.FileField)
	if !ok || field == nil || maxSelect <= 0 || field.MaxSelect == maxSelect {
		return false
	}
	field.MaxSelect = maxSelect
	return true
}
