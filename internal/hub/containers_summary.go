package hub

import (
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type containerListResponse struct {
	Items   []containerListItem      `json:"items"`
	Systems []containerSystemSummary `json:"systems"`
	System  string                   `json:"system,omitempty"`
	HasMore bool                     `json:"hasMore"`
	Limit   int                      `json:"limit"`
}

type containerSystemSummary struct {
	ID      string `json:"id"`
	Total   int    `json:"total"`
	Running int    `json:"running"`
	Stopped int    `json:"stopped"`
}

type containerSystemSummaryRow struct {
	System string `db:"system"`
	Status string `db:"status"`
	Count  int    `db:"count"`
}

type containerListItem struct {
	ID              string  `db:"id" json:"id"`
	System          string  `db:"system" json:"system"`
	Name            string  `db:"name" json:"name"`
	Image           string  `db:"image" json:"image"`
	Ports           string  `db:"ports" json:"ports"`
	CPU             float64 `db:"cpu" json:"cpu"`
	Memory          float64 `db:"memory" json:"memory"`
	Net             float64 `db:"net" json:"net"`
	Health          int     `db:"health" json:"health"`
	Status          string  `db:"status" json:"status"`
	StackProject    string  `db:"stack_project" json:"stack_project,omitempty"`
	StackService    string  `db:"stack_service" json:"stack_service,omitempty"`
	StackNumber     string  `db:"stack_number" json:"stack_number,omitempty"`
	StackConfig     string  `db:"stack_config" json:"stack_config,omitempty"`
	StackWorkingDir string  `db:"stack_working_dir" json:"stack_working_dir,omitempty"`
	Updated         int64   `db:"updated" json:"updated"`
}

func (h *Hub) listContainers(e *core.RequestEvent) error {
	limit := clampQueryInt(e.Request.URL.Query().Get("limit"), 2000, 1, 5000)
	requestedSystemID := strings.TrimSpace(e.Request.URL.Query().Get("system"))

	summaries, selectedSystemID, err := h.listContainerSystemSummaries(e, requestedSystemID)
	if err != nil {
		return err
	}
	if selectedSystemID == "" {
		return e.JSON(http.StatusOK, containerListResponse{
			Items:   []containerListItem{},
			Systems: summaries,
			Limit:   limit,
		})
	}

	items, hasMore, err := h.listContainersForSystem(e, selectedSystemID, limit)
	if err != nil {
		return err
	}
	return e.JSON(http.StatusOK, containerListResponse{
		Items:   items,
		Systems: summaries,
		System:  selectedSystemID,
		HasMore: hasMore,
		Limit:   limit,
	})
}

func (h *Hub) listContainerSystemSummaries(e *core.RequestEvent, requestedSystemID string) ([]containerSystemSummary, string, error) {
	systemFilter, params := h.dashboardSystemAccessFilter(e, "s")
	rows := []containerSystemSummaryRow{}
	query := `
		SELECT c.system AS system, COALESCE(c.status, '') AS status, COUNT(*) AS count
		FROM containers c
		INNER JOIN systems s ON s.id = c.system
		WHERE (` + systemFilter + `)
		GROUP BY c.system, COALESCE(c.status, '')
		ORDER BY LOWER(COALESCE(NULLIF(s.display_name, ''), s.name))
	`
	if err := h.DB().NewQuery(query).Bind(params).All(&rows); err != nil {
		return nil, "", e.InternalServerError("Failed to load container summaries", err)
	}

	bySystem := map[string]*containerSystemSummary{}
	order := []string{}
	for _, row := range rows {
		summary := bySystem[row.System]
		if summary == nil {
			summary = &containerSystemSummary{ID: row.System}
			bySystem[row.System] = summary
			order = append(order, row.System)
		}
		summary.Total += row.Count
		if dashboardContainerStatusRunning(row.Status) {
			summary.Running += row.Count
		}
	}
	for _, summary := range bySystem {
		summary.Stopped = summary.Total - summary.Running
	}

	selectedSystemID := requestedSystemID
	if selectedSystemID == "" && len(order) > 0 {
		selectedSystemID = order[0]
	}

	if requestedSystemID != "" {
		visible, err := h.isContainerSystemVisible(e, requestedSystemID)
		if err != nil {
			return nil, "", e.InternalServerError("Failed to validate container system", err)
		}
		if !visible {
			return nil, "", e.NotFoundError("System not found", nil)
		}
		if _, ok := bySystem[requestedSystemID]; !ok {
			bySystem[requestedSystemID] = &containerSystemSummary{ID: requestedSystemID}
			order = append([]string{requestedSystemID}, order...)
		}
	}

	summaries := make([]containerSystemSummary, 0, len(order))
	seen := map[string]struct{}{}
	for _, id := range order {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		if summary := bySystem[id]; summary != nil {
			summaries = append(summaries, *summary)
		}
	}
	return summaries, selectedSystemID, nil
}

func (h *Hub) isContainerSystemVisible(e *core.RequestEvent, systemID string) (bool, error) {
	systemFilter, params := h.dashboardSystemAccessFilter(e, "s")
	params["system"] = systemID
	row := struct {
		Count int `db:"count"`
	}{}
	query := `SELECT COUNT(*) AS count FROM systems s WHERE s.id = {:system} AND (` + systemFilter + `)`
	if err := h.DB().NewQuery(query).Bind(params).One(&row); err != nil {
		return false, err
	}
	return row.Count > 0, nil
}

func (h *Hub) listContainersForSystem(e *core.RequestEvent, systemID string, limit int) ([]containerListItem, bool, error) {
	systemFilter, params := h.dashboardSystemAccessFilter(e, "s")
	params["system"] = systemID
	params["limit"] = limit + 1
	items := []containerListItem{}
	query := `
		SELECT
			c.id,
			c.system,
			COALESCE(c.name, '') AS name,
			COALESCE(c.image, '') AS image,
			COALESCE(c.ports, '') AS ports,
			COALESCE(c.cpu, 0) AS cpu,
			COALESCE(c.memory, 0) AS memory,
			COALESCE(c.net, 0) AS net,
			COALESCE(c.health, 0) AS health,
			COALESCE(c.status, '') AS status,
			COALESCE(c.stack_project, '') AS stack_project,
			COALESCE(c.stack_service, '') AS stack_service,
			COALESCE(c.stack_number, '') AS stack_number,
			COALESCE(c.stack_config, '') AS stack_config,
			COALESCE(c.stack_working_dir, '') AS stack_working_dir,
			COALESCE(c.updated, 0) AS updated
		FROM containers c
		INNER JOIN systems s ON s.id = c.system
		WHERE c.system = {:system} AND (` + systemFilter + `)
		ORDER BY
			LOWER(COALESCE(NULLIF(c.stack_project, ''), '~~~~')),
			LOWER(COALESCE(c.stack_service, '')),
			LOWER(COALESCE(c.name, '')),
			c.updated DESC
		LIMIT {:limit}
	`
	if err := h.DB().NewQuery(query).Bind(params).All(&items); err != nil {
		return nil, false, e.InternalServerError("Failed to load containers", err)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	trimDuplicateStackConfigs(items)
	return items, hasMore, nil
}

func trimDuplicateStackConfigs(items []containerListItem) {
	seen := map[string]struct{}{}
	for i := range items {
		project := strings.TrimSpace(items[i].StackProject)
		if project == "" || strings.TrimSpace(items[i].StackConfig) == "" {
			continue
		}
		key := items[i].System + ":" + project
		if _, ok := seen[key]; ok {
			items[i].StackConfig = ""
			continue
		}
		seen[key] = struct{}{}
	}
}
