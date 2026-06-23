package hub

import (
	"net/http"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/hub/utils"
)

type systemSummaryResponse struct {
	Items []systemSummaryRecord `json:"items"`
}

type systemSummaryRecord struct {
	ID                    string         `json:"id"`
	Created               string         `json:"created,omitempty"`
	Updated               string         `json:"updated,omitempty"`
	Name                  string         `json:"name"`
	DisplayName           string         `json:"display_name,omitempty"`
	Role                  string         `json:"role,omitempty"`
	CustomRole            string         `json:"custom_role,omitempty"`
	PrimaryUse            string         `json:"primary_use,omitempty"`
	IsNAS                 bool           `json:"is_nas,omitempty"`
	Description           string         `json:"description,omitempty"`
	SuppressOfflineAlerts bool           `json:"suppress_offline_alerts,omitempty"`
	HideFromHome          bool           `json:"hide_from_home,omitempty"`
	IsLocal               bool           `json:"is_local,omitempty"`
	PairingConfirmed      bool           `json:"pairing_confirmed,omitempty"`
	TargetIP              string         `json:"target_ip,omitempty"`
	ConnectIP             string         `json:"connect_ip,omitempty"`
	ReportedIPs           []string       `json:"reported_ips,omitempty"`
	FingerprintSummary    string         `json:"fingerprint_summary,omitempty"`
	AgentProfile          string         `json:"agent_profile,omitempty"`
	Status                string         `json:"status"`
	Info                  map[string]any `json:"info"`
}

var systemSummaryInfoKeys = map[string]struct{}{
	"h":   {},
	"k":   {},
	"c":   {},
	"t":   {},
	"m":   {},
	"u":   {},
	"cpu": {},
	"mp":  {},
	"dp":  {},
	"b":   {},
	"bb":  {},
	"bbd": {},
	"v":   {},
	"p":   {},
	"g":   {},
	"gs":  {},
	"dt":  {},
	"os":  {},
	"o":   {},
	"la":  {},
	"ct":  {},
	"bat": {},
	"ip":  {},
	"sv":  {},
	"msv": {},
}

var systemSummaryCapabilityKeys = map[string]struct{}{
	"platform":            {},
	"arch":                {},
	"agent_version":       {},
	"install_method":      {},
	"run_mode":            {},
	"agent_profile":       {},
	"privilege":           {},
	"collection":          {},
	"operations":          {},
	"unsupported_reasons": {},
	"last_update":         {},
}

func (h *Hub) listSystemSummaries(e *core.RequestEvent) error {
	filter := "(pairing_confirmed = true || is_local = true)"
	params := dbx.Params{}
	if shareAllSystems, _ := utils.GetEnv("SHARE_ALL_SYSTEMS"); shareAllSystems != "true" && (e.Auth == nil || !e.Auth.IsSuperuser()) {
		filter += " && users ~ {:userId}"
		if e.Auth != nil {
			params["userId"] = e.Auth.Id
		} else {
			params["userId"] = ""
		}
	}
	records, err := h.FindRecordsByFilter("systems", filter, "name", -1, 0, params)
	if err != nil {
		return err
	}
	items := make([]systemSummaryRecord, 0, len(records))
	for _, record := range records {
		items = append(items, buildSystemSummaryRecord(record))
	}
	return e.JSON(http.StatusOK, systemSummaryResponse{Items: items})
}

func buildSystemSummaryRecord(record *core.Record) systemSummaryRecord {
	return systemSummaryRecord{
		ID:                    record.Id,
		Created:               record.GetString("created"),
		Updated:               record.GetString("updated"),
		Name:                  record.GetString("name"),
		DisplayName:           record.GetString("display_name"),
		Role:                  record.GetString("role"),
		CustomRole:            record.GetString("custom_role"),
		PrimaryUse:            record.GetString("primary_use"),
		IsNAS:                 record.GetBool("is_nas"),
		Description:           record.GetString("description"),
		SuppressOfflineAlerts: record.GetBool("suppress_offline_alerts"),
		HideFromHome:          record.GetBool("hide_from_home"),
		IsLocal:               record.GetBool("is_local"),
		PairingConfirmed:      record.GetBool("pairing_confirmed"),
		TargetIP:              record.GetString("target_ip"),
		ConnectIP:             record.GetString("connect_ip"),
		ReportedIPs:           record.GetStringSlice("reported_ips"),
		FingerprintSummary:    record.GetString("fingerprint_summary"),
		AgentProfile:          record.GetString("agent_profile"),
		Status:                record.GetString("status"),
		Info:                  buildSystemSummaryInfo(record),
	}
}

func buildSystemSummaryInfo(record *core.Record) map[string]any {
	raw := map[string]any{}
	if err := record.UnmarshalJSONField("info", &raw); err != nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(raw))
	for key, value := range raw {
		if _, ok := systemSummaryInfoKeys[key]; ok {
			out[key] = value
		}
	}
	if capValue, ok := raw["cap"]; ok {
		if capSummary := summarizeSystemCapabilities(capValue); len(capSummary) > 0 {
			out["cap"] = capSummary
		}
	}
	return out
}

func summarizeSystemCapabilities(value any) map[string]any {
	raw, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	out := make(map[string]any, len(systemSummaryCapabilityKeys))
	for key, item := range raw {
		if _, ok := systemSummaryCapabilityKeys[key]; ok {
			out[key] = item
		}
	}
	return out
}
