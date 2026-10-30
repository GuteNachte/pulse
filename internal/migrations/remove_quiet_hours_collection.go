package migrations

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("quiet_hours")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	}, func(app core.App) error {
		return errors.New("quiet_hours collection removal cannot be automatically reverted")
	})
}
