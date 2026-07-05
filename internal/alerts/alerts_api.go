package alerts

import (
	"database/sql"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"slices"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/common"
)

var allowedAlertPolicyNames = map[string]struct{}{
	"Status":      {},
	"CPU":         {},
	"Memory":      {},
	"Disk":        {},
	"Temperature": {},
	"Bandwidth":   {},
	"GPU":         {},
	"LoadAvg1":    {},
	"LoadAvg5":    {},
	"LoadAvg15":   {},
	"Battery":     {},
}

func isAllowedAlertPolicyName(name string) bool {
	_, ok := allowedAlertPolicyNames[name]
	return ok
}

func findUserSystemIDs(app core.App, userID string) ([]string, error) {
	records, err := app.FindRecordsByFilter(
		"systems",
		"users ~ {:user}",
		"",
		-1,
		0,
		dbx.Params{"user": userID},
	)
	if err != nil {
		return nil, err
	}
	systemIDs := make([]string, 0, len(records))
	for _, record := range records {
		systemIDs = append(systemIDs, record.Id)
	}
	return systemIDs, nil
}

func upsertAlertForSystem(app core.App, alertsCollection *core.Collection, userID string, systemID string, name string, value float64, min uint8, overwrite bool) error {
	alertRecord, err := app.FindFirstRecordByFilter(alertsCollection,
		"system={:system} && name={:name} && user={:user}",
		dbx.Params{"system": systemID, "name": name, "user": userID})

	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	if !overwrite && alertRecord != nil {
		return nil
	}

	if alertRecord == nil {
		alertRecord = core.NewRecord(alertsCollection)
		alertRecord.Set("user", userID)
		alertRecord.Set("system", systemID)
		alertRecord.Set("name", name)
	}

	alertRecord.Set("asset", resolveSystemAssetID(app, systemID))
	alertRecord.Set("value", value)
	alertRecord.Set("min", min)

	return app.SaveNoValidate(alertRecord)
}

func resolveSystemAssetID(app core.App, systemID string) string {
	systemID = strings.TrimSpace(systemID)
	if systemID == "" {
		return ""
	}
	systemRecord, err := app.FindRecordById("systems", systemID)
	if err != nil || systemRecord == nil {
		return ""
	}
	return strings.TrimSpace(systemRecord.GetString("asset"))
}

func resolveUserAlertTargetSystems(app core.App, userID string, systemIDs []string, assetIDs []string, requireTargets bool) ([]string, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, errors.New("missing user")
	}
	targets := make([]string, 0, len(systemIDs)+len(assetIDs))
	seen := map[string]struct{}{}

	addSystem := func(systemID string) error {
		systemID = strings.TrimSpace(systemID)
		if systemID == "" {
			return nil
		}
		if _, ok := seen[systemID]; ok {
			return nil
		}
		systemRecord, err := app.FindRecordById("systems", systemID)
		if err != nil || systemRecord == nil {
			return fmt.Errorf("invalid system target")
		}
		if !slices.Contains(systemRecord.GetStringSlice("users"), userID) {
			return fmt.Errorf("system target is not visible to current user")
		}
		seen[systemID] = struct{}{}
		targets = append(targets, systemID)
		return nil
	}

	for _, systemID := range systemIDs {
		if err := addSystem(systemID); err != nil {
			return nil, err
		}
	}

	for _, assetID := range assetIDs {
		assetID = strings.TrimSpace(assetID)
		if assetID == "" {
			continue
		}
		assetRecord, err := app.FindRecordById("assets", assetID)
		if err != nil || assetRecord == nil {
			return nil, fmt.Errorf("invalid asset target")
		}
		if strings.TrimSpace(assetRecord.GetString("user")) != userID {
			return nil, fmt.Errorf("asset target is not visible to current user")
		}
		records, err := app.FindRecordsByFilter(
			"systems",
			"users ~ {:user} && asset = {:asset}",
			"",
			-1,
			0,
			dbx.Params{"user": userID, "asset": assetID},
		)
		if err != nil {
			return nil, err
		}
		if requireTargets && len(records) == 0 {
			return nil, fmt.Errorf("asset target has no monitored system")
		}
		for _, record := range records {
			if err := addSystem(record.Id); err != nil {
				return nil, err
			}
		}
	}

	if requireTargets && len(targets) == 0 {
		return nil, fmt.Errorf("no valid alert targets")
	}
	return targets, nil
}

