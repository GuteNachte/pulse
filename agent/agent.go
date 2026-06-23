// Package agent implements the Pulse monitoring agent that collects and serves system metrics.
//
// The agent runs on monitored systems and communicates collected data
// to the Pulse hub for centralized monitoring and alerting.
package agent

import (
	"log/slog"
	"runtime"
	"strings"
	"sync"
	"time"

	"gutenacht.site/pulse"
	"gutenacht.site/pulse/agent/deltatracker"
	"gutenacht.site/pulse/agent/utils"
	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/system"
)

const defaultDataCacheTimeMs uint16 = 60_000

type Agent struct {
	sync.Mutex                                                                      // Used to lock agent while collecting data
	debug                     bool                                                  // true if LOG_LEVEL is set to debug
	zfs                       bool                                                  // true if system has arcstats
	memCalc                   string                                                // Memory calculation formula
	fsNames                   []string                                              // List of filesystem device names being monitored
	fsStats                   map[string]*system.FsStats                            // Keeps track of disk stats for each filesystem
	diskPrev                  map[uint16]map[string]prevDisk                        // Previous disk I/O counters per cache interval
	diskUsageCacheDuration    time.Duration                                         // How long to cache disk usage (to avoid waking sleeping disks)
	lastDiskUsageUpdate       time.Time                                             // Last time disk usage was collected
	netInterfaces             map[string]struct{}                                   // Stores all valid network interfaces
	netIoStats                map[uint16]system.NetIoStats                          // Keeps track of bandwidth usage per cache interval
	netInterfaceDeltaTrackers map[uint16]*deltatracker.DeltaTracker[string, uint64] // Per-cache-time NIC delta trackers
	dockerManager             *dockerManager                                        // Manages Docker API requests
	sensorConfig              *SensorConfig                                         // Sensors config
	systemInfo                system.Info                                           // Host system info (dynamic)
	systemDetails             system.Details                                        // Host system details (static, once-per-connection)
	detailsDirty              bool                                                  // Whether system details have changed and need to be resent
	gpuManager                *GPUManager                                           // Manages GPU data
	cache                     *systemDataCache                                      // Cache for system stats based on cache time
	connectionManager         *ConnectionManager                                    // Channel to signal connection events
	handlerRegistry           *HandlerRegistry                                      // Registry for routing incoming messages
	dataDir                   string                                                // Directory for persisting data
	smartManager              *SmartManager                                         // Manages SMART data
	serviceManager            *serviceManager                                       // Manages generic platform services
	softwareManager           *softwareManager                                      // Manages regular software processes
	gpuError                  string                                                // Last GPU initialization error for capability reporting
}

