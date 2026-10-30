package migrations

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("system_wol_configs")
		if err != nil {
			return nil
		}
		return app.Delete(collection)
	}, func(app core.App) error {
		return errors.New("system_wol_configs collection removal cannot be automatically reverted")
	})
}
