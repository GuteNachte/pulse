// Package alerts handles alert management and delivery.
package alerts

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/nicholas-fedor/shoutrrr"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
	"gutenacht.site/pulse/internal/common"
)

type hubLike interface {
	core.App
	MakeLink(parts ...string) string
}

type AlertManager struct {
	hub           hubLike
	stopOnce      sync.Once
	pendingAlerts sync.Map
	alertsCache   *AlertsCache
}

type AlertMessageData struct {
	UserID    string
	SystemID  string
	AssetID   string
	AssetName string
	AlertID   string
	Title     string
	Message   string
	Link      string
	LinkText  string
	Resolved  bool
}

type UserNotificationSettings struct {
	Webhooks []string `json:"webhooks"`
}

type SystemAlertFsStats struct {
	DiskTotal float64 `json:"d"`
	DiskUsed  float64 `json:"du"`
}

// Values pulled from system_stats.stats that are relevant to alerts.
type SystemAlertStats struct {
	Cpu          float64                       `json:"cpu"`
	Mem          float64                       `json:"mp"`
	Disk         float64                       `json:"dp"`
	Bandwidth    [2]uint64                     `json:"b"`
	GPU          map[string]SystemAlertGPUData `json:"g"`
	Temperatures map[string]float32            `json:"t"`
	LoadAvg      [3]float64                    `json:"la"`
	Battery      [2]uint8                      `json:"bat"`
	ExtraFs      map[string]SystemAlertFsStats `json:"efs"`
}

type SystemAlertGPUData struct {
	Usage float64 `json:"u"`
}

type SystemAlertData struct {
	systemRecord *core.Record
	alertData    CachedAlertData
	name         string
	unit         string
	val          float64
	threshold    float64
	triggered    bool
	time         time.Time
	count        uint8
	min          uint8
	mapSums      map[string]float32
	descriptor   string // override descriptor in notification body (for temp sensor, disk partition, etc)
}

// notification services that support title param
var supportsTitle = map[string]struct{}{
	"bark":       {},
	"discord":    {},
	"gotify":     {},
	"ifttt":      {},
	"join":       {},
	"lark":       {},
	"ntfy":       {},
	"opsgenie":   {},
	"pushbullet": {},
	"pushover":   {},
	"slack":      {},
	"teams":      {},
	"telegram":   {},
	"zulip":      {},
}

var sendShoutrrr = shoutrrr.Send

const defaultNotificationCooldown = 30 * time.Minute

// NewAlertManager creates a new AlertManager instance.
func NewAlertManager(app hubLike) *AlertManager {
	am := &AlertManager{
		hub:         app,
		alertsCache: NewAlertsCache(app),
	}
	am.bindLifecycle()
	am.bindEvents()
	return am
}

func (am *AlertManager) bindLifecycle() {
	am.hub.OnTerminate().BindFunc(func(e *core.TerminateEvent) error {
		am.Stop()
		return e.Next()
	})
}

// Bind events to the alerts collection lifecycle
func (am *AlertManager) bindEvents() {
	am.hub.OnRecordAfterCreateSuccess("alerts").BindFunc(func(e *core.RecordEvent) error {
		_ = syncAlertAssetFromSystem(e.App, e.Record)
		return e.Next()
	})
	am.hub.OnRecordAfterUpdateSuccess("alerts").BindFunc(updateHistoryOnAlertUpdate)
	am.hub.OnRecordAfterDeleteSuccess("alerts").BindFunc(resolveHistoryOnAlertDelete)
	am.hub.OnRecordAfterUpdateSuccess("systems").BindFunc(func(e *core.RecordEvent) error {
		if e.Record.GetString("asset") != e.Record.Original().GetString("asset") {
			_ = syncAlertAssetsForSystem(e.App, e.Record.Id, e.Record.GetString("asset"))
		}
		return e.Next()
	})
	am.hub.OnRecordAfterUpdateSuccess("smart_devices").BindFunc(am.handleSmartDeviceAlert)

	am.hub.OnServe().BindFunc(func(e *core.ServeEvent) error {
		// Populate all alerts into cache on startup
		_ = am.alertsCache.PopulateFromDB(true)

		if err := resolveStatusAlerts(e.App); err != nil {
			e.App.Logger().Error("Failed to resolve stale status alerts", "err", err)
		}
		if err := am.restorePendingStatusAlerts(); err != nil {
			e.App.Logger().Error("Failed to restore pending status alerts", "err", err)
		}
		return e.Next()
	})
}

