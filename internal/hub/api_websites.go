package hub

import (
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type websiteMonitorListResponse struct {
	Items   []websiteMonitorListItem   `json:"items"`
	Page    int                        `json:"page"`
	PerPage int                        `json:"perPage"`
	HasMore bool                       `json:"hasMore"`
	Counts  websiteMonitorStatusCounts `json:"counts"`
}

type websiteMonitorStatusCounts struct {
	All     int `json:"all"`
	Up      int `json:"up"`
	Down    int `json:"down"`
	Unknown int `json:"unknown"`
	Stale   int `json:"stale"`
}

type websiteMonitorListItem struct {
	Id                  string  `db:"id" json:"id"`
	User                string  `db:"user" json:"user"`
	System              string  `db:"system" json:"system,omitempty"`
	Name                string  `db:"name" json:"name"`
	URL                 string  `db:"url" json:"url"`
	Description         string  `db:"description" json:"description,omitempty"`
	InternalURL         string  `db:"internal_url" json:"internal_url,omitempty"`
	ExternalURL         string  `db:"external_url" json:"external_url,omitempty"`
	Targets             string  `db:"targets" json:"targets,omitempty"`
	ExpectedContent     string  `db:"expected_content" json:"expected_content,omitempty"`
	IconURL             string  `db:"icon_url" json:"icon_url,omitempty"`
	Group               string  `db:"group" json:"group,omitempty"`
	IntervalSeconds     int     `db:"interval_seconds" json:"interval_seconds"`
	TimeoutSeconds      int     `db:"timeout_seconds" json:"timeout_seconds"`
	Enabled             bool    `db:"enabled" json:"enabled"`
	LastStatus          string  `db:"last_status" json:"last_status,omitempty"`
	LastStatusCode      int     `db:"last_status_code" json:"last_status_code,omitempty"`
	LastLatencyMS       int64   `db:"last_latency_ms" json:"last_latency_ms,omitempty"`
	LastError           string  `db:"last_error" json:"last_error,omitempty"`
	LastFailureCategory string  `db:"last_failure_category" json:"last_failure_category,omitempty"`
	LastChecked         string  `db:"last_checked" json:"last_checked,omitempty"`
	Uptime24h           float64 `db:"uptime_24h" json:"uptime_24h,omitempty"`
	Created             string  `db:"created" json:"created,omitempty"`
	Updated             string  `db:"updated" json:"updated,omitempty"`
}

type websiteMonitorStatusCountRow struct {
	Status string `db:"status"`
	Count  int    `db:"count"`
}

func (h *Hub) listWebsiteMonitors(e *core.RequestEvent) error {
	page := clampQueryInt(e.Request.URL.Query().Get("page"), 1, 1, 10_000)
	perPage := clampQueryInt(e.Request.URL.Query().Get("perPage"), 50, 1, 100)
	search := strings.TrimSpace(e.Request.URL.Query().Get("search"))
	status := strings.TrimSpace(e.Request.URL.Query().Get("status"))
	systemID := strings.TrimSpace(e.Request.URL.Query().Get("system"))

	baseWhere, params := h.websiteMonitorListBaseFilter(e, search, systemID)
	counts, err := h.websiteMonitorListStatusCounts(baseWhere, params)
	if err != nil {
		return e.InternalServerError("Failed to load website monitor counts", err)
	}

	where := append([]string{}, baseWhere...)
	if statusClause := websiteMonitorListStatusFilter(status); statusClause != "" {
		where = append(where, statusClause)
	}
	params["limit"] = perPage + 1
	params["offset"] = (page - 1) * perPage

	var items []websiteMonitorListItem
	query := `
		SELECT
			m.id,
			m."user",
			COALESCE(m.system, '') AS system,
			COALESCE(m.name, '') AS name,
			COALESCE(m.url, '') AS url,
			COALESCE(m.description, '') AS description,
			COALESCE(m.internal_url, '') AS internal_url,
			COALESCE(m.external_url, '') AS external_url,
			COALESCE(m.targets, '') AS targets,
			COALESCE(m.expected_content, '') AS expected_content,
			COALESCE(m.icon_url, '') AS icon_url,
			COALESCE(m."group", '') AS "group",
			COALESCE(m.interval_seconds, 300) AS interval_seconds,
			COALESCE(m.timeout_seconds, 10) AS timeout_seconds,
			COALESCE(m.enabled, FALSE) AS enabled,
			COALESCE(m.last_status, '') AS last_status,
			COALESCE(m.last_status_code, 0) AS last_status_code,
			COALESCE(m.last_latency_ms, 0) AS last_latency_ms,
			COALESCE(m.last_error, '') AS last_error,
			COALESCE(m.last_failure_category, '') AS last_failure_category,
			COALESCE(m.last_checked, '') AS last_checked,
			COALESCE(m.uptime_24h, 0) AS uptime_24h,
			m.created,
			m.updated
		FROM website_monitors m
		LEFT JOIN systems s ON s.id = m.system
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY LOWER(COALESCE(m."group", '')), LOWER(COALESCE(m.name, '')), m.created DESC
		LIMIT {:limit}
		OFFSET {:offset}
	`
	if err := h.DB().NewQuery(query).Bind(params).All(&items); err != nil {
		return e.InternalServerError("Failed to load website monitors", err)
	}

	hasMore := len(items) > perPage
	if hasMore {
		items = items[:perPage]
	}
	return e.JSON(http.StatusOK, websiteMonitorListResponse{
		Items:   items,
		Page:    page,
		PerPage: perPage,
		HasMore: hasMore,
		Counts:  counts,
	})
}

func (h *Hub) websiteMonitorListBaseFilter(e *core.RequestEvent, search string, systemID string) ([]string, dbx.Params) {
	where := []string{"1=1"}
	params := dbx.Params{}
	if e.Auth == nil || !e.Auth.IsSuperuser() {
		where = append(where, `m."user" = {:user}`)
		if e.Auth != nil {
			params["user"] = e.Auth.Id
		} else {
			params["user"] = ""
		}
	}
	if systemID != "" && systemID != "all" {
		where = append(where, "m.system = {:system}")
		params["system"] = systemID
	}
	if search != "" {
		where = append(where, `(
			m.name LIKE {:search}
			OR m.description LIKE {:search}
			OR m."group" LIKE {:search}
			OR m.expected_content LIKE {:search}
			OR m.url LIKE {:search}
			OR m.internal_url LIKE {:search}
			OR m.external_url LIKE {:search}
			OR m.targets LIKE {:search}
			OR s.name LIKE {:search}
			OR s.display_name LIKE {:search}
		)`)
		params["search"] = "%" + search + "%"
	}
	return where, params
}

func (h *Hub) websiteMonitorListStatusCounts(baseWhere []string, params dbx.Params) (websiteMonitorStatusCounts, error) {
	countParams := dbx.Params{}
	for key, value := range params {
		countParams[key] = value
	}
	var rows []websiteMonitorStatusCountRow
	query := `
		SELECT COALESCE(m.last_status, '') AS status, COUNT(*) AS count
		FROM website_monitors m
		LEFT JOIN systems s ON s.id = m.system
		WHERE ` + strings.Join(baseWhere, " AND ") + `
		GROUP BY COALESCE(m.last_status, '')
	`
	if err := h.DB().NewQuery(query).Bind(countParams).All(&rows); err != nil {
		return websiteMonitorStatusCounts{}, err
	}
	counts := websiteMonitorStatusCounts{}
	for _, row := range rows {
		counts.All += row.Count
		switch row.Status {
		case "up":
			counts.Up += row.Count
		case "down":
			counts.Down += row.Count
		default:
			counts.Unknown += row.Count
		}
	}
	staleWhere := append([]string{}, baseWhere...)
	staleWhere = append(staleWhere, websiteMonitorListStaleClause())
	staleQuery := `
		SELECT COUNT(*) AS count
		FROM website_monitors m
		LEFT JOIN systems s ON s.id = m.system
		WHERE ` + strings.Join(staleWhere, " AND ")
	staleRow := struct {
		Count int `db:"count"`
	}{}
	if err := h.DB().NewQuery(staleQuery).Bind(countParams).One(&staleRow); err != nil {
		return websiteMonitorStatusCounts{}, err
	}
	counts.Stale = staleRow.Count
	return counts, nil
}

func websiteMonitorListStatusFilter(status string) string {
	switch strings.TrimSpace(status) {
	case "up":
		return "m.last_status = 'up'"
	case "down":
		return "m.last_status = 'down'"
	case "unknown":
		return "(m.last_status IS NULL OR m.last_status = '' OR m.last_status NOT IN ('up', 'down'))"
	case "stale":
		return websiteMonitorListStaleClause()
	default:
		return ""
	}
}

func websiteMonitorListStaleClause() string {
	return `(
		COALESCE(m.last_checked, '') != ''
		AND (
			julianday(m.last_checked) IS NULL
			OR (
				strftime('%s', 'now') - strftime('%s', m.last_checked)
			) > (
				CASE
					WHEN (
						CASE
							WHEN COALESCE(m.interval_seconds, 0) <= 0 THEN 300
							WHEN m.interval_seconds < 60 THEN 60
							ELSE m.interval_seconds
						END
					) * 2 > (
						CASE
							WHEN COALESCE(m.interval_seconds, 0) <= 0 THEN 300
							WHEN m.interval_seconds < 60 THEN 60
							ELSE m.interval_seconds
						END
					) + 300
					THEN (
						CASE
							WHEN COALESCE(m.interval_seconds, 0) <= 0 THEN 300
							WHEN m.interval_seconds < 60 THEN 60
							ELSE m.interval_seconds
						END
					) * 2
					ELSE (
						CASE
							WHEN COALESCE(m.interval_seconds, 0) <= 0 THEN 300
							WHEN m.interval_seconds < 60 THEN 60
							ELSE m.interval_seconds
						END
					) + 300
				END
			)
		)
	)`
}
