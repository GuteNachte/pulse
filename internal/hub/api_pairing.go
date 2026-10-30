package hub

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/entities/system"
)

type agentPairRequest struct {
	Code          string         `json:"code"`
	Hostname      string         `json:"hostname"`
	Name          string         `json:"name"`
	Fingerprint   string         `json:"fingerprint"`
	ReportedIPs   []string       `json:"reported_ips"`
	Platform      string         `json:"platform"`
	Arch          string         `json:"arch"`
	AgentVersion  string         `json:"agent_version"`
	InstallMethod string         `json:"install_method"`
	RunMode       string         `json:"run_mode"`
	Capabilities  map[string]any `json:"capabilities"`
}

type createPairingCodeRequest struct {
	ExpectedIP string `json:"expected_ip"`
	TargetIP   string `json:"target_ip"`
	Asset      string `json:"asset"`
}

func normalizePairingCode(code string) string {
	return strings.NewReplacer("-", "", " ", "", "\t", "", "\r", "", "\n", "").Replace(strings.TrimSpace(code))
}

func isSixDigitPairingCode(code string) bool {
	if len(code) != 6 {
		return false
	}
	for _, digit := range code {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return true
}

func formatPairingCode(code string) string {
	code = normalizePairingCode(code)
	if len(code) == 6 {
		return code[:3] + "-" + code[3:]
	}
	return code
}

func generatePairingCode() (string, error) {
	var b [3]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	n := int(b[0])<<16 | int(b[1])<<8 | int(b[2])
	return fmt.Sprintf("%06d", n%1000000), nil
}

func generateSecretHex(bytesLen int) (string, error) {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func (h *Hub) createPairingCode(e *core.RequestEvent) error {
	var req createPairingCodeRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		h.createOperationAudit(e, "", "create_pairing_code", "", "", "failed", "Invalid pairing code request", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid pairing code request", err)
	}
	expectedIP, err := normalizePairingExpectedIP(firstNonEmpty(req.TargetIP, req.ExpectedIP))
	if err != nil {
		h.createOperationAudit(e, "", "create_pairing_code", firstNonEmpty(req.TargetIP, req.ExpectedIP), "", "failed", "Invalid target IP", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid target IP", err)
	}
	assetID := strings.TrimSpace(req.Asset)
	if err := h.validateAgentPairingAsset(assetID, e.Auth.Id); err != nil {
		h.createOperationAudit(e, "", "create_pairing_code", assetID, "", "failed", err.Error(), operationFailureInvalidRequest)
		return e.BadRequestError(err.Error(), err)
	}

	code, err := generatePairingCode()
	if err != nil {
		return e.InternalServerError("", err)
	}
	for i := 0; i < 5; i++ {
		if _, err := h.FindFirstRecordByFilter("agent_pairing_codes", "code = {:code}", dbx.Params{"code": code}); err != nil {
			break
		}
		code, err = generatePairingCode()
		if err != nil {
			return e.InternalServerError("", err)
		}
	}

	collection, err := h.FindCachedCollectionByNameOrId("agent_pairing_codes")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("code", code)
	record.Set("user", e.Auth.Id)
	record.Set("asset", assetID)
	record.Set("expected_ip", expectedIP)
	// 配对码是资产级长期凭据，不设置过期时间；旧数据中的 expires_at 仅作兼容保留。
	record.Set("expires_at", "")
	record.Set("used", false)
	if err := h.SaveNoValidate(record); err != nil {
		h.createOperationAudit(e, "", "create_pairing_code", expectedIP, "", "failed", err.Error(), operationFailureFailed)
		return err
	}

	h.createOperationAudit(e, "", "create_pairing_code", expectedIP, "", "success", "Agent 配对会话已创建")
	return e.JSON(http.StatusOK, h.pairingCodeResponse(record))
}

func (h *Hub) listPairingCodes(e *core.RequestEvent) error {
	filter := "user = {:user}"
	params := dbx.Params{"user": e.Auth.Id}
	if systemID := strings.TrimSpace(e.Request.URL.Query().Get("system")); systemID != "" {
		filter += " && system = {:system}"
		params["system"] = systemID
	}
	records, err := h.FindRecordsByFilter(
		"agent_pairing_codes",
		filter,
		"-created",
		20,
		0,
		params,
	)
	if err != nil {
		return err
	}
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		items = append(items, h.pairingCodeResponse(record))
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}

func (h *Hub) getPairingCode(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	if id == "" {
		return e.BadRequestError("Missing pairing session id", nil)
	}
	record, err := h.FindFirstRecordByFilter(
		"agent_pairing_codes",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": id, "user": e.Auth.Id},
	)
	if err != nil {
		return e.NotFoundError("Pairing session not found", err)
	}
	return e.JSON(http.StatusOK, h.pairingCodeResponse(record))
}

func (h *Hub) resetPairingCode(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	if id == "" {
		return e.BadRequestError("Missing pairing session id", nil)
	}
	record, err := h.FindFirstRecordByFilter(
		"agent_pairing_codes",
		"id = {:id} && user = {:user}",
		dbx.Params{"id": id, "user": e.Auth.Id},
	)
	if err != nil {
		h.createOperationAudit(e, "", "reset_pairing_code", id, "", "failed", "Pairing session not found", operationFailureNotFound)
		return e.NotFoundError("Pairing session not found", err)
	}
	code, err := h.generateUniquePairingCode()
	if err != nil {
		h.createOperationAudit(e, record.GetString("system"), "reset_pairing_code", id, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("Failed to reset pairing code", err)
	}
	if systemID := strings.TrimSpace(record.GetString("system")); systemID != "" {
		if fingerprint, findErr := h.FindFirstRecordByFilter("fingerprints", "system = {:system}", dbx.Params{"system": systemID}); findErr == nil {
			token, tokenErr := generateSecretHex(24)
			if tokenErr != nil {
				return e.InternalServerError("Failed to reset pairing code", tokenErr)
			}
			fingerprint.Set("token", token)
			fingerprint.Set("fingerprint", "")
			if saveErr := h.SaveNoValidate(fingerprint); saveErr != nil {
				return e.InternalServerError("Failed to reset pairing code", saveErr)
			}
		}
	}
	record.Set("code", code)
	record.Set("used", false)
	record.Set("used_at", "")
	record.Set("used_by", "")
	for _, field := range []string{"connect_ip", "hostname", "fingerprint_summary", "agent_profile", "platform", "arch", "agent_version", "install_method", "run_mode"} {
		record.Set(field, "")
	}
	record.Set("reported_ips", []string{})
	if err := h.SaveNoValidate(record); err != nil {
		h.createOperationAudit(e, record.GetString("system"), "reset_pairing_code", id, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("Failed to reset pairing code", err)
	}
	h.createOperationAudit(e, record.GetString("system"), "reset_pairing_code", id, "", "success", "配对码已重置，旧配对码和旧设备凭据已失效")
	return e.JSON(http.StatusOK, h.pairingCodeResponse(record))
}

func (h *Hub) generateUniquePairingCode() (string, error) {
	for i := 0; i < 10; i++ {
		code, err := generatePairingCode()
		if err != nil {
			return "", err
		}
		if _, err := h.FindFirstRecordByFilter("agent_pairing_codes", "code = {:code}", dbx.Params{"code": code}); err != nil {
			return code, nil
		}
	}
	return "", errors.New("unable to generate a unique pairing code")
}

func (h *Hub) pairAgent(e *core.RequestEvent) error {
	// Public endpoint: throttle per source IP so the 6-digit code space cannot
	// be brute-forced from the network. Agents retrying a mistyped code stay
	// under the looser pairing threshold (see newPairAttemptLimiter).
	if h.pairLimiter == nil {
		h.pairLimiter = newPairAttemptLimiter()
	}
	key := "pair|" + getRealIP(e.Request)
	if retryAfter, limited := h.pairLimiter.retryAfter(key); limited {
		e.Response.Header().Set("Retry-After", retryAfterHeaderValue(retryAfter))
		return e.TooManyRequestsError("配对尝试次数过多，请稍后再试。", nil)
	}
	err := h.pairAgentAttempt(e)
	if err != nil {
		h.pairLimiter.recordFailure(key)
	}
	return err
}

func (h *Hub) pairAgentAttempt(e *core.RequestEvent) error {
	var req agentPairRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid pairing request", err)
	}
	code := normalizePairingCode(req.Code)
	if !isSixDigitPairingCode(code) {
		return e.BadRequestError("Invalid pairing code", nil)
	}
	if req.Fingerprint == "" || req.Hostname == "" {
		return e.BadRequestError("Missing required agent identity", nil)
	}

	pairingRecord, err := h.FindFirstRecordByFilter("agent_pairing_codes", "code = {:code}", dbx.Params{"code": code})
	if err != nil {
		return e.NotFoundError("Invalid or expired pairing code", err)
	}
	userID := pairingRecord.GetString("user")

	remoteIP := getRealIP(e.Request)
	if expectedIP := pairingRecord.GetString("expected_ip"); expectedIP != "" && !sameIP(expectedIP, remoteIP) {
		h.createOperationAuditForUser(e, pairingRecord.GetString("user"), "", "pair_agent", expectedIP, "", "failed", "Agent source IP does not match pairing target IP", operationFailureDenied)
		return e.BadRequestError("Agent source IP does not match pairing target IP", nil)
	}

	allowed, err := h.ensurePulseModuleEnabledForUser(e, "agent-management", userID)
	if err != nil {
		return err
	}
	if !allowed {
		return nil
	}
	assetID := strings.TrimSpace(pairingRecord.GetString("asset"))
	if err := h.validateAgentPairingAsset(assetID, userID); err != nil {
		h.createOperationAuditForUser(e, userID, "", "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureDenied)
		return e.BadRequestError(err.Error(), err)
	}
	existingSystemID := strings.TrimSpace(pairingRecord.GetString("system"))
	var existingFingerprint *core.Record
	if existingSystemID != "" {
		existingFingerprint, _ = h.FindFirstRecordByFilter("fingerprints", "system = {:system}", dbx.Params{"system": existingSystemID})
	}
	if pairingRecord.GetBool("used") {
		if existingSystemID == "" {
			return e.BadRequestError("配对码状态无效，请在网页中重置后重试", nil)
		}
		if existingFingerprint == nil || existingFingerprint.GetString("fingerprint") != strings.TrimSpace(req.Fingerprint) {
			h.createOperationAuditForUser(e, userID, existingSystemID, "pair_agent", req.Hostname, "", "failed", "Pairing code is bound to another device", operationFailureDenied)
			return e.BadRequestError("配对码已绑定其他设备，请先在网页中重置配对码", nil)
		}
	}
	if !pairingRecord.GetBool("used") {
		fingerprintInUse, err := h.rejectOrClearPairingFingerprintConflict(req.Fingerprint)
		if err != nil {
			h.createOperationAuditForUser(e, pairingRecord.GetString("user"), "", "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
			return e.InternalServerError("", err)
		}
		if fingerprintInUse {
			h.createOperationAuditForUser(e, pairingRecord.GetString("user"), "", "pair_agent", req.Hostname, "", "failed", "Agent fingerprint already belongs to another system", operationFailureDenied)
			return e.BadRequestError("Agent fingerprint already belongs to another system", nil)
		}
	}

	targetIP := pairingRecord.GetString("expected_ip")
	systemID := existingSystemID
	if systemID == "" {
		systemID, err = h.createPairedSystem(req, userID, assetID, remoteIP, targetIP)
		if err != nil {
			h.createOperationAuditForUser(e, userID, "", "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
			return e.InternalServerError("", err)
		}
	}
	if existingFingerprint == nil && systemID != "" {
		if fingerprintRecord, findErr := h.FindFirstRecordByFilter("fingerprints", "system = {:system}", dbx.Params{"system": systemID}); findErr == nil {
			existingFingerprint = fingerprintRecord
		}
	}
	token, err := generateSecretHex(24)
	if err != nil {
		h.createOperationAuditForUser(e, userID, systemID, "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}
	agentSecret, err := generateSecretHex(32)
	if err != nil {
		h.createOperationAuditForUser(e, userID, systemID, "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}
	if existingFingerprint != nil {
		existingFingerprint.Set("token", token)
		existingFingerprint.Set("fingerprint", req.Fingerprint)
		err = h.SaveNoValidate(existingFingerprint)
	} else {
		err = h.createPairedFingerprint(systemID, token, req.Fingerprint)
	}
	if err != nil {
		h.createOperationAuditForUser(e, userID, systemID, "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}

	now := time.Now().UTC().Format(time.RFC3339Nano)
	agentProfile := pairingAgentProfile(req)
	pairingRecord.Set("used", true)
	pairingRecord.Set("system", systemID)
	pairingRecord.Set("used_at", now)
	pairingRecord.Set("used_by", req.Hostname)
	pairingRecord.Set("target_ip", pairingRecord.GetString("expected_ip"))
	pairingRecord.Set("connect_ip", remoteIP)
	pairingRecord.Set("reported_ips", normalizePairingReportedIPs(req.ReportedIPs))
	pairingRecord.Set("hostname", req.Hostname)
	pairingRecord.Set("fingerprint_summary", summarizeFingerprint(req.Fingerprint))
	pairingRecord.Set("agent_profile", agentProfile)
	pairingRecord.Set("platform", req.Platform)
	pairingRecord.Set("arch", req.Arch)
	pairingRecord.Set("agent_version", req.AgentVersion)
	pairingRecord.Set("install_method", req.InstallMethod)
	pairingRecord.Set("run_mode", req.RunMode)
	if err := h.SaveNoValidate(pairingRecord); err != nil {
		h.createOperationAuditForUser(e, userID, systemID, "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
		return err
	}

	h.createOperationAuditForUser(e, userID, systemID, "pair_agent", req.Hostname, "", "success", "Agent 已配对")
	return e.JSON(http.StatusOK, map[string]any{
		"agent_id":          systemID,
		"agent_secret":      agentSecret,
		"agent_secret_hash": hashSecret(agentSecret),
		"token":             token,
		"hub_url":           strings.TrimRight(getHubURLFromRequest(e.Request), "/"),
		"system": map[string]any{
			"id":   systemID,
			"name": firstNonEmpty(req.Name, req.Hostname),
		},
	})
}

func (h *Hub) createPairedSystem(req agentPairRequest, userID string, assetID string, remoteAddr string, targetIP string) (string, error) {
	collection, err := h.FindCachedCollectionByNameOrId("systems")
	if err != nil {
		return "", err
	}
	var record *core.Record
	assetID = strings.TrimSpace(assetID)
	if assetID != "" {
		existing, findErr := h.FindFirstRecordByFilter("systems", "asset = {:asset}", dbx.Params{"asset": assetID})
		if findErr == nil {
			if existing.GetBool("is_local") {
				return "", errors.New("Hub 同机资产不能重新配对")
			}
			record = existing
		}
	}
	if record == nil {
		record = core.NewRecord(collection)
	}
	name := firstNonEmpty(req.Name, req.Hostname, remoteAddr)
	agentProfile := pairingAgentProfile(req)
	record.Set("name", name)
	record.Set("status", "pending")
	record.Set("pairing_confirmed", false)
	record.Set("asset", assetID)
	record.Set("target_ip", targetIP)
	record.Set("connect_ip", remoteAddr)
	record.Set("reported_ips", normalizePairingReportedIPs(req.ReportedIPs))
	record.Set("fingerprint_summary", summarizeFingerprint(req.Fingerprint))
	record.Set("agent_profile", agentProfile)
	users := record.GetStringSlice("users")
	if !slices.Contains(users, userID) {
		users = append(users, userID)
	}
	record.Set("users", users)
	info := map[string]any{
		"agent_version":  req.AgentVersion,
		"platform":       req.Platform,
		"arch":           req.Arch,
		"install_method": req.InstallMethod,
		"run_mode":       req.RunMode,
		"paired_at":      time.Now().UTC().Format(time.RFC3339Nano),
		"ct":             system.ConnectionTypeWebSocket,
		"h":              req.Hostname,
		"ip":             remoteAddr,
	}
	if hasPairingCapabilitiesPayload(req.Capabilities) {
		info["cap"] = req.Capabilities
	}
	if err := h.SaveNoValidate(record); err != nil {
		return "", err
	}
	record.Set("info", info)
	if err := h.SaveNoValidate(record); err != nil {
		return "", err
	}
	return record.Id, nil
}

func (h *Hub) pairingCodeResponse(record *core.Record) map[string]any {
	targetIP := record.GetString("expected_ip")
	if targetIP == "" {
		targetIP = record.GetString("target_ip")
	}
	var reportedIPs []string
	_ = record.UnmarshalJSONField("reported_ips", &reportedIPs)
	return map[string]any{
		"id":                  record.Id,
		"code":                formatPairingCode(record.GetString("code")),
		"asset":               record.GetString("asset"),
		"expected_ip":         targetIP,
		"target_ip":           targetIP,
		"connect_ip":          record.GetString("connect_ip"),
		"reported_ips":        reportedIPs,
		"hostname":            record.GetString("hostname"),
		"fingerprint_summary": record.GetString("fingerprint_summary"),
		"agent_profile":       record.GetString("agent_profile"),
		"platform":            record.GetString("platform"),
		"arch":                record.GetString("arch"),
		"agent_version":       record.GetString("agent_version"),
		"install_method":      record.GetString("install_method"),
		"run_mode":            record.GetString("run_mode"),
		"expires_at":          record.GetString("expires_at"),
		"used":                record.GetBool("used"),
		"system":              record.GetString("system"),
		"used_at":             record.GetString("used_at"),
		"used_by":             record.GetString("used_by"),
		"created":             record.GetString("created"),
	}
}

func normalizePairingExpectedIP(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	ip := net.ParseIP(value)
	if ip == nil {
		return "", fmt.Errorf("invalid IP")
	}
	return ip.String(), nil
}

func normalizePairingReportedIPs(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(values))
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if ip, _, err := net.ParseCIDR(value); err == nil {
			value = ip.String()
		} else if ip := net.ParseIP(value); ip != nil {
			value = ip.String()
		} else {
			continue
		}
		ip := net.ParseIP(value)
		if ip == nil || ip.IsLoopback() || ip.IsUnspecified() {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
		if len(normalized) >= 16 {
			break
		}
	}
	return normalized
}

func summarizeFingerprint(fingerprint string) string {
	fingerprint = strings.TrimSpace(fingerprint)
	if fingerprint == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(fingerprint))
	return "sha256:" + hex.EncodeToString(sum[:])[:12]
}

func pairingAgentProfile(req agentPairRequest) string {
	if profile := pairingCapabilityString(req.Capabilities, "agent_profile"); profile != "" {
		return profile
	}
	return ""
}

func pairingCapabilityString(capabilities map[string]any, key string) string {
	if len(capabilities) == 0 {
		return ""
	}
	value, ok := capabilities[key]
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}

func hasPairingCapabilitiesPayload(capabilities map[string]any) bool {
	if len(capabilities) == 0 {
		return false
	}
	_, hasCollection := capabilities["collection"]
	_, hasOperations := capabilities["operations"]
	return hasCollection || hasOperations
}

func sameIP(expected string, actual string) bool {
	expectedIP := net.ParseIP(strings.TrimSpace(expected))
	actualIP := net.ParseIP(strings.TrimSpace(actual))
	return expectedIP != nil && actualIP != nil && expectedIP.Equal(actualIP)
}

func (h *Hub) createPairedFingerprint(systemID string, token string, fingerprint string) error {
	collection, err := h.FindCachedCollectionByNameOrId("fingerprints")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("system", systemID)
	record.Set("token", token)
	record.Set("fingerprint", fingerprint)
	return h.SaveNoValidate(record)
}

func (h *Hub) rejectOrClearPairingFingerprintConflict(fingerprint string) (bool, error) {
	fingerprint = strings.TrimSpace(fingerprint)
	if fingerprint == "" {
		return false, nil
	}
	records, err := h.FindRecordsByFilter(
		"fingerprints",
		"fingerprint = {:fingerprint}",
		"",
		1,
		0,
		dbx.Params{"fingerprint": fingerprint},
	)
	if err != nil || len(records) == 0 {
		return false, err
	}
	for _, record := range records {
		systemID := record.GetString("system")
		if systemID == "" {
			continue
		}
		systemRecord, err := h.FindRecordById("systems", systemID)
		if err != nil {
			return false, err
		}
		if systemRecord.GetBool("pairing_confirmed") || systemRecord.GetBool("is_local") {
			return true, nil
		}
		if err := h.Delete(systemRecord); err != nil {
			return false, err
		}
	}
	return false, nil
}
