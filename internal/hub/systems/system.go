package systems

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"math/rand"
	"net"
	"os"
	"strings"
	"sync/atomic"
	"time"

	"gutenacht.site/pulse/internal/alerts"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/hub/transport"
	"gutenacht.site/pulse/internal/hub/utils"
	"gutenacht.site/pulse/internal/hub/ws"

	"gutenacht.site/pulse/internal/entities/container"
	"gutenacht.site/pulse/internal/entities/service"
	"gutenacht.site/pulse/internal/entities/smart"
	"gutenacht.site/pulse/internal/entities/system"

	"github.com/blang/semver"
	"github.com/lxzan/gws"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type System struct {
	Id             string               `db:"id"`
	Status         string               `db:"status"`
	manager        *SystemManager       // Manager that this system belongs to
	data           *system.CombinedData // system data from agent
	ctx            context.Context      // Context for stopping the updater
	cancel         context.CancelFunc   // Stops and removes system from updater
	WsConn         *ws.WsConn           // Handler for agent WebSocket connection
	RemoteIP       string               // Real IP observed by the Hub for this Agent connection
	agentVersion   semver.Version       // Agent version
	updateTicker   *time.Ticker         // Ticker for updating the system
	done           chan struct{}        // Closed when the updater exits
	detailsFetched atomic.Bool          // True if static system details have been fetched and saved
	smartFetching  atomic.Bool          // True if SMART devices are currently being fetched
	smartInterval  time.Duration        // Interval for periodic SMART data updates
}

func (sys *System) hasLegacyHostPort() bool {
	return false
}

func (sm *SystemManager) NewSystem(systemId string) *System {
	system := &System{
		Id:   systemId,
		data: &system.CombinedData{},
		done: make(chan struct{}),
	}
	system.ctx, system.cancel = system.getContext()
	return system
}

// StartUpdater starts the system updater.
// It first fetches the data from the agent then updates the records.
// If the data is not found or the system is down, it sets the system down.
func (sys *System) StartUpdater() {
	if sys.done != nil {
		defer close(sys.done)
	}
	if sys.manager != nil && sys.manager.hub != nil {
		sys.manager.hub.Logger().Info("System updater started", "system", sys.Id, "websocket", sys.WsConn != nil, "status", sys.Status)
		defer sys.manager.hub.Logger().Info("System updater stopped", "system", sys.Id)
	}
	// Channel that can be used to set the system down. Currently only used to
	// allow a short delay for reconnection after websocket connection is closed.
	var downChan chan struct{}

	// Add random jitter to first WebSocket connection to prevent
	// clustering if all agents are started at the same time.
	var jitter <-chan time.Time
	if sys.WsConn != nil {
		jitter = getJitter()
		// use the websocket connection's down channel to set the system down
		downChan = sys.WsConn.DownChan
	} else {
		// if the system does not have a websocket connection, wait before updating
		// to allow the agent to connect via websocket (makes sure fingerprint is set).
		select {
		case <-sys.ctx.Done():
			return
		case <-time.After(11 * time.Second):
		}
	}

	// update immediately if system is not paused. When no WebSocket is present,
	// the short wait above gives reconnecting agents a chance to attach first.
	if sys.Status != paused && sys.ctx.Err() == nil {
		if err := sys.update(); err != nil {
			sys.logUpdateError("System updater immediate update failed", err)
			_ = sys.setDown(err)
		}
	}

	sys.updateTicker = time.NewTicker(time.Duration(interval) * time.Millisecond)
	// Go 1.23+ will automatically stop the ticker when the system is garbage collected, however we seem to need this or testing/synctest will block even if calling runtime.GC()
	defer sys.updateTicker.Stop()

	for {
		select {
		case <-sys.ctx.Done():
			return
		case <-sys.updateTicker.C:
			if err := sys.update(); err != nil {
				sys.logUpdateError("System updater tick failed", err)
				_ = sys.setDown(err)
			}
		case <-downChan:
			sys.WsConn = nil
			downChan = nil
			_ = sys.setDown(nil)
		case <-jitter:
			sys.updateTicker.Reset(time.Duration(interval) * time.Millisecond)
			if err := sys.update(); err != nil {
				sys.logUpdateError("System updater jitter update failed", err)
				_ = sys.setDown(err)
			}
		}
	}
}

func (sys *System) logUpdateError(message string, err error) {
	if isExpectedAgentDisconnectError(err) || sys.manager == nil || sys.manager.hub == nil {
		return
	}
	sys.manager.hub.Logger().Warn(message, "system", sys.Id, "err", err)
}

func isExpectedAgentDisconnectError(err error) bool {
	return errors.Is(err, transport.ErrWebSocketNotConnected) ||
		errors.Is(err, gws.ErrConnClosed) ||
		strings.Contains(strings.ToLower(strings.TrimSpace(fmt.Sprint(err))), "no websocket connection")
}

// update updates the system data and records.
func (sys *System) update() error {
	if sys.ctx.Err() != nil {
		return sys.ctx.Err()
	}
	if sys.Status == paused {
		sys.handlePaused()
		return nil
	}
	options := common.DataRequestOptions{
		CacheTimeMs:       uint16(interval),
		MonitoredServices: sys.getMonitoredServiceNames(),
		MonitoredSoftware: sys.getMonitoredSoftwareNames(),
	}
	// fetch system details if not already fetched
	if !sys.detailsFetched.Load() {
		options.IncludeDetails = true
	}

	data, err := sys.fetchDataFromAgent(options)
	if err != nil {
		return err
	}
	if sys.manager != nil && sys.manager.hub != nil {
		sys.manager.hub.Logger().Debug("System data fetched", "system", sys.Id, "includeDetails", options.IncludeDetails, "containers", len(data.Containers), "services", len(data.Services), "software", len(data.Software))
	}

	// ensure deprecated fields from older agents are migrated to current fields
	migrateDeprecatedFields(data, !sys.detailsFetched.Load())

	// create system records
	_, err = sys.createRecords(data)

	// if details were included and fetched successfully, mark details as fetched and update smart interval if set by agent
	if err == nil && data.Details != nil {
		sys.detailsFetched.Store(true)
		// update smart interval if it's set on the agent side
		if data.Details.SmartInterval > 0 {
			sys.smartInterval = data.Details.SmartInterval
			sys.manager.hub.Logger().Info("SMART interval updated from agent details", "system", sys.Id, "interval", sys.smartInterval.String())
			// make sure we reset expiration of lastFetch to remain as long as the new smart interval
			// to prevent premature expiration leading to new fetch if interval is different.
			sys.manager.smartFetchMap.UpdateExpiration(sys.Id, sys.smartInterval+time.Minute)
		}
	}

	// Fetch and save SMART devices when system first comes online or at intervals
	if backgroundSmartFetchEnabled() && sys.detailsFetched.Load() {
		if sys.smartInterval <= 0 {
			sys.smartInterval = time.Hour
		}
		if sys.shouldFetchSmart() && sys.smartFetching.CompareAndSwap(false, true) {
			sys.manager.hub.Logger().Info("SMART fetch", "system", sys.Id, "interval", sys.smartInterval.String())
			go func() {
				defer sys.smartFetching.Store(false)
				_ = sys.FetchAndSaveSmartDevices()
			}()
		}
	}

	return err
}

func (sys *System) handlePaused() {
	if sys.WsConn == nil {
		// if the system is paused and there's no websocket connection, remove the system
		_ = sys.manager.RemoveSystem(sys.Id)
	} else {
		// Send a ping to the agent to keep the connection alive if the system is paused
		if err := sys.WsConn.Ping(); err != nil {
			sys.manager.hub.Logger().Warn("Failed to ping agent", "system", sys.Id, "err", err)
			_ = sys.manager.RemoveSystem(sys.Id)
		}
	}
}

