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
		values := appendMissingSelectValues(selectField.Values, "start_container_stack", "stop_container_stack", "restart_container_stack")
		selectField.Values = values
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
		selectField.Values = removeSelectValues(selectField.Values, "start_container_stack", "stop_container_stack", "restart_container_stack")
		return app.Save(collection)
	})
}

func appendMissingSelectValues(values []string, additions ...string) []string {
	seen := make(map[string]struct{}, len(values)+len(additions))
	out := make([]string, 0, len(values)+len(additions))
	for _, value := range values {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	for _, value := range additions {
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func removeSelectValues(values []string, removals ...string) []string {
	remove := make(map[string]struct{}, len(removals))
	for _, value := range removals {
		remove[value] = struct{}{}
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		if _, ok := remove[value]; ok {
			continue
		}
		out = append(out, value)
	}
	return out
}
