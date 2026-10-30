package hub

import (
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// getAgentStatus reports the connection state for the system bound to an
// Agent token. It intentionally returns no system data and never changes state.
func (h *Hub) getAgentStatus(e *core.RequestEvent) error {
	token := strings.TrimSpace(e.Request.Header.Get("X-Token"))
	if token == "" || len(token) > 64 {
		return e.UnauthorizedError("Invalid agent token.", nil)
	}

	type fingerprintBinding struct {
		SystemID string `db:"system"`
	}
	var binding fingerprintBinding
	if err := h.DB().NewQuery("SELECT system FROM fingerprints WHERE token = {:token} LIMIT 1").
		Bind(dbx.Params{"token": token}).One(&binding); err != nil || binding.SystemID == "" {
		return e.UnauthorizedError("Invalid agent token.", nil)
	}

	record, err := h.FindRecordById("systems", binding.SystemID)
	if err != nil {
		return e.JSON(http.StatusOK, map[string]string{"status": "down"})
	}
	status := strings.TrimSpace(record.GetString("status"))
	if system, getErr := h.sm.GetSystem(binding.SystemID); getErr == nil && system.WsConn != nil && system.WsConn.IsConnected() {
		status = "up"
	}
	if status == "" {
		status = "down"
	}
	return e.JSON(http.StatusOK, map[string]string{"status": status})
}