func deleteAlertForSystem(app core.App, userID string, systemID string, name string) (bool, error) {
	alertRecord, err := app.FindFirstRecordByFilter("alerts",
		"system={:system} && name={:name} && user={:user}",
		dbx.Params{"system": systemID, "name": name, "user": userID})

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}

	if err := app.Delete(alertRecord); err != nil {
		return false, err
	}
	return true, nil
}

// DeleteStatusAlertForSystem removes all Status alert records for a system.
func DeleteStatusAlertForSystem(app core.App, systemID string) (int, error) {
	if systemID == "" {
		return 0, nil
	}
	records, err := app.FindRecordsByFilter(
		"alerts",
		"system = {:system} && name = 'Status'",
		"",
		-1,
		0,
		dbx.Params{"system": systemID},
	)
	if err != nil {
		return 0, err
	}
	for _, record := range records {
		if err := app.Delete(record); err != nil {
			return 0, err
		}
	}
	return len(records), nil
}

// UpsertUserAlerts handles API requests to create or update alerts for a user
// across multiple systems or monitored assets (POST /api/pulse/user-alerts).
func UpsertUserAlerts(e *core.RequestEvent) error {
	userID := e.Auth.Id

	reqData := struct {
		Min       uint8    `json:"min"`
		Value     float64  `json:"value"`
		Name      string   `json:"name"`
		Systems   []string `json:"systems"`
		Assets    []string `json:"assets"`
		Overwrite bool     `json:"overwrite"`
	}{}
	err := e.BindBody(&reqData)
	if err != nil || userID == "" || reqData.Name == "" || (len(reqData.Systems) == 0 && len(reqData.Assets) == 0) {
		return e.BadRequestError("Bad data", err)
	}
	targetSystems, err := resolveUserAlertTargetSystems(e.App, userID, reqData.Systems, reqData.Assets, true)
	if err != nil {
		return e.BadRequestError("Bad data", err)
	}

	alertsCollection, err := e.App.FindCachedCollectionByNameOrId("alerts")
	if err != nil {
		return err
	}

	err = e.App.RunInTransaction(func(txApp core.App) error {
		for _, systemId := range targetSystems {
			if err := upsertAlertForSystem(txApp, alertsCollection, userID, systemId, reqData.Name, reqData.Value, reqData.Min, reqData.Overwrite); err != nil {
				return err
			}
		}
		return nil
	})

	if err != nil {
		writeOperationAudit(e.App, userID, "", "upsert_user_alerts", reqData.Name, "failed", err.Error(), "failed", auditRequestIP(e.Request))
		return err
	}

	writeOperationAudit(e.App, userID, "", "upsert_user_alerts", reqData.Name, "success", alertSystemsAuditDetail(len(targetSystems), "updated"), "", auditRequestIP(e.Request))
	return e.JSON(http.StatusOK, map[string]any{"success": true})
}