// createRecords updates the system record and adds system_stats and container_stats records
func (sys *System) createRecords(data *system.CombinedData) (*core.Record, error) {
	systemRecord, err := sys.getRecord(sys.manager.hub)
	if err != nil {
		return nil, err
	}
	hub := sys.manager.hub
	err = hub.RunInTransaction(func(txApp core.App) error {
		// add system_stats record
		systemStatsCollection, err := txApp.FindCachedCollectionByNameOrId("system_stats")
		if err != nil {
			return err
		}
		systemStatsRecord := core.NewRecord(systemStatsCollection)
		systemStatsRecord.Set("system", systemRecord.Id)
		systemStatsRecord.Set("stats", data.Stats)
		systemStatsRecord.Set("type", "1m")
		if err := txApp.SaveNoValidate(systemStatsRecord); err != nil {
			return err
		}

		// add containers and container_stats records
		if len(data.Containers) > 0 {
			if data.Containers[0].Id != "" {
				if err := createContainerRecords(txApp, data.Containers, sys.Id); err != nil {
					return err
				}
			}
			containerStatsCollection, err := txApp.FindCachedCollectionByNameOrId("container_stats")
			if err != nil {
				return err
			}
			containerStatsRecord := core.NewRecord(containerStatsCollection)
			containerStatsRecord.Set("system", systemRecord.Id)
			containerStatsRecord.Set("stats", data.Containers)
			containerStatsRecord.Set("type", "1m")
			if err := txApp.SaveNoValidate(containerStatsRecord); err != nil {
				return err
			}
		}

		if len(data.Services) > 0 {
			serviceSummary, err := createMonitoredServiceRecords(txApp, data.Services, sys.Id)
			if err != nil {
				return err
			}
			data.Info.ManagedServices = serviceSummary
		}

		if len(data.Software) > 0 {
			if err := createMonitoredSoftwareRecords(txApp, data.Software, sys.Id); err != nil {
				return err
			}
		}

		if err := cleanupUnsupportedImportantMonitoring(txApp, sys.Id, data.Info); err != nil {
			return err
		}

		// add system details record
		if data.Details != nil {
			if err := createSystemDetailsRecord(txApp, data.Details, sys.Id); err != nil {
				return err
			}
		}

		// update system record (do this last because it triggers alerts and we need above records to be inserted first)
		systemRecord.Set("status", up)
		updateSystemNameFromDetails(systemRecord, data.Details)
		info := sanitizeSystemInfo(data.Info)
		if remoteIP := strings.TrimSpace(sys.RemoteIP); remoteIP != "" {
			info.RemoteIP = remoteIP
		}
		mergePersistedCapabilityResults(systemRecord, &info)
		markStaleCapabilityStatuses(info.Capabilities, time.Now().UTC(), sys.smartFetchInterval())
		updateLocalSystemMarkerFromInfo(systemRecord, info)
		systemRecord.Set("info", info)
		if err := txApp.SaveNoValidate(systemRecord); err != nil {
			return err
		}
		return nil
	})
	if err == nil && len(data.Containers) > 0 && data.Containers[0].Id != "" {
		if alertErr := sys.syncContainerAlertHistory(systemRecord, data.Containers); alertErr != nil {
			hub.Logger().Warn("Failed to sync container alert history", "system", sys.Id, "err", alertErr)
		}
	}
	if err == nil {
		if alertErr := sys.syncImportantMonitoringAlertHistory(systemRecord, "service", data.Services); alertErr != nil {
			hub.Logger().Warn("Failed to sync service alert history", "system", sys.Id, "err", alertErr)
		}
	}
	if err == nil {
		if alertErr := sys.syncImportantMonitoringAlertHistory(systemRecord, "software", data.Software); alertErr != nil {
			hub.Logger().Warn("Failed to sync software alert history", "system", sys.Id, "err", alertErr)
		}
	}

	return systemRecord, err
}

func updateSystemNameFromDetails(record *core.Record, details *system.Details) {
	hostname := strings.TrimSpace(detailsHostname(details))
	if hostname == "" || hostname == strings.TrimSpace(record.GetString("name")) {
		return
	}
	record.Set("name", hostname)
}

func updateLocalSystemMarkerFromInfo(record *core.Record, info system.Info) {
	if record == nil {
		return
	}
	if record.GetBool("is_local") && isDevLoopbackHubAgentInfo(info) {
		record.Set("is_local", true)
		normalizeDevLocalSystemMetadata(record)
		return
	}
	if !record.GetBool("is_local") || !isNonHubLocalAgentInfo(info) {
		return
	}
	record.Set("is_local", false)
}

func isDevLoopbackHubAgentInfo(info system.Info) bool {
	return devLocalAgentAsHubEnabled() && isLoopbackIPString(info.RemoteIP)
}

func devLocalAgentAsHubEnabled() bool {
	value := strings.TrimSpace(os.Getenv("PULSE_DEV_LOCAL_AGENT_AS_HUB"))
	return value == "1" || strings.EqualFold(value, "true") || strings.EqualFold(value, "yes")
}

func isLoopbackIPString(value string) bool {
	ip := net.ParseIP(strings.TrimSpace(value))
	return ip != nil && ip.IsLoopback()
}

