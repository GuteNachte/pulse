package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		for _, collectionName := range []string{"software_monitor_rules", "monitored_software"} {
			collection, err := app.FindCollectionByNameOrId(collectionName)
			if err != nil {
				continue
			}
			if field := collection.Fields.GetByName("launch_command"); field != nil {
				collection.Fields.RemoveById(field.GetId())
				if err := app.Save(collection); err != nil {
					return err
				}
			}
		}
		return nil
	}, nil)
}