// DeleteUserAlerts handles API requests to delete alerts for a user across
// multiple systems or monitored assets (DELETE /api/pulse/user-alerts).
func DeleteUserAlerts(e *core.RequestEvent) error {
	userID := e.Auth.Id

	reqData := struct {
		AlertName string   `json:"name"`
		Systems   []string `json:"systems"`
		Assets    []string `json:"assets"`
	}{}
	err := e.BindBody(&reqData)
	if err != nil || userID == "" || reqData.AlertName == "" || (len(reqData.Systems) == 0 && len(reqData.Assets) == 0) {
		return e.BadRequestError("Bad data", err)
	}
	targetSystems, err := resolveUserAlertTargetSystems(e.App, userID, reqData.Systems, reqData.Assets, false)
	if err != nil {
		return e.BadRequestError("Bad data", err)
	}

	var numDeleted uint16

	err = e.App.RunInTransaction(func(txApp core.App) error {
		for _, systemId := range targetSystems {
			deleted, err := deleteAlertForSystem(txApp, userID, systemId, reqData.AlertName)
			if err != nil {
				return err
			}
			if deleted {
				numDeleted++
			}
		}
		return nil
	})

	if err != nil {
		writeOperationAudit(e.App, userID, "", "delete_user_alerts", reqData.AlertName, "failed", err.Error(), "failed", auditRequestIP(e.Request))
		return err
	}

	writeOperationAudit(e.App, userID, "", "delete_user_alerts", reqData.AlertName, "success", alertSystemsAuditDetail(int(numDeleted), "deleted"), "", auditRequestIP(e.Request))
	return e.JSON(http.StatusOK, map[string]any{"success": true, "count": numDeleted})
}

// ListGlobalAlertPolicies returns the current user's global alert policies.
func ListGlobalAlertPolicies(e *core.RequestEvent) error {
	records, err := e.App.FindRecordsByFilter(
		"alert_policies",
		"user = {:user}",
		"name",
		-1,
		0,
		dbx.Params{"user": e.Auth.Id},
	)
	if err != nil {
		return err
	}
	coverageByName := buildAlertPolicyCoverage(e.App, e.Auth.Id)
	items := make([]map[string]any, 0, len(records))
	for _, record := range records {
		coverage := coverageByName[record.GetString("name")]
		items = append(items, map[string]any{
			"id":                    record.Id,
			"user":                  record.GetString("user"),
			"name":                  record.GetString("name"),
			"value":                 record.GetFloat("value"),
			"min":                   record.GetInt("min"),
			"coverage_count":        len(coverage.Assets),
			"coverage_system_count": coverage.SystemCount,
			"coverage_assets":       coverage.Assets,
			"created":               record.GetString("created"),
			"updated":               record.GetString("updated"),
		})
	}
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}

type alertPolicyCoverageAsset struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Type       string `json:"type,omitempty"`
	SystemID   string `json:"system_id,omitempty"`
	SystemName string `json:"system_name,omitempty"`
}

type alertPolicyCoverage struct {
	SystemCount int                        `json:"system_count"`
	Assets      []alertPolicyCoverageAsset `json:"assets"`
}

func buildAlertPolicyCoverage(app core.App, userID string) map[string]alertPolicyCoverage {
	result := map[string]alertPolicyCoverage{}
	if userID == "" {
		return result
	}
	alertRecords, err := app.FindRecordsByFilter(
		"alerts",
		"user = {:user}",
		"name",
		-1,
		0,
		dbx.Params{"user": userID},
	)
	if err != nil {
		app.Logger().Warn("Failed to load alert policy coverage", "err", err)
		return result
	}

	assetCache := map[string]*core.Record{}
	seenAssetsByPolicy := map[string]map[string]struct{}{}
	for _, alertRecord := range alertRecords {
		name := alertRecord.GetString("name")
		if name == "" {
			continue
		}
		coverage := result[name]
		coverage.SystemCount++

		systemID := alertRecord.GetString("system")
		systemName := systemID
		assetID := strings.TrimSpace(alertRecord.GetString("asset"))
		if systemID != "" {
			if systemRecord, err := app.FindRecordById("systems", systemID); err == nil {
				if displayName := strings.TrimSpace(systemRecord.GetString("display_name")); displayName != "" {
					systemName = displayName
				} else if name := strings.TrimSpace(systemRecord.GetString("name")); name != "" {
					systemName = name
				}
				if assetID == "" {
					assetID = strings.TrimSpace(systemRecord.GetString("asset"))
				}
			}
		}
		if assetID != "" {
			if seenAssetsByPolicy[name] == nil {
				seenAssetsByPolicy[name] = map[string]struct{}{}
			}
			if _, ok := seenAssetsByPolicy[name][assetID]; !ok {
				seenAssetsByPolicy[name][assetID] = struct{}{}
				assetRecord, ok := assetCache[assetID]
				if !ok {
					record, err := app.FindRecordById("assets", assetID)
					if err == nil {
						assetRecord = record
						assetCache[assetID] = record
					}
				}
				assetName := assetID
				assetType := ""
				if assetRecord != nil {
					if name := strings.TrimSpace(assetRecord.GetString("name")); name != "" {
						assetName = name
					}
					assetType = assetRecord.GetString("type")
				}
				coverage.Assets = append(coverage.Assets, alertPolicyCoverageAsset{
					ID:         assetID,
					Name:       assetName,
					Type:       assetType,
					SystemID:   systemID,
					SystemName: systemName,
				})
			}
		}
		result[name] = coverage
	}
	return result
}

