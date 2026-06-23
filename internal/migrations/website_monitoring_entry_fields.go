package migrations

import (
	"net/url"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return err
		}
		for _, name := range []string{"description", "internal_url", "external_url", "icon_url"} {
			if collection.Fields.GetByName(name) == nil {
				collection.Fields.Add(&core.TextField{Name: name})
			}
		}
		if err := app.Save(collection); err != nil {
			return err
		}

		records, err := app.FindRecordsByFilter("website_monitors", "", "", -1, 0)
		if err != nil {
			return err
		}
		for _, record := range records {
			changed := false
			rawURL := strings.TrimSpace(record.GetString("url"))
			if strings.TrimSpace(record.GetString("internal_url")) == "" && rawURL != "" {
				record.Set("internal_url", rawURL)
				changed = true
			}
			if strings.TrimSpace(record.GetString("icon_url")) == "" {
				if iconURL := websiteMonitorFaviconURL(rawURL); iconURL != "" {
					record.Set("icon_url", iconURL)
					changed = true
				}
			}
			if changed {
				if err := app.SaveNoValidate(record); err != nil {
					return err
				}
			}
		}
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("website_monitors")
		if err != nil {
			return err
		}
		for _, name := range []string{"description", "internal_url", "external_url", "icon_url"} {
			if field := collection.Fields.GetByName(name); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}
		return app.Save(collection)
	})
}

func websiteMonitorFaviconURL(raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return ""
	}
	return parsed.Scheme + "://" + parsed.Host + "/favicon.ico"
}
