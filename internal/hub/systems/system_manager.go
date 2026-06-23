package systems

import (
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"gutenacht.site/pulse/internal/alerts"
	"gutenacht.site/pulse/internal/hub/ws"

	"gutenacht.site/pulse/internal/entities/system"
	"gutenacht.site/pulse/internal/hub/expirymap"

	"github.com/blang/semver"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/store"
)

// System status constants
const (
	up      string = "up"      // System is online and responding
	down    string = "down"    // System is offline or not responding
	paused  string = "paused"  // System monitoring is paused
	pending string = "pending" // System is waiting on initial connection result

	// interval is the default update interval in milliseconds (60 seconds)
	interval int = 60_000
	// interval int = 10_000 // Debug interval for faster updates

)

// errSystemExists is returned when attempting to add a system that already exists
var errSystemExists = errors.New("system exists")

// SystemManager manages a collection of monitored systems and their WebSocket connections.
type SystemManager struct {
	hub           hubLike                               // Hub interface for database and alert operations
	systems       *store.Store[string, *System]         // Thread-safe store of active systems
	smartFetchMap *expirymap.ExpiryMap[smartFetchState] // Stores last SMART fetch time/result; TTL is only for cleanup
	shuttingDown  atomic.Bool                           // Prevents new updaters while the manager is being torn down
}

// hubLike defines the interface requirements for the hub dependency.
// It extends core.App with system-specific functionality.
type hubLike interface {
	core.App
	HandleSystemAlerts(systemRecord *core.Record, data *system.CombinedData) error
	HandleStatusAlerts(status string, systemRecord *core.Record) error
	CancelPendingStatusAlerts(systemID string)
	SendAlert(data alerts.AlertMessageData) error
	MakeLink(parts ...string) string
}

// NewSystemManager creates a new SystemManager instance with the provided hub.
// The hub must implement the hubLike interface to provide database and alert functionality.
func NewSystemManager(hub hubLike) *SystemManager {
	return &SystemManager{
		systems:       store.New(map[string]*System{}),
		hub:           hub,
		smartFetchMap: expirymap.New[smartFetchState](time.Hour),
	}
}

// GetSystem returns a system by ID from the store
func (sm *SystemManager) GetSystem(systemID string) (*System, error) {
	sys, ok := sm.systems.GetOk(systemID)
	if !ok {
		return nil, fmt.Errorf("system not found")
	}
	return sys, nil
}

// Initialize sets up the system manager by binding event hooks and starting existing systems.
// It begins monitoring all non-paused systems from the database.
func (sm *SystemManager) Initialize() error {
	sm.bindEventHooks()

	// Load existing systems from database (excluding paused ones)
	var systems []*System
	err := sm.hub.DB().NewQuery("SELECT id, status FROM systems WHERE status != 'paused'").All(&systems)
	if err != nil || len(systems) == 0 {
		return err
	}

	// Start systems in background with staggered timing
	go func() {
		// Calculate staggered delay between system starts (max 2 seconds per system)
		delta := interval / max(1, len(systems))
		delta = min(delta, 2_000)
		sleepTime := time.Duration(delta) * time.Millisecond

		for _, system := range systems {
			time.Sleep(sleepTime)
			_ = sm.AddSystem(system)
		}
	}()
	return nil
}

// bindEventHooks registers event handlers for system and fingerprint record changes.
// These hooks ensure the system manager stays synchronized with database changes.
func (sm *SystemManager) bindEventHooks() {
	sm.hub.OnRecordCreate("systems").BindFunc(sm.onRecordCreate)
	sm.hub.OnRecordAfterCreateSuccess("systems").BindFunc(sm.onRecordAfterCreateSuccess)
	sm.hub.OnRecordUpdate("systems").BindFunc(sm.onRecordUpdate)
	sm.hub.OnRecordAfterUpdateSuccess("systems").BindFunc(sm.onRecordAfterUpdateSuccess)
	sm.hub.OnRecordAfterDeleteSuccess("systems").BindFunc(sm.onRecordAfterDeleteSuccess)
	sm.hub.OnRecordAfterUpdateSuccess("fingerprints").BindFunc(sm.onTokenRotated)
	sm.hub.OnRealtimeSubscribeRequest().BindFunc(sm.onRealtimeSubscribeRequest)
	sm.hub.OnRealtimeConnectRequest().BindFunc(sm.onRealtimeConnectRequest)
}