// UpsertGlobalAlertPolicy stores a global alert policy and applies it to all current systems.
func UpsertGlobalAlertPolicy(e *core.RequestEvent) error {
	userID := e.Auth.Id
	reqData := struct {
		Min   uint8   `json:"min"`
		Value float64 `json:"value"`
		Name  string  `json:"name"`
	}{}
	err := e.BindBody(&reqData)
	if err != nil || userID == "" || reqData.Name == "" || reqData.Min == 0 || !isAllowedAlertPolicyName(reqData.Name) {
		return e.BadRequestError("Bad data", err)
	}

	policiesCollection, err := e.App.FindCachedCollectionByNameOrId("alert_policies")
	if err != nil {
		return err
	}
	alertsCollection, err := e.App.FindCachedCollectionByNameOrId("alerts")
	if err != nil {
		return err
	}

	var appliedCount int
	err = e.App.RunInTransaction(func(txApp core.App) error {
		policyRecord, err := txApp.FindFirstRecordByFilter(
			policiesCollection,
			"user={:user} && name={:name}",
			dbx.Params{"user": userID, "name": reqData.Name},
		)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if policyRecord == nil {
			policyRecord = core.NewRecord(policiesCollection)
			policyRecord.Set("user", userID)
			policyRecord.Set("name", reqData.Name)
		}
		policyRecord.Set("value", reqData.Value)
		policyRecord.Set("min", reqData.Min)
		if err := txApp.SaveNoValidate(policyRecord); err != nil {
			return err
		}

		systemIDs, err := findUserSystemIDs(txApp, userID)
		if err != nil {
			return err
		}
		for _, systemID := range systemIDs {
			if reqData.Name == "Status" && !systemAllowsOfflineAlerts(txApp, systemID) {
				continue
			}
			if err := upsertAlertForSystem(txApp, alertsCollection, userID, systemID, reqData.Name, reqData.Value, reqData.Min, true); err != nil {
				return err
			}
			appliedCount++
		}
		return nil
	})
	if err != nil {
		writeOperationAudit(e.App, userID, "", "upsert_global_alert_policy", reqData.Name, "failed", err.Error(), "failed", auditRequestIP(e.Request))
		return err
	}

	writeOperationAudit(e.App, userID, "", "upsert_global_alert_policy", reqData.Name, "success", alertSystemsAuditDetail(appliedCount, "applied"), "", auditRequestIP(e.Request))
	return e.JSON(http.StatusOK, map[string]any{"success": true, "applied": appliedCount})
}

