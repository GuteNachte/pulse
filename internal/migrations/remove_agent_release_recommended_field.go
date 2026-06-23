package migrations

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("agent_releases")
		if err != nil {
			return nil
		}
		if field := collection.Fields.GetByName("recommended"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		indexes := collection.Indexes[:0]
		for _, index := range collection.Indexes {
			if strings.Contains(index, "idx_agent_releases_recommended") || strings.Contains(index, "`recommended`") {
				continue
			}
			indexes = append(indexes, index)
		}
		collection.Indexes = indexes
		return app.Save(collection)
	}, nil)
}
