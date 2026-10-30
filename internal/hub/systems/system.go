package systems

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"math/rand"
	"net"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/hub/transport"
	"gutenacht.site/pulse/internal/hub/utils"
	"gutenacht.site/pulse/internal/hub/ws"

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
	pushMu         sync.Mutex           // 2026-10-22 Agent 2.0：串行化推送与拉取的入库
	lastPush       atomic.Int64         // 最近一次入库（推送或拉取）的 unix nano
	pushIngests    atomic.Int64         // PushStats 推送入库次数（首条记日志用）
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
	// 2026-10-22 Agent 2.0 阶段二：本更新周期内已有 PushStats 推送入库时跳过本轮拉取；
	// 推送停止后自动回退为拉取（回退开关语义）。
	if sys.recentlyPushed() {
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
	// 拉取期间若推送已到达，丢弃本次拉取结果避免重复入库
	if sys.recentlyPushed() {
		return nil
	}
	if sys.manager != nil && sys.manager.hub != nil {
		sys.manager.hub.Logger().Debug("System data fetched", "system", sys.Id, "includeDetails", options.IncludeDetails, "containers", len(data.Containers), "services", len(data.Services), "software", len(data.Software))
	}

	return sys.ingestData(data)
}

// ingestData 2026-10-22 Agent 2.0 阶段二：update 拉取与 PushStats 推送共用的入库入口。
func (sys *System) ingestData(data *system.CombinedData) error {
	sys.pushMu.Lock()
	defer sys.pushMu.Unlock()

	// ensure deprecated fields from older agents are migrated to current fields
	migrateDeprecatedFields(data, !sys.detailsFetched.Load())

	// create system records
	if _, err := sys.createRecords(data); err != nil {
		return err
	}
	// 推送与拉取共用：入库即视为本周期已有数据
	sys.markPushed()

	// if details were included and fetched successfully, mark details as fetched and update smart interval if set by agent
	if data.Details != nil {
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

	return nil
}

// markPushed 记录最近一次入库时间（推送与拉取共用，保证每周期只入库一次）。
func (sys *System) markPushed() {
	sys.lastPush.Store(time.Now().UnixNano())
}

// recentlyPushed 报告本更新周期内是否已有入库。
func (sys *System) recentlyPushed() bool {
	last := sys.lastPush.Load()
	if last == 0 {
		return false
	}
	return time.Since(time.Unix(0, last)) < time.Duration(interval)*time.Millisecond
}

// HandlePushStats 2026-10-22 Agent 2.0 阶段二：接收 agent 主动推送的快照并入库。
func (sys *System) HandlePushStats(data *system.CombinedData) {
	if sys.ctx.Err() != nil || sys.Status == paused {
		return
	}
	if !hubAcceptsPushStats() {
		return
	}
	if err := sys.ingestData(data); err != nil {
		if sys.manager != nil && sys.manager.hub != nil {
			sys.manager.hub.Logger().Warn("PushStats ingest failed", "system", sys.Id, "err", err)
		}
		return
	}
	// 首条推送入库记 Info，作为推送链路生效的运维信号；后续推送不刷日志。
	if sys.pushIngests.Add(1) == 1 && sys.manager != nil && sys.manager.hub != nil {
		sys.manager.hub.Logger().Info("PushStats ingestion active", "system", sys.Id)
	}
}

var hubAcceptsPushStats = sync.OnceValue(func() bool {
	value := strings.TrimSpace(os.Getenv("PULSE_HUB_ACCEPT_PUSH_STATS"))
	return value != "0" && !strings.EqualFold(value, "false") && !strings.EqualFold(value, "no")
})

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
		connectionIP := strings.TrimSpace(sys.RemoteIP)
		if connectionIP != "" {
			info.RemoteIP = connectionIP
		}
		mergePersistedCapabilityResults(systemRecord, &info)
		markStaleCapabilityStatuses(info.Capabilities, time.Now().UTC(), sys.smartFetchInterval())
		updateLocalSystemMarkerFromInfo(systemRecord, info)
		info.RemoteIP = systemIdentityIP(systemRecord, connectionIP, data.Details)
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

func selectSystemIdentityIP(observedIP string, details *system.Details) string {
	observedIP = strings.TrimSpace(observedIP)
	if parsed := net.ParseIP(observedIP); parsed != nil {
		// 2026-10-21 用户要求一律采集局域网 IP：公网连接地址让位给详情里的私网地址。
		if ip4 := parsed.To4(); ip4 != nil && ip4.IsPrivate() {
			return ip4.String()
		}
	}
	if details == nil {
		return observedIP
	}

	type candidate struct {
		value string
		score int
	}
	candidates := make([]candidate, 0)
	for _, iface := range details.NetworkInterfaces {
		if isVirtualNetworkInterfaceName(iface.Name) {
			continue
		}
		score := 0
		if strings.EqualFold(strings.TrimSpace(iface.Status), "up") {
			score += 2
		}
		if len(iface.Gateways) > 0 {
			score++
		}
		for _, rawIP := range iface.IPv4 {
			ip := net.ParseIP(strings.TrimSpace(rawIP))
			if ip == nil || ip.To4() == nil || ip.IsLoopback() || ip.IsUnspecified() || ip.IsMulticast() || ip.IsLinkLocalUnicast() {
				continue
			}
			candidateScore := score
			if ip.IsPrivate() {
				candidateScore += 4
			}
			candidates = append(candidates, candidate{value: ip.To4().String(), score: candidateScore})
		}
	}
	if len(candidates) == 0 {
		return observedIP
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].score != candidates[j].score {
			return candidates[i].score > candidates[j].score
		}
		return candidates[i].value < candidates[j].value
	})
	return candidates[0].value
}