// DeleteGlobalAlertPolicy removes a global alert policy and all matching per-system alert records for the current user.
func DeleteGlobalAlertPolicy(e *core.RequestEvent) error {
	userID := e.Auth.Id
	reqData := struct {
		Name string `json:"name"`
	}{}
	err := e.BindBody(&reqData)
	if err != nil || userID == "" || reqData.Name == "" || !isAllowedAlertPolicyName(reqData.Name) {
		return e.BadRequestError("Bad data", err)
	}

	var deletedCount int
	err = e.App.RunInTransaction(func(txApp core.App) error {
		policyRecord, err := txApp.FindFirstRecordByFilter(
			"alert_policies",
			"user={:user} && name={:name}",
			dbx.Params{"user": userID, "name": reqData.Name},
		)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if policyRecord != nil {
			if err := txApp.Delete(policyRecord); err != nil {
				return err
			}
		}

		systemIDs, err := findUserSystemIDs(txApp, userID)
		if err != nil {
			return err
		}
		for _, systemID := range systemIDs {
			deleted, err := deleteAlertForSystem(txApp, userID, systemID, reqData.Name)
			if err != nil {
				return err
			}
			if deleted {
				deletedCount++
			}
		}
		return nil
	})
	if err != nil {
		writeOperationAudit(e.App, userID, "", "delete_global_alert_policy", reqData.Name, "failed", err.Error(), "failed", auditRequestIP(e.Request))
		return err
	}

	writeOperationAudit(e.App, userID, "", "delete_global_alert_policy", reqData.Name, "success", alertSystemsAuditDetail(deletedCount, "deleted"), "", auditRequestIP(e.Request))
	return e.JSON(http.StatusOK, map[string]any{"success": true, "count": deletedCount})
}

// ApplyGlobalAlertPoliciesToSystem applies all existing global policies for a user to a newly created system.
func ApplyGlobalAlertPoliciesToSystem(app core.App, userID string, systemID string) error {
	if userID == "" || systemID == "" {
		return nil
	}
	policies, err := app.FindRecordsByFilter(
		"alert_policies",
		"user = {:user}",
		"",
		-1,
		0,
		dbx.Params{"user": userID},
	)
	if err != nil {
		return err
	}
	if len(policies) == 0 {
		return nil
	}
	alertsCollection, err := app.FindCachedCollectionByNameOrId("alerts")
	if err != nil {
		return err
	}
	for _, policy := range policies {
		name := policy.GetString("name")
		if name == "Status" && !systemAllowsOfflineAlerts(app, systemID) {
			continue
		}
		if err := upsertAlertForSystem(
			app,
			alertsCollection,
			userID,
			systemID,
			name,
			policy.GetFloat("value"),
			uint8(policy.GetInt("min")),
			false,
		); err != nil {
			return err
		}
	}
	return nil
}

func systemAllowsOfflineAlerts(app core.App, systemID string) bool {
	systemRecord, err := app.FindRecordById("systems", systemID)
	if err != nil {
		return true
	}
	return !systemRecord.GetBool("suppress_offline_alerts")
}

// SendTestNotification handles API request to send a test notification to a specified Shoutrrr URL
func (am *AlertManager) SendTestNotification(e *core.RequestEvent) error {
	var data struct {
		URL string `json:"url"`
	}
	err := e.BindBody(&data)
	if err != nil || data.URL == "" {
		writeOperationAudit(e.App, e.Auth.Id, "", "test_notification", notificationAuditTarget(data.URL), "failed", "URL is required", "invalid_request", auditRequestIP(e.Request))
		return e.BadRequestError("URL is required", err)
	}
	// Only allow admins to send test notifications to internal URLs
	if !e.Auth.IsSuperuser() && e.Auth.GetString("role") != "admin" {
		internalURL, err := isInternalURL(data.URL)
		if err != nil {
			writeOperationAudit(e.App, e.Auth.Id, "", "test_notification", notificationAuditTarget(data.URL), "failed", err.Error(), "invalid_request", auditRequestIP(e.Request))
			return e.BadRequestError(err.Error(), nil)
		}
		if internalURL {
			writeOperationAudit(e.App, e.Auth.Id, "", "test_notification", notificationAuditTarget(data.URL), "failed", "Only admins can send to internal destinations", "denied", auditRequestIP(e.Request))
			return e.ForbiddenError("Only admins can send to internal destinations", nil)
		}
	}
	testData := AlertMessageData{
		UserID:   e.Auth.Id,
		Title:    "Test Alert",
		Message:  "This is a notification from Pulse.",
		Link:     am.hub.Settings().Meta.AppURL,
		LinkText: "View Pulse",
	}
	err = am.SendShoutrrrAlert(data.URL, testData.Title, testData.Message, testData.Link, testData.LinkText)
	if err != nil {
		if healthErr := am.recordNotificationChannelFailure(testData, data.URL, err, true); healthErr != nil {
			e.App.Logger().Error("Failed to record notification test failure", "err", healthErr)
		}
		writeOperationAudit(e.App, e.Auth.Id, "", "test_notification", notificationAuditTarget(data.URL), "failed", err.Error(), "failed", auditRequestIP(e.Request))
		return e.JSON(200, map[string]string{"err": err.Error()})
	}
	if healthErr := am.recordNotificationChannelSuccess(testData, data.URL, true); healthErr != nil {
		e.App.Logger().Error("Failed to record notification test success", "err", healthErr)
	}
	if err := am.clearNotificationFailure(e.Auth.Id, data.URL); err != nil {
		e.App.Logger().Error("Failed to clear notification failure after test success", "err", err)
	}
	writeOperationAudit(e.App, e.Auth.Id, "", "test_notification", notificationAuditTarget(data.URL), "success", "通知测试成功", "", auditRequestIP(e.Request))
	return e.JSON(200, map[string]bool{"err": false})
}

