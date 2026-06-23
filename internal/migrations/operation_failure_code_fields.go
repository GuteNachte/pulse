package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

var operationFailureCodeValues = []string{
	"offline",
	"agent_disconnected",
	"timeout",
	"protected",
	"unsupported",
	"denied",
	"invalid_request",
	"not_found",
	"failed",
}

func init() {
	m.Register(func(app core.App) error {
		for _, collectionName := range []string{"operation_actions", "operation_audit"} {
			collection, err := app.FindCollectionByNameOrId(collectionName)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					continue
				}
				return err
			}
			if collection.Fields.GetByName("failure_code") == nil {
				collection.Fields.Add(&core.SelectField{
					Name:   "failure_code",
					Values: operationFailureCodeValues,
				})
				if err := app.Save(collection); err != nil {
					return err
				}
			}
		}
		return nil
	}, func(app core.App) error {
		for _, collectionName := range []string{"operation_actions", "operation_audit"} {
			collection, err := app.FindCollectionByNameOrId(collectionName)
			if err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					continue
				}
				return err
			}
			if field := collection.Fields.GetByName("failure_code"); field != nil {
				collection.Fields.RemoveById(field.GetId())
				if err := app.Save(collection); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