// SendAlert sends an alert to the user
func (am *AlertManager) SendAlert(data AlertMessageData) error {
	data = am.withAlertAssetContext(data)
	if data.AlertID != "" && IsAlertSilenced(am.hub, data.UserID, data.SystemID, data.AlertID) {
		am.hub.Logger().Info("Skipped silenced alert notification", "alert_id", data.AlertID, "system", data.SystemID)
		return nil
	}

	if !data.Resolved && !am.shouldSendAlertNotification(data) {
		am.hub.Logger().Info("Skipped alert notification during cooldown", "alert_id", data.AlertID, "system", data.SystemID)
		return nil
	}

	// get user settings
	record, err := am.hub.FindFirstRecordByFilter(
		"user_settings", "user={:user}",
		dbx.Params{"user": data.UserID},
	)
	if err != nil {
		return err
	}
	// unmarshal user settings
	userAlertSettings := UserNotificationSettings{
		Webhooks: []string{},
	}
	if err := record.UnmarshalJSONField("settings", &userAlertSettings); err != nil {
		am.hub.Logger().Error("Failed to unmarshal user settings", "err", err)
	}
	// send alerts via webhooks
	var firstErr error
	sentToChannels := 0
	for _, webhook := range userAlertSettings.Webhooks {
		sentToChannels++
		if err := am.SendShoutrrrAlert(webhook, data.Title, data.Message, data.Link, data.LinkText); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			am.hub.Logger().Error("Failed to send shoutrrr alert", "err", common.RedactSensitiveText(err.Error()))
			if healthErr := am.recordNotificationChannelFailure(data, webhook, err, false); healthErr != nil {
				firstErr = errors.Join(firstErr, healthErr)
				am.hub.Logger().Error("Failed to record notification channel health", "err", healthErr)
			}
			if recordErr := am.recordNotificationFailure(data, webhook, err); recordErr != nil {
				firstErr = errors.Join(firstErr, recordErr)
				am.hub.Logger().Error("Failed to record notification failure", "err", recordErr)
			}
			continue
		}
		if err := am.recordNotificationChannelSuccess(data, webhook, false); err != nil {
			am.hub.Logger().Error("Failed to record notification channel health", "err", err)
		}
		if err := am.clearNotificationFailure(data.UserID, webhook); err != nil {
			am.hub.Logger().Error("Failed to clear notification failure", "err", err)
		}
	}
	if data.AlertID != "" && sentToChannels > 0 {
		if err := am.recordAlertNotificationResult(data, firstErr); err != nil {
			am.hub.Logger().Error("Failed to record alert notification state", "err", err)
		}
	}
	return firstErr
}

func (am *AlertManager) withAlertAssetContext(data AlertMessageData) AlertMessageData {
	assetName := strings.TrimSpace(data.AssetName)
	assetID := strings.TrimSpace(data.AssetID)
	if assetName == "" && assetID != "" {
		if assetRecord, err := am.hub.FindRecordById("assets", assetID); err == nil && assetRecord != nil {
			assetName = strings.TrimSpace(assetRecord.GetString("name"))
		}
	}
	if assetName == "" && strings.TrimSpace(data.SystemID) != "" {
		if systemRecord, err := am.hub.FindRecordById("systems", strings.TrimSpace(data.SystemID)); err == nil && systemRecord != nil {
			if assetID == "" {
				assetID = strings.TrimSpace(systemRecord.GetString("asset"))
			}
			if assetID != "" {
				if assetRecord, err := am.hub.FindRecordById("assets", assetID); err == nil && assetRecord != nil {
					assetName = strings.TrimSpace(assetRecord.GetString("name"))
				}
			}
		}
	}
	if assetName == "" {
		return data
	}
	data.AssetID = assetID
	data.AssetName = assetName
	line := "资产：" + assetName
	if !strings.Contains(data.Message, line) {
		if strings.TrimSpace(data.Message) == "" {
			data.Message = line
		} else {
			data.Message = line + "\n" + data.Message
		}
	}
	return data
}