func writeOperationAudit(app core.App, userID string, systemID string, action string, target string, result string, detail string, failureCode string, ip string) {
	collection, err := app.FindCachedCollectionByNameOrId("operation_audit")
	if err != nil {
		return
	}
	record := core.NewRecord(collection)
	if userID != "" {
		record.Set("user", userID)
	}
	if systemID != "" {
		record.Set("system", systemID)
	}
	record.Set("action", strings.TrimSpace(action))
	record.Set("target", common.RedactSensitiveText(target))
	record.Set("result", strings.TrimSpace(result))
	record.Set("detail", common.RedactSensitiveText(detail))
	if failureCode != "" {
		record.Set("failure_code", strings.TrimSpace(failureCode))
	}
	record.Set("ip", strings.TrimSpace(ip))
	_ = app.SaveNoValidate(record)
}

func auditRequestIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	for _, header := range []string{"X-Real-IP", "X-Forwarded-For"} {
		value := strings.TrimSpace(r.Header.Get(header))
		if value == "" {
			continue
		}
		if header == "X-Forwarded-For" {
			value = strings.TrimSpace(strings.Split(value, ",")[0])
		}
		if value != "" {
			return value
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func notificationAuditTarget(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		return "invalid notification target"
	}
	scheme := strings.TrimSpace(parsed.Scheme)
	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		host = strings.TrimSpace(parsed.Host)
	}
	if scheme != "" && host != "" {
		return scheme + "://" + host
	}
	if scheme != "" {
		return scheme
	}
	return "notification target"
}

func alertSystemsAuditDetail(count int, verb string) string {
	if count < 0 {
		count = 0
	}
	return strings.TrimSpace(verb) + " systems: " + fmt.Sprint(count)
}

// isInternalURL checks if the given shoutrrr URL points to an internal destination (localhost or private IP)
func isInternalURL(rawURL string) (bool, error) {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return false, err
	}

	host := parsedURL.Hostname()
	if host == "" {
		return false, nil
	}

	if strings.EqualFold(host, "localhost") {
		return true, nil
	}

	if ip := net.ParseIP(host); ip != nil {
		return isInternalIP(ip), nil
	}

	// Some Shoutrrr URLs use the host position for service identifiers rather than a
	// network hostname (for example, discord://token@webhookid). Restrict DNS lookups
	// to names that look like actual hostnames so valid service URLs keep working.
	if !strings.Contains(host, ".") {
		return false, nil
	}

	ips, err := net.LookupIP(host)
	if err != nil {
		return false, nil
	}

	if slices.ContainsFunc(ips, isInternalIP) {
		return true, nil
	}

	return false, nil
}

func isInternalIP(ip net.IP) bool {
	return ip.IsPrivate() || ip.IsLoopback() || ip.IsUnspecified()
}
