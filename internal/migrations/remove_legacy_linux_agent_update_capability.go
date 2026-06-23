package migrations

import (
	"strings"

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
			if !isLegacyLinuxContainerAgentForImageUpdate(info.Capabilities) {
				continue
			}
			info.Capabilities.Operations = removeCapabilityValue(info.Capabilities.Operations, "agent_update")
			if info.Capabilities.UnsupportedReasons == nil {
				info.Capabilities.UnsupportedReasons = map[string]string{}
			}
			info.Capabilities.UnsupportedReasons["agent_update"] = "Linux container image self-update requires Agent 1.0.1 or newer"
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

func isLegacyLinuxContainerAgentForImageUpdate(capabilities *system.AgentCapabilities) bool {
	if !isLinuxContainerCapabilities(capabilities) {
		return false
	}
	if !hasCapabilityValue(capabilities.Operations, "agent_update") {
		return false
	}
	version := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(capabilities.AgentVersion)), "v")
	return version == "" || compareLooseSemver(version, "1.0.1") < 0
}

func hasCapabilityValue(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func removeCapabilityValue(values []string, target string) []string {
	filtered := values[:0]
	for _, value := range values {
		if value == target {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func compareLooseSemver(a string, b string) int {
	aParts := looseSemverParts(a)
	bParts := looseSemverParts(b)
	for i := 0; i < 3; i++ {
		if aParts[i] < bParts[i] {
			return -1
		}
		if aParts[i] > bParts[i] {
			return 1
		}
	}
	return 0
}

func looseSemverParts(value string) [3]int {
	var parts [3]int
	raw := strings.Split(strings.TrimSpace(value), ".")
	for i := 0; i < len(raw) && i < 3; i++ {
		for _, r := range raw[i] {
			if r < '0' || r > '9' {
				break
			}
			parts[i] = parts[i]*10 + int(r-'0')
		}
	}
	return parts
}
