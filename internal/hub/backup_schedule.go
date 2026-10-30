package hub

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/alerts"
)

// 每日自动备份（PBL-003 V1）：
// cron 每 5 分钟检查一次配置，命中配置时刻的 5 分钟窗口且当天未执行时，
// 创建完整实例备份并复制到独立外部目录，按 7 日 / 4 周 / 12 月分层保留，
// 结果写入 system_settings，失败时写系统日志和站内告警。
// TODO(PBL-00x V2): 每月自动恢复演练（用最近一次自动备份在隔离目录做恢复验证）。

const (
	dailyBackupSettingsKey     = "daily_backup"
	dailyBackupStatusKey       = "daily_backup_status"
	dailyBackupAlertID         = "backup:daily"
	dailyBackupAlertFailedName = "备份：每日自动备份失败"
	dailyBackupAlertOkName     = "备份：每日自动备份已恢复"
	dailyBackupRunTimeout      = 10 * time.Minute
)

var dailyBackupTimePattern = regexp.MustCompile(`^([01]\d|2[0-3]):([0-5]\d)$`)

type dailyBackupSettings struct {
	Enabled          bool   `json:"enabled"`
	Time             string `json:"time"`
	Dir              string `json:"dir"`
	RetentionDaily   int    `json:"retentionDaily"`
	RetentionWeekly  int    `json:"retentionWeekly"`
	RetentionMonthly int    `json:"retentionMonthly"`
}

type dailyBackupStatus struct {
	LastRunDate    string `json:"lastRunDate"`
	LastAttempt    string `json:"lastAttempt"`
	LastSuccess    string `json:"lastSuccess"`
	LastError      string `json:"lastError"`
	LastSizeBytes  int64  `json:"lastSizeBytes"`
	LastDurationMs int64  `json:"lastDurationMs"`
	LastBackupName string `json:"lastBackupName"`
}

func defaultDailyBackupSettings() dailyBackupSettings {
	return dailyBackupSettings{
		Enabled:          false,
		Time:             "02:00",
		Dir:              "",
		RetentionDaily:   7,
		RetentionWeekly:  4,
		RetentionMonthly: 12,
	}
}

// loadDailyBackupSettings 读取自动备份配置，缺失或字段损坏时回退到默认值。
func (h *Hub) loadDailyBackupSettings() dailyBackupSettings {
	settings := defaultDailyBackupSettings()
	record, err := h.FindFirstRecordByFilter("system_settings", "key = {:key}", map[string]any{"key": dailyBackupSettingsKey})
	if err != nil || record == nil {
		return settings
	}
	var stored dailyBackupSettings
	if err := record.UnmarshalJSONField("settings", &stored); err != nil {
		if raw := strings.TrimSpace(record.GetString("settings")); raw != "" {
			_ = json.Unmarshal([]byte(raw), &stored)
		}
	}
	if stored.Time != "" {
		settings.Time = stored.Time
	}
	if stored.Dir != "" {
		settings.Dir = stored.Dir
	}
	if stored.RetentionDaily > 0 {
		settings.RetentionDaily = stored.RetentionDaily
	}
	if stored.RetentionWeekly > 0 {
		settings.RetentionWeekly = stored.RetentionWeekly
	}
	if stored.RetentionMonthly > 0 {
		settings.RetentionMonthly = stored.RetentionMonthly
	}
	settings.Enabled = stored.Enabled
	return settings
}

func (h *Hub) saveDailyBackupSettings(settings dailyBackupSettings) error {
	return h.writeSystemSettingsJSON(dailyBackupSettingsKey, settings)
}

// loadDailyBackupStatus 读取最近一次执行状态。
func (h *Hub) loadDailyBackupStatus() dailyBackupStatus {
	var status dailyBackupStatus
	record, err := h.FindFirstRecordByFilter("system_settings", "key = {:key}", map[string]any{"key": dailyBackupStatusKey})
	if err != nil || record == nil {
		return status
	}
	if err := record.UnmarshalJSONField("settings", &status); err != nil {
		if raw := strings.TrimSpace(record.GetString("settings")); raw != "" {
			_ = json.Unmarshal([]byte(raw), &status)
		}
	}
	return status
}

