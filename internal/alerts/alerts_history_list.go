package alerts

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type alertHistoryListResponse struct {
	Items   []alertHistoryListItem `json:"items"`
	Page    int                    `json:"page"`
	PerPage int                    `json:"perPage"`
	HasMore bool                   `json:"hasMore"`
}

type alertHistoryListItem struct {
	Id             string             `db:"id" json:"id"`
	AlertID        string             `db:"alert_id" json:"alert_id,omitempty"`
	User           string             `db:"user" json:"user"`
	System         string             `db:"system" json:"system"`
	Asset          string             `db:"asset" json:"asset,omitempty"`
	Name           string             `db:"name" json:"name"`
	Value          float64            `db:"value" json:"value"`
	Created        string             `db:"created" json:"created"`
	Resolved       string             `db:"resolved" json:"resolved,omitempty"`
	AcknowledgedAt string             `db:"acknowledged_at" json:"acknowledged_at,omitempty"`
	AcknowledgedBy string             `db:"acknowledged_by" json:"acknowledged_by,omitempty"`
	SilencedUntil  string             `db:"silenced_until" json:"silenced_until,omitempty"`
	SilencedBy     string             `db:"silenced_by" json:"silenced_by,omitempty"`
	SilenceReason  string             `db:"silence_reason" json:"silence_reason,omitempty"`
	SystemName     string             `db:"system_name" json:"-"`
	AssetName      string             `db:"asset_name" json:"-"`
	Expand         alertHistoryExpand `json:"expand"`
}

type alertHistoryExpand struct {
	System alertHistorySystemExpand `json:"system"`
	Asset  *alertHistoryAssetExpand `json:"asset,omitempty"`
}

type alertHistorySystemExpand struct {
	Id   string `json:"id"`
	Name string `json:"name"`
}

type alertHistoryAssetExpand struct {
	Id   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type,omitempty"`
}

func ListAlertHistory(e *core.RequestEvent) error {
	page := clampAlertHistoryQueryInt(e.Request.URL.Query().Get("page"), 1, 1, 10_000)
	perPage := clampAlertHistoryQueryInt(e.Request.URL.Query().Get("perPage"), 25, 1, 100)
	search := strings.TrimSpace(e.Request.URL.Query().Get("search"))
	state := strings.TrimSpace(e.Request.URL.Query().Get("state"))
	source := strings.TrimSpace(e.Request.URL.Query().Get("source"))
	systemID := strings.TrimSpace(e.Request.URL.Query().Get("system"))

	where := []string{"1=1"}
	params := dbx.Params{
		"limit":  perPage + 1,
		"offset": (page - 1) * perPage,
	}
	if e.Auth == nil || !e.Auth.IsSuperuser() {
		where = append(where, `h."user" = {:user}`)
		if e.Auth != nil {
			params["user"] = e.Auth.Id
		} else {
			params["user"] = ""
		}
	}
	if systemID != "" && systemID != "all" {
		where = append(where, "h.system = {:system}")
		params["system"] = systemID
	}
	switch state {
	case "current", "active", "unresolved":
		where = append(where, "(h.resolved IS NULL OR h.resolved = '')")
	case "recovered", "resolved":
		where = append(where, "(h.resolved IS NOT NULL AND h.resolved != '')")
	}
	if sourceClause := alertHistorySourceFilter(source); sourceClause != "" {
		where = append(where, sourceClause)
	}
	if search != "" {
		where = append(where, `(h.name LIKE {:search} OR h.alert_id LIKE {:search} OR h.system LIKE {:search} OR h.asset LIKE {:search} OR s.name LIKE {:search} OR s.display_name LIKE {:search} OR a.name LIKE {:search})`)
		params["search"] = "%" + search + "%"
	}

	var items []alertHistoryListItem
	query := `
		SELECT
			h.id,
			COALESCE(h.alert_id, '') AS alert_id,
			h."user",
			h.system,
			COALESCE(h.asset, '') AS asset,
			h.name,
			COALESCE(h.value, 0) AS value,
			h.created,
			COALESCE(h.resolved, '') AS resolved,
			COALESCE(h.acknowledged_at, '') AS acknowledged_at,
			COALESCE(h.acknowledged_by, '') AS acknowledged_by,
			COALESCE(h.silenced_until, '') AS silenced_until,
			COALESCE(h.silenced_by, '') AS silenced_by,
			COALESCE(h.silence_reason, '') AS silence_reason,
			COALESCE(NULLIF(s.display_name, ''), NULLIF(s.name, ''), h.system) AS system_name,
			COALESCE(NULLIF(a.name, ''), h.asset) AS asset_name
		FROM alerts_history h
		LEFT JOIN systems s ON s.id = h.system
		LEFT JOIN assets a ON a.id = h.asset
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY h.created DESC
		LIMIT {:limit}
		OFFSET {:offset}
	`
	if err := e.App.DB().NewQuery(query).Bind(params).All(&items); err != nil {
		return e.InternalServerError("Failed to load alert history", err)
	}

	hasMore := len(items) > perPage
	if hasMore {
		items = items[:perPage]
	}
	for i := range items {
		items[i].Expand.System = alertHistorySystemExpand{
			Id:   items[i].System,
			Name: items[i].SystemName,
		}
		if items[i].Asset != "" {
			items[i].Expand.Asset = &alertHistoryAssetExpand{
				Id:   items[i].Asset,
				Name: items[i].AssetName,
			}
		}
	}

	return e.JSON(http.StatusOK, alertHistoryListResponse{
		Items:   items,
		Page:    page,
		PerPage: perPage,
		HasMore: hasMore,
	})
}

func alertHistorySourceFilter(source string) string {
	switch strings.TrimSpace(source) {
	case "machine":
		return "h.name = 'Status'"
	case "website":
		return "h.name LIKE '网站：%'"
	case "container":
		return "h.name LIKE '容器：%'"
	case "compose":
		return "h.name LIKE '编排：%'"
	case "service":
		return "h.name LIKE '服务：%'"
	case "software":
		return "h.name LIKE '软件：%'"
	case "hardware":
		return "h.name IN ('Temperature', 'Battery', 'Disk')"
	case "resource":
		return "h.name NOT IN ('Status', 'Temperature', 'Battery', 'Disk') AND h.name NOT LIKE '网站：%' AND h.name NOT LIKE '容器：%' AND h.name NOT LIKE '编排：%' AND h.name NOT LIKE '服务：%' AND h.name NOT LIKE '软件：%'"
	default:
		return ""
	}
}

func clampAlertHistoryQueryInt(raw string, fallback int, minValue int, maxValue int) int {
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return fallback
	}
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}
