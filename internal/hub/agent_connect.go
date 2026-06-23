package hub

import (
	"context"
	"errors"
	"net"
	"net/http"
	"os"
	"net/url"
	"strings"
	"sync"
	"time"

	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/system"
	"gutenacht.site/pulse/internal/hub/expirymap"
	"gutenacht.site/pulse/internal/hub/ws"

	"github.com/blang/semver"
	"github.com/lxzan/gws"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// agentConnectRequest holds information related to an agent's connection attempt.
type agentConnectRequest struct {
	hub          *Hub
	req          *http.Request
	res          http.ResponseWriter
	token        string
	agentSemVer  semver.Version
	isLocalAgent bool
	// isUniversalToken is true if the token is a universal token.
	isUniversalToken bool
	// userId is the user ID associated with the universal token.
	userId string
}

const defaultLocalAgentToken = "pulse-local-agent"

// universalTokenMap stores active universal tokens and their associated user IDs.
var universalTokenMap tokenMap

type tokenMap struct {
	store *expirymap.ExpiryMap[string]
	once  sync.Once
}

// getMap returns the expirymap, creating it if necessary.
func (tm *tokenMap) GetMap() *expirymap.ExpiryMap[string] {
	tm.once.Do(func() {
		tm.store = expirymap.New[string](time.Hour)
	})
	return tm.store
}

// handleAgentConnect is the HTTP handler for an agent's connection request.
func (h *Hub) handleAgentConnect(e *core.RequestEvent) error {
	agentRequest := agentConnectRequest{req: e.Request, res: e.Response, hub: h}
	_ = agentRequest.agentConnect()
	return nil
}

// agentConnect validates agent credentials and upgrades the connection to a WebSocket.
func (acr *agentConnectRequest) agentConnect() (err error) {
	var agentVersion string

	acr.token, agentVersion, err = acr.validateAgentHeaders(acr.req.Header)
	if err != nil {
		return acr.sendResponseError(acr.res, http.StatusBadRequest, "")
	}

	if acr.isLocalAgentToken() {
		if !isLoopbackLocalAgentRequest(acr.req) {
			return acr.sendResponseError(acr.res, http.StatusUnauthorized, "Invalid token")
		}
		acr.isLocalAgent = true
	} else {
		// Check if token is an active universal token
		acr.userId, acr.isUniversalToken = universalTokenMap.GetMap().GetOk(acr.token)
		if !acr.isUniversalToken {
			// Fallback: check for a permanent universal token stored in the DB
			if rec, err := acr.hub.FindFirstRecordByFilter("universal_tokens", "token = {:token}", dbx.Params{"token": acr.token}); err == nil {
				if userID := rec.GetString("user"); userID != "" {
					acr.userId = userID
					acr.isUniversalToken = true
				}
			}
		}
	}

	// Find matching device binding records for this token.
	fpRecords := getFingerprintRecordsByToken(acr.token, acr.hub)
	if len(fpRecords) == 0 && !acr.isUniversalToken && !acr.isLocalAgent {
		// Invalid token - no records found and not a universal token
		return acr.sendResponseError(acr.res, http.StatusUnauthorized, "Invalid token")
	}

	// Validate agent version
	acr.agentSemVer, err = semver.Parse(agentVersion)
	if err != nil {
		return acr.sendResponseError(acr.res, http.StatusUnauthorized, "Invalid agent version")
	}

	// Upgrade connection to WebSocket
	conn, err := ws.GetUpgrader().Upgrade(acr.res, acr.req)
	if err != nil {
		return acr.sendResponseError(acr.res, http.StatusInternalServerError, "WebSocket upgrade failed")
	}

	go func() {
		if err := acr.verifyWsConn(conn, fpRecords); err != nil {
			acr.hub.Logger().Error("Agent WebSocket verification failed", "remote", acr.req.RemoteAddr, "err", err)
		}
	}()

	return nil
}

// verifyWsConn verifies the token-authenticated WebSocket connection using the
// agent's stable device identity, then adds the system to the system manager.
func (acr *agentConnectRequest) verifyWsConn(conn *gws.Conn, fpRecords []ws.FingerprintRecord) (err error) {
	wsConn := ws.NewWsConnection(conn, acr.agentSemVer)

	// must set wsConn in connection store before the read loop
	conn.Session().Store("wsConn", wsConn)

	// make sure connection is closed if there is an error
	defer func() {
		if err != nil {
			wsConn.Close([]byte(err.Error()))
		}
	}()

	go conn.ReadLoop()

	agentFingerprint, err := wsConn.GetFingerprint(context.Background(), acr.isUniversalToken || acr.isLocalAgent)
	if err != nil {
		return err
	}
	// Find or create the appropriate WebSocket-bound system for this token and identity.
	fpRecord, err := acr.findOrCreateSystemForToken(fpRecords, agentFingerprint)
	if err != nil {
		return err
	}
	acr.hub.Logger().Info("Agent WebSocket system bound", "system", fpRecord.SystemId, "universal", acr.isUniversalToken)

	return acr.hub.sm.AddWebSocketSystem(fpRecord.SystemId, acr.agentSemVer, wsConn, getRealIP(acr.req))
}

// validateAgentHeaders extracts and validates the token and agent version from HTTP headers.
func (acr *agentConnectRequest) validateAgentHeaders(headers http.Header) (string, string, error) {
	token := headers.Get("X-Token")
	agentVersion := headers.Get("X-Pulse")
	if agentVersion == "" {
		agentVersion = headers.Get("X-Beszel")
	}

	if agentVersion == "" || token == "" || len(token) > 64 {
		return "", "", errors.New("")
	}
	return token, agentVersion, nil
}

func (acr *agentConnectRequest) isLocalAgentToken() bool {
	return acr.token == localAgentToken()
}

func localAgentToken() string {
	if token := strings.TrimSpace(os.Getenv("PULSE_LOCAL_AGENT_TOKEN")); token != "" {
		return token
	}
	if token := strings.TrimSpace(os.Getenv("BESZEL_LOCAL_AGENT_TOKEN")); token != "" {
		return token
	}
	return defaultLocalAgentToken
}

func (h *Hub) repairLocalSystemMarkers() error {
	localToken := localAgentToken()
	type localSystemBinding struct {
		SystemId         string `db:"id"`
		HasLocalToken    int    `db:"has_local_token"`
		PairingConfirmed int    `db:"pairing_confirmed"`
	}
	var bindings []localSystemBinding
	if err := h.DB().NewQuery(`
		SELECT
			s.id,
			CASE WHEN s.pairing_confirmed THEN 1 ELSE 0 END AS pairing_confirmed,
			CASE WHEN EXISTS (
				SELECT 1 FROM fingerprints f
				WHERE f.system = s.id AND f.token = {:token}
			) THEN 1 ELSE 0 END AS has_local_token
		FROM systems s
		WHERE s.is_local = true
			AND EXISTS (
				SELECT 1 FROM fingerprints f_any
				WHERE f_any.system = s.id
			)
	`).Bind(dbx.Params{"token": localToken}).All(&bindings); err != nil {
		return err
	}
	for _, binding := range bindings {
		if binding.HasLocalToken == 1 {
			continue
		}
		record, err := h.FindRecordById("systems", binding.SystemId)
		if err != nil {
			return err
		}
		if binding.PairingConfirmed == 0 {
			record.Set("is_local", false)
			if err := h.SaveNoValidate(record); err != nil {
				return err
			}
			h.Logger().Info("Cleared unconfirmed Hub local marker", "system", binding.SystemId)
			continue
		}
		if shouldKeepDevLoopbackHubMarker(record) {
			continue
		}
		record.Set("is_local", false)
		if err := h.SaveNoValidate(record); err != nil {
			return err
		}
		h.Logger().Info("Cleared stale Hub local marker", "system", binding.SystemId)
	}
	return nil
}

func shouldKeepDevLoopbackHubMarker(record *core.Record) bool {
	if record == nil || !devLocalAgentAsHubEnabled() {
		return false
	}
	var info system.Info
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return false
	}
	return isDevHubLocalIP(info.RemoteIP) || isDevHubLocalIP(firstNonEmpty(record.GetString("target_ip"), record.GetString("connect_ip")))
}

