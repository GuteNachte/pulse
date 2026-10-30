package migrations

import (
	"database/sql"
	"errors"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("operation_actions")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if collection.Fields.GetByName("stage") == nil {
			collection.Fields.Add(&core.SelectField{
				Name:   "stage",
				Values: []string{"queued", "validating", "executing", "completed"},
			})
		}
		if collection.Fields.GetByName("started_at") == nil {
			collection.Fields.Add(&core.DateField{Name: "started_at"})
		}
		if collection.Fields.GetByName("completed_at") == nil {
			collection.Fields.Add(&core.DateField{Name: "completed_at"})
		}
		if collection.Fields.GetByName("duration_ms") == nil {
			min := float64(0)
			collection.Fields.Add(&core.NumberField{Name: "duration_ms", Min: &min})
		}
		if !hasCollectionIndex(collection.Indexes, "idx_operation_actions_stage") {
			collection.Indexes = append(collection.Indexes, "CREATE INDEX `idx_operation_actions_stage` ON `operation_actions` (`stage`)")
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("operation_actions")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		for _, name := range []string{"stage", "started_at", "completed_at", "duration_ms"} {
			if field := collection.Fields.GetByName(name); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}
		indexes := collection.Indexes[:0]
		for _, index := range collection.Indexes {
			if !hasCollectionIndex([]string{index}, "idx_operation_actions_stage") {
				indexes = append(indexes, index)
			}
		}
		collection.Indexes = indexes
		return app.Save(collection)
	})
}

func hasCollectionIndex(indexes []string, name string) bool {
	for _, index := range indexes {
		if containsIndexName(index, name) {
			return true
		}
	}
	return false
}

func containsIndexName(index string, name string) bool {
	return strings.Contains(index, "`"+name+"`") || strings.Contains(index, " "+name+" ")
}
