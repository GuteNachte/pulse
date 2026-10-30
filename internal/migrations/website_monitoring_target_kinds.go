package migrations

import (
	"encoding/json"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

type websiteMonitorKindMigrationTarget struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	URL       string `json:"url"`
	Scope     string `json:"scope"`
	IPVersion string `json:"ip_version"`
	LegacyID  string `json:"-"`
}

func init() {
	m.Register(func(app core.App) error {
		if _, err := app.FindCollectionByNameOrId("website_monitors"); err != nil {
			return nil
		}
		records, err := app.FindRecordsByFilter("website_monitors", "", "", -1, 0)
		if err != nil {
			return err
		}
		for _, record := range records {
			targets := parseWebsiteMonitorKindMigrationTargets(record.GetString("targets"))
			if len(targets) == 0 {
				targets = fallbackWebsiteMonitorKindMigrationTargets(record)
			}
			if len(targets) == 0 {
				continue
			}
			changed := false
			for index := range targets {
				target := &targets[index]
				target.LegacyID = target.ID
				if target.Scope == "" || target.IPVersion == "" || !isWebsiteMonitorKindID(target.ID) {
					scope, ipVersion := inferWebsiteMonitorKindTarget(app, record.Id, *target)
					target.Scope = scope
					target.IPVersion = ipVersion
					target.ID = websiteMonitorKindID(scope, ipVersion)
					target.Label = websiteMonitorKindLabel(scope, ipVersion)
					changed = true
				}
			}
			if changed {
				bytes, err := json.Marshal(targets)
				if err != nil {
					return err
				}
				record.Set("targets", string(bytes))
				if err := app.SaveNoValidate(record); err != nil {
					return err
				}
			}
			if err := migrateWebsiteMonitorKindChecks(app, record.Id, targets); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		return nil
	})
}

func migrateWebsiteMonitorKindChecks(app core.App, monitorID string, targets []websiteMonitorKindMigrationTarget) error {
	if _, err := app.FindCollectionByNameOrId("website_monitor_checks"); err != nil {
		return nil
	}
	for _, target := range targets {
		legacyIDs := []string{legacyWebsiteMonitorKindID(target)}
		if original := strings.TrimSpace(target.LegacyID); original != "" && original != target.ID {
			legacyIDs = append(legacyIDs, original)
		}
		for _, legacyID := range legacyIDs {
			if legacyID == "" || legacyID == target.ID {
				continue
			}
			records, err := app.FindRecordsByFilter(
				"website_monitor_checks",
				"monitor = {:monitor} && target = {:target}",
				"",
				-1,
				0,
				dbx.Params{"monitor": monitorID, "target": legacyID},
			)
			if err != nil {
				return err
			}
			for _, record := range records {
				record.Set("target", target.ID)
				if strings.TrimSpace(record.GetString("ip_version")) == "" {
					record.Set("ip_version", target.IPVersion)
				}
				if err := app.SaveNoValidate(record); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func parseWebsiteMonitorKindMigrationTargets(raw string) []websiteMonitorKindMigrationTarget {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var targets []websiteMonitorKindMigrationTarget
	if err := json.Unmarshal([]byte(raw), &targets); err != nil {
		return nil
	}
	return targets
}

func fallbackWebsiteMonitorKindMigrationTargets(record *core.Record) []websiteMonitorKindMigrationTarget {
	targets := make([]websiteMonitorKindMigrationTarget, 0, 2)
	if rawURL := strings.TrimSpace(record.GetString("internal_url")); rawURL != "" {
		targets = append(targets, websiteMonitorKindMigrationTarget{ID: "internal", Label: "内网", URL: rawURL})
	}
	if rawURL := strings.TrimSpace(record.GetString("external_url")); rawURL != "" {
		targets = append(targets, websiteMonitorKindMigrationTarget{ID: "external", Label: "外网", URL: rawURL})
	}
	if len(targets) == 0 {
		if rawURL := strings.TrimSpace(record.GetString("url")); rawURL != "" {
			targets = append(targets, websiteMonitorKindMigrationTarget{ID: "internal", Label: "内网", URL: rawURL})
		}
	}
	return targets
}

func inferWebsiteMonitorKindTarget(app core.App, monitorID string, target websiteMonitorKindMigrationTarget) (string, string) {
	scope := "internal"
	if strings.Contains(strings.ToLower(target.ID+" "+target.Label), "external") || strings.Contains(target.Label, "外网") {
		scope = "external"
	}
	ipVersion := strings.TrimSpace(target.IPVersion)
	if ipVersion != "IPv4" && ipVersion != "IPv6" {
		ipVersion = latestWebsiteMonitorKindIPVersion(app, monitorID, target.ID)
	}
	if ipVersion != "IPv4" && ipVersion != "IPv6" {
		ipVersion = "IPv4"
	}
	return scope, ipVersion
}

func latestWebsiteMonitorKindIPVersion(app core.App, monitorID string, target string) string {
	target = strings.TrimSpace(target)
	if target == "" {
		return ""
	}
	records, err := app.FindRecordsByFilter(
		"website_monitor_checks",
		"monitor = {:monitor} && target = {:target} && ip_version != ''",
		"-created",
		1,
		0,
		dbx.Params{"monitor": monitorID, "target": target},
	)
	if err != nil || len(records) == 0 {
		return ""
	}
	return records[0].GetString("ip_version")
}

func legacyWebsiteMonitorKindID(target websiteMonitorKindMigrationTarget) string {
	id := strings.ToLower(strings.TrimSpace(target.ID))
	if id == "internal" || id == "external" {
		return id
	}
	if strings.Contains(strings.ToLower(target.Label), "内网") {
		return "internal"
	}
	if strings.Contains(strings.ToLower(target.Label), "外网") {
		return "external"
	}
	if strings.HasPrefix(id, "internal-") {
		return "internal"
	}
	if strings.HasPrefix(id, "external-") {
		return "external"
	}
	return ""
}

func isWebsiteMonitorKindID(id string) bool {
	switch id {
	case "internal-ipv4", "internal-ipv6", "external-ipv4", "external-ipv6":
		return true
	default:
		return false
	}
}

func websiteMonitorKindID(scope string, ipVersion string) string {
	if scope != "external" {
		scope = "internal"
	}
	if ipVersion != "IPv6" {
		ipVersion = "IPv4"
	}
	return scope + "-" + strings.ToLower(ipVersion)
}

func websiteMonitorKindLabel(scope string, ipVersion string) string {
	if scope == "external" {
		if ipVersion == "IPv6" {
			return "外网 IPv6"
		}
		return "外网 IPv4"
	}
	if ipVersion == "IPv6" {
		return "内网 IPv6"
	}
	return "内网 IPv4"
}