func (h *Hub) saveDailyBackupStatus(status dailyBackupStatus) error {
	return h.writeSystemSettingsJSON(dailyBackupStatusKey, status)
}

// writeSystemSettingsJSON 按 key upsert 一条 system_settings 记录（参考 applyPortableRestoreStorageSettings）。
func (h *Hub) writeSystemSettingsJSON(key string, value any) error {
	record, err := h.FindFirstRecordByFilter("system_settings", "key = {:key}", map[string]any{"key": key})
	if err != nil {
		collection, findErr := h.FindCachedCollectionByNameOrId("system_settings")
		if findErr != nil {
			return findErr
		}
		record = core.NewRecord(collection)
		record.Set("key", key)
	}
	record.Set("settings", value)
	return h.Save(record)
}

func validateDailyBackupSettings(settings dailyBackupSettings) error {
	if !dailyBackupTimePattern.MatchString(strings.TrimSpace(settings.Time)) {
		return errors.New("备份时间格式应为 HH:MM，例如 02:00")
	}
	dir := strings.TrimSpace(settings.Dir)
	if settings.Enabled && dir == "" {
		return errors.New("启用自动备份时必须填写备份目录")
	}
	if dir != "" && !filepath.IsAbs(dir) {
		return errors.New("备份目录必须是绝对路径")
	}
	if settings.RetentionDaily < 1 || settings.RetentionDaily > 52 {
		return errors.New("每日保留数量需在 1-52 之间")
	}
	if settings.RetentionWeekly < 1 || settings.RetentionWeekly > 52 {
		return errors.New("每周保留数量需在 1-52 之间")
	}
	if settings.RetentionMonthly < 1 || settings.RetentionMonthly > 52 {
		return errors.New("每月保留数量需在 1-52 之间")
	}
	return nil
}

func parseDailyBackupTime(value string) (int, bool) {
	value = strings.TrimSpace(value)
	if !dailyBackupTimePattern.MatchString(value) {
		return 0, false
	}
	hour := int(value[0]-'0')*10 + int(value[1]-'0')
	minute := int(value[3]-'0')*10 + int(value[4]-'0')
	return hour*60 + minute, true
}

// withinDailyBackupWindow 判断当前时间是否与配置时刻落在同一个 5 分钟窗口内。
func withinDailyBackupWindow(now time.Time, scheduled string) bool {
	target, ok := parseDailyBackupTime(scheduled)
	if !ok {
		return false
	}
	current := now.Hour()*60 + now.Minute()
	return current/5 == target/5
}

// runScheduledBackupCheck 是 cron 每 5 分钟触发的检查入口。
func (h *Hub) runScheduledBackupCheck() {
	settings := h.loadDailyBackupSettings()
	if !settings.Enabled {
		return
	}
	now := time.Now()
	if !withinDailyBackupWindow(now, settings.Time) {
		return
	}
	status := h.loadDailyBackupStatus()
	if status.LastRunDate == now.Format("20060102") {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), dailyBackupRunTimeout)
	defer cancel()
	if err := h.runScheduledBackup(ctx, settings); err != nil {
		// 失败详情已写入状态记录和站内告警，这里只补一条调度日志。
		h.Logger().Warn("每日自动备份调度执行失败", "err", err)
	}
}

