package hub

import (
	"net/http"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/alerts"
	"gutenacht.site/pulse/internal/hub/utils"
)

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
	assetMonitoringModule := h.requirePulseModule("asset-monitoring")
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
	// asset-centric monitoring registry: host Agent + website HTTP providers
	apiAuth.GET("/asset-monitoring", h.listAssetMonitorAssets).BindFunc(assetMonitoringModule)
	apiAuth.DELETE("/asset-monitoring/bindings/{id}", h.deleteAssetMonitorBinding).BindFunc(requireAdminRole).BindFunc(assetMonitoringModule)
	// get paged website monitors for large website lists
	apiAuth.GET("/website-monitors", h.listWebsiteMonitors).BindFunc(websiteMonitoringModule)
	// get container system summaries and the selected system's container list
	apiAuth.GET("/containers", h.listContainers).BindFunc(clientMonitoringModule)
	// send test notification
	apiAuth.POST("/test-notification", h.SendTestNotification).BindFunc(excludeReadOnlyRole).BindFunc(notificationsModule)
	// send a test email with the SMTP config provided in the request body (not persisted)
	apiAuth.POST("/notifications/email/test", h.SendTestEmailNotification).BindFunc(excludeReadOnlyRole).BindFunc(notificationsModule)
	// account password change for all logged-in users (admins keep superuser password in sync)
	apiAuth.POST("/account/password", h.changeAccountPassword)
	// handle agent websocket connection
	apiNoAuth.GET("/agent-connect", h.handleAgentConnect)
	// read-only status endpoint for installed agents using their own token
	apiNoAuth.GET("/agent-status", h.getAgentStatus)
	// local agent release binaries; agents fetch these without browser auth during controlled updates
	apiNoAuth.GET("/agent-releases/{version}/{filename}", h.downloadAgentRelease)
	apiNoAuth.GET("/agent-install/windows.ps1", h.downloadWindowsAgentInstallScript)
	apiNoAuth.GET("/agent-install/unraid.xml", h.downloadUnraidAgentTemplateXml)
	apiAuth.POST("/agent-releases/sync", h.syncAgentReleases).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.POST("/pairing-codes", h.createPairingCode).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.GET("/pairing-codes", h.listPairingCodes).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.GET("/pairing-codes/{id}", h.getPairingCode).BindFunc(excludeReadOnlyRole).BindFunc(agentManagementModule)
	apiAuth.POST("/pairing-codes/{id}/reset", h.resetPairingCode).BindFunc(requireAdminRole).BindFunc(agentManagementModule)
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
	apiAuth.POST("/assets/parameter-agent", h.assetParameterAgent).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/image-candidates", h.assetImageCandidates).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/enrichment-reports", h.generateAssetEnrichmentReport).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/migrations/export", h.exportAssetMigrationPackage).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/migrations/upload", h.uploadAssetMigrationPackage).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/migrations/{id}/preflight", h.preflightAssetMigrationUpload).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/migrations/{id}/apply", h.applyAssetMigrationUpload).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/internet-addresses/refresh", h.refreshInternetPublicAddresses).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/internet-addresses/settings", h.updateInternetPublicAddressSettings).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/visuals/turntable", h.generateAssetTurntableVisual).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/visuals/{visualId}/select", h.selectAssetVisualCandidate).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/visuals/{visualId}/crop", h.updateAssetVisualCrop).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.GET("/assets/{id}/media", h.listAssetMedia).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/import-url", h.importAssetMediaURL).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/adopt", h.adoptAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/placements", h.upsertAssetMediaPlacement).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/album", h.setAssetMediaAlbum).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/archive", h.archiveAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.DELETE("/assets/{id}/media/{mediaId}", h.deleteAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/versions", h.createAssetMediaVersion).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/{mediaId}/restore-original", h.restoreAssetMediaOriginal).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/upload", h.uploadAssetMedia).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.POST("/assets/{id}/media/import-visual", h.importAssetVisualCandidate).BindFunc(excludeReadOnlyRole).BindFunc(assetCenterModule)
	apiAuth.GET("/asset-media/store", h.getAssetMediaStoreSettings).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.POST("/asset-media/store", h.updateAssetMediaStoreSettings).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.GET("/asset-media/object", h.readAssetMediaObject).BindFunc(assetCenterModule)
	apiAuth.GET("/asset-enrichment/config", h.getAssetEnrichmentConfig).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.POST("/asset-enrichment/config", h.updateAssetEnrichmentConfig).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
	apiAuth.GET("/asset-enrichment/models", h.listAssetEnrichmentModels).BindFunc(requireAdminRole).BindFunc(assetCenterModule)
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
	apiAuth.POST("/backups/upload", h.uploadPortableBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.POST("/backups/{key}/preflight", h.preflightPortableBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.GET("/backups/{key}", h.downloadBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.DELETE("/backups/{key}", h.deleteBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.POST("/backups/{key}/restore", h.restoreBackup).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.GET("/backups/tasks/{id}", h.getPortableRestoreTask).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	// daily scheduled backup config / status / manual run / external files
	apiAuth.GET("/backups/scheduled/config", h.getScheduledBackupConfig).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.PUT("/backups/scheduled/config", h.updateScheduledBackupConfig).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.POST("/backups/scheduled/run", h.runScheduledBackupNow).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	apiAuth.GET("/backups/scheduled/list", h.listScheduledBackups).BindFunc(requireAdminRole).BindFunc(maintenanceModule)
	// deep health report (cron heartbeats, db write probe, backup dir, disk usage); admin only
	// because it exposes disk and task details; health is not a single module so no module gate
	apiAuth.GET("/health/deep", h.getDeepHealth).BindFunc(requireAdminRole)
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
