package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return err
		}
		if collection.Fields.GetByName("system") == nil {
			collection.Fields.Add(&core.RelationField{
				Name:         "system",
				CollectionId: "2hz5ncl8tizk5nx",
				MaxSelect:    1,
			})
		}
		if !hasWebsiteMonitorSystemIndex(collection.Indexes) {
			collection.Indexes = append(collection.Indexes, "CREATE INDEX `idx_website_monitors_system` ON `website_monitors` (`system`)")
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return err
		}
		if field := collection.Fields.GetByName("system"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		indexes := collection.Indexes[:0]
		for _, index := range collection.Indexes {
			if index != "CREATE INDEX `idx_website_monitors_system` ON `website_monitors` (`system`)" {
				indexes = append(indexes, index)
			}
		}
		collection.Indexes = indexes
		return app.Save(collection)
	})
}

func hasWebsiteMonitorSystemIndex(indexes []string) bool {
	for _, index := range indexes {
		if index == "CREATE INDEX `idx_website_monitors_system` ON `website_monitors` (`system`)" {
			return true
		}
	}
	return false
}