// runScheduledBackup 执行一次完整自动备份：创建 -> 复制到外部目录并校验 SHA256 ->
// 删除内部副本 -> 保留清理 -> 记录状态。失败时写状态与站内告警并返回错误。
// TODO(PBL-00x V2): 成功后每月触发一次自动恢复演练。
func (h *Hub) runScheduledBackup(ctx context.Context, settings dailyBackupSettings) error {
	if !h.dailyBackupBusy.CompareAndSwap(false, true) {
		return errors.New("已有自动备份任务在执行")
	}
	defer h.dailyBackupBusy.Store(false)

	now := time.Now()
	h.markDailyBackupAttempt(now)

	dir := strings.TrimSpace(settings.Dir)
	if dir == "" {
		return h.recordDailyBackupFailure(now, "", "未配置备份目录")
	}

	key := "pulse_backup_" + now.Format("20060102_150405")
	if _, err := h.createPortableBackup(ctx, key); err != nil {
		return h.recordDailyBackupFailure(now, key, "创建备份失败: "+err.Error())
	}

	size, err := h.exportScheduledBackupToDirectory(key, dir)
	if err != nil {
		return h.recordDailyBackupFailure(now, key, "复制备份到外部目录失败: "+err.Error())
	}

	h.deleteInternalBackupCopy(ctx, key)
	h.runScheduledBackupRetention(dir, now, settings)

	elapsed := time.Since(now)
	status := h.loadDailyBackupStatus()
	status.LastRunDate = now.Format("20060102")
	status.LastAttempt = now.UTC().Format(time.RFC3339)
	status.LastSuccess = time.Now().UTC().Format(time.RFC3339)
	status.LastError = ""
	status.LastSizeBytes = size
	status.LastDurationMs = elapsed.Milliseconds()
	status.LastBackupName = key
	if err := h.saveDailyBackupStatus(status); err != nil {
		h.Logger().Error("Failed to save daily backup status", "err", err)
	}
	h.resolveDailyBackupAlerts()
	h.Logger().Info("每日自动备份完成", "key", key, "size", size, "duration_ms", elapsed.Milliseconds())
	return nil
}

func (h *Hub) markDailyBackupAttempt(now time.Time) {
	status := h.loadDailyBackupStatus()
	status.LastRunDate = now.Format("20060102")
	status.LastAttempt = now.UTC().Format(time.RFC3339)
	if err := h.saveDailyBackupStatus(status); err != nil {
		h.Logger().Error("Failed to mark daily backup attempt", "err", err)
	}
}

