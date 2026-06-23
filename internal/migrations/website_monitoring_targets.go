package migrations

import (
	"encoding/json"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

type websiteMonitorMigrationTarget struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	URL   string `json:"url"`
}

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return nil
		}
		if collection.Fields.GetByName("targets") == nil {
			collection.Fields.Add(&core.TextField{Name: "targets"})
			if err := app.Save(collection); err != nil {
				return err
			}
		}

		records, err := app.FindRecordsByFilter("website_monitors", "", "", -1, 0)
		if err != nil {
			return err
		}
		for _, record := range records {
			if strings.TrimSpace(record.GetString("targets")) != "" {
				continue
			}
			targets := make([]websiteMonitorMigrationTarget, 0, 2)
			if rawURL := strings.TrimSpace(record.GetString("internal_url")); rawURL != "" {
				targets = append(targets, websiteMonitorMigrationTarget{ID: "internal", Label: "内网", URL: rawURL})
			}
			if rawURL := strings.TrimSpace(record.GetString("external_url")); rawURL != "" {
				targets = append(targets, websiteMonitorMigrationTarget{ID: "external", Label: "外网", URL: rawURL})
			}
			if len(targets) == 0 {
				if rawURL := strings.TrimSpace(record.GetString("url")); rawURL != "" {
					targets = append(targets, websiteMonitorMigrationTarget{ID: "internal", Label: "内网", URL: rawURL})
				}
			}
			if len(targets) == 0 {
				continue
			}
			bytes, err := json.Marshal(targets)
			if err != nil {
				return err
			}
			record.Set("targets", string(bytes))
			if err := app.SaveNoValidate(record); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return nil
		}
		if field := collection.Fields.GetByName("targets"); field != nil {
			collection.Fields.RemoveById(field.GetId())
			return app.Save(collection)
		}
		return nil
	})
}
