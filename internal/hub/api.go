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
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse"
	"gutenacht.site/pulse/internal/alerts"
	"gutenacht.site/pulse/internal/entities/system"
	"gutenacht.site/pulse/internal/hub/systems"
	"gutenacht.site/pulse/internal/hub/utils"
)

var containerIDPattern = regexp.MustCompile(`^[a-fA-F0-9]{12,64}$`)

// Middleware to allow only admin role users
var requireAdminRole = customAuthMiddleware(func(e *core.RequestEvent) bool {
	return e.Auth.GetString("role") == "admin"
})

// Middleware to exclude readonly users
var excludeReadOnlyRole = customAuthMiddleware(func(e *core.RequestEvent) bool {
	return e.Auth.GetString("role") != "readonly"
})

// customAuthMiddleware handles boilerplate for custom authentication middlewares. fn should
// return true if the request is allowed, false otherwise. e.Auth is guaranteed to be non-nil.
func customAuthMiddleware(fn func(*core.RequestEvent) bool) func(*core.RequestEvent) error {
	return func(e *core.RequestEvent) error {
		if e.Auth == nil {
			return e.UnauthorizedError("The request requires valid record authorization token.", nil)
		}
		if !fn(e) {
			return e.ForbiddenError("The authorized record is not allowed to perform this action.", nil)
		}
		return e.Next()
	}
}

// registerMiddlewares registers custom middlewares
func (h *Hub) registerMiddlewares(se *core.ServeEvent) {
	// authorizes request with user matching the provided email
	authorizeRequestWithEmail := func(e *core.RequestEvent, email string) (err error) {
		if e.Auth != nil || email == "" {
			return e.Next()
		}
		isAuthRefresh := e.Request.URL.Path == "/api/collections/users/auth-refresh" && e.Request.Method == http.MethodPost
		e.Auth, err = e.App.FindAuthRecordByEmail("users", email)
		if err != nil || !isAuthRefresh {
			return e.Next()
		}
		// auth refresh endpoint, make sure token is set in header
		token, _ := e.Auth.NewAuthToken()
		e.Request.Header.Set("Authorization", token)
		return e.Next()
	}
	// authenticate with trusted header
	if autoLogin, _ := utils.GetEnv("AUTO_LOGIN"); autoLogin != "" {
		se.Router.BindFunc(func(e *core.RequestEvent) error {
			return authorizeRequestWithEmail(e, autoLogin)
		})
	}
	// authenticate with trusted header
	if trustedHeader, _ := utils.GetEnv("TRUSTED_AUTH_HEADER"); trustedHeader != "" {
		se.Router.BindFunc(func(e *core.RequestEvent) error {
			return authorizeRequestWithEmail(e, e.Request.Header.Get(trustedHeader))
		})
	}
}

// registerApiRoutes registers custom API routes
func (h *Hub) registerApiRoutes(se *core.ServeEvent) error {
	return h.registerApiRouteGroup(se, "/api/pulse")
}

