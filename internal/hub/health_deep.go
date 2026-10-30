package hub

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/shirou/gopsutil/v4/disk"
)

// PBL-021 深度健康检查 V1：
// - 6 个定时任务的心跳：内存记录最近一次开始 / 结束 / 错误，不写数据库（避免
//   每分钟任务的 SQLite 写放大）；超过各自阈值未执行视为"逾期"。
// - 数据库写入探针：向 system_settings 写入 _health_probe（覆盖写）再删除，记录耗时。
// - 备份目录可达性、数据目录所在磁盘水位、Hub 进程启动时间。
// 通过 GET /api/pulse/health/deep 暴露，管理员专用；设置 -> 高级设置"运行状态"卡片展示。
// 现有 /api/health（PocketBase 内置存活探针）保持不变。

// 定时任务心跳标识（与 cron 显示名解耦，供 API 和前端使用）。
const (
	cronTaskDeleteOldRecords         = "delete_old_records"
	cronTaskCreateLongerRecords      = "create_longer_records"
	cronTaskMonitorRetention         = "monitor_retention"
	cronTaskCheckWebsiteMonitors     = "check_website_monitors"
	cronTaskCheckAssetPresence       = "check_asset_presence"
	cronTaskRefreshInternetAddresses = "refresh_internet_addresses"
	cronTaskScheduledBackupCheck     = "scheduled_backup_check"
)

const deepHealthProbeKey = "_health_probe"

// cronTaskDefinition 是一个定时任务的调度与心跳元数据。
// name 是心跳标识，cronName 保持与历史注册名一致。
type cronTaskDefinition struct {
	name           string
	cronName       string
	schedule       string
	staleThreshold time.Duration // 超过该时长未执行视为逾期
	run            func()
}

// cronTaskDefinitions 返回全部定时任务定义。注册（registerCronJobs）与
// 深度健康报告（buildDeepHealth）共用，保证任务列表单一来源。
func (h *Hub) cronTaskDefinitions() []cronTaskDefinition {
	return []cronTaskDefinition{
		// delete old system_stats and alerts_history records once every hour
		{name: cronTaskDeleteOldRecords, cronName: "delete old records", schedule: "8 * * * *", staleThreshold: 2 * time.Hour, run: h.rm.DeleteOldRecords},
		// create longer records every 10 minutes
		{name: cronTaskCreateLongerRecords, cronName: "create longer records", schedule: "*/10 * * * *", staleThreshold: 30 * time.Minute, run: h.rm.CreateLongerRecords},
		// delete monitoring data older than 30 days, once per day at 03:00 server
		// local time (staggered from the 02:00 daily backup)
		{name: cronTaskMonitorRetention, cronName: "monitor retention cleanup", schedule: "0 3 * * *", staleThreshold: 26 * time.Hour, run: h.rm.RunMonitorRetentionCron},
		// check due website monitors once per minute
		{name: cronTaskCheckWebsiteMonitors, cronName: "check website monitors", schedule: "* * * * *", staleThreshold: 5 * time.Minute, run: h.checkDueWebsiteMonitors},
		// probe asset presence via ping once per minute
		{name: cronTaskCheckAssetPresence, cronName: "check asset presence", schedule: "* * * * *", staleThreshold: 5 * time.Minute, run: h.checkAssetPresence},
		// scan due internet public-address refreshes every 15 minutes
		{name: cronTaskRefreshInternetAddresses, cronName: "refresh internet public addresses", schedule: internetAddressRefreshSchedule, staleThreshold: 2 * time.Hour, run: h.refreshActiveInternetAddresses},
		// check whether the daily scheduled backup is due, every 5 minutes
		{name: cronTaskScheduledBackupCheck, cronName: "scheduled daily backup", schedule: "*/5 * * * *", staleThreshold: 30 * time.Minute, run: h.runScheduledBackupCheck},
	}
}

// cronHeartbeat 记录单个定时任务最近一次执行情况（仅内存，不落库）。
type cronHeartbeat struct {
	LastStart  time.Time
	LastFinish time.Time
	LastError  string
}

// cronHeartbeatTracker 保存全部定时任务的心跳，线程安全。
type cronHeartbeatTracker struct {
	mu      sync.Mutex
	entries map[string]cronHeartbeat
}

