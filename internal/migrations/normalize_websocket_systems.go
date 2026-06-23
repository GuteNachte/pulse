package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"gutenacht.site/pulse/internal/entities/system"
)

func init() {
	m.Register(func(app core.App) error {
		records, err := app.FindRecordsByFilter("systems", "", "", -1, 0)
		if err != nil {
			return err
		}
		for _, record := range records {
			var info system.Info
			if err := record.UnmarshalJSONField("info", &info); err != nil {
				info = system.Info{}
			}
			info.ConnectionType = system.ConnectionTypeWebSocket
			record.Set("info", info)
			if err := app.SaveNoValidate(record); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		return nil
	})
}