func alertNotificationFingerprint(data AlertMessageData) string {
	parts := []string{
		strings.TrimSpace(data.UserID),
		strings.TrimSpace(data.SystemID),
		strings.TrimSpace(data.AlertID),
	}
	if parts[2] == "" {
		parts[2] = strings.TrimSpace(data.Title)
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:])
}

func (am *AlertManager) shouldSendAlertNotification(data AlertMessageData) bool {
	if strings.TrimSpace(data.UserID) == "" || strings.TrimSpace(data.AlertID) == "" {
		return true
	}
	fingerprint := alertNotificationFingerprint(data)
	record, err := am.hub.FindFirstRecordByFilter(
		"alert_notification_states",
		"user={:user} && fingerprint={:fingerprint}",
		dbx.Params{"user": data.UserID, "fingerprint": fingerprint},
	)
	if err != nil || record == nil {
		return true
	}
	nextAllowed := record.GetDateTime("next_allowed_at")
	if nextAllowed.IsZero() || !nextAllowed.Time().After(time.Now().UTC()) {
		return true
	}
	now := time.Now().UTC()
	if assetID := strings.TrimSpace(data.AssetID); assetID != "" {
		record.Set("asset", assetID)
	}
	record.Set("status", "suppressed")
	record.Set("title", data.Title)
	record.Set("last_attempt_at", now)
	record.Set("last_suppressed_at", now)
	record.Set("suppressed_count", record.GetInt("suppressed_count")+1)
	if err := am.hub.SaveNoValidate(record); err != nil {
		am.hub.Logger().Error("Failed to record suppressed alert notification", "err", err)
	}
	return false
}

func (am *AlertManager) recordAlertNotificationResult(data AlertMessageData, sendErr error) error {
	if strings.TrimSpace(data.UserID) == "" || strings.TrimSpace(data.AlertID) == "" {
		return nil
	}
	fingerprint := alertNotificationFingerprint(data)
	record, err := am.hub.FindFirstRecordByFilter(
		"alert_notification_states",
		"user={:user} && fingerprint={:fingerprint}",
		dbx.Params{"user": data.UserID, "fingerprint": fingerprint},
	)
	if err != nil {
		collection, collectionErr := am.hub.FindCollectionByNameOrId("alert_notification_states")
		if collectionErr != nil {
			return collectionErr
		}
		record = core.NewRecord(collection)
		record.Set("user", data.UserID)
		record.Set("fingerprint", fingerprint)
		record.Set("suppressed_count", 0)
	}
	now := time.Now().UTC()
	record.Set("system", data.SystemID)
	record.Set("asset", strings.TrimSpace(data.AssetID))
	record.Set("alert_id", data.AlertID)
	record.Set("title", data.Title)
	record.Set("last_attempt_at", now)
	if data.Resolved {
		record.Set("status", "resolved")
		record.Set("last_resolved_at", now)
		record.Set("next_allowed_at", types.DateTime{})
		record.Set("last_error", "")
		return am.hub.SaveNoValidate(record)
	}
	record.Set("next_allowed_at", now.Add(defaultNotificationCooldown))
	if sendErr != nil {
		record.Set("status", "failed")
		record.Set("last_error", common.RedactSensitiveText(sendErr.Error()))
	} else {
		record.Set("status", "sent")
		record.Set("last_error", "")
		record.Set("last_sent_at", now)
	}
	return am.hub.SaveNoValidate(record)
}

