package migrations

import (
	"database/sql"
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		removedActions := []string{"refresh_systemd", "start_service", "stop_service", "restart_service"}

		if collection, err := app.FindCollectionByNameOrId("operation_actions"); err == nil {
			if _, err := app.DB().NewQuery(
				"DELETE FROM operation_actions WHERE action IN ({:refresh}, {:start}, {:stop}, {:restart})",
			).Bind(map[string]any{
				"refresh": "refresh_systemd",
				"start":   "start_service",
				"stop":    "stop_service",
				"restart": "restart_service",
			}).Execute(); err != nil {
				return err
			}
			if field := collection.Fields.GetByName("action"); field != nil {
				if selectField, ok := field.(*core.SelectField); ok {
					selectField.Values = removeSelectValues(selectField.Values, removedActions...)
					if err := app.Save(collection); err != nil {
						return err
					}
				}
			}
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		if collection, err := app.FindCollectionByNameOrId("systemd_services"); err == nil {
			if err := app.Delete(collection); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		return errors.New("systemd services removal cannot be automatically reverted")
	})
}
