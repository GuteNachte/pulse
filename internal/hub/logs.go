package hub

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type systemLogRecord struct {
	Id      string `db:"id" json:"id"`
	Level   int    `db:"level" json:"level"`
	Message string `db:"message" json:"message"`
	Data    string `db:"data" json:"data"`
	Created string `db:"created" json:"created"`
}

type systemLogListResponse struct {
	Items   []systemLogRecord `json:"items"`
	Page    int               `json:"page"`
	PerPage int               `json:"perPage"`
	HasMore bool              `json:"hasMore"`
}

func (h *Hub) getSystemLogs(e *core.RequestEvent) error {
	page := clampQueryInt(e.Request.URL.Query().Get("page"), 1, 1, 10_000)
	perPage := parseLogPageSize(e.Request.URL.Query().Get("perPage"), e.Request.URL.Query().Get("limit"))
	level := strings.TrimSpace(e.Request.URL.Query().Get("level"))
	search := strings.TrimSpace(e.Request.URL.Query().Get("search"))

	where := []string{"1=1"}
	params := dbx.Params{
		"limit":  perPage + 1,
		"offset": (page - 1) * perPage,
	}
	if level != "" && level != "all" {
		if parsed, err := strconv.Atoi(level); err == nil {
			where = append(where, "level = {:level}")
			params["level"] = parsed
		}
	}
	if search != "" {
		where = append(where, "(message LIKE {:search} OR data LIKE {:search})")
		params["search"] = "%" + search + "%"
	}

	var logs []systemLogRecord
	query := `
		SELECT id, level, message, data, created
		FROM _logs
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY created DESC
		LIMIT {:limit}
		OFFSET {:offset}
	`
	if err := e.App.AuxDB().NewQuery(query).Bind(params).All(&logs); err != nil {
		return e.InternalServerError("Failed to load system logs", err)
	}
	hasMore := len(logs) > perPage
	if hasMore {
		logs = logs[:perPage]
	}
	return e.JSON(http.StatusOK, systemLogListResponse{
		Items:   logs,
		Page:    page,
		PerPage: perPage,
		HasMore: hasMore,
	})
}

func parseLogPageSize(perPageRaw string, limitRaw string) int {
	raw := strings.TrimSpace(perPageRaw)
	if raw == "" {
		raw = strings.TrimSpace(limitRaw)
	}
	return clampQueryInt(raw, 80, 1, 500)
}