func newCronHeartbeatTracker() *cronHeartbeatTracker {
	return &cronHeartbeatTracker{entries: make(map[string]cronHeartbeat)}
}

// recordStart 记录任务开始执行。
func (t *cronHeartbeatTracker) recordStart(name string, now time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.entries[name] = cronHeartbeat{LastStart: now, LastFinish: t.entries[name].LastFinish, LastError: t.entries[name].LastError}
}

// recordFinish 记录任务结束；errMessage 非空时覆盖 lastError，成功时清空上次错误。
func (t *cronHeartbeatTracker) recordFinish(name string, now time.Time, errMessage string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	entry := t.entries[name]
	entry.LastFinish = now
	entry.LastError = errMessage
	t.entries[name] = entry
}

// get 返回任务心跳；任务从未执行过时返回零值。
func (t *cronHeartbeatTracker) get(name string) cronHeartbeat {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.entries[name]
}

// cronRunState 描述单个定时任务的心跳状态。
type cronRunState string

const (
	cronRunPending cronRunState = "pending" // 尚未执行过（例如容器刚启动）
	cronRunNormal  cronRunState = "normal"  // 最近一次执行在阈值内
	cronRunStale   cronRunState = "stale"   // 超过阈值未执行
)

// evaluateCronHeartbeat 根据心跳与阈值判定任务状态（纯函数）：
// 没有开始时间即"等待首次执行"；否则以最近一次结束时间（尚未结束则用开始时间，
// 用于发现长时间未返回的任务）距今是否超过阈值判定是否逾期。
func evaluateCronHeartbeat(entry cronHeartbeat, threshold time.Duration, now time.Time) cronRunState {
	if entry.LastStart.IsZero() {
		return cronRunPending
	}
	reference := entry.LastFinish
	if reference.IsZero() {
		reference = entry.LastStart
	}
	if now.Sub(reference) > threshold {
		return cronRunStale
	}
	return cronRunNormal
}

// withCronHeartbeat 包装定时任务函数：执行前记开始，结束后记结束，panic 记错误
// 后原样抛出，不吞异常、不改变执行语义。
func (h *Hub) withCronHeartbeat(task cronTaskDefinition) func() {
	return func() {
		h.cronHeartbeats.recordStart(task.name, time.Now())
		defer func() {
			if r := recover(); r != nil {
				h.cronHeartbeats.recordFinish(task.name, time.Now(), fmt.Sprintf("panic: %v", r))
				panic(r)
			}
			h.cronHeartbeats.recordFinish(task.name, time.Now(), "")
		}()
		task.run()
	}
}

// deepHealthReport 是深度健康检查的完整报告。
type deepHealthReport struct {
	StartedAt   time.Time            `json:"startedAt"`
	GeneratedAt time.Time            `json:"generatedAt"`
	DbWrite     deepHealthDbWrite    `json:"dbWrite"`
	CronTasks   []deepHealthCronTask `json:"cronTasks"`
	BackupDir   deepHealthBackupDir  `json:"backupDir"`
	Disk        deepHealthDisk       `json:"disk"`
}

// deepHealthDbWrite 是数据库写入探针结果。
type deepHealthDbWrite struct {
	Ok         bool   `json:"ok"`
	DurationMs int64  `json:"durationMs"`
	Error      string `json:"error"`
}

// deepHealthCronTask 是单个定时任务的心跳快照。LastStart / LastFinish 为 null
// 表示从未开始 / 结束。
type deepHealthCronTask struct {
	Name           string     `json:"name"`
	LastStart      *time.Time `json:"lastStart"`
	LastFinish     *time.Time `json:"lastFinish"`
	LastError      string     `json:"lastError"`
	Stale          bool       `json:"stale"`
	StaleThreshold int64      `json:"staleThreshold"` // 逾期阈值，秒
}

// deepHealthBackupDir 是自动备份外部目录的可达性结果。
type deepHealthBackupDir struct {
	Configured string `json:"configured"`
	Reachable  bool   `json:"reachable"`
	IsDir      bool   `json:"isDir"`
	Error      string `json:"error"`
}

