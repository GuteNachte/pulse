package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Global module settings use an empty optional user relation. Existing
// user-scoped records are intentionally preserved as a compatibility fallback.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("module_settings")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("user"); field != nil {
			if relation, ok := field.(*core.RelationField); ok {
				relation.Required = false
			}
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("module_settings")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("user"); field != nil {
			if relation, ok := field.(*core.RelationField); ok {
				relation.Required = true
			}
		}
		return app.Save(collection)
	})
}