// onTokenRotated handles fingerprint token rotation events.
// When a system's authentication token is rotated, any existing WebSocket connection
// must be closed to force re-authentication with the new token.
func (sm *SystemManager) onTokenRotated(e *core.RecordEvent) error {
	systemID := e.Record.GetString("system")
	system, ok := sm.systems.GetOk(systemID)
	if !ok {
		return e.Next()
	}
	// No need to close connection if not connected via websocket
	if system.WsConn == nil {
		return e.Next()
	}
	system.setDown(nil)
	sm.RemoveSystem(systemID)
	return e.Next()
}

// onRecordCreate is called before a new system record is committed to the database.
// New systems are WebSocket-only; legacy host/port fields are intentionally not used.
func (sm *SystemManager) onRecordCreate(e *core.RecordEvent) error {
	e.Record.Set("info", system.Info{})
	e.Record.Set("status", pending)
	discardLegacySystemTransportFields(e.Record)
	return e.Next()
}

// onRecordAfterCreateSuccess is called after a new system record is successfully created.
// It adds the new system to the manager to begin monitoring.
func (sm *SystemManager) onRecordAfterCreateSuccess(e *core.RecordEvent) error {
	for _, userID := range e.Record.GetStringSlice("users") {
		if err := alerts.ApplyGlobalAlertPoliciesToSystem(e.App, userID, e.Record.Id); err != nil {
			e.App.Logger().Error("Error applying global alert policies", "err", err, "systemID", e.Record.Id, "userID", userID)
		}
	}
	if err := sm.AddRecord(e.Record, nil); err != nil {
		e.App.Logger().Error("Error adding record", "err", err)
	}
	return e.Next()
}

// onRecordUpdate is called before a system record is updated in the database.
// It clears system info when paused. Agent transport is WebSocket-only and has no
// editable host/port configuration.
func (sm *SystemManager) onRecordUpdate(e *core.RecordEvent) error {
	if e.Record.GetString("status") == paused {
		e.Record.Set("info", system.Info{})
	}
	discardLegacySystemTransportFields(e.Record)
	return e.Next()
}

// onRecordAfterUpdateSuccess handles system record updates after they're committed to the database.
// It manages system lifecycle based on status changes and triggers appropriate alerts.
// Status transitions are handled as follows:
// - paused: Closes the active WebSocket connection and deactivates alerts
// - pending: Starts monitoring (reuses WebSocket if available)
// - up: Triggers system alerts
// - down: Triggers status change alerts
func (sm *SystemManager) onRecordAfterUpdateSuccess(e *core.RecordEvent) error {
	newStatus := e.Record.GetString("status")
	prevStatus := pending
	system, ok := sm.systems.GetOk(e.Record.Id)
	if ok {
		prevStatus = system.Status
		system.Status = newStatus
	}

	switch newStatus {
	case paused:
		if ok {
			// Pause monitoring but keep system in manager for potential resume
			system.closeWebSocketConnection()
		}
		_ = deactivateAlerts(e.App, e.Record.Id)
		sm.hub.CancelPendingStatusAlerts(e.Record.Id)
		return e.Next()
	case pending:
		// Resume monitoring, preferring existing WebSocket connection
		if ok && system.WsConn != nil {
			go system.update()
			return e.Next()
		}
		// Start new monitoring session
		if err := sm.AddRecord(e.Record, nil); err != nil {
			e.App.Logger().Error("Error adding record", "err", err)
		}
		_ = deactivateAlerts(e.App, e.Record.Id)
		return e.Next()
	}

	if e.Record.GetBool("suppress_offline_alerts") && !e.Record.Original().GetBool("suppress_offline_alerts") {
		sm.hub.CancelPendingStatusAlerts(e.Record.Id)
		_, _ = alerts.DeleteStatusAlertForSystem(e.App, e.Record.Id)
	} else if !e.Record.GetBool("suppress_offline_alerts") && e.Record.Original().GetBool("suppress_offline_alerts") {
		for _, userID := range e.Record.GetStringSlice("users") {
			if err := alerts.ApplyGlobalAlertPoliciesToSystem(e.App, userID, e.Record.Id); err != nil {
				e.App.Logger().Error("Error reapplying global alert policies", "err", err, "systemID", e.Record.Id, "userID", userID)
			}
		}
	}

	// Handle systems not in manager
	if !ok {
		return sm.AddRecord(e.Record, nil)
	}

	// Trigger system alerts when system comes online
	if newStatus == up {
		if err := sm.hub.HandleSystemAlerts(e.Record, system.data); err != nil {
			e.App.Logger().Error("Error handling system alerts", "err", err)
		}
	}

	// Trigger status change alerts for up/down transitions
	if (newStatus == down && prevStatus == up) || (newStatus == up && prevStatus == down) {
		if err := sm.hub.HandleStatusAlerts(newStatus, e.Record); err != nil {
			e.App.Logger().Error("Error handling status alerts", "err", err)
		}
	}
	return e.Next()
}