// exportScheduledBackupToDirectory 把 PB backups 文件系统里的内部备份复制到外部目录并做 SHA256 校验。
func (h *Hub) exportScheduledBackupToDirectory(key, dir string) (int64, error) {
	localPath, cleanup, err := h.downloadBackupToTemporary(key)
	if err != nil {
		return 0, err
	}
	defer cleanup()

	if err := os.MkdirAll(dir, 0o750); err != nil {
		return 0, fmt.Errorf("创建备份目录失败: %w", err)
	}
	target := filepath.Join(dir, key)
	if err := copyPortableRestoreFile(localPath, target); err != nil {
		return 0, err
	}
	sourceHash, err := sha256File(localPath)
	if err != nil {
		_ = os.Remove(target)
		return 0, err
	}
	targetHash, err := sha256File(target)
	if err != nil {
		_ = os.Remove(target)
		return 0, err
	}
	if sourceHash != targetHash {
		_ = os.Remove(target)
		return 0, errors.New("复制后 SHA256 校验不一致")
	}
	info, err := os.Stat(target)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

func (h *Hub) deleteInternalBackupCopy(ctx context.Context, key string) {
	fsys, err := h.NewBackupsFilesystem()
	if err != nil {
		h.Logger().Error("Failed to open backups filesystem for cleanup", "err", err)
		return
	}
	defer fsys.Close()
	fsys.SetContext(ctx)
	if err := fsys.Delete(key); err != nil {
		h.Logger().Error("Failed to delete internal backup copy", "key", key, "err", err)
	}
}

// recordDailyBackupFailure 写失败状态、系统日志和站内告警。
func (h *Hub) recordDailyBackupFailure(now time.Time, backupName, message string) error {
	h.Logger().Error("每日自动备份失败", "err", message)
	status := h.loadDailyBackupStatus()
	status.LastRunDate = now.Format("20060102")
	status.LastAttempt = now.UTC().Format(time.RFC3339)
	status.LastError = message
	if backupName != "" {
		status.LastBackupName = backupName
	}
	if err := h.saveDailyBackupStatus(status); err != nil {
		h.Logger().Error("Failed to save daily backup failure status", "err", err)
	}
	h.createDailyBackupAlerts(message)
	return errors.New(message)
}

// backupFileInfo 是保留清理的输入文件描述。
type backupFileInfo struct {
	Name    string
	ModTime time.Time
}

// planScheduledBackupCleanup 计算需要删除的备份文件名。
// 分桶：每日 / ISO 周 / 自然月（按 UTC 日历），各自保留最近 d/w/m 个日历窗口内
// 每个桶的最新一份；一个文件被任一存活桶引用则保留；全局最新一份永远保留；
// d/w/m 至少按 1 处理。
func planScheduledBackupCleanup(files []backupFileInfo, now time.Time, retentionDaily, retentionWeekly, retentionMonthly int) []string {
	days := max(retentionDaily, 1)
	weeks := max(retentionWeekly, 1)
	months := max(retentionMonthly, 1)

	dayCutoff := dailyBackupDayIndex(now) - int64(days-1)
	monthCutoff := dailyBackupMonthIndex(now) - int64(months-1)
	weekKeys := make(map[dailyBackupWeekKey]bool, weeks)
	for offset := 0; offset < weeks; offset++ {
		year, week := now.AddDate(0, 0, -7*offset).ISOWeek()
		weekKeys[dailyBackupWeekKey{Year: year, Week: week}] = true
	}

	// 全局最新一份永远保留（即使所有桶都不含它，例如备份长期中断后的最后一份）。
	globalNewest := ""
	var globalNewestTime time.Time
	for _, file := range files {
		if globalNewest == "" || file.ModTime.After(globalNewestTime) {
			globalNewest, globalNewestTime = file.Name, file.ModTime
		}
	}
	keep := make(map[string]bool, len(files))
	if globalNewest != "" {
		keep[globalNewest] = true
	}

	type candidate struct {
		name    string
		modTime time.Time
	}
	newestPerDay := make(map[int64]candidate)
	newestPerWeek := make(map[dailyBackupWeekKey]candidate)
	newestPerMonth := make(map[int64]candidate)
	for _, file := range files {
		modTime := file.ModTime.UTC()
		if day := dailyBackupDayIndex(modTime); day >= dayCutoff {
			if current, ok := newestPerDay[day]; !ok || modTime.After(current.modTime) {
				newestPerDay[day] = candidate{name: file.Name, modTime: modTime}
			}
		}
		year, week := modTime.ISOWeek()
		weekKey := dailyBackupWeekKey{Year: year, Week: week}
		if weekKeys[weekKey] {
			if current, ok := newestPerWeek[weekKey]; !ok || modTime.After(current.modTime) {
				newestPerWeek[weekKey] = candidate{name: file.Name, modTime: modTime}
			}
		}
		if month := dailyBackupMonthIndex(modTime); month >= monthCutoff {
			if current, ok := newestPerMonth[month]; !ok || modTime.After(current.modTime) {
				newestPerMonth[month] = candidate{name: file.Name, modTime: modTime}
			}
		}
	}
	for _, item := range newestPerDay {
		keep[item.name] = true
	}
	for _, item := range newestPerWeek {
		keep[item.name] = true
	}
	for _, item := range newestPerMonth {
		keep[item.name] = true
	}

	var remove []string
	for _, file := range files {
		if !keep[file.Name] {
			remove = append(remove, file.Name)
		}
	}
	return remove
}

type dailyBackupWeekKey struct {
	Year int
	Week int
}

func dailyBackupDayIndex(t time.Time) int64 {
	return t.UTC().Unix() / 86400
}

func dailyBackupMonthIndex(t time.Time) int64 {
	utc := t.UTC()
	return int64(utc.Year())*12 + int64(utc.Month()) - 1
}

// runScheduledBackupRetention 对外部目录执行保留清理，删除失败只记日志不中断。
func (h *Hub) runScheduledBackupRetention(dir string, now time.Time, settings dailyBackupSettings) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		h.Logger().Error("Failed to read scheduled backup directory", "dir", dir, "err", err)
		return
	}
	files := make([]backupFileInfo, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".zip") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			h.Logger().Warn("Failed to stat scheduled backup file", "name", entry.Name(), "err", err)
			continue
		}
		files = append(files, backupFileInfo{Name: entry.Name(), ModTime: info.ModTime()})
	}
	remove := planScheduledBackupCleanup(files, now, settings.RetentionDaily, settings.RetentionWeekly, settings.RetentionMonthly)
	for _, name := range remove {
		if err := os.Remove(filepath.Join(dir, name)); err != nil {
			h.Logger().Error("Failed to remove expired scheduled backup", "name", name, "err", err)
			continue
		}
		h.Logger().Info("已清理过期自动备份", "name", name)
	}
}

