package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// AI image agent task records use kind=image_agent, but the original ai_tasks
// select only allowed asset_enrichment/asset_visual. Add the value so saving the
// task record no longer fails with a 500 after a successful image search.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("ai_tasks")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if !ensureSelectFieldValue(collection, "kind", "image_agent") {
			return nil
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("ai_tasks")
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
			if value != "image_agent" {
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