func notificationFingerprint(webhook string) string {
	sum := sha256.Sum256([]byte(webhook))
	return hex.EncodeToString(sum[:])
}

func notificationTarget(webhook string) string {
	parsedURL, err := url.Parse(webhook)
	if err != nil {
		return "Webhook"
	}
	if host := parsedURL.Hostname(); host != "" {
		return parsedURL.Scheme + "://" + host
	}
	if parsedURL.Scheme != "" {
		return parsedURL.Scheme
	}
	return "Webhook"
}

func (am *AlertManager) recordNotificationFailure(data AlertMessageData, webhook string, sendErr error) error {
	fingerprint := notificationFingerprint(webhook)
	record, err := am.hub.FindFirstRecordByFilter(
		"notification_failures",
		"user={:user} && fingerprint={:fingerprint}",
		dbx.Params{"user": data.UserID, "fingerprint": fingerprint},
	)
	if err != nil {
		collection, collectionErr := am.hub.FindCollectionByNameOrId("notification_failures")
		if collectionErr != nil {
			return collectionErr
		}
		record = core.NewRecord(collection)
		record.Set("user", data.UserID)
		record.Set("fingerprint", fingerprint)
		record.Set("count", 0)
	}
	record.Set("system", data.SystemID)
	record.Set("asset", strings.TrimSpace(data.AssetID))
	record.Set("title", data.Title)
	record.Set("target", notificationTarget(webhook))
	record.Set("error", common.RedactSensitiveText(sendErr.Error()))
	record.Set("count", record.GetInt("count")+1)
	return am.hub.SaveNoValidate(record)
}

func (am *AlertManager) notificationChannelHealthRecord(userID string, webhook string) (*core.Record, error) {
	fingerprint := notificationFingerprint(webhook)
	record, err := am.hub.FindFirstRecordByFilter(
		"notification_channel_health",
		"user={:user} && fingerprint={:fingerprint}",
		dbx.Params{"user": userID, "fingerprint": fingerprint},
	)
	if err == nil && record != nil {
		return record, nil
	}
	collection, collectionErr := am.hub.FindCollectionByNameOrId("notification_channel_health")
	if collectionErr != nil {
		return nil, collectionErr
	}
	record = core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("fingerprint", fingerprint)
	record.Set("target", notificationTarget(webhook))
	record.Set("status", "unknown")
	record.Set("success_count", 0)
	record.Set("failure_count", 0)
	return record, nil
}

func (am *AlertManager) recordNotificationChannelSuccess(data AlertMessageData, webhook string, test bool) error {
	record, err := am.notificationChannelHealthRecord(data.UserID, webhook)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	record.Set("target", notificationTarget(webhook))
	record.Set("status", "healthy")
	record.Set("last_title", data.Title)
	record.Set("last_error", "")
	record.Set("last_checked_at", now)
	record.Set("last_success_at", now)
	record.Set("success_count", record.GetInt("success_count")+1)
	if test {
		record.Set("last_test_at", now)
	}
	return am.hub.SaveNoValidate(record)
}

func (am *AlertManager) recordNotificationChannelFailure(data AlertMessageData, webhook string, sendErr error, test bool) error {
	record, err := am.notificationChannelHealthRecord(data.UserID, webhook)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	record.Set("target", notificationTarget(webhook))
	record.Set("status", "failed")
	record.Set("last_title", data.Title)
	record.Set("last_error", common.RedactSensitiveText(sendErr.Error()))
	record.Set("last_checked_at", now)
	record.Set("last_failure_at", now)
	record.Set("failure_count", record.GetInt("failure_count")+1)
	if test {
		record.Set("last_test_at", now)
	}
	return am.hub.SaveNoValidate(record)
}