// createDailyBackupAlerts 为每个管理员账号 upsert 一条“每日自动备份失败”告警。
// alerts_history.system 在 schema 中是必填 relation，但备份告警不关联任何系统，
// 沿用 website monitor 的 SaveNoValidate 模式写空 system（列表查询用 LEFT JOIN，空值可正常展示）。
// 新建（即本次是新失败、不是重复失败）时按重要告警调用 SendAlert 发送邮件通知，
// 复用 SendAlert 内部的冷却与失败留痕；管理员未配置邮箱时静默跳过。
func (h *Hub) createDailyBackupAlerts(failureMessage string) {
	admins, err := h.FindRecordsByFilter("users", "role = 'admin'", "", -1, 0, nil)
	if err != nil {
		h.Logger().Error("Failed to load admins for daily backup alert", "err", err)
		return
	}
	collection, err := h.FindCachedCollectionByNameOrId("alerts_history")
	if err != nil {
		h.Logger().Error("Failed to load alerts_history collection", "err", err)
		return
	}
	for _, admin := range admins {
		existing, err := h.FindFirstRecordByFilter(
			"alerts_history",
			"alert_id={:alert_id} && user={:user} && resolved=null",
			map[string]any{"alert_id": dailyBackupAlertID, "user": admin.Id},
		)
		if err == nil && existing != nil {
			continue
		}
		record := core.NewRecord(collection)
		record.Set("alert_id", dailyBackupAlertID)
		record.Set("user", admin.Id)
		record.Set("system", "")
		record.Set("name", dailyBackupAlertFailedName)
		record.Set("value", 0)
		if err := h.SaveNoValidate(record); err != nil {
			h.Logger().Error("Failed to save daily backup alert", "err", err)
			continue
		}
		if h.AlertManager == nil {
			continue
		}
		if err := h.SendAlert(alerts.AlertMessageData{
			UserID:    admin.Id,
			AlertID:   dailyBackupAlertID,
			Title:     "每日自动备份失败",
			Message:   strings.TrimSpace(failureMessage),
			Link:      h.MakeLink("alerts"),
			LinkText:  "查看告警",
			Important: true,
		}); err != nil {
			h.Logger().Warn("Failed to send daily backup alert notification", "user", admin.Id, "err", err)
		}
	}
}

// resolveDailyBackupAlerts 把每个管理员账号未解决的每日备份告警标记为已恢复。
func (h *Hub) resolveDailyBackupAlerts() {
	admins, err := h.FindRecordsByFilter("users", "role = 'admin'", "", -1, 0, nil)
	if err != nil {
		h.Logger().Error("Failed to load admins for daily backup alert resolve", "err", err)
		return
	}
	for _, admin := range admins {
		existing, err := h.FindFirstRecordByFilter(
			"alerts_history",
			"alert_id={:alert_id} && user={:user} && resolved=null",
			map[string]any{"alert_id": dailyBackupAlertID, "user": admin.Id},
		)
		if err != nil || existing == nil {
			continue
		}
		existing.Set("resolved", time.Now().UTC())
		existing.Set("name", dailyBackupAlertOkName)
		if err := h.SaveNoValidate(existing); err != nil {
			h.Logger().Error("Failed to resolve daily backup alert", "err", err)
		}
	}
}

