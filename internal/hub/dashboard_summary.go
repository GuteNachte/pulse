package hub

import (
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/hub/utils"
)

type dashboardSummaryResponse struct {
	Containers dashboardContainerSummary `json:"containers"`
	Websites   dashboardWebsiteSummary   `json:"websites"`
}

type dashboardContainerSummary struct {
	Total   int `json:"total"`
	Running int `json:"running"`
	Stopped int `json:"stopped"`
}

type dashboardWebsiteSummary struct {
	Total   int `json:"total"`
	Up      int `json:"up"`
	Down    int `json:"down"`
	Unknown int `json:"unknown"`
}

func (h *Hub) getDashboardSummary(e *core.RequestEvent) error {
	containers, err := h.getDashboardContainerSummary(e)
	if err != nil {
		return err
	}
	websites, err := h.getDashboardWebsiteSummary(e)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, dashboardSummaryResponse{
		Containers: containers,
		Websites:   websites,
	})
}

func (h *Hub) getDashboardContainerSummary(e *core.RequestEvent) (dashboardContainerSummary, error) {
	systemFilter, params := h.dashboardSystemAccessFilter(e, "s")
	rows := []struct {
		Status string `db:"status"`
		Count  int    `db:"count"`
	}{}
	query := `
		SELECT COALESCE(c.status, '') AS status, COUNT(*) AS count
		FROM containers c
		INNER JOIN systems s ON s.id = c.system
		WHERE (` + systemFilter + `)
		GROUP BY COALESCE(c.status, '')
	`
	if err := h.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
		return dashboardContainerSummary{}, err
	}
	summary := dashboardContainerSummary{}
	for _, row := range rows {
		summary.Total += row.Count
		if dashboardContainerStatusRunning(row.Status) {
			summary.Running += row.Count
		}
	}
	summary.Stopped = summary.Total - summary.Running
	return summary, nil
}

func (h *Hub) getDashboardWebsiteSummary(e *core.RequestEvent) (dashboardWebsiteSummary, error) {
	rows := []struct {
		Status string `db:"status"`
		Count  int    `db:"count"`
	}{}
	params := dbx.Params{}
	filter := "enabled = TRUE"
	if e.Auth == nil || !e.Auth.IsSuperuser() {
		filter += " AND user = {:userId}"
		if e.Auth != nil {
			params["userId"] = e.Auth.Id
		} else {
			params["userId"] = ""
		}
	}
	query := `
		SELECT COALESCE(last_status, '') AS status, COUNT(*) AS count
		FROM website_monitors
		WHERE ` + filter + `
		GROUP BY COALESCE(last_status, '')
	`
	if err := h.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
		return dashboardWebsiteSummary{}, err
	}
	summary := dashboardWebsiteSummary{}
	for _, row := range rows {
		summary.Total += row.Count
		switch row.Status {
		case "up":
			summary.Up += row.Count
		case "down":
			summary.Down += row.Count
		default:
			summary.Unknown += row.Count
		}
	}
	return summary, nil
}

func (h *Hub) dashboardSystemAccessFilter(e *core.RequestEvent, alias string) (string, dbx.Params) {
	params := dbx.Params{}
	filter := "(" + alias + ".pairing_confirmed = TRUE OR " + alias + ".is_local = TRUE)"
	if shareAllSystems, _ := utils.GetEnv("SHARE_ALL_SYSTEMS"); shareAllSystems != "true" && (e.Auth == nil || !e.Auth.IsSuperuser()) {
		filter += " AND EXISTS (SELECT 1 FROM json_each(" + alias + ".users) WHERE value = {:userId})"
		if e.Auth != nil {
			params["userId"] = e.Auth.Id
		} else {
			params["userId"] = ""
		}
	}
	return filter, params
}

func dashboardContainerStatusRunning(status string) bool {
	normalized := strings.ToLower(strings.TrimSpace(status))
	return strings.HasPrefix(normalized, "up") || strings.Contains(normalized, "running")
}