func normalizeDevLocalSystemMetadata(record *core.Record) {
	switch strings.TrimSpace(record.GetString("primary_use")) {
	case "", "primary":
		record.Set("primary_use", "development")
	}
	switch strings.TrimSpace(record.GetString("description")) {
	case "", "自己主要用的机器":
		record.Set("description", "Hub 开发机器")
	}
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

func detailsHostname(details *system.Details) string {
	if details == nil {
		return ""
	}
	return details.Hostname
}

func sanitizeSystemInfo(info system.Info) system.Info {
	if info.Capabilities == nil {
		return info
	}
	info.Capabilities.Collection = filterAgentCollection(info.Capabilities.Collection)
	info.Capabilities.Operations = filterAgentOperations(info.Capabilities.Operations)
	normalizeAgentProfile(info.Capabilities)
	sanitizeProfileCapabilities(info.Capabilities)
	sanitizeCapabilityStatusMaps(info.Capabilities)
	if len(info.Capabilities.UnsupportedReasons) > 0 {
		for _, key := range disabledCapabilityKeys {
			delete(info.Capabilities.UnsupportedReasons, key)
		}
		for _, key := range profileDisabledCapabilityKeys(info.Capabilities.AgentProfile) {
			delete(info.Capabilities.UnsupportedReasons, key)
		}
		if len(info.Capabilities.UnsupportedReasons) == 0 {
			info.Capabilities.UnsupportedReasons = nil
		}
	}
	return info
}

func sanitizeCapabilityStatusMaps(capabilities *system.AgentCapabilities) {
	if capabilities == nil {
		return
	}
	removed := map[string]struct{}{}
	for _, key := range disabledCapabilityKeys {
		removed[key] = struct{}{}
	}
	for _, key := range profileDisabledCapabilityKeys(capabilities.AgentProfile) {
		removed[key] = struct{}{}
	}
	if len(removed) == 0 {
		return
	}
	deleteCapabilityStatusKeys(capabilities.CollectionResults, removed)
	deleteCapabilityStatusKeys(capabilities.Diagnostics, removed)
	if len(capabilities.CollectionResults) == 0 {
		capabilities.CollectionResults = nil
	}
	if len(capabilities.Diagnostics) == 0 {
		capabilities.Diagnostics = nil
	}
}

func mergePersistedCapabilityResults(record *core.Record, info *system.Info) {
	if record == nil || info == nil || info.Capabilities == nil {
		return
	}
	var previous system.Info
	if err := record.UnmarshalJSONField("info", &previous); err != nil || previous.Capabilities == nil {
		return
	}
	preserveCapabilityStatus(info.Capabilities.CollectionResults, previous.Capabilities.CollectionResults, "smart")
	preserveCapabilityStatus(info.Capabilities.Diagnostics, previous.Capabilities.Diagnostics, "smart")
}

func markStaleCapabilityStatuses(capabilities *system.AgentCapabilities, now time.Time, smartInterval time.Duration) {
	if capabilities == nil {
		return
	}
	markStaleCapabilityStatusMap(capabilities.CollectionResults, now, smartInterval)
	markStaleCapabilityStatusMap(capabilities.Diagnostics, now, smartInterval)
}

func markStaleCapabilityStatusMap(values map[string]system.CapabilityStatus, now time.Time, smartInterval time.Duration) {
	if len(values) == 0 {
		return
	}
	for key, status := range values {
		next := markStaleCapabilityStatus(key, status, now, smartInterval)
		values[key] = next
	}
}

func markStaleCapabilityStatus(
	key string,
	status system.CapabilityStatus,
	now time.Time,
	smartInterval time.Duration,
) system.CapabilityStatus {
	if !isTimeSensitiveCapabilityState(status.State) || strings.TrimSpace(status.CheckedAt) == "" {
		return status
	}
	checkedAt, err := time.Parse(time.RFC3339, strings.TrimSpace(status.CheckedAt))
	if err != nil {
		return status
	}
	staleAfter := capabilityStaleAfter(key, smartInterval)
	if staleAfter <= 0 || now.Before(checkedAt) || now.Sub(checkedAt) <= staleAfter {
		return status
	}
	previousLabel := capabilityStateLabel(status.State)
	originalReason := strings.TrimSpace(status.Reason)
	status.State = system.CapabilityStateStale
	status.Reason = fmt.Sprintf("该采集结果已超过 %s未刷新，不能作为实时状态。上次状态：%s。", formatStaleDuration(staleAfter), previousLabel)
	if originalReason != "" {
		status.Detail = originalReason
	}
	return status
}

func isTimeSensitiveCapabilityState(state system.CapabilityState) bool {
	switch state {
	case system.CapabilityStateConfirmed, system.CapabilityStateUnavailable, system.CapabilityStateFailed:
		return true
	default:
		return false
	}
}

func capabilityStaleAfter(key string, smartInterval time.Duration) time.Duration {
	if key == "smart" {
		if smartInterval <= 0 {
			smartInterval = time.Hour
		}
		return smartInterval*2 + 5*time.Minute
	}
	heartbeatInterval := time.Duration(interval) * time.Millisecond
	if heartbeatInterval <= 0 {
		return 5 * time.Minute
	}
	return max(heartbeatInterval*5, 5*time.Minute)
}

func capabilityStateLabel(state system.CapabilityState) string {
	switch state {
	case system.CapabilityStateConfirmed:
		return "已采集"
	case system.CapabilityStateUnavailable:
		return "未发现"
	case system.CapabilityStateFailed:
		return "失败"
	case system.CapabilityStateUnsupported:
		return "不支持"
	case system.CapabilityStateUnknown:
		return "未知"
	case system.CapabilityStateStale:
		return "过期"
	default:
		return string(state)
	}
}

func formatStaleDuration(value time.Duration) string {
	value = value.Round(time.Minute)
	if value < time.Minute {
		return value.String()
	}
	hours := int(value / time.Hour)
	minutes := int((value % time.Hour) / time.Minute)
	if hours > 0 && minutes > 0 {
		return fmt.Sprintf("%d 小时 %d 分钟", hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%d 小时", hours)
	}
	return fmt.Sprintf("%d 分钟", minutes)
}

func preserveCapabilityStatus(
	current map[string]system.CapabilityStatus,
	previous map[string]system.CapabilityStatus,
	key string,
) {
	if len(current) == 0 || len(previous) == 0 {
		return
	}
	currentStatus, ok := current[key]
	if !ok || currentStatus.State != system.CapabilityStateUnknown {
		return
	}
	previousStatus, ok := previous[key]
	if !ok || previousStatus.State == "" || previousStatus.State == system.CapabilityStateUnknown {
		return
	}
	current[key] = previousStatus
}

func deleteCapabilityStatusKeys(values map[string]system.CapabilityStatus, removed map[string]struct{}) {
	if len(values) == 0 || len(removed) == 0 {
		return
	}
	for key := range removed {
		delete(values, key)
	}
}

func normalizeAgentProfile(capabilities *system.AgentCapabilities) {
	if capabilities == nil || strings.TrimSpace(capabilities.AgentProfile) != "" {
		return
	}
	if strings.EqualFold(capabilities.Platform, "linux") || strings.EqualFold(capabilities.RunMode, "docker") {
		capabilities.AgentProfile = "linux-container"
	}
}

var disabledCapabilityKeys = []string{
	"extra_filesystems",
	"linux_host_agent",
	"power_privilege",
	"reboot",
	"shutdown",
	"software_control",
	"wake_on_lan",
}

func filterAgentCollection(collection []string) []string {
	if len(collection) == 0 {
		return collection
	}
	filtered := collection[:0]
	for _, item := range collection {
		switch item {
		case "extra_filesystems":
			continue
		default:
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func filterAgentOperations(operations []string) []string {
	if len(operations) == 0 {
		return operations
	}
	filtered := operations[:0]
	for _, operation := range operations {
		switch operation {
		case "shutdown", "reboot", "wake_on_lan", "software_control":
			continue
		default:
			filtered = append(filtered, operation)
		}
	}
	return filtered
}

func sanitizeProfileCapabilities(capabilities *system.AgentCapabilities) {
	removed := profileDisabledCapabilityMap(capabilities.AgentProfile)
	if len(removed) == 0 {
		return
	}
	capabilities.Collection = removeCapabilityStrings(capabilities.Collection, removed)
	capabilities.Operations = removeCapabilityStrings(capabilities.Operations, removed)
}

func profileDisabledCapabilityKeys(agentProfile string) []string {
	switch strings.ToLower(strings.TrimSpace(agentProfile)) {
	case "linux-container":
		return []string{"service_control", "software_monitor", "systemd_services"}
	default:
		return nil
	}
}

func profileDisabledCapabilityMap(agentProfile string) map[string]struct{} {
	keys := profileDisabledCapabilityKeys(agentProfile)
	if len(keys) == 0 {
		return nil
	}
	removed := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		removed[key] = struct{}{}
	}
	return removed
}

func removeCapabilityStrings(values []string, removed map[string]struct{}) []string {
	if len(values) == 0 || len(removed) == 0 {
		return values
	}
	filtered := values[:0]
	for _, value := range values {
		if _, ok := removed[value]; ok {
			continue
		}
		filtered = append(filtered, value)
	}
	return filtered
}

func isLinuxContainerInfo(info system.Info) bool {
	capabilities := info.Capabilities
	if capabilities == nil {
		return info.Os == system.Linux && strings.TrimSpace(info.AgentVersion) != "" && info.ConnectionType == system.ConnectionTypeWebSocket
	}
	return strings.EqualFold(capabilities.AgentProfile, "linux-container") ||
		(strings.EqualFold(capabilities.Platform, "linux") && strings.EqualFold(capabilities.RunMode, "docker")) ||
		(strings.EqualFold(capabilities.Platform, "linux") && strings.EqualFold(capabilities.InstallMethod, "docker"))
}

func isLinuxContainerSystemRecord(record *core.Record) bool {
	var info system.Info
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return false
	}
	return isLinuxContainerInfo(info)
}

func cleanupUnsupportedImportantMonitoring(app core.App, systemId string, info system.Info) error {
	if !isLinuxContainerInfo(info) {
		return nil
	}
	for _, query := range []string{
		"DELETE FROM service_control_rules WHERE system = {:system}",
		"DELETE FROM monitored_services WHERE system = {:system}",
		"DELETE FROM software_monitor_rules WHERE system = {:system}",
		"DELETE FROM monitored_software WHERE system = {:system}",
	} {
		if _, err := app.DB().NewQuery(query).Bind(dbx.Params{"system": systemId}).Execute(); err != nil {
			return err
		}
	}
	return nil
}

func createMonitoredServiceRecords(app core.App, data []*service.Service, systemId string) ([]uint16, error) {
	if len(data) == 0 {
		return nil, nil
	}

	rules, err := app.FindRecordsByFilter(
		"service_control_rules",
		"system = {:system} && enabled = true",
		"",
		0,
		0,
		map[string]any{"system": systemId},
	)
	if err != nil {
		return nil, err
	}
	if len(rules) == 0 {
		return []uint16{0, 0}, nil
	}

	allowedServices := make(map[string]*core.Record, len(rules))
	for _, rule := range rules {
		allowedServices[serviceKey(rule.GetString("platform"), rule.GetString("name"))] = rule
	}

	dataByKey := make(map[string]*service.Service, len(data))
	for _, svc := range data {
		key := serviceKey(svc.Platform, svc.Name)
		if _, ok := allowedServices[key]; ok {
			dataByKey[key] = svc
		}
	}
	filteredData := make([]*service.Service, 0, len(rules))
	for key, rule := range allowedServices {
		if svc, ok := dataByKey[key]; ok {
			filteredData = append(filteredData, svc)
			continue
		}
		filteredData = append(filteredData, &service.Service{
			Name:     rule.GetString("name"),
			Platform: rule.GetString("platform"),
			State:    service.StateStopped,
		})
	}
	if len(filteredData) == 0 {
		return []uint16{0, 0}, nil
	}

	params := dbx.Params{
		"system":  systemId,
		"updated": time.Now().UTC().UnixMilli(),
	}

	valueStrings := make([]string, 0, len(filteredData))
	for i, svc := range filteredData {
		suffix := fmt.Sprintf("%d", i)
		valueStrings = append(valueStrings, fmt.Sprintf("({:id%[1]s}, {:system}, {:platform%[1]s}, {:name%[1]s}, {:displayName%[1]s}, {:state%[1]s}, {:startType%[1]s}, {:updated})", suffix))
		params["id"+suffix] = makeStableHashId(systemId, svc.Platform, svc.Name)
		params["platform"+suffix] = svc.Platform
		params["name"+suffix] = svc.Name
		params["displayName"+suffix] = svc.DisplayName
		params["state"+suffix] = svc.State
		params["startType"+suffix] = svc.StartType
	}
	queryString := fmt.Sprintf(
		"INSERT INTO monitored_services (id, system, platform, name, display_name, state, start_type, updated) VALUES %s ON CONFLICT(id) DO UPDATE SET system = excluded.system, platform = excluded.platform, name = excluded.name, display_name = excluded.display_name, state = excluded.state, start_type = excluded.start_type, updated = excluded.updated",
		strings.Join(valueStrings, ","),
	)
	_, err = app.DB().NewQuery(queryString).Bind(params).Execute()
	if err != nil {
		return nil, err
	}
	return monitoredServiceSummary(filteredData), nil
}

func createMonitoredSoftwareRecords(app core.App, data []*service.Service, systemId string) error {
	if len(data) == 0 {
		return nil
	}
	rules, err := app.FindRecordsByFilter(
		"software_monitor_rules",
		"system = {:system} && enabled = true",
		"",
		0,
		0,
		map[string]any{"system": systemId},
	)
	if err != nil {
		return err
	}
	if len(rules) == 0 {
		return nil
	}
	allowedSoftware := make(map[string]*core.Record, len(rules))
	for _, rule := range rules {
		allowedSoftware[monitoredSoftwareKey(rule.GetString("name"))] = rule
	}
	dataByKey := make(map[string]*service.Service, len(data))
	for _, item := range data {
		key := monitoredSoftwareKey(item.Name)
		if _, ok := allowedSoftware[key]; ok {
			dataByKey[key] = item
		}
	}
	filteredData := make([]*service.Service, 0, len(rules))
	for key, rule := range allowedSoftware {
		if item, ok := dataByKey[key]; ok {
			filteredData = append(filteredData, item)
			continue
		}
		filteredData = append(filteredData, &service.Service{
			Name:        rule.GetString("name"),
			DisplayName: rule.GetString("display_name"),
			Platform:    rule.GetString("platform"),
			State:       service.StateStopped,
		})
	}
	params := dbx.Params{
		"system":  systemId,
		"updated": time.Now().UTC().UnixMilli(),
	}

	valueStrings := make([]string, 0, len(filteredData))
	for i, item := range filteredData {
		suffix := fmt.Sprintf("%d", i)
		valueStrings = append(valueStrings, fmt.Sprintf("({:id%[1]s}, {:system}, {:platform%[1]s}, {:name%[1]s}, {:displayName%[1]s}, {:state%[1]s}, {:updated})", suffix))
		params["id"+suffix] = makeStableHashId(systemId, item.Platform, item.Name)
		params["platform"+suffix] = item.Platform
		params["name"+suffix] = item.Name
		params["displayName"+suffix] = item.DisplayName
		params["state"+suffix] = item.State
	}
	queryString := fmt.Sprintf(
		"INSERT INTO monitored_software (id, system, platform, name, display_name, state, updated) VALUES %s ON CONFLICT(id) DO UPDATE SET system = excluded.system, platform = excluded.platform, name = excluded.name, display_name = excluded.display_name, state = excluded.state, updated = excluded.updated",
		strings.Join(valueStrings, ","),
	)
	_, err = app.DB().NewQuery(queryString).Bind(params).Execute()
	if err != nil {
		return err
	}
	_, _ = app.DB().NewQuery(
		"DELETE FROM monitored_software WHERE system = {:system} AND name NOT IN (" + placeholdersForRuleNames(rules, params) + ")",
	).Bind(params).Execute()
	return err
}

func placeholdersForRuleNames(rules []*core.Record, params dbx.Params) string {
	placeholders := make([]string, 0, len(rules))
	for i, rule := range rules {
		key := fmt.Sprintf("ruleName%d", i)
		placeholders = append(placeholders, "{:"+key+"}")
		params[key] = rule.GetString("name")
	}
	if len(placeholders) == 0 {
		return "''"
	}
	return strings.Join(placeholders, ",")
}

func monitoredServiceSummary(services []*service.Service) []uint16 {
	nonRunning := uint16(0)
	for _, svc := range services {
		if svc.State != service.StateRunning {
			nonRunning++
		}
	}
	return []uint16{uint16(len(services)), nonRunning}
}

func serviceKey(platform string, name string) string {
	return strings.ToLower(strings.TrimSpace(platform)) + ":" + strings.ToLower(strings.TrimSpace(name))
}

func monitoredSoftwareKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func (sys *System) getMonitoredServiceNames() []string {
	if sys.manager == nil || sys.manager.hub == nil {
		return nil
	}
	if sys.ctx != nil && sys.ctx.Err() != nil {
		return nil
	}
	if !sys.supportsWindowsServiceMonitoring() {
		return nil
	}
	rules, err := sys.manager.hub.FindRecordsByFilter(
		"service_control_rules",
		"system = {:system} && enabled = true",
		"name",
		0,
		0,
		map[string]any{"system": sys.Id},
	)
	if err != nil {
		sys.manager.hub.Logger().Warn("Failed to load monitored services", "system", sys.Id, "err", err)
		return nil
	}
	names := make([]string, 0, len(rules))
	for _, rule := range rules {
		name := strings.TrimSpace(rule.GetString("name"))
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func (sys *System) getMonitoredSoftwareNames() []string {
	if sys.manager == nil || sys.manager.hub == nil {
		return nil
	}
	if sys.ctx != nil && sys.ctx.Err() != nil {
		return nil
	}
	if !sys.supportsSoftwareMonitoring() {
		return nil
	}
	rules, err := sys.manager.hub.FindRecordsByFilter(
		"software_monitor_rules",
		"system = {:system} && enabled = true",
		"name",
		0,
		0,
		map[string]any{"system": sys.Id},
	)
	if err != nil {
		sys.manager.hub.Logger().Warn("Failed to load monitored software", "system", sys.Id, "err", err)
		return nil
	}
	names := make([]string, 0, len(rules))
	for _, rule := range rules {
		name := strings.TrimSpace(rule.GetString("name"))
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

func createSystemDetailsRecord(app core.App, data *system.Details, systemId string) error {
	collectionName := "system_details"
	networkInterfaces, err := json.Marshal(data.NetworkInterfaces)
	if err != nil {
		return err
	}
	memoryModules, err := json.Marshal(data.MemoryModules)
	if err != nil {
		return err
	}
	virtualization, err := json.Marshal(data.Virtualization)
	if err != nil {
		return err
	}
	params := dbx.Params{
		"id":                        systemId,
		"system":                    systemId,
		"hostname":                  data.Hostname,
		"kernel":                    data.Kernel,
		"cores":                     data.Cores,
		"threads":                   data.Threads,
		"cpu":                       data.CpuModel,
		"cpu_vendor":                data.CpuVendor,
		"cpu_frequency_mhz":         data.CpuFrequencyMhz,
		"os":                        data.Os,
		"os_name":                   data.OsName,
		"arch":                      data.Arch,
		"memory":                    data.MemoryTotal,
		"podman":                    data.Podman,
		"container_runtime_name":    data.ContainerRuntimeName,
		"container_runtime_version": data.ContainerRuntimeVersion,
		"network_interfaces":        string(networkInterfaces),
		"memory_modules":            string(memoryModules),
		"virtualization":            string(virtualization),
		"updated":                   time.Now().UTC(),
	}
	result, err := app.DB().Update(collectionName, params, dbx.HashExp{"id": systemId}).Execute()
	rowsAffected, _ := result.RowsAffected()
	if err != nil || rowsAffected == 0 {
		_, err = app.DB().Insert(collectionName, params).Execute()
	}
	return err
}

// createContainerRecords creates container records
func createContainerRecords(app core.App, data []*container.Stats, systemId string) error {
	if len(data) == 0 {
		return nil
	}
	// shared params for all records
	params := dbx.Params{
		"system":  systemId,
		"updated": time.Now().UTC().UnixMilli(),
	}
	valueStrings := make([]string, 0, len(data))
	currentIds := make([]string, 0, len(data))
	for i, container := range data {
		suffix := fmt.Sprintf("%d", i)
		valueStrings = append(valueStrings, fmt.Sprintf("({:id%[1]s}, {:system}, {:name%[1]s}, {:image%[1]s}, {:ports%[1]s}, {:status%[1]s}, {:health%[1]s}, {:cpu%[1]s}, {:memory%[1]s}, {:net%[1]s}, {:stackProject%[1]s}, {:stackService%[1]s}, {:stackNumber%[1]s}, {:stackConfig%[1]s}, {:stackWorkingDir%[1]s}, {:updated})", suffix))
		params["id"+suffix] = container.Id
		currentIds = append(currentIds, container.Id)
		params["name"+suffix] = container.Name
		params["image"+suffix] = container.Image
		params["ports"+suffix] = container.Ports
		params["status"+suffix] = container.Status
		params["health"+suffix] = container.Health
		params["cpu"+suffix] = container.Cpu
		params["memory"+suffix] = container.Mem
		stack := sanitizeContainerStackInfo(container)
		params["stackProject"+suffix] = strings.TrimSpace(stack.Project)
		params["stackService"+suffix] = strings.TrimSpace(stack.Service)
		params["stackNumber"+suffix] = strings.TrimSpace(stack.Number)
		params["stackConfig"+suffix] = strings.TrimSpace(stack.Config)
		params["stackWorkingDir"+suffix] = strings.TrimSpace(stack.WorkingDir)
		netBytes := container.Bandwidth[0] + container.Bandwidth[1]
		if netBytes == 0 {
			netBytes = uint64((container.NetworkSent + container.NetworkRecv) * 1024 * 1024)
		}
		params["net"+suffix] = netBytes
	}
	queryString := fmt.Sprintf(
		"INSERT INTO containers (id, system, name, image, ports, status, health, cpu, memory, net, stack_project, stack_service, stack_number, stack_config, stack_working_dir, updated) VALUES %s ON CONFLICT(id) DO UPDATE SET system = excluded.system, name = excluded.name, image = excluded.image, ports = excluded.ports, status = excluded.status, health = excluded.health, cpu = excluded.cpu, memory = excluded.memory, net = excluded.net, stack_project = excluded.stack_project, stack_service = excluded.stack_service, stack_number = excluded.stack_number, stack_config = excluded.stack_config, stack_working_dir = excluded.stack_working_dir, updated = excluded.updated",
		strings.Join(valueStrings, ","),
	)
	if _, err := app.DB().NewQuery(queryString).Bind(params).Execute(); err != nil {
		return err
	}
	return deleteStaleContainerRecords(app, systemId, currentIds)
}

func sanitizeContainerStackInfo(stats *container.Stats) container.StackInfo {
	if stats == nil || isPulseProtectedContainer(stats.Name, stats.Image) {
		return container.StackInfo{}
	}
	stack := stats.Stack
	stack.Project = strings.TrimSpace(stack.Project)
	stack.Service = strings.TrimSpace(stack.Service)
	stack.Number = strings.TrimSpace(stack.Number)
	stack.Config = strings.TrimSpace(stack.Config)
	stack.WorkingDir = strings.TrimSpace(stack.WorkingDir)
	if !isTrustedContainerStackInfo(stack) {
		return container.StackInfo{}
	}
	return stack
}

func isTrustedContainerStackInfo(stack container.StackInfo) bool {
	if stack.Project == "" || stack.Service == "" {
		return false
	}
	if stack.Trusted {
		return true
	}
	// Older 1.0.x agents did not send the Trusted bit. Keep accepting their
	// complete Compose label sets, but never group containers from only a
	// project label or other partial metadata.
	return stack.Config != "" || stack.WorkingDir != "" || stack.Number != ""
}

func isPulseProtectedContainer(name string, image string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	image = strings.ToLower(strings.TrimSpace(image))
	return strings.Contains(name, "pulse-hub") ||
		strings.Contains(image, "pulse-hub") ||
		strings.Contains(name, "pulse-agent") ||
		strings.Contains(image, "pulse-agent")
}

func deleteStaleContainerRecords(app core.App, systemId string, currentIds []string) error {
	if len(currentIds) == 0 {
		return nil
	}
	params := dbx.Params{"system": systemId}
	placeholders := make([]string, 0, len(currentIds))
	for i, id := range currentIds {
		key := fmt.Sprintf("id%d", i)
		params[key] = id
		placeholders = append(placeholders, "{:"+key+"}")
	}
	query := fmt.Sprintf(
		"DELETE FROM containers WHERE system = {:system} AND id NOT IN (%s)",
		strings.Join(placeholders, ","),
	)
	_, err := app.DB().NewQuery(query).Bind(params).Execute()
	return err
}

type containerAlertTarget struct {
	id       string
	name     string
	value    int
	detail   string
	recovery string
}

type importantMonitoringAlertTarget struct {
	id       string
	kind     string
	name     string
	value    int
	detail   string
	recovery string
}

func (sys *System) syncImportantMonitoringAlertHistory(systemRecord *core.Record, kind string, data []*service.Service) error {
	if sys.manager == nil || sys.manager.hub == nil || systemRecord == nil {
		return nil
	}
	userIDs := systemRecord.GetStringSlice("users")
	if len(userIDs) == 0 {
		return nil
	}

	currentTargets, err := sys.buildImportantMonitoringAlertTargets(kind, data)
	if err != nil {
		return err
	}
	currentIDs := make(map[string]struct{}, len(currentTargets))
	for id := range currentTargets {
		currentIDs[id] = struct{}{}
	}
	if err := sys.resolveMissingImportantMonitoringAlerts(systemRecord, kind, currentIDs); err != nil {
		return err
	}

	for _, target := range currentTargets {
		for _, userID := range userIDs {
			if strings.TrimSpace(userID) == "" {
				continue
			}
			created, err := sys.createImportantMonitoringAlertHistory(systemRecord, userID, target)
			if err != nil {
				return err
			}
			if created {
				sys.sendImportantMonitoringAlertNotification(systemRecord, userID, target, false)
			}
		}
	}
	return nil
}

func (sys *System) buildImportantMonitoringAlertTargets(kind string, data []*service.Service) (map[string]importantMonitoringAlertTarget, error) {
	rulesCollection, prefix, label := importantMonitoringAlertMeta(kind)
	if rulesCollection == "" {
		return nil, nil
	}
	rules, err := sys.manager.hub.FindRecordsByFilter(
		rulesCollection,
		"system = {:system} && enabled = true",
		"",
		0,
		0,
		dbx.Params{"system": sys.Id},
	)
	if err != nil {
		return nil, err
	}
	targets := make(map[string]importantMonitoringAlertTarget, len(rules))
	if len(rules) == 0 {
		return targets, nil
	}

	dataByKey := make(map[string]*service.Service, len(data))
	for _, item := range data {
		if item == nil {
			continue
		}
		switch kind {
		case "service":
			dataByKey[serviceKey(item.Platform, item.Name)] = item
		case "software":
			dataByKey[monitoredSoftwareKey(item.Name)] = item
		}
	}

	for _, rule := range rules {
		name := strings.TrimSpace(rule.GetString("name"))
		if name == "" {
			continue
		}
		platform := strings.TrimSpace(rule.GetString("platform"))
		key := monitoredSoftwareKey(name)
		idParts := []string{sys.Id, strings.ToLower(name)}
		if kind == "service" {
			key = serviceKey(platform, name)
			idParts = []string{sys.Id, strings.ToLower(platform), strings.ToLower(name)}
		}
		id := prefix + makeStableHashId(idParts...)
		if len(data) == 0 {
			targets[id] = importantMonitoringAlertTarget{id: id, kind: kind}
			continue
		}
		item := dataByKey[key]
		displayName := importantMonitoringDisplayName(kind, name, rule, item)
		if item != nil && item.State == service.StateRunning {
			targets[id] = importantMonitoringAlertTarget{id: id, kind: kind}
			continue
		}
		targets[id] = importantMonitoringAlertTarget{
			id:       id,
			kind:     kind,
			name:     label + "：" + displayName,
			value:    1,
			detail:   importantMonitoringAlertDetail(kind, item),
			recovery: fmt.Sprintf("%s %s 已恢复运行。", label, displayName),
		}
	}
	return targets, nil
}

func importantMonitoringAlertMeta(kind string) (collection string, prefix string, label string) {
	switch kind {
	case "service":
		return "service_control_rules", "service:", "服务"
	case "software":
		return "software_monitor_rules", "software:", "软件"
	default:
		return "", "", ""
	}
}

func importantMonitoringDisplayName(kind string, name string, rule *core.Record, item *service.Service) string {
	if item != nil && strings.TrimSpace(item.DisplayName) != "" {
		return strings.TrimSpace(item.DisplayName)
	}
	if rule != nil {
		switch kind {
		case "service":
			if note := strings.TrimSpace(rule.GetString("note")); note != "" {
				return note
			}
		case "software":
			if displayName := strings.TrimSpace(rule.GetString("display_name")); displayName != "" {
				return displayName
			}
		}
	}
	return strings.TrimSpace(name)
}

func importantMonitoringAlertDetail(kind string, item *service.Service) string {
	if item == nil {
		if kind == "service" {
			return "未找到服务"
		}
		return "未匹配到运行进程"
	}
	return "状态：" + serviceStateName(item.State)
}

func serviceStateName(state service.State) string {
	switch state {
	case service.StateRunning:
		return "运行中"
	case service.StateStopped:
		return "未运行"
	case service.StatePaused:
		return "已暂停"
	case service.StateStarting:
		return "启动中"
	case service.StateStopping:
		return "停止中"
	case service.StateOther:
		return "其他"
	default:
		return "未知"
	}
}

func (sys *System) resolveMissingImportantMonitoringAlerts(systemRecord *core.Record, kind string, currentIDs map[string]struct{}) error {
	_, prefix, _ := importantMonitoringAlertMeta(kind)
	if prefix == "" {
		return nil
	}
	records, err := sys.manager.hub.FindRecordsByFilter(
		"alerts_history",
		"system={:system} && resolved=null",
		"",
		0,
		0,
		dbx.Params{"system": systemRecord.Id},
	)
	if err != nil {
		return nil
	}
	for _, record := range records {
		alertID := record.GetString("alert_id")
		if !strings.HasPrefix(alertID, prefix) {
			continue
		}
		if _, ok := currentIDs[alertID]; ok {
			continue
		}
		record.Set("resolved", time.Now().UTC())
		setAlertHistoryAssetFromSystem(record, systemRecord)
		if err := sys.manager.hub.SaveNoValidate(record); err != nil {
			return err
		}
		sys.sendImportantMonitoringAlertNotification(systemRecord, record.GetString("user"), importantMonitoringAlertTarget{
			id:       alertID,
			kind:     kind,
			name:     record.GetString("name"),
			recovery: fmt.Sprintf("%s 已恢复。", strings.TrimPrefix(strings.TrimPrefix(record.GetString("name"), "服务："), "软件：")),
		}, true)
	}
	return nil
}

func (sys *System) createImportantMonitoringAlertHistory(systemRecord *core.Record, userID string, target importantMonitoringAlertTarget) (bool, error) {
	if target.name == "" || target.value <= 0 {
		return sys.resolveImportantMonitoringAlertHistory(systemRecord, userID, target)
	}
	existing, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err == nil && existing != nil {
		changed := false
		if existing.GetString("name") != target.name {
			existing.Set("name", target.name)
			changed = true
		}
		if existing.GetFloat("value") != float64(target.value) {
			existing.Set("value", target.value)
			changed = true
		}
		if setAlertHistoryAssetFromSystem(existing, systemRecord) {
			changed = true
		}
		if changed {
			if err := sys.manager.hub.SaveNoValidate(existing); err != nil {
				return false, err
			}
		}
		return false, nil
	}

	collection, err := sys.manager.hub.FindCachedCollectionByNameOrId("alerts_history")
	if err != nil {
		return false, err
	}
	record := core.NewRecord(collection)
	record.Set("alert_id", target.id)
	record.Set("user", userID)
	record.Set("system", systemRecord.Id)
	setAlertHistoryAssetFromSystem(record, systemRecord)
	record.Set("name", target.name)
	record.Set("value", target.value)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	return true, nil
}

func (sys *System) resolveImportantMonitoringAlertHistory(systemRecord *core.Record, userID string, target importantMonitoringAlertTarget) (bool, error) {
	record, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err != nil || record == nil {
		return false, nil
	}
	record.Set("resolved", time.Now().UTC())
	setAlertHistoryAssetFromSystem(record, systemRecord)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	target.name = record.GetString("name")
	sys.sendImportantMonitoringAlertNotification(systemRecord, userID, target, true)
	return true, nil
}

func setAlertHistoryAssetFromSystem(alertRecord *core.Record, systemRecord *core.Record) bool {
	if alertRecord == nil || systemRecord == nil {
		return false
	}
	assetID := strings.TrimSpace(systemRecord.GetString("asset"))
	if assetID == "" || alertRecord.GetString("asset") == assetID {
		return false
	}
	alertRecord.Set("asset", assetID)
	return true
}

func (sys *System) sendImportantMonitoringAlertNotification(systemRecord *core.Record, userID string, target importantMonitoringAlertTarget, resolved bool) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	systemName := strings.TrimSpace(systemRecord.GetString("name"))
	if systemName == "" {
		systemName = systemRecord.Id
	}
	_, _, label := importantMonitoringAlertMeta(target.kind)
	if label == "" {
		label = "监控项"
	}
	displayName := strings.TrimPrefix(strings.TrimPrefix(target.name, "服务："), "软件：")
	title := fmt.Sprintf("%s %s 异常", label, displayName)
	message := fmt.Sprintf("%s 上的%s状态异常。", systemName, label)
	if resolved {
		title = fmt.Sprintf("%s %s 已恢复", label, displayName)
		message = fmt.Sprintf("%s 上的%s已恢复。", systemName, label)
		if target.recovery != "" {
			message = fmt.Sprintf("%s\n%s", message, target.recovery)
		}
	} else if target.detail != "" {
		message = fmt.Sprintf("%s\n%s", message, target.detail)
	}
	if err := sys.manager.hub.SendAlert(alerts.AlertMessageData{
		UserID:   userID,
		SystemID: systemRecord.Id,
		AssetID:  strings.TrimSpace(systemRecord.GetString("asset")),
		AlertID:  target.id,
		Title:    title,
		Message:  message,
		Link:     sys.manager.hub.MakeLink("system", systemRecord.Id),
		LinkText: "查看机器",
		Resolved: resolved,
	}); err != nil {
		sys.manager.hub.Logger().Warn("Failed to send important monitoring alert", "system", systemRecord.Id, "alert", target.id, "err", err)
	}
}

func (sys *System) syncContainerAlertHistory(systemRecord *core.Record, data []*container.Stats) error {
	if sys.manager == nil || sys.manager.hub == nil || systemRecord == nil {
		return nil
	}
	userIDs := systemRecord.GetStringSlice("users")
	if len(userIDs) == 0 {
		return nil
	}

	currentTargets := buildContainerAlertTargets(sys.Id, data)
	currentIDs := make(map[string]struct{}, len(currentTargets))
	for id := range currentTargets {
		currentIDs[id] = struct{}{}
	}

	if err := sys.resolveMissingContainerAlerts(systemRecord, currentIDs); err != nil {
		return err
	}

	for _, target := range currentTargets {
		for _, userID := range userIDs {
			if strings.TrimSpace(userID) == "" {
				continue
			}
			created, err := sys.createContainerAlertHistory(systemRecord, userID, target)
			if err != nil {
				return err
			}
			if created {
				sys.sendContainerAlertNotification(systemRecord, userID, target, false)
			}
		}
	}
	return nil
}

func buildContainerAlertTargets(systemID string, data []*container.Stats) map[string]containerAlertTarget {
	targets := make(map[string]containerAlertTarget)
	stackAbnormalCounts := map[string]int{}
	stackDetails := map[string][]string{}
	stackNames := map[string]string{}
	normalIDs := make(map[string]struct{})

	for _, item := range data {
		if item == nil {
			continue
		}
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.Id)
		}
		if name == "" {
			continue
		}
		project := strings.TrimSpace(item.Stack.Project)
		if project != "" {
			id := containerStackAlertID(systemID, project)
			normalIDs[id] = struct{}{}
			stackNames[id] = project
			if isContainerAlertAbnormal(item) {
				stackAbnormalCounts[id]++
				stackDetails[id] = append(stackDetails[id], fmt.Sprintf("%s：%s", name, containerAlertReason(item)))
			}
			continue
		}

		id := containerAlertID(systemID, name)
		normalIDs[id] = struct{}{}
		if isContainerAlertAbnormal(item) {
			targets[id] = containerAlertTarget{
				id:       id,
				name:     "容器：" + name,
				value:    1,
				detail:   containerAlertReason(item),
				recovery: fmt.Sprintf("容器 %s 已恢复运行。", name),
			}
		}
	}

	for id, count := range stackAbnormalCounts {
		if count <= 0 {
			continue
		}
		project := stackNames[id]
		targets[id] = containerAlertTarget{
			id:       id,
			name:     "编排：" + project,
			value:    count,
			detail:   strings.Join(stackDetails[id], "\n"),
			recovery: fmt.Sprintf("编排 %s 已恢复运行。", project),
		}
	}

	for id := range normalIDs {
		if _, ok := targets[id]; !ok {
			targets[id] = containerAlertTarget{id: id}
		}
	}
	return targets
}

func (sys *System) resolveMissingContainerAlerts(systemRecord *core.Record, currentIDs map[string]struct{}) error {
	records, err := sys.manager.hub.FindRecordsByFilter(
		"alerts_history",
		"system={:system} && resolved=null",
		"",
		0,
		0,
		dbx.Params{"system": systemRecord.Id},
	)
	if err != nil {
		return nil
	}
	for _, record := range records {
		alertID := record.GetString("alert_id")
		if !strings.HasPrefix(alertID, "container:") && !strings.HasPrefix(alertID, "container-stack:") {
			continue
		}
		if _, ok := currentIDs[alertID]; ok {
			continue
		}
		record.Set("resolved", time.Now().UTC())
		setAlertHistoryAssetFromSystem(record, systemRecord)
		if err := sys.manager.hub.SaveNoValidate(record); err != nil {
			return err
		}
		sys.sendContainerAlertNotification(systemRecord, record.GetString("user"), containerAlertTarget{
			id:       alertID,
			name:     record.GetString("name"),
			recovery: fmt.Sprintf("%s 已恢复。", strings.TrimPrefix(strings.TrimPrefix(record.GetString("name"), "容器："), "编排：")),
		}, true)
	}
	return nil
}

func (sys *System) createContainerAlertHistory(systemRecord *core.Record, userID string, target containerAlertTarget) (bool, error) {
	if target.name == "" || target.value <= 0 {
		return sys.resolveContainerAlertHistory(systemRecord, userID, target)
	}
	existing, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err == nil && existing != nil {
		changed := false
		if existing.GetString("name") != target.name {
			existing.Set("name", target.name)
			changed = true
		}
		if existing.GetFloat("value") != float64(target.value) {
			existing.Set("value", target.value)
			changed = true
		}
		if setAlertHistoryAssetFromSystem(existing, systemRecord) {
			changed = true
		}
		if changed {
			if err := sys.manager.hub.SaveNoValidate(existing); err != nil {
				return false, err
			}
		}
		return false, nil
	}

	collection, err := sys.manager.hub.FindCachedCollectionByNameOrId("alerts_history")
	if err != nil {
		return false, err
	}
	record := core.NewRecord(collection)
	record.Set("alert_id", target.id)
	record.Set("user", userID)
	record.Set("system", systemRecord.Id)
	setAlertHistoryAssetFromSystem(record, systemRecord)
	record.Set("name", target.name)
	record.Set("value", target.value)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	return true, nil
}

func (sys *System) resolveContainerAlertHistory(systemRecord *core.Record, userID string, target containerAlertTarget) (bool, error) {
	record, err := sys.manager.hub.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && user={:user} && system={:system} && resolved=null",
		dbx.Params{"alert_id": target.id, "user": userID, "system": systemRecord.Id},
	)
	if err != nil || record == nil {
		return false, nil
	}
	record.Set("resolved", time.Now().UTC())
	setAlertHistoryAssetFromSystem(record, systemRecord)
	if err := sys.manager.hub.SaveNoValidate(record); err != nil {
		return false, err
	}
	target.name = record.GetString("name")
	sys.sendContainerAlertNotification(systemRecord, userID, target, true)
	return true, nil
}

func (sys *System) sendContainerAlertNotification(systemRecord *core.Record, userID string, target containerAlertTarget, resolved bool) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	systemName := strings.TrimSpace(systemRecord.GetString("name"))
	if systemName == "" {
		systemName = systemRecord.Id
	}
	name := strings.TrimSpace(target.name)
	displayName := strings.TrimPrefix(strings.TrimPrefix(name, "容器："), "编排：")
	kind := "容器"
	if strings.HasPrefix(name, "编排：") {
		kind = "编排"
	}
	title := fmt.Sprintf("%s %s 异常", kind, displayName)
	message := fmt.Sprintf("%s 上的%s状态异常。", systemName, kind)
	if resolved {
		title = fmt.Sprintf("%s %s 已恢复", kind, displayName)
		message = fmt.Sprintf("%s 上的%s已恢复。", systemName, kind)
		if target.recovery != "" {
			message = fmt.Sprintf("%s\n%s", message, target.recovery)
		}
	} else if target.detail != "" {
		message = fmt.Sprintf("%s\n%s", message, target.detail)
	}
	if err := sys.manager.hub.SendAlert(alerts.AlertMessageData{
		UserID:   userID,
		SystemID: systemRecord.Id,
		AssetID:  strings.TrimSpace(systemRecord.GetString("asset")),
		AlertID:  target.id,
		Title:    title,
		Message:  message,
		Link:     sys.manager.hub.MakeLink("system", systemRecord.Id),
		LinkText: "查看机器",
		Resolved: resolved,
	}); err != nil {
		sys.manager.hub.Logger().Warn("Failed to send container alert", "system", systemRecord.Id, "alert", target.id, "err", err)
	}
}

func isContainerAlertAbnormal(item *container.Stats) bool {
	if item == nil {
		return false
	}
	if item.Health == container.DockerHealthUnhealthy {
		return true
	}
	status := strings.ToLower(strings.TrimSpace(item.Status))
	if status == "" {
		return false
	}
	if strings.HasPrefix(status, "up") || strings.Contains(status, "running") {
		return false
	}
	return strings.Contains(status, "exited") ||
		strings.Contains(status, "dead") ||
		strings.Contains(status, "stopped") ||
		strings.Contains(status, "created") ||
		strings.Contains(status, "paused")
}

func containerAlertReason(item *container.Stats) string {
	if item == nil {
		return "状态异常"
	}
	reasons := make([]string, 0, 2)
	status := strings.TrimSpace(item.Status)
	if status != "" && !containerStatusLooksRunning(status) {
		reasons = append(reasons, "状态："+status)
	}
	if item.Health == container.DockerHealthUnhealthy {
		reasons = append(reasons, "健康检查：unhealthy")
	}
	if len(reasons) == 0 {
		return "状态异常"
	}
	return strings.Join(reasons, "；")
}

func containerStatusLooksRunning(status string) bool {
	normalized := strings.ToLower(strings.TrimSpace(status))
	return strings.HasPrefix(normalized, "up") || strings.Contains(normalized, "running")
}

func containerAlertID(systemID string, name string) string {
	return "container:" + makeStableHashId(systemID, strings.ToLower(strings.TrimSpace(name)))
}

func containerStackAlertID(systemID string, project string) string {
	return "container-stack:" + makeStableHashId(systemID, strings.ToLower(strings.TrimSpace(project)))
}

// getRecord retrieves the system record from the database.
// If the record is not found, it removes the system from the manager.
func (sys *System) getRecord(app core.App) (*core.Record, error) {
	record, err := app.FindRecordById("systems", sys.Id)
	if err != nil || record == nil {
		_ = sys.manager.RemoveSystem(sys.Id)
		return nil, err
	}
	return record, nil
}

// HasUser checks if the given user is in the system's users list.
// Returns true if SHARE_ALL_SYSTEMS is enabled (any authenticated user can access any system).
func (sys *System) HasUser(app core.App, user *core.Record) bool {
	if user == nil {
		return false
	}
	if v, _ := utils.GetEnv("SHARE_ALL_SYSTEMS"); v == "true" {
		return true
	}
	var recordData = struct {
		Users string
	}{}
	err := app.DB().NewQuery("SELECT users FROM systems WHERE id={:id}").
		Bind(dbx.Params{"id": sys.Id}).
		One(&recordData)
	if err != nil || recordData.Users == "" {
		return false
	}
	return strings.Contains(recordData.Users, user.Id)
}

// setDown marks a system as down in the database.
// It takes the original error that caused the system to go down and returns any error
// encountered during the process of updating the system status.
func (sys *System) setDown(originalError error) error {
	if sys.Status == down || sys.Status == paused {
		return nil
	}
	record, err := sys.getRecord(sys.manager.hub)
	if err != nil {
		return err
	}
	if originalError != nil && !isExpectedAgentDisconnectError(originalError) {
		sys.manager.hub.Logger().Error("System down", "system", record.GetString("name"), "err", originalError)
	}
	record.Set("status", down)
	return sys.manager.hub.SaveNoValidate(record)
}

func (sys *System) getContext() (context.Context, context.CancelFunc) {
	if sys.ctx == nil {
		sys.ctx, sys.cancel = context.WithCancel(context.Background())
	}
	return sys.ctx, sys.cancel
}

// request sends a request to the agent through its active WebSocket connection.
func (sys *System) request(ctx context.Context, action common.WebSocketAction, req any, dest any) error {
	if sys.WsConn == nil || !sys.WsConn.IsConnected() {
		return transport.ErrWebSocketNotConnected
	}
	wsTransport := transport.NewWebSocketTransport(sys.WsConn)
	if err := wsTransport.Request(ctx, action, req, dest); err != nil {
		if errors.Is(err, gws.ErrConnClosed) || errors.Is(err, transport.ErrWebSocketNotConnected) {
			sys.closeWebSocketConnection()
		}
		return err
	}
	return nil
}

// fetchDataFromAgent fetches data from the active agent WebSocket connection.
func (sys *System) fetchDataFromAgent(options common.DataRequestOptions) (*system.CombinedData, error) {
	if sys.data == nil {
		sys.data = &system.CombinedData{}
	}

	return sys.fetchDataViaWebSocket(options)
}

func (sys *System) fetchDataViaWebSocket(options common.DataRequestOptions) (*system.CombinedData, error) {
	if sys.WsConn == nil || !sys.WsConn.IsConnected() {
		return nil, transport.ErrWebSocketNotConnected
	}
	wsTransport := transport.NewWebSocketTransport(sys.WsConn)
	err := wsTransport.Request(sys.ctx, common.GetData, options, sys.data)
	if err != nil {
		return nil, err
	}
	return sys.data, nil
}

// FetchContainerInfoFromAgent fetches container info from the agent
func (sys *System) FetchContainerInfoFromAgent(containerID string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var result string
	err := sys.request(ctx, common.GetContainerInfo, common.ContainerInfoRequest{ContainerID: containerID}, &result)
	return result, err
}

// FetchContainerLogsFromAgent fetches container logs from the agent
func (sys *System) FetchContainerLogsFromAgent(containerID string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	var result string
	err := sys.request(ctx, common.GetContainerLogs, common.ContainerLogsRequest{ContainerID: containerID}, &result)
	return result, err
}

func (sys *System) supportsWindowsServiceMonitoring() bool {
	record, err := sys.getRecord(sys.manager.hub)
	if err != nil {
		return false
	}
	if isLinuxContainerSystemRecord(record) {
		return false
	}
	var info struct {
		Capabilities struct {
			Collection []string `json:"collection"`
			Operations []string `json:"operations"`
		} `json:"cap"`
	}
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return false
	}
	return containsCapability(info.Capabilities.Collection, "windows_services") &&
		containsCapability(info.Capabilities.Operations, "service_control")
}

func (sys *System) SupportsWindowsServiceMonitoring() bool {
	return sys.supportsWindowsServiceMonitoring()
}

func (sys *System) supportsSoftwareMonitoring() bool {
	record, err := sys.getRecord(sys.manager.hub)
	if err != nil {
		return false
	}
	if isLinuxContainerSystemRecord(record) {
		return false
	}
	var info struct {
		Capabilities struct {
			Collection []string `json:"collection"`
		} `json:"cap"`
	}
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return false
	}
	return containsCapability(info.Capabilities.Collection, "software_monitor")
}