type scheduledBackupFileRecord struct {
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

type updateScheduledBackupConfigRequest struct {
	Enabled          *bool   `json:"enabled"`
	Time             *string `json:"time"`
	Dir              *string `json:"dir"`
	RetentionDaily   *int    `json:"retentionDaily"`
	RetentionWeekly  *int    `json:"retentionWeekly"`
	RetentionMonthly *int    `json:"retentionMonthly"`
}

func (h *Hub) getScheduledBackupConfig(e *core.RequestEvent) error {
	settings := h.loadDailyBackupSettings()
	status := h.loadDailyBackupStatus()
	return e.JSON(http.StatusOK, dailyBackupConfigResponse(settings, status))
}

func (h *Hub) updateScheduledBackupConfig(e *core.RequestEvent) error {
	var req updateScheduledBackupConfigRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("无效的自动备份配置", err)
	}
	settings := h.loadDailyBackupSettings()
	if req.Enabled != nil {
		settings.Enabled = *req.Enabled
	}
	if req.Time != nil {
		settings.Time = strings.TrimSpace(*req.Time)
	}
	if req.Dir != nil {
		settings.Dir = strings.TrimSpace(*req.Dir)
	}
	if req.RetentionDaily != nil {
		settings.RetentionDaily = *req.RetentionDaily
	}
	if req.RetentionWeekly != nil {
		settings.RetentionWeekly = *req.RetentionWeekly
	}
	if req.RetentionMonthly != nil {
		settings.RetentionMonthly = *req.RetentionMonthly
	}
	if err := validateDailyBackupSettings(settings); err != nil {
		h.createOperationAudit(e, "", "update_backup_schedule", "", "", "failed", err.Error(), operationFailureInvalidRequest)
		return e.BadRequestError(err.Error(), nil)
	}
	if err := h.saveDailyBackupSettings(settings); err != nil {
		h.createOperationAudit(e, "", "update_backup_schedule", "", "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("保存自动备份配置失败", err)
	}
	h.createOperationAudit(e, "", "update_backup_schedule", strings.TrimSpace(settings.Dir), "", "success", "自动备份配置已保存")
	status := h.loadDailyBackupStatus()
	return e.JSON(http.StatusOK, dailyBackupConfigResponse(settings, status))
}

func dailyBackupConfigResponse(settings dailyBackupSettings, status dailyBackupStatus) map[string]any {
	return map[string]any{
		"enabled":          settings.Enabled,
		"time":             settings.Time,
		"dir":              settings.Dir,
		"retentionDaily":   settings.RetentionDaily,
		"retentionWeekly":  settings.RetentionWeekly,
		"retentionMonthly": settings.RetentionMonthly,
		"status":           status,
	}
}

func (h *Hub) runScheduledBackupNow(e *core.RequestEvent) error {
	settings := h.loadDailyBackupSettings()
	ctx, cancel := context.WithTimeout(context.Background(), dailyBackupRunTimeout)
	defer cancel()
	err := h.runScheduledBackup(ctx, settings)
	status := h.loadDailyBackupStatus()
	if err != nil {
		h.createOperationAudit(e, "", "run_backup_schedule", strings.TrimSpace(settings.Dir), "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("每日自动备份执行失败", err)
	}
	h.createOperationAudit(e, "", "run_backup_schedule", strings.TrimSpace(settings.Dir), "", "success", "每日自动备份执行完成")
	return e.JSON(http.StatusOK, status)
}

func (h *Hub) listScheduledBackups(e *core.RequestEvent) error {
	settings := h.loadDailyBackupSettings()
	items := make([]scheduledBackupFileRecord, 0)
	dir := strings.TrimSpace(settings.Dir)
	if dir != "" {
		entries, err := os.ReadDir(dir)
		if err != nil {
			// 目录尚不存在或不可读时返回空列表，由前端展示空态。
			h.Logger().Warn("Failed to read scheduled backup directory", "dir", dir, "err", err)
			return e.JSON(http.StatusOK, map[string]any{"items": items})
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".zip") {
				continue
			}
			info, err := entry.Info()
			if err != nil {
				continue
			}
			items = append(items, scheduledBackupFileRecord{
				Name:     entry.Name(),
				Size:     info.Size(),
				Modified: info.ModTime().UTC().Format(time.RFC3339),
			})
		}
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Modified != items[j].Modified {
			return items[i].Modified > items[j].Modified
		}
		return items[i].Name > items[j].Name
	})
	return e.JSON(http.StatusOK, map[string]any{"items": items})
}
