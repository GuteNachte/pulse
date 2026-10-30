package migrations

import (
	"strings"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const (
	oldAgentReleaseRegistry = "192.168.1.35:5000/"
	newAgentReleaseRegistry = "registry.example.com/"
)

func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("agent_releases"); err != nil {
			return nil
		}
		records, err := app.FindRecordsByFilter("agent_releases", "", "", -1, 0)
		if err != nil {
			return err
		}
		for _, record := range records {
			downloadURL := strings.TrimSpace(record.GetString("download_url"))
			if !strings.HasPrefix(downloadURL, oldAgentReleaseRegistry) {
				continue
			}
			record.Set("download_url", newAgentReleaseRegistry+strings.TrimPrefix(downloadURL, oldAgentReleaseRegistry))
			if err := app.SaveNoValidate(record); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		return nil
	})
}
