package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Agent onboarding is pairing-only. Per-machine credentials remain in
// fingerprints and are never exposed as a user-managed token system.
func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("universal_tokens")
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		return app.Delete(collection)
	}, func(app core.App) error {
		return nil
	})
}