func (h *Hub) registerApiRouteGroup(se *core.ServeEvent, prefix string) error {
	// auth protected routes
	apiAuth := se.Router.Group(prefix)
	apiAuth.Bind(apis.RequireAuth())
	// auth optional routes
	apiNoAuth := se.Router.Group(prefix)
	assetCenterModule := h.requirePulseModule("asset-center")
	clientMonitoringModule := h.requirePulseModule("client-monitoring")
	websiteMonitoringModule := h.requirePulseModule("website-monitoring")
	alertsModule := h.requirePulseModule("alerts")
	notificationsModule := h.requirePulseModule("notifications")
	agentManagementModule := h.requirePulseModule("agent-management")
	maintenanceModule := h.requirePulseModule("maintenance")

	// create first user endpoint only needed if no users exist
	if totalUsers, _ := se.App.CountRecords("users"); totalUsers == 0 {
		apiNoAuth.POST("/create-user", h.um.CreateFirstUser)
	}
	// check if first time setup on login page
	apiNoAuth.GET("/first-run", func(e *core.RequestEvent) error {
		total, err := e.App.CountRecords("users")
		return e.JSON(http.StatusOK, map[string]bool{"firstRun": err == nil && total == 0})
	})
	// public runtime metadata used before or during auth bootstrap
	apiNoAuth.GET("/public-info", h.getInfo)
	// get hub metadata for authenticated users
	apiAuth.GET("/info", h.getInfo)
	// get lightweight system summaries for home, clients, and mobile inventory pages
	apiAuth.GET("/systems/summary", h.listSystemSummaries).BindFunc(clientMonitoringModule)
	// get lightweight dashboard counters without loading full containers or website monitor lists
	apiAuth.GET("/dashboard/summary", h.getDashboardSummary)
	// get paged website monitors for large website lists
	apiAuth.GET("/website-monitors", h.listWebsiteMonitors).BindFunc(websiteMonitoringModule)
	// get container system summaries and the selected system's container list
	apiAuth.GET("/containers", h.listContainers).BindFunc(clientMonitoringModule)
	// send test notification
	apiAuth.POST("/test-notification", h.SendTestNotification).BindFunc(excludeReadOnlyRole).BindFunc(notificationsModule)
	// handle agent websocket connection
	apiNoAuth.GET("/agent-connect", h.handleAgentConnect)
	// local agent release binaries; agents fetch these without browser auth during controlled updates
	apiNoAuth.GET("/agent-releases/{version}/{filename}", h.downloadAgentRelease)
	apiNoAuth.GET("/agent-install/windows.ps1", h.downloadWindowsAgentInstallScript)
	apiNoAuth.GET("/agent-install/unraid.xml", h.downloadUnraidAgentTemplateXml)
	apiAuth.POST("/agent-releases/sync", h.syncAgentReleases).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.POST("/pairing-codes", h.createPairingCode).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.GET("/pairing-codes", h.listPairingCodes).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.GET("/pairing-codes/{id}", h.getPairingCode).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.GET("/agent-tokens", h.listAgentTokens).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.GET("/agent-tokens/system/{id}/secret", h.getAgentTokenSecretBySystem).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.GET("/agent-tokens/{id}/secret", h.getAgentTokenSecret).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.POST("/agent-tokens/{id}/rotate", h.rotateAgentToken).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.POST("/agent-tokens/{id}/unbind", h.unbindAgentToken).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	// get or create universal tokens
	apiAuth.GET("/universal-token", h.getUniversalToken).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiNoAuth.POST("/agent-pair", h.pairAgent)
	// update / delete user alerts
	apiAuth.POST("/user-alerts", alerts.UpsertUserAlerts).BindFunc(excludeReadOnlyRole).BindFunc(alertsModule)
	apiAuth.DELETE("/user-alerts", alerts.DeleteUserAlerts).BindFunc(excludeReadOnlyRole).BindFunc(alertsModule)
	apiAuth.GET("/alert-policies", alerts.ListGlobalAlertPolicies).BindFunc(alertsModule)
	apiAuth.POST("/alert-policies", alerts.UpsertGlobalAlertPolicy).BindFunc(excludeReadOnlyRole).BindFunc(alertsModule)
	apiAuth.DELETE("/alert-policies", alerts.DeleteGlobalAlertPolicy).BindFunc(excludeReadOnlyRole).BindFunc(alertsModule)
	apiAuth.GET("/alerts-history", alerts.ListAlertHistory).BindFunc(alertsModule)
	apiAuth.POST("/alerts-history/{id}/acknowledge", alerts.AcknowledgeAlertHistory).BindFunc(excludeReadOnlyRole).BindFunc(alertsModule)
	apiAuth.POST("/alerts-history/{id}/silence", alerts.SilenceAlertHistory).BindFunc(excludeReadOnlyRole).BindFunc(alertsModule)
	apiAuth.POST("/alerts-history/{id}/unsilence", alerts.UnsilenceAlertHistory).BindFunc(excludeReadOnlyRole).BindFunc(alertsModule)
	// refresh SMART devices for a system
	apiAuth.POST("/smart/refresh", h.refreshSmartData).BindFunc(excludeReadOnlyRole).BindFunc(clientMonitoringModule)
	apiAuth.GET("/services/search", h.searchServices).BindFunc(excludeReadOnlyRole).BindFunc(clientMonitoringModule)
	apiAuth.GET("/software/search", h.searchSoftware).BindFunc(excludeReadOnlyRole).BindFunc(clientMonitoringModule)
	apiAuth.POST("/important-monitoring/rules", h.upsertImportantMonitoringRule).BindFunc(excludeReadOnlyRole).BindFunc(clientMonitoringModule)
	apiAuth.DELETE("/important-monitoring/rules/{kind}/{id}", h.deleteImportantMonitoringRule).BindFunc(excludeReadOnlyRole).BindFunc(clientMonitoringModule)
	apiAuth.DELETE("/systems/{id}", h.deleteSystemAndRelatedData).BindFunc(excludeReadOnlyRole).BindFunc(clientMonitoringModule)
	apiAuth.POST("/assets/{id}/enrichment-reports", h.generateAssetEnrichmentReport).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/internet-addresses/refresh", h.refreshInternetPublicAddresses).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/internet-addresses/confirm", h.confirmInternetPublicAddress).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/visuals/turntable", h.generateAssetTurntableVisual).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/visuals/{visualId}/select", h.selectAssetVisualCandidate).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/visuals/{visualId}/crop", h.updateAssetVisualCrop).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.GET("/assets/{id}/media", h.listAssetMedia).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/adopt", h.adoptAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/placements", h.upsertAssetMediaPlacement).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/archive", h.archiveAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.DELETE("/assets/{id}/media/{mediaId}", h.deleteAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/versions", h.createAssetMediaVersion).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/upload", h.uploadAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/import-visual", h.importAssetVisualCandidate).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.GET("/asset-media/store", h.getAssetMediaStoreSettings).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.POST("/asset-media/store", h.updateAssetMediaStoreSettings).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.GET("/asset-media/object", h.readAssetMediaObject).BindFunc(assetCenterModule)
	apiAuth.GET("/asset-enrichment/config", h.getAssetEnrichmentConfig).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.POST("/asset-enrichment/config", h.updateAssetEnrichmentConfig).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.POST("/asset-enrichment-suggestions/accept-batch", h.acceptAssetEnrichmentSuggestionsBatch).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/asset-enrichment-suggestions/{id}/accept", h.acceptAssetEnrichmentSuggestion).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/asset-enrichment-suggestions/{id}/reject", h.rejectAssetEnrichmentSuggestion).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.DELETE("/service-control-rules/{id}", h.deleteServiceControlRule).BindFunc(excludeReadOnlyRole)
	// operations extension
	apiAuth.GET("/operations", h.getOperations)
	apiAuth.POST("/operations", h.createOperation).BindFunc(excludeReadOnlyRole)
	apiAuth.GET("/operations/audit", h.getOperationAudit)
	apiAuth.GET("/logs", h.getSystemLogs).BindFunc(maintenanceModule)
	apiAuth.GET("/users", h.listAppUsers).BindFunc(requireAdminRole)
	apiAuth.POST("/users", h.createAppUser).BindFunc(requireAdminRole)
	apiAuth.PATCH("/users/{id}", h.updateAppUser).BindFunc(requireAdminRole)
	apiAuth.POST("/users/{id}/password", h.resetAppUserPassword).BindFunc(requireAdminRole)
	apiAuth.DELETE("/users/{id}", h.deleteAppUser).BindFunc(requireAdminRole)
	apiAuth.GET("/backups", h.listBackups).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.POST("/backups", h.createBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.GET("/backups/{key}", h.downloadBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.DELETE("/backups/{key}", h.deleteBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.POST("/backups/{key}/restore", h.restoreBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.POST("/website-monitors/{id}/check", h.checkWebsiteMonitorNow).BindFunc(excludeReadOnlyRole).BindFunc(websiteMonitoringModule)
	// /containers routes
	if enabled, _ := utils.GetEnv("CONTAINER_DETAILS"); enabled != "false" {
		// get container logs
		apiAuth.GET("/containers/logs", h.getContainerLogs).BindFunc(clientMonitoringModule)
		// get container info
		apiAuth.GET("/containers/info", h.getContainerInfo).BindFunc(clientMonitoringModule)
	}
	return nil
}

const pairingCodeTTL = 10 * time.Minute

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
	return strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), "-", ""))
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

	expiresAt := time.Now().UTC().Add(pairingCodeTTL)
	collection, err := h.FindCachedCollectionByNameOrId("agent_pairing_codes")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("code", code)
	record.Set("user", e.Auth.Id)
	record.Set("asset", assetID)
	record.Set("expected_ip", expectedIP)
	record.Set("expires_at", expiresAt.Format(time.RFC3339Nano))
	record.Set("used", false)
	if err := h.SaveNoValidate(record); err != nil {
		h.createOperationAudit(e, "", "create_pairing_code", expectedIP, "", "failed", err.Error(), operationFailureFailed)
		return err
	}

	h.createOperationAudit(e, "", "create_pairing_code", expectedIP, "", "success", "Agent 配对会话已创建")
	return e.JSON(http.StatusOK, h.pairingCodeResponse(record))
}