// deepHealthDisk 是 Hub 数据目录所在磁盘的水位。
type deepHealthDisk struct {
	Path        string  `json:"path"`
	TotalBytes  uint64  `json:"totalBytes"`
	FreeBytes   uint64  `json:"freeBytes"`
	UsedPercent float64 `json:"usedPercent"`
	Error       string  `json:"error"`
}

// getDeepHealth 返回深度健康检查报告（管理员专用）。
func (h *Hub) getDeepHealth(e *core.RequestEvent) error {
	return e.JSON(http.StatusOK, h.buildDeepHealth())
}

// buildDeepHealth 汇总深度健康数据。只读探针不改变任何业务数据。
func (h *Hub) buildDeepHealth() deepHealthReport {
	now := time.Now()
	report := deepHealthReport{
		StartedAt:   h.startedAt,
		GeneratedAt: now,
		DbWrite:     h.probeDatabaseWrite(),
		BackupDir:   h.checkBackupDirReachability(),
		Disk:        h.collectDiskUsage(),
	}

	definitions := h.cronTaskDefinitions()
	report.CronTasks = make([]deepHealthCronTask, 0, len(definitions))
	for _, task := range definitions {
		entry := h.cronHeartbeats.get(task.name)
		status := deepHealthCronTask{
			Name:           task.name,
			LastError:      entry.LastError,
			Stale:          evaluateCronHeartbeat(entry, task.staleThreshold, now) == cronRunStale,
			StaleThreshold: int64(task.staleThreshold / time.Second),
		}
		if !entry.LastStart.IsZero() {
			lastStart := entry.LastStart
			status.LastStart = &lastStart
		}
		if !entry.LastFinish.IsZero() {
			lastFinish := entry.LastFinish
			status.LastFinish = &lastFinish
		}
		report.CronTasks = append(report.CronTasks, status)
	}
	return report
}

// probeDatabaseWrite 向 system_settings 覆盖写一条探针记录再删除，返回总耗时与结果。
func (h *Hub) probeDatabaseWrite() deepHealthDbWrite {
	started := time.Now()
	probeErr := h.runDatabaseWriteProbe()
	result := deepHealthDbWrite{DurationMs: time.Since(started).Milliseconds()}
	if probeErr != nil {
		result.Error = probeErr.Error()
		return result
	}
	result.Ok = true
	return result
}

func (h *Hub) runDatabaseWriteProbe() error {
	// 覆盖写：writeSystemSettingsJSON 内部按 key upsert（复用自动备份的写入模式）。
	if err := h.writeSystemSettingsJSON(deepHealthProbeKey, map[string]any{"ts": time.Now().UTC().Format(time.RFC3339Nano)}); err != nil {
		return fmt.Errorf("写入探针记录失败: %w", err)
	}
	record, err := h.FindFirstRecordByFilter("system_settings", "key = {:key}", map[string]any{"key": deepHealthProbeKey})
	if err != nil {
		return fmt.Errorf("读取探针记录失败: %w", err)
	}
	if err := h.Delete(record); err != nil {
		return fmt.Errorf("删除探针记录失败: %w", err)
	}
	return nil
}

// checkBackupDirReachability 检查每日自动备份配置的外部目录是否可达。
func (h *Hub) checkBackupDirReachability() deepHealthBackupDir {
	result := deepHealthBackupDir{}
	configured := strings.TrimSpace(h.loadDailyBackupSettings().Dir)
	result.Configured = configured
	if configured == "" {
		result.Error = "未配置自动备份目录"
		return result
	}
	info, err := os.Stat(configured)
	if err != nil {
		result.Error = "目录不可访问"
		return result
	}
	result.IsDir = info.IsDir()
	if !result.IsDir {
		result.Error = "配置的路径不是目录"
		return result
	}
	result.Reachable = true
	return result
}

// collectDiskUsage 用 gopsutil 读取 Hub 数据目录所在磁盘的水位。
func (h *Hub) collectDiskUsage() deepHealthDisk {
	result := deepHealthDisk{Path: h.DataDir()}
	usage, err := disk.Usage(h.DataDir())
	if err != nil {
		result.Error = err.Error()
		return result
	}
	result.TotalBytes = usage.Total
	result.FreeBytes = usage.Free
	result.UsedPercent = usage.UsedPercent
	return result
}
