package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitor_checks")
		if err != nil {
			return nil
		}
		if field := collection.Fields.GetByName("target"); field != nil {
			if _, ok := field.(*core.TextField); ok {
				return nil
			}
			records, err := app.FindRecordsByFilter("website_monitor_checks", "", "", -1, 0)
			if err != nil {
				return err
			}
			targets := make(map[string]string, len(records))
			for _, record := range records {
				targets[record.Id] = record.GetString("target")
			}
			collection.Fields.RemoveById(field.GetId())
			collection.Fields.Add(&core.TextField{Name: "target"})
			if err := app.Save(collection); err != nil {
				return err
			}
			for id, target := range targets {
				if target == "" {
					continue
				}
				record, err := app.FindRecordById("website_monitor_checks", id)
				if err != nil {
					continue
				}
				record.Set("target", target)
				if err := app.SaveNoValidate(record); err != nil {
					return err
				}
			}
			return nil
		}
		collection.Fields.Add(&core.TextField{Name: "target"})
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitor_checks")
		if err != nil {
			return nil
		}
		if field := collection.Fields.GetByName("target"); field != nil {
			collection.Fields.RemoveById(field.GetId())
		}
		collection.Fields.Add(&core.SelectField{
			Name:      "target",
			MaxSelect: 1,
			Values:    []string{"internal", "external"},
		})
		return app.Save(collection)
	})
}
