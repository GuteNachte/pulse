package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("operation_audit")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		actionCollection, err := app.FindCollectionByNameOrId("operation_actions")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if collection.Fields.GetByName("operation") == nil {
			collection.Fields.Add(&core.RelationField{
				Name:         "operation",
				CollectionId: actionCollection.Id,
				MaxSelect:    1,
			})
		}
		if !hasCollectionIndex(collection.Indexes, "idx_operation_audit_operation") {
			collection.Indexes = append(collection.Indexes, "CREATE INDEX `idx_operation_audit_operation` ON `operation_audit` (`operation`)")
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("operation_audit")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		if field := collection.Fields.GetByName("operation"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		indexes := collection.Indexes[:0]
		for _, index := range collection.Indexes {
			if !hasCollectionIndex([]string{index}, "idx_operation_audit_operation") {
				indexes = append(indexes, index)
			}
		}
		collection.Indexes = indexes
		return app.Save(collection)
	})
}
