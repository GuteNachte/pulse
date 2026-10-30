package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		monitors, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return err
		}
		if monitors.Fields.GetByName("last_failure_category") == nil {
			monitors.Fields.Add(&core.TextField{Name: "last_failure_category", Max: 32})
			if err := app.Save(monitors); err != nil {
				return err
			}
		}

		checks, err := app.FindCollectionByNameOrId("website_monitor_checks")
		if err != nil {
			return err
		}
		if checks.Fields.GetByName("failure_category") == nil {
			checks.Fields.Add(&core.TextField{Name: "failure_category", Max: 32})
			if err := app.Save(checks); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		for _, item := range []struct {
			collection string
			field      string
		}{
			{collection: "website_monitors", field: "last_failure_category"},
			{collection: "website_monitor_checks", field: "failure_category"},
		} {
			collection, err := app.FindCollectionByNameOrId(item.collection)
			if err != nil {
				return err
			}
			if field := collection.Fields.GetByName(item.field); field != nil {
				collection.Fields.RemoveById(field.GetId())
				if err := app.Save(collection); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
