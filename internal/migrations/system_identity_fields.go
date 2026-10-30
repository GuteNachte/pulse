package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		for _, field := range []struct {
			name string
			max  int
		}{
			{name: "target_ip", max: 64},
			{name: "connect_ip", max: 64},
			{name: "fingerprint_summary", max: 32},
			{name: "agent_profile", max: 64},
		} {
			if collection.Fields.GetByName(field.name) == nil {
				collection.Fields.Add(&core.TextField{Name: field.name, Max: field.max})
			}
		}
		if collection.Fields.GetByName("reported_ips") == nil {
			collection.Fields.Add(&core.JSONField{
				Name:    "reported_ips",
				MaxSize: 4096,
			})
		}
		return app.Save(collection)
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("systems")
		if err != nil {
			return err
		}
		for _, name := range []string{"target_ip", "connect_ip", "reported_ips", "fingerprint_summary", "agent_profile"} {
			if field := collection.Fields.GetByName(name); field != nil {
				collection.Fields.RemoveById(field.GetId())
			}
		}
		return app.Save(collection)
	})
}