func devLocalAgentAsHubEnabled() bool {
	value := strings.TrimSpace(os.Getenv("PULSE_DEV_LOCAL_AGENT_AS_HUB"))
	return value == "1" || strings.EqualFold(value, "true") || strings.EqualFold(value, "yes")
}

func isLoopbackRemoteAddr(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	return isLoopbackIPHost(host)
}

func isLoopbackLocalAgentRequest(r *http.Request) bool {
	return r != nil && isDevLocalAgentRemoteAddr(r.RemoteAddr) && isDevLocalAgentRequestHost(r.Host)
}

func isDevLocalAgentRemoteAddr(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	return isDevLocalAgentIP(host)
}

func isDevLocalAgentRequestHost(hostport string) bool {
	host, _, err := net.SplitHostPort(hostport)
	if err != nil {
		host = hostport
	}
	return isDevLocalAgentHost(host)
}

func isLoopbackRequestHost(hostport string) bool {
	host, _, err := net.SplitHostPort(hostport)
	if err != nil {
		host = hostport
	}
	return isLoopbackHost(host)
}

func isLoopbackHost(host string) bool {
	host = strings.Trim(strings.TrimSpace(host), "[]")
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func isLoopbackIPHost(host string) bool {
	host = strings.Trim(strings.TrimSpace(host), "[]")
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

func isDevLocalAgentHost(host string) bool {
	if devLocalAgentAsHubEnabled() {
		return isDevHubLocalIP(host)
	}
	return isLoopbackHost(host)
}

func isDevLocalAgentIP(host string) bool {
	if devLocalAgentAsHubEnabled() {
		return isDevHubLocalIP(host)
	}
	return isLoopbackIPHost(host)
}

func isDevHubLocalIP(value string) bool {
	value = strings.TrimSpace(value)
	if value == "" {
		return false
	}
	host := value
	if parsedURL, err := url.Parse(value); err == nil && parsedURL.Host != "" {
		host = parsedURL.Hostname()
	}
	host = strings.Trim(strings.TrimSpace(host), "[]")
	ip := net.ParseIP(host)
	if ip == nil {
		return false
	}
	if ip.IsLoopback() {
		return true
	}
	return isPrivateIPv4(ip)
}

func isPrivateIPv4(ip net.IP) bool {
	v4 := ip.To4()
	if v4 == nil {
		return false
	}
	switch {
	case v4[0] == 10:
		return true
	case v4[0] == 172 && v4[1] >= 16 && v4[1] <= 31:
		return true
	case v4[0] == 192 && v4[1] == 168:
		return true
	default:
		return false
	}
}

// sendResponseError writes an HTTP error response.
func (acr *agentConnectRequest) sendResponseError(res http.ResponseWriter, code int, message string) error {
	res.WriteHeader(code)
	if message != "" {
		res.Write([]byte(message))
	}
	return nil
}

// getFingerprintRecordsByToken retrieves all fingerprint records associated with a given token.
func getFingerprintRecordsByToken(token string, h *Hub) []ws.FingerprintRecord {
	var records []ws.FingerprintRecord
	// All will populate empty slice even on error
	_ = h.DB().NewQuery("SELECT id, system, fingerprint, token FROM fingerprints WHERE token = {:token}").
		Bind(dbx.Params{
			"token": token,
		}).
		All(&records)
	return records
}

// findOrCreateSystemForToken finds an existing WebSocket-bound system matching
// the token and device identity, or creates a new one for a universal token.
func (acr *agentConnectRequest) findOrCreateSystemForToken(fpRecords []ws.FingerprintRecord, agentFingerprint common.FingerprintResponse) (ws.FingerprintRecord, error) {
	if acr.isLocalAgent {
		return acr.findOrCreateLocalSystem(agentFingerprint)
	}
	// No records - only valid for active universal tokens
	if len(fpRecords) == 0 {
		return acr.handleNoRecords(agentFingerprint)
	}

	// Single record - handle as regular token
	if len(fpRecords) == 1 && !acr.isUniversalToken {
		return acr.handleSingleRecord(fpRecords[0], agentFingerprint)
	}

	// Multiple records or universal token - look for matching fingerprint
	return acr.handleMultipleRecordsOrUniversalToken(fpRecords, agentFingerprint)
}

// handleNoRecords handles the case where no fingerprint records are found for a token.
// A new system is created if the token is a valid universal token.
func (acr *agentConnectRequest) handleNoRecords(agentFingerprint common.FingerprintResponse) (ws.FingerprintRecord, error) {
	var fpRecord ws.FingerprintRecord

	if !acr.isUniversalToken || acr.userId == "" {
		return fpRecord, errors.New("no matching fingerprints")
	}

	return acr.createNewSystemForUniversalToken(agentFingerprint)
}

// handleSingleRecord handles the case with a single binding record. It validates
// the agent's stable identity against the stored one, or sets it on first connect.
func (acr *agentConnectRequest) handleSingleRecord(fpRecord ws.FingerprintRecord, agentFingerprint common.FingerprintResponse) (ws.FingerprintRecord, error) {
	// If no current fingerprint, update with new fingerprint (first time connecting)
	if fpRecord.Fingerprint == "" {
		if err := acr.hub.SetFingerprint(&fpRecord, agentFingerprint.Fingerprint); err != nil {
			return fpRecord, err
		}
		// Update the record with the fingerprint that was set
		fpRecord.Fingerprint = agentFingerprint.Fingerprint
		return fpRecord, nil
	}

	// Abort if fingerprint exists but doesn't match (different machine)
	if fpRecord.Fingerprint != agentFingerprint.Fingerprint {
		return fpRecord, errors.New("fingerprint mismatch")
	}

	return fpRecord, nil
}

func (acr *agentConnectRequest) findOrCreateLocalSystem(agentFingerprint common.FingerprintResponse) (ws.FingerprintRecord, error) {
	var fpRecord ws.FingerprintRecord

	systemRecord, err := acr.findOrCreateLocalSystemRecord(agentFingerprint)
	if err != nil {
		return fpRecord, err
	}

	fpRecord.SystemId = systemRecord.Id
	fpRecord.Token = acr.token

	fpRecords := getFingerprintRecordsByToken(acr.token, acr.hub)
	for i := range fpRecords {
		if fpRecords[i].SystemId == systemRecord.Id {
			fpRecord = fpRecords[i]
			break
		}
	}
	if fpRecord.Id == "" {
		if existingRecord, err := acr.getFingerprintRecordForSystem(systemRecord.Id); err == nil {
			fpRecord = existingRecord
		}
	}

	if err := acr.hub.SetFingerprint(&fpRecord, agentFingerprint.Fingerprint); err != nil {
		return fpRecord, err
	}
	fpRecord.Fingerprint = agentFingerprint.Fingerprint
	return fpRecord, nil
}

func (acr *agentConnectRequest) findOrCreateLocalSystemRecord(agentFingerprint common.FingerprintResponse) (*core.Record, error) {
	record, err := acr.findExistingSystemByFingerprint(agentFingerprint.Fingerprint)
	if err == nil {
		if isKnownNonHubLocalAgentRecord(record) {
			return nil, errors.New("local agent token cannot claim a non-Hub agent record")
		}
		updateLocalSystemRecord(record, agentFingerprint, false)
		if err := acr.clearOtherLocalSystemRecords(record.Id); err != nil {
			return nil, err
		}
		return record, acr.hub.Save(record)
	}

	record, err = acr.findReusableLocalSystemRecord(agentFingerprint)
	if err == nil {
		updateLocalSystemRecord(record, agentFingerprint, false)
		if err := acr.clearOtherLocalSystemRecords(record.Id); err != nil {
			return nil, err
		}
		return record, acr.hub.Save(record)
	}

	userID, err := acr.firstUserID()
	if err != nil {
		return nil, err
	}

	collection, err := acr.hub.FindCachedCollectionByNameOrId("systems")
	if err != nil {
		return nil, err
	}
	record = core.NewRecord(collection)
	record.Set("users", []string{userID})
	record.Set("pairing_confirmed", true)
	remoteIP := getRealIP(acr.req)
	updateLocalSystemRecord(record, agentFingerprint, true)
	record.Set("info", map[string]any{
		"ct": system.ConnectionTypeWebSocket,
		"h":  agentFingerprint.Hostname,
		"ip": remoteIP,
	})
	return record, acr.hub.Save(record)
}

func isKnownNonHubLocalAgentRecord(record *core.Record) bool {
	if record == nil {
		return false
	}
	var info system.Info
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return false
	}
	return isNonHubLocalAgentInfo(info)
}

func isNonHubLocalAgentInfo(info system.Info) bool {
	capabilities := info.Capabilities
	if capabilities == nil {
		return false
	}
	profile := strings.ToLower(strings.TrimSpace(capabilities.AgentProfile))
	platform := strings.ToLower(strings.TrimSpace(capabilities.Platform))
	installMethod := strings.ToLower(strings.TrimSpace(capabilities.InstallMethod))
	runMode := strings.ToLower(strings.TrimSpace(capabilities.RunMode))
	return profile == "windows-host" ||
		platform == "windows" ||
		installMethod == "windows" ||
		strings.Contains(runMode, "windows")
}

func (acr *agentConnectRequest) clearOtherLocalSystemRecords(systemID string) error {
	records, err := acr.hub.FindRecordsByFilter("systems", "is_local = true && id != {:system}", "", 0, 0, dbx.Params{"system": systemID})
	if err != nil {
		return err
	}
	for _, record := range records {
		record.Set("is_local", false)
		if err := acr.hub.Save(record); err != nil {
			return err
		}
	}
	return nil
}

func (acr *agentConnectRequest) findReusableLocalSystemRecord(agentFingerprint common.FingerprintResponse) (*core.Record, error) {
	record, err := acr.hub.FindFirstRecordByFilter("systems", "is_local = true")
	if err != nil {
		return nil, err
	}
	fpRecord, err := acr.getFingerprintRecordForSystem(record.Id)
	if err != nil {
		return record, nil
	}
	storedFingerprint := strings.TrimSpace(fpRecord.Fingerprint)
	currentFingerprint := strings.TrimSpace(agentFingerprint.Fingerprint)
	if storedFingerprint == "" || currentFingerprint == "" || storedFingerprint == currentFingerprint {
		return record, nil
	}
	record.Set("is_local", false)
	if saveErr := acr.hub.Save(record); saveErr != nil {
		return nil, saveErr
	}
	return nil, errors.New("stale local system fingerprint")
}

func (acr *agentConnectRequest) findExistingSystemByFingerprint(fingerprint string) (*core.Record, error) {
	if strings.TrimSpace(fingerprint) == "" {
		return nil, errors.New("empty fingerprint")
	}
	type fingerprintSystem struct {
		SystemId string `db:"system"`
	}
	var row fingerprintSystem
	if err := acr.hub.DB().NewQuery("SELECT system FROM fingerprints WHERE fingerprint = {:fingerprint} LIMIT 1").
		Bind(dbx.Params{"fingerprint": fingerprint}).
		One(&row); err != nil {
		return nil, err
	}
	if row.SystemId == "" {
		return nil, errors.New("fingerprint has no system")
	}
	return acr.hub.FindRecordById("systems", row.SystemId)
}

func (acr *agentConnectRequest) getFingerprintRecordForSystem(systemID string) (ws.FingerprintRecord, error) {
	var record ws.FingerprintRecord
	if strings.TrimSpace(systemID) == "" {
		return record, errors.New("empty system id")
	}
	err := acr.hub.DB().NewQuery("SELECT id, system, fingerprint, token FROM fingerprints WHERE system = {:system} LIMIT 1").
		Bind(dbx.Params{"system": systemID}).
		One(&record)
	return record, err
}

func (acr *agentConnectRequest) firstUserID() (string, error) {
	users, err := acr.hub.FindRecordsByFilter("users", "id != ''", "created", 1, 0)
	if err != nil {
		return "", err
	}
	if len(users) == 0 {
		return "", errors.New("local agent is waiting for the first Hub user")
	}
	return users[0].Id, nil
}

func updateLocalSystemRecord(record *core.Record, agentFingerprint common.FingerprintResponse, initializeDefaults bool) {
	if displayName := localSystemDisplayName(record, agentFingerprint); displayName != "" {
		record.Set("name", displayName)
	}
	record.Set("is_local", true)
	if initializeDefaults {
		record.Set("role", "physical")
		record.Set("primary_use", "production")
		record.Set("description", "Hub 所在机器")
	} else if strings.TrimSpace(record.GetString("description")) == "" {
		record.Set("description", "Hub 所在机器")
	}
}

func localSystemDisplayName(record *core.Record, agentFingerprint common.FingerprintResponse) string {
	name := strings.TrimSpace(agentFingerprint.Name)
	if name == "本机" {
		name = ""
	}
	if name == "" {
		name = strings.TrimSpace(agentFingerprint.Hostname)
	}
	if name == "本机" {
		name = ""
	}
	if name != "" {
		return name
	}
	currentName := strings.TrimSpace(record.GetString("name"))
	if currentName == "本机" {
		return ""
	}
	return currentName
}

// handleMultipleRecordsOrUniversalToken finds a matching fingerprint from multiple records.
// If no match is found and the token is a universal token, a new system is created.
func (acr *agentConnectRequest) handleMultipleRecordsOrUniversalToken(fpRecords []ws.FingerprintRecord, agentFingerprint common.FingerprintResponse) (ws.FingerprintRecord, error) {
	// Return existing record with matching fingerprint if found
	for i := range fpRecords {
		if fpRecords[i].Fingerprint == agentFingerprint.Fingerprint {
			return fpRecords[i], nil
		}
	}

	// No matching fingerprint record found, but it's
	// an active universal token so create a new system
	if acr.isUniversalToken {
		return acr.createNewSystemForUniversalToken(agentFingerprint)
	}

	return ws.FingerprintRecord{}, errors.New("fingerprint mismatch")
}

// createNewSystemForUniversalToken creates a new system and fingerprint record for a universal token.
func (acr *agentConnectRequest) createNewSystemForUniversalToken(agentFingerprint common.FingerprintResponse) (ws.FingerprintRecord, error) {
	var fpRecord ws.FingerprintRecord
	if !acr.isUniversalToken || acr.userId == "" {
		return fpRecord, errors.New("invalid token")
	}

	fpRecord.Token = acr.token

	systemId, err := acr.createSystem(agentFingerprint)
	if err != nil {
		return fpRecord, err
	}
	fpRecord.SystemId = systemId

	// Set the fingerprint for the new system
	if err := acr.hub.SetFingerprint(&fpRecord, agentFingerprint.Fingerprint); err != nil {
		return fpRecord, err
	}

	// Update the record with the fingerprint that was set
	fpRecord.Fingerprint = agentFingerprint.Fingerprint

	return fpRecord, nil
}

// createSystem creates a new system record in the database using details from the agent.
func (acr *agentConnectRequest) createSystem(agentFingerprint common.FingerprintResponse) (recordId string, err error) {
	systemsCollection, err := acr.hub.FindCachedCollectionByNameOrId("systems")
	if err != nil {
		return "", err
	}
	if agentFingerprint.Hostname == "" {
		agentFingerprint.Hostname = getRealIP(acr.req)
	}
	if agentFingerprint.Name == "" {
		agentFingerprint.Name = agentFingerprint.Hostname
	}
	// create new record
	systemRecord := core.NewRecord(systemsCollection)
	systemRecord.Set("name", agentFingerprint.Name)
	systemRecord.Set("users", []string{acr.userId})
	systemRecord.Set("pairing_confirmed", true)
	systemRecord.Set("info", map[string]any{
		"ct": system.ConnectionTypeWebSocket,
		"h":  agentFingerprint.Hostname,
		"ip": getRealIP(acr.req),
	})
	if err := acr.hub.Save(systemRecord); err != nil {
		return "", err
	}
	systemRecord.Set("info", map[string]any{
		"ct": system.ConnectionTypeWebSocket,
		"h":  agentFingerprint.Hostname,
		"ip": getRealIP(acr.req),
	})
	if err := acr.hub.SaveNoValidate(systemRecord); err != nil {
		return "", err
	}
	return systemRecord.Id, nil
}

// SetFingerprint creates or updates the stable device identity for a WebSocket binding record.
func (h *Hub) SetFingerprint(fpRecord *ws.FingerprintRecord, fingerprint string) (err error) {
	// // can't use raw query here because it doesn't trigger SSE
	var record *core.Record
	switch fpRecord.Id {
	case "":
		// create new record for universal token
		collection, _ := h.FindCachedCollectionByNameOrId("fingerprints")
		record = core.NewRecord(collection)
		record.Set("system", fpRecord.SystemId)
	default:
		record, err = h.FindRecordById("fingerprints", fpRecord.Id)
	}
	if err != nil {
		return err
	}
	record.Set("token", fpRecord.Token)
	record.Set("fingerprint", fingerprint)
	return h.SaveNoValidate(record)
}

// getRealIP extracts the client's real IP address from request headers,
// checking common proxy headers before falling back to the remote address.
func getRealIP(r *http.Request) string {
	if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		// X-Forwarded-For can contain a comma-separated list: "client_ip, proxy1, proxy2"
		// Take the first one
		ips := strings.Split(ip, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}
	// Fallback to RemoteAddr
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