// onRecordAfterDeleteSuccess is called after a system record is successfully deleted.
// It removes the system from the manager and cleans up all associated resources.
func (sm *SystemManager) onRecordAfterDeleteSuccess(e *core.RecordEvent) error {
	sm.RemoveSystem(e.Record.Id)
	return e.Next()
}

// AddSystem adds a system to the manager and starts monitoring it.
// It validates required fields, initializes the system context, and starts the update goroutine.
// Returns error if a system with the same ID already exists.
func (sm *SystemManager) AddSystem(sys *System) error {
	if sm.systems.Has(sys.Id) {
		return errSystemExists
	}
	if sm.shuttingDown.Load() {
		return nil
	}
	if sys.Id == "" {
		return errors.New("system missing required fields")
	}

	// Initialize system for monitoring
	sys.manager = sm
	sys.ctx, sys.cancel = sys.getContext()
	sys.data = &system.CombinedData{}
	sm.systems.Set(sys.Id, sys)
	if sm.shuttingDown.Load() {
		_ = sm.RemoveSystem(sys.Id)
		return nil
	}

	// Start monitoring in background
	go sys.StartUpdater()
	return nil
}

// RemoveSystem removes a system from the manager and cleans up all associated resources.
// It cancels the system's context, closes all connections, and removes it from the store.
// Returns an error if the system is not found.
func (sm *SystemManager) RemoveSystem(systemID string) error {
	system, ok := sm.systems.GetOk(systemID)
	if !ok {
		return errors.New("system not found")
	}

	// Stop the update goroutine
	if system.cancel != nil {
		system.cancel()
	}

	// Clean up connection
	system.closeWebSocketConnection()
	sm.systems.Remove(systemID)
	return nil
}

// AddRecord creates a System instance from a database record and adds it to the manager.
// If a system with the same ID already exists, it's removed first to ensure clean state.
// If no system instance is provided, a new one is created.
// This method is typically called when systems are created or their status changes to pending.
func (sm *SystemManager) AddRecord(record *core.Record, system *System) (err error) {
	// Remove existing system to ensure clean state
	if sm.systems.Has(record.Id) {
		_ = sm.RemoveSystem(record.Id)
	}

	// Create new system if none provided
	if system == nil {
		system = sm.NewSystem(record.Id)
	}

	// Populate system from record
	system.Status = record.GetString("status")

	return sm.AddSystem(system)
}

func discardLegacySystemTransportFields(record *core.Record) {
	record.Set("host", nil)
	record.Set("port", nil)
}

// AddWebSocketSystem creates and adds a system with an established WebSocket connection.
// This method is called when an agent connects via WebSocket with valid authentication.
// The system is immediately added to monitoring with the provided connection and version info.
func (sm *SystemManager) AddWebSocketSystem(systemId string, agentVersion semver.Version, wsConn *ws.WsConn, remoteIP string) error {
	systemRecord, err := sm.hub.FindRecordById("systems", systemId)
	if err != nil {
		return err
	}
	sm.resetFailedSmartFetchState(systemId)
	if sm.systems.Has(systemId) {
		_ = sm.RemoveSystem(systemId)
	}

	system := sm.NewSystem(systemId)
	system.WsConn = wsConn
	system.RemoteIP = strings.TrimSpace(remoteIP)
	system.agentVersion = agentVersion

	if err := sm.AddRecord(systemRecord, system); err != nil {
		return err
	}
	return nil
}

// resetFailedSmartFetchState clears only failed SMART cooldown entries so a fresh
// agent reconnect retries SMART discovery immediately after configuration changes.
func (sm *SystemManager) resetFailedSmartFetchState(systemID string) {
	state, ok := sm.smartFetchMap.GetOk(systemID)
	if ok && !state.Successful {
		sm.smartFetchMap.Remove(systemID)
	}
}

// deactivateAlerts finds all triggered alerts for a system and sets them to inactive.
// This is called when a system is paused or goes offline to prevent continued alerts.
func deactivateAlerts(app core.App, systemID string) error {
	// Note: Direct SQL updates don't trigger SSE, so we use the PocketBase API
	// _, err := app.DB().NewQuery(fmt.Sprintf("UPDATE alerts SET triggered = false WHERE system = '%s'", systemID)).Execute()

	alerts, err := app.FindRecordsByFilter("alerts", fmt.Sprintf("system = '%s' && triggered = 1", systemID), "", -1, 0)
	if err != nil {
		return err
	}

	for _, alert := range alerts {
		alert.Set("triggered", false)
		if err := app.SaveNoValidate(alert); err != nil {
			return err
		}
	}
	return nil
}
