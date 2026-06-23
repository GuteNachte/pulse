package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		for _, item := range []struct {
			collection string
			field      string
		}{
			{collection: "fingerprints", field: "token"},
			{collection: "universal_tokens", field: "token"},
		} {
			if err := setFieldHidden(app, item.collection, item.field, true); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		for _, item := range []struct {
			collection string
			field      string
		}{
			{collection: "fingerprints", field: "token"},
			{collection: "universal_tokens", field: "token"},
		} {
			if err := setFieldHidden(app, item.collection, item.field, false); err != nil {
				return err
			}
		}
		return nil
	})
}

func setFieldHidden(app core.App, collectionName string, fieldName string, hidden bool) error {
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		return err
	}
	field := collection.Fields.GetByName(fieldName)
	if field == nil {
		return nil
	}
	if field.GetHidden() == hidden {
		return nil
	}
	field.SetHidden(hidden)
	return app.Save(collection)
}
