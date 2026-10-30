package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("role") == nil {
			return nil
		}
		_, err = app.DB().NewQuery(`
			UPDATE systems
			SET role = 'physical'
			WHERE trim(coalesce(role, '')) = ''
				OR role IN ('server', 'workstation', 'nas', 'mini_pc', 'laptop', 'router_gateway', 'custom')
		`).Execute()
		return err
	}, func(app core.App) error {
		return nil
	})
}