func (sys *System) SupportsSoftwareMonitoring() bool {
	return sys.supportsSoftwareMonitoring()
}

func containsCapability(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (sys *System) SearchServicesFromAgent(query string, limit uint16) (common.ServiceSearchResult, error) {
	if !sys.supportsWindowsServiceMonitoring() {
		return common.ServiceSearchResult{}, fmt.Errorf("current agent does not support service monitoring")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var result common.ServiceSearchResult
	err := sys.request(ctx, common.SearchServices, common.ServiceSearchRequest{Query: query, Limit: limit}, &result)
	return result, err
}

func (sys *System) SearchSoftwareFromAgent(query string, limit uint16) (common.SoftwareSearchResult, error) {
	if !sys.supportsSoftwareMonitoring() {
		return common.SoftwareSearchResult{}, fmt.Errorf("current agent does not support software monitoring")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var result common.SoftwareSearchResult
	err := sys.request(ctx, common.SearchSoftware, common.ServiceSearchRequest{Query: query, Limit: limit}, &result)
	return result, err
}

// FetchSmartDataFromAgent fetches SMART data from the agent
func (sys *System) FetchSmartDataFromAgent() (map[string]smart.SmartData, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	var result map[string]smart.SmartData
	err := sys.request(ctx, common.GetSmartData, nil, &result)
	return result, err
}

// RunOperation sends a constrained operation request to the agent.
func (sys *System) RunOperation(ctx context.Context, req common.OperationRequest, result *common.OperationResult) error {
	if sys.WsConn == nil || !sys.WsConn.IsConnected() {
		return errors.New("agent websocket operation channel is not connected")
	}
	wsTransport := transport.NewWebSocketTransport(sys.WsConn)
	return wsTransport.Request(ctx, common.RunOperation, req, result)
}

func makeStableHashId(strings ...string) string {
	hash := fnv.New32a()
	for _, str := range strings {
		hash.Write([]byte(str))
	}
	return fmt.Sprintf("%x", hash.Sum32())
}

// closeWebSocketConnection closes the WebSocket connection but keeps the system in the manager.
// The system will be set as down a few seconds later if the connection is not re-established.
func (sys *System) closeWebSocketConnection() {
	if sys.WsConn != nil {
		sys.WsConn.Close(nil)
	}
}

// getJitter returns a channel that will be triggered after a random delay
// between 51% and 95% of the interval.
// This is used to stagger the initial WebSocket connections to prevent clustering.
func getJitter() <-chan time.Time {
	minPercent := 51
	maxPercent := 95
	jitterRange := maxPercent - minPercent
	msDelay := (interval * minPercent / 100) + rand.Intn(interval*jitterRange/100)
	return time.After(time.Duration(msDelay) * time.Millisecond)
}

// migrateDeprecatedFields moves values from deprecated fields to their new locations if the new
// fields are not already populated. Deprecated fields and refs may be removed at least 30 days
// and one minor version release after the release that includes the migration.
//
// This is run when processing incoming system data from agents, which may be on older versions.
func migrateDeprecatedFields(cd *system.CombinedData, createDetails bool) {
	// migration added 0.19.0
	if cd.Stats.Bandwidth[0] == 0 && cd.Stats.Bandwidth[1] == 0 {
		cd.Stats.Bandwidth[0] = uint64(cd.Stats.NetworkSent * 1024 * 1024)
		cd.Stats.Bandwidth[1] = uint64(cd.Stats.NetworkRecv * 1024 * 1024)
		cd.Stats.NetworkSent, cd.Stats.NetworkRecv = 0, 0
	}
	// migration added 0.19.0
	if cd.Info.BandwidthBytes == 0 {
		cd.Info.BandwidthBytes = uint64(cd.Info.Bandwidth * 1024 * 1024)
		cd.Info.Bandwidth = 0
	}
	if cd.Info.BandwidthBytesByDirection[0] == 0 && cd.Info.BandwidthBytesByDirection[1] == 0 {
		cd.Info.BandwidthBytesByDirection = cd.Stats.Bandwidth
	}
	// migration added 0.19.0
	if cd.Stats.DiskIO[0] == 0 && cd.Stats.DiskIO[1] == 0 {
		cd.Stats.DiskIO[0] = uint64(cd.Stats.DiskReadPs * 1024 * 1024)
		cd.Stats.DiskIO[1] = uint64(cd.Stats.DiskWritePs * 1024 * 1024)
		cd.Stats.DiskReadPs, cd.Stats.DiskWritePs = 0, 0
	}
	// migration added 0.19.0 - Move deprecated Info fields to Details struct
	if cd.Details == nil && cd.Info.Hostname != "" {
		if createDetails {
			cd.Details = &system.Details{
				Hostname:    cd.Info.Hostname,
				Kernel:      cd.Info.KernelVersion,
				Cores:       cd.Info.Cores,
				Threads:     cd.Info.Threads,
				CpuModel:    cd.Info.CpuModel,
				Podman:      cd.Info.Podman,
				Os:          cd.Info.Os,
				MemoryTotal: uint64(cd.Stats.Mem * 1024 * 1024 * 1024),
			}
		}
		// zero the deprecated fields to prevent saving them in systems.info DB json payload
		cd.Info.Hostname = ""
		cd.Info.KernelVersion = ""
		cd.Info.Cores = 0
		cd.Info.CpuModel = ""
		cd.Info.Podman = false
		cd.Info.Os = 0
	}
}
