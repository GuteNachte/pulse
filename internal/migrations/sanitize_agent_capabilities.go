package migrations

import (
	"strings"

	"github.com/pocketbase/dbx"
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
			if err := record.UnmarshalJSONField("info", &info); err != nil || info.Capabilities == nil {
				continue
			}
			linuxContainer := isLinuxContainerCapabilities(info.Capabilities)
			sanitizePersistedAgentCapabilities(info.Capabilities)
			record.Set("info", info)
			if err := app.SaveNoValidate(record); err != nil {
				return err
			}
			if linuxContainer {
				if err := cleanupPersistedLinuxContainerImportantMonitoring(app, record.Id); err != nil {
					return err
				}
			}
		}
		return nil
	}, func(app core.App) error {
		return nil
	})
}

func sanitizePersistedAgentCapabilities(capabilities *system.AgentCapabilities) {
	capabilities.Collection = removeCapabilityValues(capabilities.Collection, map[string]struct{}{
		"extra_filesystems": {},
	})
	capabilities.Operations = removeCapabilityValues(capabilities.Operations, map[string]struct{}{
		"reboot":           {},
		"shutdown":         {},
		"software_control": {},
		"wake_on_lan":      {},
	})
	for _, key := range []string{
		"extra_filesystems",
		"linux_host_agent",
		"power_privilege",
		"reboot",
		"shutdown",
		"software_control",
		"wake_on_lan",
	} {
		delete(capabilities.UnsupportedReasons, key)
	}
	if isLinuxContainerCapabilities(capabilities) {
		linuxContainerRemoved := map[string]struct{}{
			"service_control":  {},
			"software_monitor": {},
			"systemd_services": {},
		}
		capabilities.Collection = removeCapabilityValues(capabilities.Collection, linuxContainerRemoved)
		capabilities.Operations = removeCapabilityValues(capabilities.Operations, linuxContainerRemoved)
		for key := range linuxContainerRemoved {
			delete(capabilities.UnsupportedReasons, key)
		}
	}
	if len(capabilities.UnsupportedReasons) == 0 {
		capabilities.UnsupportedReasons = nil
	}
}

func isLinuxContainerCapabilities(capabilities *system.AgentCapabilities) bool {
	if capabilities == nil {
		return false
	}
	return strings.EqualFold(capabilities.AgentProfile, "linux-container") ||
		strings.EqualFold(capabilities.Platform, "linux") ||
		strings.EqualFold(capabilities.RunMode, "docker")
}

func cleanupPersistedLinuxContainerImportantMonitoring(app core.App, systemId string) error {
	for _, query := range []string{
		"DELETE FROM service_control_rules WHERE system = {:system}",
		"DELETE FROM monitored_services WHERE system = {:system}",
		"DELETE FROM software_monitor_rules WHERE system = {:system}",
		"DELETE FROM monitored_software WHERE system = {:system}",
	} {
		if _, err := app.DB().NewQuery(query).Bind(dbx.Params{"system": systemId}).Execute(); err != nil {
			return err
		}
	}
	return nil
}

func removeCapabilityValues(values []string, removed map[string]struct{}) []string {
	if len(values) == 0 {
		return values
	}
	filtered := values[:0]
	for _, value := range values {
		if _, ok := removed[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}
