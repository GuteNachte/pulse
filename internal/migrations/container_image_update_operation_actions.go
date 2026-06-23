package migrations

import (
	"database/sql"
	"errors"

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
		field := collection.Fields.GetByName("action")
		selectField, ok := field.(*core.SelectField)
		if !ok || selectField == nil {
			return nil
		}
		selectField.Values = appendMissingSelectValues(selectField.Values, "update_container_image", "update_container_stack_images")
		ensureOperationTimeoutMax(collection, 600)
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("operation_actions")
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return nil
			}
			return err
		}
		field := collection.Fields.GetByName("action")
		selectField, ok := field.(*core.SelectField)
		if !ok || selectField == nil {
			return nil
		}
		selectField.Values = removeSelectValues(selectField.Values, "update_container_image", "update_container_stack_images")
		ensureOperationTimeoutMax(collection, 300)
		return app.Save(collection)
	})
}

func ensureOperationTimeoutMax(collection *core.Collection, value float64) {
	field := collection.Fields.GetByName("timeout_seconds")
	numberField, ok := field.(*core.NumberField)
	if !ok || numberField == nil {
		return
	}
	numberField.Max = &value
}
