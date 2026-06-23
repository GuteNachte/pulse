package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("containers")
		if err != nil {
			return err
		}
		for _, name := range []string{"stack_project", "stack_service", "stack_number", "stack_config", "stack_working_dir"} {
			if collection.Fields.GetByName(name) == nil {
				collection.Fields.Add(&core.TextField{Name: name})
			}
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("containers")
		if err != nil {
			return err
		}
		for _, name := range []string{"stack_project", "stack_service", "stack_number", "stack_config", "stack_working_dir"} {
			if field := collection.Fields.GetByName(name); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}
		return app.Save(collection)
	})
}