func (h *Hub) listPairingCodes(e *core.RequestEvent) error {
	records, err := h.FindRecordsByFilter(
		"agent_pairing_codes",
		"user = {:user}",
		"-created",
		20,
		0,
		dbx.Params{"user": e.Auth.Id},
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

func (h *Hub) pairAgent(e *core.RequestEvent) error {
	var req agentPairRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid pairing request", err)
	}
	code := normalizePairingCode(req.Code)
	if len(code) != 6 {
		return e.BadRequestError("Invalid pairing code", nil)
	}
	if req.Fingerprint == "" || req.Hostname == "" {
		return e.BadRequestError("Missing required agent identity", nil)
	}

	pairingRecord, err := h.FindFirstRecordByFilter("agent_pairing_codes", "code = {:code}", dbx.Params{"code": code})
	if err != nil {
		return e.NotFoundError("Invalid or expired pairing code", err)
	}
	if pairingRecord.GetBool("used") {
		h.createOperationAuditForUser(e, pairingRecord.GetString("user"), pairingRecord.GetString("system"), "pair_agent", pairingRecord.GetString("hostname"), "", "failed", "Pairing code has already been used", operationFailureDenied)
		return e.BadRequestError("Pairing code has already been used", nil)
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, pairingRecord.GetString("expires_at"))
	if err != nil {
		expiresAt, err = time.Parse("2006-01-02 15:04:05.000Z", pairingRecord.GetString("expires_at"))
	}
	if err != nil || time.Now().UTC().After(expiresAt) {
		h.createOperationAuditForUser(e, pairingRecord.GetString("user"), "", "pair_agent", pairingRecord.GetString("expected_ip"), "", "failed", "Pairing code has expired", operationFailureInvalidRequest)
		return e.BadRequestError("Pairing code has expired", nil)
	}

	remoteIP := getRealIP(e.Request)
	if expectedIP := pairingRecord.GetString("expected_ip"); expectedIP != "" && !sameIP(expectedIP, remoteIP) {
		h.createOperationAuditForUser(e, pairingRecord.GetString("user"), "", "pair_agent", expectedIP, "", "failed", "Agent source IP does not match pairing target IP", operationFailureDenied)
		return e.BadRequestError("Agent source IP does not match pairing target IP", nil)
	}

	userID := pairingRecord.GetString("user")
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
	fingerprintInUse, err := h.rejectOrClearPairingFingerprintConflict(req.Fingerprint)
	if err != nil {
		h.createOperationAuditForUser(e, pairingRecord.GetString("user"), "", "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}
	if fingerprintInUse {
		h.createOperationAuditForUser(e, pairingRecord.GetString("user"), "", "pair_agent", req.Hostname, "", "failed", "Agent fingerprint already belongs to another system", operationFailureDenied)
		return e.BadRequestError("Agent fingerprint already belongs to another system", nil)
	}

	targetIP := pairingRecord.GetString("expected_ip")
	systemID, err := h.createPairedSystem(req, userID, assetID, remoteIP, targetIP)
	if err != nil {
		h.createOperationAuditForUser(e, userID, "", "pair_agent", req.Hostname, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
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
	if err := h.createPairedFingerprint(systemID, token, req.Fingerprint); err != nil {
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
	record := core.NewRecord(collection)
	name := firstNonEmpty(req.Name, req.Hostname, remoteAddr)
	agentProfile := pairingAgentProfile(req)
	record.Set("name", name)
	record.Set("status", "pending")
	record.Set("pairing_confirmed", false)
	record.Set("asset", strings.TrimSpace(assetID))
	record.Set("target_ip", targetIP)
	record.Set("connect_ip", remoteAddr)
	record.Set("reported_ips", normalizePairingReportedIPs(req.ReportedIPs))
	record.Set("fingerprint_summary", summarizeFingerprint(req.Fingerprint))
	record.Set("agent_profile", agentProfile)
	record.Set("users", []string{userID})
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

func getHubURLFromRequest(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return proto + "://" + host
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// getInfo returns data needed by authenticated users, such as the current hub version.
func (h *Hub) getInfo(e *core.RequestEvent) error {
	type infoResponse struct {
		Version             string                `json:"v"`
		CheckUpdate         bool                  `json:"cu"`
		AgentHubURL         string                `json:"agent_hub_url"`
		Environment         string                `json:"environment"`
		BuildCommit         string                `json:"build_commit,omitempty"`
		BuildTime           string                `json:"build_time,omitempty"`
		AgentTargetVersion  string                `json:"agent_target_version,omitempty"`
		AgentActualVersions []agentVersionSummary `json:"agent_actual_versions,omitempty"`
		AgentTotalSystems   int                   `json:"agent_total_systems,omitempty"`
		AgentOnlineSystems  int                   `json:"agent_online_systems,omitempty"`
		Readiness           []readinessCheck      `json:"readiness,omitempty"`
	}
	info := infoResponse{
		Version:     pulse.Version,
		AgentHubURL: getAgentHubURL(firstNonEmptyString(h.appURL, h.Settings().Meta.AppURL, getHubURLFromRequest(e.Request))),
		Environment: hubRuntimeEnvironment(),
		BuildCommit: strings.TrimSpace(pulse.BuildCommit),
		BuildTime:   strings.TrimSpace(pulse.BuildTime),
	}
	if e.Auth != nil {
		agentInfo := h.buildAgentVersionInfo(e.Auth)
		info.AgentTargetVersion = agentInfo.TargetVersion
		info.AgentActualVersions = agentInfo.ActualVersions
		info.AgentTotalSystems = agentInfo.TotalSystems
		info.AgentOnlineSystems = agentInfo.OnlineSystems
	}
	if e.Auth != nil && (e.Auth.IsSuperuser() || e.Auth.GetString("role") == "admin") {
		info.Readiness = h.buildReadinessChecks()
	}
	return e.JSON(http.StatusOK, info)
}

type agentVersionInfo struct {
	TargetVersion  string
	ActualVersions []agentVersionSummary
	TotalSystems   int
	OnlineSystems  int
}

type agentVersionSummary struct {
	Version string `json:"version"`
	Count   int    `json:"count"`
	Online  int    `json:"online"`
}

func hubRuntimeEnvironment() string {
	if isDevelopmentBuild() {
		return "development"
	}
	return "production"
}

func (h *Hub) buildAgentVersionInfo(auth *core.Record) agentVersionInfo {
	actual, total, online := h.summarizeActualAgentVersions(auth)
	return agentVersionInfo{
		TargetVersion:  h.latestEnabledAgentVersion(),
		ActualVersions: actual,
		TotalSystems:   total,
		OnlineSystems:  online,
	}
}

func (h *Hub) latestEnabledAgentVersion() string {
	records, err := h.FindRecordsByFilter("agent_releases", "enabled = true", "", -1, 0)
	if err != nil || len(records) == 0 {
		return pulse.Version
	}
	latest := ""
	for _, record := range records {
		version := strings.TrimSpace(record.GetString("version"))
		if version == "" {
			continue
		}
		if latest == "" || compareAgentReleaseVersions(version, latest) > 0 {
			latest = version
		}
	}
	if latest == "" {
		return pulse.Version
	}
	if compareAgentReleaseVersions(latest, pulse.Version) < 0 {
		return pulse.Version
	}
	return latest
}

func (h *Hub) summarizeActualAgentVersions(auth *core.Record) ([]agentVersionSummary, int, int) {
	filter := "(pairing_confirmed = true || is_local = true)"
	params := dbx.Params{}
	if auth != nil && !auth.IsSuperuser() && auth.GetString("role") != "admin" {
		filter += " && users ~ {:userId}"
		params["userId"] = auth.Id
	}
	records, err := h.FindRecordsByFilter("systems", filter, "", -1, 0, params)
	if err != nil || len(records) == 0 {
		return nil, 0, 0
	}

	byVersion := make(map[string]*agentVersionSummary)
	online := 0
	for _, record := range records {
		version := systemAgentVersion(record)
		if version == "" {
			version = "未上报"
		}
		summary := byVersion[version]
		if summary == nil {
			summary = &agentVersionSummary{Version: version}
			byVersion[version] = summary
		}
		summary.Count++
		if record.GetString("status") == "up" {
			summary.Online++
			online++
		}
	}

	items := make([]agentVersionSummary, 0, len(byVersion))
	for _, summary := range byVersion {
		items = append(items, *summary)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Version == "未上报" {
			return false
		}
		if items[j].Version == "未上报" {
			return true
		}
		return compareAgentReleaseVersions(items[i].Version, items[j].Version) > 0
	})
	return items, len(records), online
}

func systemAgentVersion(record *core.Record) string {
	var info system.Info
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return strings.TrimSpace(record.GetString("v"))
	}
	if info.Capabilities != nil {
		if version := strings.TrimSpace(info.Capabilities.AgentVersion); version != "" {
			return version
		}
	}
	if version := strings.TrimSpace(info.AgentVersion); version != "" {
		return version
	}
	return strings.TrimSpace(record.GetString("v"))
}

type readinessCheck struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

func (h *Hub) buildReadinessChecks() []readinessCheck {
	checks := make([]readinessCheck, 0, 9)

	if value := trimmedEnv("AUTO_LOGIN"); value != "" {
		checks = append(checks, readinessCheck{
			ID:     "auto_login",
			Title:  "自动登录",
			Status: "danger",
			Detail: "AUTO_LOGIN 已启用，生产环境会绕过正常登录入口。发布前应关闭。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "auto_login",
			Title:  "自动登录",
			Status: "ok",
			Detail: "未启用 AUTO_LOGIN。",
		})
	}

	if value := trimmedEnv("TRUSTED_AUTH_HEADER"); value != "" {
		checks = append(checks, readinessCheck{
			ID:     "trusted_auth_header",
			Title:  "可信请求头登录",
			Status: "danger",
			Detail: "TRUSTED_AUTH_HEADER 已启用，必须确认反向代理会清理外部同名请求头；自用部署建议关闭。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "trusted_auth_header",
			Title:  "可信请求头登录",
			Status: "ok",
			Detail: "未启用 TRUSTED_AUTH_HEADER。",
		})
	}

	if isDevelopmentBuild() {
		checks = append(checks, readinessCheck{
			ID:     "development_build",
			Title:  "开发构建",
			Status: "warning",
			Detail: "当前 Hub 使用 development 构建标签，会代理 Vite 开发服务；正式部署必须使用生产构建。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "development_build",
			Title:  "开发构建",
			Status: "ok",
			Detail: "当前 Hub 是生产构建。",
		})
	}

	if devLocalAgentAsHubEnabled() {
		checks = append(checks, readinessCheck{
			ID:     "dev_local_agent_as_hub",
			Title:  "开发本机 Agent 标记",
			Status: "warning",
			Detail: "PULSE_DEV_LOCAL_AGENT_AS_HUB 已启用，只应在源码开发环境使用，正式部署应关闭。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "dev_local_agent_as_hub",
			Title:  "开发本机 Agent 标记",
			Status: "ok",
			Detail: "未启用开发本机 Agent 标记。",
		})
	}

	switch value := strings.ToLower(trimmedEnv("MFA_OTP")); value {
	case "true":
		checks = append(checks, readinessCheck{
			ID:     "mfa",
			Title:  "账号二次验证",
			Status: "ok",
			Detail: "MFA_OTP 已对用户和超级用户启用。",
		})
	case "superusers":
		checks = append(checks, readinessCheck{
			ID:     "mfa",
			Title:  "账号二次验证",
			Status: "warning",
			Detail: "MFA_OTP 只对超级用户启用，普通用户登录没有二次验证。",
		})
	default:
		checks = append(checks, readinessCheck{
			ID:     "mfa",
			Title:  "账号二次验证",
			Status: "warning",
			Detail: "MFA_OTP 未启用；上线前建议启用邮箱验证码二次验证。",
		})
	}

	if strings.EqualFold(trimmedEnv("DISABLE_PASSWORD_AUTH"), "true") {
		checks = append(checks, readinessCheck{
			ID:     "password_auth",
			Title:  "密码登录",
			Status: "warning",
			Detail: "DISABLE_PASSWORD_AUTH 已启用；确认已有可靠替代登录方式，否则普通账号会无法登录。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "password_auth",
			Title:  "密码登录",
			Status: "ok",
			Detail: "密码登录可用。",
		})
	}

	checks = append(checks, localAgentTokenReadinessCheck())
	checks = append(checks, h.localHubIdentityReadinessCheck())
	checks = append(checks, readinessCheck{
		ID:     "version_consistency",
		Title:  "版本一致性",
		Status: "unknown",
		Detail: fmt.Sprintf("运行时已确认 Hub 版本为 %s；Web、Agent、Android、Compose 和文档一致性需在发布前通过 check-version-consistency.ps1 校验。", pulse.Version),
	})

	return checks
}

func trimmedEnv(name string) string {
	value, _ := utils.GetEnv(name)
	return strings.TrimSpace(value)
}

func localAgentTokenReadinessCheck() readinessCheck {
	if strings.TrimSpace(localAgentToken()) == defaultLocalAgentToken {
		return readinessCheck{
			ID:     "local_agent_token",
			Title:  "Hub 同机 Agent Token",
			Status: "warning",
			Detail: "正在使用默认本机 Agent Token；生产环境建议设置 PULSE_LOCAL_AGENT_TOKEN，避免沿用公开默认值。",
		}
	}
	return readinessCheck{
		ID:     "local_agent_token",
		Title:  "Hub 同机 Agent Token",
		Status: "ok",
		Detail: "已配置非默认本机 Agent Token。",
	}
}

func (h *Hub) localHubIdentityReadinessCheck() readinessCheck {
	records, err := h.FindRecordsByFilter("systems", "is_local = true", "", 2, 0)
	if err != nil {
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "unknown",
			Detail: "无法读取 Hub 机器标记，请检查 systems 集合迁移和数据库状态。",
		}
	}
	switch len(records) {
	case 0:
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "warning",
			Detail: "当前没有 is_local=true 的 Hub 机器；标准 Hub + Agent 同机部署上线后应自动出现一台带 Hub 标签的真实机器。",
		}
	case 1:
		record := records[0]
		name := strings.TrimSpace(record.GetString("name"))
		if name == "" {
			name = record.Id
		}
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "ok",
			Detail: fmt.Sprintf("当前 Hub 机器为 %s。", name),
		}
	default:
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "danger",
			Detail: "检测到多台 is_local=true 的机器，存在 Hub 标签误标风险；需要修复身份标记后再发布。",
		}
	}
}

type agentTokenListItem struct {
	ID             string `json:"id"`
	System         string `json:"system"`
	SystemName     string `json:"system_name"`
	TokenPreview   string `json:"token_preview"`
	Status         string `json:"status"`
	ConnectionType int    `json:"connection_type"`
	Bound          bool   `json:"bound"`
	Updated        string `json:"updated,omitempty"`
}

func (h *Hub) listAgentTokens(e *core.RequestEvent) error {
	records, err := h.FindRecordsByFilter("fingerprints", "id != ''", "", 0, 0)
	if err != nil {
		return e.InternalServerError("Failed to load agent tokens", err)
	}

	items := make([]agentTokenListItem, 0, len(records))
	for _, record := range records {
		systemRecord, err := h.FindRecordById("systems", record.GetString("system"))
		if err != nil || !h.systemRecordVisibleToRequest(e, systemRecord) {
			continue
		}
		items = append(items, agentTokenListItem{
			ID:             record.Id,
			System:         systemRecord.Id,
			SystemName:     firstNonEmpty(systemRecord.GetString("display_name"), systemRecord.GetString("name"), systemRecord.Id),
			TokenPreview:   tokenPreview(record.GetString("token")),
			Status:         systemRecord.GetString("status"),
			ConnectionType: systemRecordConnectionType(systemRecord),
			Bound:          strings.TrimSpace(record.GetString("fingerprint")) != "",
			Updated:        record.GetDateTime("updated").String(),
		})
	}
	sort.Slice(items, func(i, j int) bool {
		return strings.ToLower(items[i].SystemName) < strings.ToLower(items[j].SystemName)
	})
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}

func (h *Hub) getAgentTokenSecret(e *core.RequestEvent) error {
	record, systemRecord, err := h.findAgentTokenForRequest(e, strings.TrimSpace(e.Request.PathValue("id")))
	if err != nil {
		return e.NotFoundError("Agent token not found", err)
	}
	return e.JSON(http.StatusOK, map[string]any{
		"id":      record.Id,
		"system":  systemRecord.Id,
		"token":   record.GetString("token"),
		"preview": tokenPreview(record.GetString("token")),
	})
}

func (h *Hub) getAgentTokenSecretBySystem(e *core.RequestEvent) error {
	systemID := strings.TrimSpace(e.Request.PathValue("id"))
	if systemID == "" {
		return e.BadRequestError("Missing system id", nil)
	}
	systemRecord, err := h.FindRecordById("systems", systemID)
	if err != nil || !h.systemRecordVisibleToRequest(e, systemRecord) {
		return e.NotFoundError("Agent token not found", err)
	}
	record, err := h.FindFirstRecordByFilter("fingerprints", "system = {:system}", dbx.Params{"system": systemID})
	if err != nil {
		return e.NotFoundError("Agent token not found", err)
	}
	return e.JSON(http.StatusOK, map[string]any{
		"id":      record.Id,
		"system":  systemRecord.Id,
		"token":   record.GetString("token"),
		"preview": tokenPreview(record.GetString("token")),
	})
}

func (h *Hub) rotateAgentToken(e *core.RequestEvent) error {
	record, systemRecord, err := h.findAgentTokenForRequest(e, strings.TrimSpace(e.Request.PathValue("id")))
	if err != nil {
		h.createOperationAudit(e, "", "rotate_agent_token", "agent_token", "", "failed", "Agent token not found", operationFailureNotFound)
		return e.NotFoundError("Agent token not found", err)
	}
	token, err := generateSecretHex(24)
	if err != nil {
		h.createOperationAudit(e, systemRecord.Id, "rotate_agent_token", systemRecord.Id, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("Failed to rotate agent token", err)
	}
	record.Set("token", token)
	record.Set("fingerprint", "")
	if err := h.SaveNoValidate(record); err != nil {
		h.createOperationAudit(e, systemRecord.Id, "rotate_agent_token", systemRecord.Id, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("Failed to rotate agent token", err)
	}
	target := firstNonEmpty(systemRecord.GetString("display_name"), systemRecord.GetString("name"), systemRecord.Id)
	h.createOperationAudit(e, systemRecord.Id, "rotate_agent_token", target, "", "success", "Agent 接入 Token 已轮换，旧 Token 已失效")
	return e.JSON(http.StatusOK, map[string]any{
		"id":            record.Id,
		"system":        systemRecord.Id,
		"token_preview": tokenPreview(token),
		"bound":         false,
	})
}

func (h *Hub) unbindAgentToken(e *core.RequestEvent) error {
	record, systemRecord, err := h.findAgentTokenForRequest(e, strings.TrimSpace(e.Request.PathValue("id")))
	if err != nil {
		h.createOperationAudit(e, "", "unbind_agent_token", "agent_token", "", "failed", "Agent token not found", operationFailureNotFound)
		return e.NotFoundError("Agent token not found", err)
	}
	record.Set("fingerprint", "")
	if err := h.SaveNoValidate(record); err != nil {
		h.createOperationAudit(e, systemRecord.Id, "unbind_agent_token", systemRecord.Id, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("Failed to unbind agent token", err)
	}
	target := firstNonEmpty(systemRecord.GetString("display_name"), systemRecord.GetString("name"), systemRecord.Id)
	h.createOperationAudit(e, systemRecord.Id, "unbind_agent_token", target, "", "success", "Agent 当前设备绑定已解除")
	return e.JSON(http.StatusOK, map[string]any{
		"id":            record.Id,
		"system":        systemRecord.Id,
		"token_preview": tokenPreview(record.GetString("token")),
		"bound":         false,
	})
}

func (h *Hub) findAgentTokenForRequest(e *core.RequestEvent, id string) (*core.Record, *core.Record, error) {
	if id == "" {
		return nil, nil, errors.New("missing agent token id")
	}
	record, err := h.FindRecordById("fingerprints", id)
	if err != nil {
		return nil, nil, err
	}
	systemRecord, err := h.FindRecordById("systems", record.GetString("system"))
	if err != nil {
		return nil, nil, err
	}
	if !h.systemRecordVisibleToRequest(e, systemRecord) {
		return nil, nil, errors.New("agent token not visible to user")
	}
	return record, systemRecord, nil
}

func (h *Hub) systemRecordVisibleToRequest(e *core.RequestEvent, record *core.Record) bool {
	if e == nil || e.Auth == nil || record == nil {
		return false
	}
	if e.Auth.IsSuperuser() {
		return true
	}
	if shareAllSystems, _ := utils.GetEnv("SHARE_ALL_SYSTEMS"); shareAllSystems == "true" {
		return true
	}
	for _, userID := range record.GetStringSlice("users") {
		if userID == e.Auth.Id {
			return true
		}
	}
	return false
}

func systemRecordConnectionType(record *core.Record) int {
	if record == nil {
		return 0
	}
	var info map[string]any
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return 0
	}
	switch value := info["ct"].(type) {
	case float64:
		return int(value)
	case int:
		return value
	case string:
		if strings.TrimSpace(value) == "2" || strings.EqualFold(strings.TrimSpace(value), "websocket") {
			return 2
		}
	}
	return 0
}

func tokenPreview(token string) string {
	value := strings.TrimSpace(token)
	if value == "" {
		return "未生成"
	}
	if len(value) <= 12 {
		return "******"
	}
	return value[:6] + "..." + value[len(value)-4:]
}

// GetUniversalToken handles the universal token API endpoint (create, read, delete)
func (h *Hub) getUniversalToken(e *core.RequestEvent) error {
	if e.Auth.IsSuperuser() {
		return e.ForbiddenError("Superusers cannot use universal tokens", nil)
	}

	tokenMap := universalTokenMap.GetMap()
	userID := e.Auth.Id
	query := e.Request.URL.Query()
	token := query.Get("token")
	enable := query.Get("enable")
	permanent := query.Get("permanent")

	// helper for deleting any existing permanent token record for this user
	deletePermanent := func() error {
		rec, err := h.FindFirstRecordByFilter("universal_tokens", "user = {:user}", dbx.Params{"user": userID})
		if err != nil {
			return nil // no record
		}
		return h.Delete(rec)
	}

	// helper for upserting a permanent token record for this user
	upsertPermanent := func(token string) error {
		rec, err := h.FindFirstRecordByFilter("universal_tokens", "user = {:user}", dbx.Params{"user": userID})
		if err == nil {
			rec.Set("token", token)
			return h.Save(rec)
		}

		col, err := h.FindCachedCollectionByNameOrId("universal_tokens")
		if err != nil {
			return err
		}
		newRec := core.NewRecord(col)
		newRec.Set("user", userID)
		newRec.Set("token", token)
		return h.Save(newRec)
	}

	// Disable universal tokens (both ephemeral and permanent)
	if enable == "0" {
		tokenMap.RemovebyValue(userID)
		_ = deletePermanent()
		h.createOperationAudit(e, "", "disable_universal_token", "universal_token", "", "success", "通用 Agent Token 已停用")
		return e.JSON(http.StatusOK, map[string]any{"token": token, "active": false, "permanent": false})
	}

	// Enable universal token (ephemeral or permanent)
	if enable == "1" {
		if token == "" {
			token = uuid.New().String()
		}

		if permanent == "1" {
			// make token permanent (persist across restarts)
			tokenMap.RemovebyValue(userID)
			if err := upsertPermanent(token); err != nil {
				h.createOperationAudit(e, "", "enable_universal_token", "permanent", "", "failed", err.Error(), operationFailureFailed)
				return err
			}
			h.createOperationAudit(e, "", "enable_universal_token", "permanent", "", "success", "永久通用 Agent Token 已启用")
			return e.JSON(http.StatusOK, map[string]any{"token": token, "active": true, "permanent": true})
		}

		// default: ephemeral mode (1 hour)
		_ = deletePermanent()
		tokenMap.Set(token, userID, time.Hour)
		h.createOperationAudit(e, "", "enable_universal_token", "ephemeral", "", "success", "临时通用 Agent Token 已启用")
		return e.JSON(http.StatusOK, map[string]any{"token": token, "active": true, "permanent": false})
	}

	// Read current state
	// Prefer permanent token if it exists.
	if rec, err := h.FindFirstRecordByFilter("universal_tokens", "user = {:user}", dbx.Params{"user": userID}); err == nil {
		dbToken := rec.GetString("token")
		// If no token was provided, or the caller is asking about their permanent token, return it.
		if token == "" || token == dbToken {
			return e.JSON(http.StatusOK, map[string]any{"token": dbToken, "active": true, "permanent": true})
		}
		// Token doesn't match their permanent token (avoid leaking other info)
		return e.JSON(http.StatusOK, map[string]any{"token": token, "active": false, "permanent": false})
	}

	// No permanent token; fall back to ephemeral token map.
	if token == "" {
		// return existing token if it exists
		if token, _, ok := tokenMap.GetByValue(userID); ok {
			return e.JSON(http.StatusOK, map[string]any{"token": token, "active": true, "permanent": false})
		}
		// if no token is provided, generate a new one
		token = uuid.New().String()
	}

	// Token is considered active only if it belongs to the current user.
	activeUser, ok := tokenMap.GetOk(token)
	active := ok && activeUser == userID
	response := map[string]any{"token": token, "active": active, "permanent": false}
	return e.JSON(http.StatusOK, response)
}

// containerRequestHandler handles both container logs and info requests
func (h *Hub) containerRequestHandler(e *core.RequestEvent, fetchFunc func(*systems.System, string) (string, error), responseKey string) error {
	systemID := e.Request.URL.Query().Get("system")
	containerID := e.Request.URL.Query().Get("container")

	if systemID == "" || containerID == "" || !containerIDPattern.MatchString(containerID) {
		return e.BadRequestError("Invalid system or container parameter", nil)
	}

	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}

	data, err := fetchFunc(system, containerID)
	if err != nil {
		return e.InternalServerError("", err)
	}

	return e.JSON(http.StatusOK, map[string]string{responseKey: data})
}

// getContainerLogs handles GET /api/pulse/containers/logs requests
func (h *Hub) getContainerLogs(e *core.RequestEvent) error {
	return h.containerRequestHandler(e, func(system *systems.System, containerID string) (string, error) {
		return system.FetchContainerLogsFromAgent(containerID)
	}, "logs")
}

func (h *Hub) getContainerInfo(e *core.RequestEvent) error {
	return h.containerRequestHandler(e, func(system *systems.System, containerID string) (string, error) {
		return system.FetchContainerInfoFromAgent(containerID)
	}, "info")
}

func (h *Hub) searchServices(e *core.RequestEvent) error {
	query := strings.TrimSpace(e.Request.URL.Query().Get("q"))
	systemID := e.Request.URL.Query().Get("system")
	if systemID == "" {
		return e.BadRequestError("Invalid system parameter", nil)
	}
	if query == "" {
		return e.BadRequestError("Search query is required", nil)
	}
	if len(query) < 2 {
		return e.BadRequestError("Search query must be at least 2 characters", nil)
	}
	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}
	if !system.SupportsWindowsServiceMonitoring() {
		return e.BadRequestError("Current system does not support service monitoring", nil)
	}
	result, err := system.SearchServicesFromAgent(query, 50)
	if err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(http.StatusOK, result)
}

func (h *Hub) searchSoftware(e *core.RequestEvent) error {
	query := strings.TrimSpace(e.Request.URL.Query().Get("q"))
	systemID := e.Request.URL.Query().Get("system")
	if systemID == "" {
		return e.BadRequestError("Invalid system parameter", nil)
	}
	if query == "" {
		return e.BadRequestError("Search query is required", nil)
	}
	if len(query) < 2 {
		return e.BadRequestError("Search query must be at least 2 characters", nil)
	}
	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}
	if !system.SupportsSoftwareMonitoring() {
		return e.BadRequestError("Current system does not support software monitoring", nil)
	}
	result, err := system.SearchSoftwareFromAgent(query, 50)
	if err != nil {
		return e.InternalServerError("", err)
	}
	return e.JSON(http.StatusOK, result)
}

func (h *Hub) deleteServiceControlRule(e *core.RequestEvent) error {
	id := e.Request.PathValue("id")
	if id == "" {
		return e.BadRequestError("Invalid rule id", nil)
	}
	rule, err := h.FindRecordById("service_control_rules", id)
	if err != nil {
		return e.NotFoundError("", err)
	}
	system, err := h.sm.GetSystem(rule.GetString("system"))
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}
	if e.Auth.GetString("role") == "readonly" {
		h.createOperationAudit(e, rule.GetString("system"), "delete_service_control_rule", rule.GetString("name"), "", "failed", "Readonly users cannot remove service monitoring rules", operationFailureDenied)
		return e.ForbiddenError("Readonly users cannot remove service monitoring rules", nil)
	}
	if err := h.Delete(rule); err != nil {
		h.createOperationAudit(e, rule.GetString("system"), "delete_service_control_rule", rule.GetString("name"), "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}
	h.createOperationAudit(e, rule.GetString("system"), "delete_service_control_rule", rule.GetString("name"), "", "success", "服务控制规则已删除")
	return e.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

// refreshSmartData handles POST /api/pulse/smart/refresh requests
// Fetches fresh SMART data from the agent and updates the collection
func (h *Hub) refreshSmartData(e *core.RequestEvent) error {
	systemID := e.Request.URL.Query().Get("system")
	if systemID == "" {
		h.createOperationAudit(e, "", "refresh_smart", "", "", "failed", "Invalid system parameter", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid system parameter", nil)
	}

	system, err := h.sm.GetSystem(systemID)
	if err != nil || !system.HasUser(e.App, e.Auth) {
		return e.NotFoundError("", nil)
	}

	if err := system.FetchAndSaveSmartDevices(); err != nil {
		h.createOperationAudit(e, systemID, "refresh_smart", "", "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("", err)
	}

	h.createOperationAudit(e, systemID, "refresh_smart", "", "", "success", "S.M.A.R.T. 数据已刷新")
	return e.JSON(http.StatusOK, map[string]string{"status": "ok"})
}

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