// NewAgent creates a new agent with the given data directory for persisting data.
// If the data directory is not set, it will attempt to find the optimal directory.
func NewAgent(dataDir ...string) (agent *Agent, err error) {
	agent = &Agent{
		fsStats: make(map[string]*system.FsStats),
		cache:   NewSystemDataCache(),
	}

	// Initialize disk I/O previous counters storage
	agent.diskPrev = make(map[uint16]map[string]prevDisk)
	// Initialize per-cache-time network tracking structures
	agent.netIoStats = make(map[uint16]system.NetIoStats)
	agent.netInterfaceDeltaTrackers = make(map[uint16]*deltatracker.DeltaTracker[string, uint64])

	agent.dataDir, err = GetDataDir(dataDir...)
	if err != nil {
		slog.Warn("Data directory not found")
	} else {
		slog.Info("Data directory", "path", agent.dataDir)
	}

	agent.memCalc, _ = utils.GetEnv("MEM_CALC")
	agent.sensorConfig = agent.newSensorConfig()

	// Parse disk usage cache duration (e.g., "15m", "1h") to avoid waking sleeping disks
	if diskUsageCache, exists := utils.GetEnv("DISK_USAGE_CACHE"); exists {
		if duration, err := time.ParseDuration(diskUsageCache); err == nil {
			agent.diskUsageCacheDuration = duration
			slog.Info("DISK_USAGE_CACHE", "duration", duration)
		} else {
			slog.Warn("Invalid DISK_USAGE_CACHE", "err", err)
		}
	}

	// Set up slog with a log level determined by the LOG_LEVEL env var
	if logLevelStr, exists := utils.GetEnv("LOG_LEVEL"); exists {
		switch strings.ToLower(logLevelStr) {
		case "debug":
			agent.debug = true
			slog.SetLogLoggerLevel(slog.LevelDebug)
		case "warn":
			slog.SetLogLoggerLevel(slog.LevelWarn)
		case "error":
			slog.SetLogLoggerLevel(slog.LevelError)
		}
	}

	slog.Debug(pulse.Version)

	// initialize docker manager
	agent.dockerManager = newDockerManager(agent)

	// initialize system info
	agent.refreshSystemDetails()

	// SMART_INTERVAL env var to update smart data at this interval
	if smartIntervalEnv, exists := utils.GetEnv("SMART_INTERVAL"); exists {
		if duration, err := time.ParseDuration(smartIntervalEnv); err == nil && duration > 0 {
			agent.systemDetails.SmartInterval = duration
			slog.Info("SMART_INTERVAL", "duration", duration)
		} else {
			slog.Warn("Invalid SMART_INTERVAL", "err", err)
		}
	}

	// initialize connection manager
	agent.connectionManager = newConnectionManager(agent)

	// initialize handler registry
	agent.handlerRegistry = NewHandlerRegistry()

	// initialize disk info
	agent.initializeDiskInfo()

	// initialize net io stats
	agent.initializeNetIoStats()

	agent.serviceManager, err = newServiceManager()
	if err != nil {
		slog.Debug("Services", "err", err)
	}
	agent.softwareManager, err = newSoftwareManager()
	if err != nil {
		slog.Debug("Software", "err", err)
	}

	agent.smartManager, err = NewSmartManager()
	if err != nil {
		slog.Debug("SMART", "err", err)
	}

	// initialize GPU manager
	agent.gpuManager, err = NewGPUManager()
	if err != nil {
		agent.gpuError = err.Error()
		slog.Debug("GPU", "err", err)
	}

	// if debugging, print stats
	if agent.debug {
		slog.Debug("Stats", "data", agent.gatherStats(common.DataRequestOptions{CacheTimeMs: defaultDataCacheTimeMs, IncludeDetails: true}))
	}

	return agent, nil
}

func (a *Agent) gatherStats(options common.DataRequestOptions) *system.CombinedData {
	a.Lock()
	defer a.Unlock()

	cacheTimeMs := options.CacheTimeMs
	monitoredServices := normalizeMonitoredServiceNames(options.MonitoredServices)
	monitoredSoftware := normalizeMonitoredServiceNames(options.MonitoredSoftware)
	cacheKey := cacheKeyForTypedDataOptions(cacheTimeMs, monitoredServices, monitoredSoftware)
	data, isCached := a.cache.Get(cacheKey, cacheTimeMs)
	if isCached {
		slog.Debug("Cached data", "cacheTimeMs", cacheTimeMs)
		return data
	}

	*data = system.CombinedData{
		Stats: a.getSystemStats(cacheTimeMs),
		Info:  a.systemInfo,
	}
	data.Info.Capabilities = a.buildCapabilities()

	// slog.Info("System data", "data", data, "cacheTimeMs", cacheTimeMs)

	if a.dockerManager != nil {
		if containerStats, err := a.dockerManager.getDockerStats(cacheTimeMs); err == nil {
			data.Containers = containerStats
			slog.Debug("Containers", "data", data.Containers)
		} else {
			slog.Debug("Containers", "err", err)
		}
	}

	a.updateCapabilityResults(data)

	if a.serviceManager != nil && cacheTimeMs == defaultDataCacheTimeMs {
		services := a.serviceManager.getServiceStats(monitoredServices)
		if len(services) > 0 {
			data.Services = services
		}
	}

	if a.softwareManager != nil && runtime.GOOS == "windows" && cacheTimeMs == defaultDataCacheTimeMs {
		software := a.softwareManager.getSoftwareStats(monitoredSoftware)
		if len(software) > 0 {
			data.Software = software
		}
	}

	a.cache.Set(data, cacheKey)

	return a.attachSystemDetails(data, cacheTimeMs, options.IncludeDetails)
}

// Start initializes and starts the agent WebSocket connection.
func (a *Agent) Start() error {
	return a.connectionManager.Start()
}

func (a *Agent) Stop() error {
	if a.connectionManager == nil {
		return nil
	}
	return a.connectionManager.Stop()
}

func (a *Agent) getFingerprint() string {
	return GetFingerprint(a.dataDir, a.systemDetails.Hostname, a.systemDetails.CpuModel)
}