func persistedSystemIdentityIP(record *core.Record, selectedIP string) string {
	if !isLoopbackIPString(selectedIP) || record == nil || !record.GetBool("is_local") {
		return selectedIP
	}
	var previous system.Info
	if err := record.UnmarshalJSONField("info", &previous); err == nil {
		if ip := net.ParseIP(strings.TrimSpace(previous.RemoteIP)); ip != nil && !ip.IsLoopback() {
			return strings.TrimSpace(previous.RemoteIP)
		}
	}
	return selectedIP
}

func systemIdentityIP(record *core.Record, observedIP string, details *system.Details) string {
	return resolveSystemIdentityIP(record, observedIP, details, localLANIPv4())
}

func resolveSystemIdentityIP(record *core.Record, observedIP string, details *system.Details, localLANIP string) string {
	selectedIP := selectSystemIdentityIP(observedIP, details)
	if record != nil && record.GetBool("is_local") && isLoopbackIPString(selectedIP) {
		if lanIP := privateIPv4String(localLANIP); lanIP != "" {
			selectedIP = lanIP
		}
	}
	return persistedSystemIdentityIP(record, selectedIP)
}

// localLANIPv4 returns the host's outbound private IPv4 without relying on Agent details.
func localLANIPv4() string {
	if conn, err := net.Dial("udp4", "8.8.8.8:80"); err == nil {
		defer conn.Close()
		if udpAddr, ok := conn.LocalAddr().(*net.UDPAddr); ok {
			if ip := privateIPv4String(udpAddr.IP.String()); ip != "" {
				return ip
			}
		}
	}
	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		if isVirtualNetworkInterfaceName(iface.Name) {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch value := addr.(type) {
			case *net.IPNet:
				ip = value.IP
			case *net.IPAddr:
				ip = value.IP
			}
			if ip != nil {
				if value := privateIPv4String(ip.String()); value != "" {
					return value
				}
			}
		}
	}
	return ""
}

func privateIPv4String(value string) string {
	ip := net.ParseIP(strings.TrimSpace(value))
	if ip == nil {
		return ""
	}
	ip4 := ip.To4()
	if ip4 == nil || !ip4.IsPrivate() {
		return ""
	}
	return ip4.String()
}

func isVirtualNetworkInterfaceName(name string) bool {
	name = strings.ToLower(strings.TrimSpace(name))
	for _, prefix := range []string{
		"docker", "podman", "veth", "virbr", "br-", "cni", "flannel",
		"tailscale", "wg", "zt", "tun", "tap",
	} {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return name == "lo"
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

// FetchDataForAgentUpdate performs a lightweight real data refresh used to
// verify that an Agent update restarted and is running the requested version.
func (sys *System) FetchDataForAgentUpdate(ctx context.Context) (*system.CombinedData, error) {
	var data system.CombinedData
	err := sys.request(ctx, common.GetData, common.DataRequestOptions{CacheTimeMs: 0, IncludeDetails: true}, &data)
	if err != nil {
		return nil, err
	}
	return &data, nil
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