func (am *AlertManager) clearNotificationFailure(userID, webhook string) error {
	record, err := am.hub.FindFirstRecordByFilter(
		"notification_failures",
		"user={:user} && fingerprint={:fingerprint}",
		dbx.Params{"user": userID, "fingerprint": notificationFingerprint(webhook)},
	)
	if err != nil {
		return nil
	}
	return am.hub.Delete(record)
}

// SendShoutrrrAlert sends an alert via a Shoutrrr URL
func (am *AlertManager) SendShoutrrrAlert(notificationUrl, title, message, link, linkText string) error {
	// Parse the URL
	parsedURL, err := url.Parse(notificationUrl)
	if err != nil {
		return fmt.Errorf("error parsing URL: %v", err)
	}
	scheme := parsedURL.Scheme
	queryParams := parsedURL.Query()

	// Add title
	if _, ok := supportsTitle[scheme]; ok {
		queryParams.Add("title", title)
	} else if scheme == "mattermost" {
		// use markdown title for mattermost
		message = "##### " + title + "\n\n" + message
	} else if scheme == "generic" && queryParams.Has("template") {
		// add title as property if using generic with template json
		titleKey := queryParams.Get("titlekey")
		if titleKey == "" {
			titleKey = "title"
		}
		queryParams.Add("$"+titleKey, title)
	} else {
		// otherwise just add title to message
		message = title + "\n\n" + message
	}

	// Add link
	switch scheme {
	case "ntfy":
		queryParams.Add("Actions", fmt.Sprintf("view, %s, %s", linkText, link))
	case "lark":
		queryParams.Add("link", link)
	case "bark":
		queryParams.Add("url", link)
	default:
		message += "\n\n" + link
	}

	// Encode the modified query parameters back into the URL
	parsedURL.RawQuery = queryParams.Encode()
	// log.Println("URL after modification:", parsedURL.String())

	err = sendShoutrrr(parsedURL.String(), message)

	if err == nil {
		am.hub.Logger().Info("Sent shoutrrr alert", "title", title)
	} else {
		am.hub.Logger().Error("Error sending shoutrrr alert", "err", common.RedactSensitiveText(err.Error()))
		return err
	}
	return nil
}

// setAlertTriggered updates the "triggered" status of an alert record in the database
func (am *AlertManager) setAlertTriggered(alert CachedAlertData, triggered bool) error {
	alertRecord, err := am.hub.FindRecordById("alerts", alert.Id)
	if err != nil {
		return err
	}
	syncAlertAssetFromSystem(am.hub, alertRecord)
	alertRecord.Set("triggered", triggered)
	return am.hub.Save(alertRecord)
}

func syncAlertAssetFromSystem(app core.App, alertRecord *core.Record) error {
	if app == nil || alertRecord == nil {
		return nil
	}
	assetID := ""
	systemID := strings.TrimSpace(alertRecord.GetString("system"))
	if systemID != "" {
		if systemRecord, err := app.FindRecordById("systems", systemID); err == nil && systemRecord != nil {
			assetID = strings.TrimSpace(systemRecord.GetString("asset"))
		}
	}
	if strings.TrimSpace(alertRecord.GetString("asset")) == assetID {
		return nil
	}
	alertRecord.Set("asset", assetID)
	return app.SaveNoValidate(alertRecord)
}

func syncAlertAssetsForSystem(app core.App, systemID string, assetID string) error {
	systemID = strings.TrimSpace(systemID)
	if systemID == "" {
		return nil
	}
	records, err := app.FindRecordsByFilter(
		"alerts",
		"system={:system}",
		"",
		-1,
		0,
		dbx.Params{"system": systemID},
	)
	if err != nil {
		return err
	}
	assetID = strings.TrimSpace(assetID)
	for _, record := range records {
		if strings.TrimSpace(record.GetString("asset")) == assetID {
			continue
		}
		record.Set("asset", assetID)
		if err := app.SaveNoValidate(record); err != nil {
			return err
		}
	}
	return nil
}
