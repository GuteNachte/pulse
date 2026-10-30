package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Pairing codes are asset-level credentials and intentionally do not expire.
// Keep the legacy expires_at field for compatibility with existing records,
// but make it optional for newly created records.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("agent_pairing_codes")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("expires_at"); field != nil {
			if dateField, ok := field.(*core.DateField); ok {
				dateField.Required = false
			}
		}
		return app.Save(collection)
	}, func(app core.App) error {
		return nil
	})
}
