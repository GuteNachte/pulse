package systems

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/subscriptions"
	"gutenacht.site/pulse/internal/common"
)

type subscriptionInfo struct {
	subscription     string
	systemID         string
	connectedClients int
	userIDs          map[string]int
}

// onRealtimeConnectRequest handles client connection events for realtime subscriptions.
// It cleans up existing subscriptions when a client connects or disconnects.
func (sm *SystemManager) onRealtimeConnectRequest(e *core.RealtimeConnectRequestEvent) error {
	userID := realtimeClientUserID(e.Client)
	if err := e.Next(); err != nil {
		return err
	}
	for topic := range e.Client.Subscriptions() {
		sm.removeRealtimeSubscription(topic, userID)
	}
	return nil
}

// onRealtimeSubscribeRequest handles client subscription events for realtime metrics.
// The module gate runs in the same hook chain before the default PocketBase handler.
func (sm *SystemManager) onRealtimeSubscribeRequest(e *core.RealtimeSubscribeRequestEvent) error {
	oldSubscriptions := e.Client.Subscriptions()
	userID := realtimeRecordUserID(e.Auth)
	if err := e.Next(); err != nil {
		return err
	}
	newSubscriptions := e.Client.Subscriptions()

	for topic, options := range newSubscriptions {
		if _, existed := oldSubscriptions[topic]; existed || !isRealtimeMetricsTopic(topic) {
			continue
		}
		sm.registerRealtimeSubscription(options.Query["system"], topic, userID)
	}
	for topic := range oldSubscriptions {
		if _, remains := newSubscriptions[topic]; !remains {
			sm.removeRealtimeSubscription(topic, userID)
		}
	}

	return nil
}

func isRealtimeMetricsTopic(subscription string) bool {
	topic := strings.TrimSpace(subscription)
	if index := strings.IndexByte(topic, '?'); index >= 0 {
		topic = topic[:index]
	}
	return topic == "rt_metrics"
}

func realtimeRecordUserID(record *core.Record) string {
	if record == nil {
		return ""
	}
	return strings.TrimSpace(record.Id)
}

func realtimeClientUserID(client subscriptions.Client) string {
	if client == nil {
		return ""
	}
	authRecord, _ := client.Get(apis.RealtimeClientAuthKey).(*core.Record)
	return realtimeRecordUserID(authRecord)
}

func (sm *SystemManager) registerRealtimeSubscription(systemID, topic, userID string) {
	systemID = strings.TrimSpace(systemID)
	if systemID == "" || !isRealtimeMetricsTopic(topic) {
		return
	}

	sm.realtimeMutex.Lock()
	info := sm.activeSubscriptions[topic]
	if info == nil {
		info = &subscriptionInfo{
			subscription: topic,
			systemID:     systemID,
			userIDs:      make(map[string]int),
		}
		sm.activeSubscriptions[topic] = info
	}
	info.connectedClients++
	info.userIDs[userID]++
	startWorker := !sm.workerRunning
	var stopChan chan struct{}
	if startWorker {
		sm.workerRunning = true
		stopChan = make(chan struct{})
		sm.tickerStopChan = stopChan
	}
	sm.realtimeMutex.Unlock()

	if startWorker {
		go sm.startRealtimeWorker(stopChan)
	}
}

// DisableRealtimeForUser immediately removes metrics subscriptions belonging to a user.
// This is called when the client-monitoring module is switched off.
func (sm *SystemManager) DisableRealtimeForUser(userID string) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}

	for _, client := range sm.hub.SubscriptionsBroker().Clients() {
		if realtimeClientUserID(client) != userID {
			continue
		}
		for topic := range client.Subscriptions("rt_metrics") {
			client.Unsubscribe(topic)
			sm.removeRealtimeSubscription(topic, userID)
		}
	}
}

// checkSubscriptions stops the realtime worker when no clients are listening.
func (sm *SystemManager) checkSubscriptions() {
	sm.realtimeMutex.Lock()
	defer sm.realtimeMutex.Unlock()
	sm.stopRealtimeWorkerIfIdleLocked()
}

func (sm *SystemManager) stopRealtimeWorkerIfIdleLocked() {
	if !sm.workerRunning || len(sm.activeSubscriptions) > 0 {
		return
	}
	if sm.tickerStopChan != nil {
		close(sm.tickerStopChan)
		sm.tickerStopChan = nil
	}
	sm.workerRunning = false
}

// removeRealtimeSubscription removes one client's metrics subscription.
func (sm *SystemManager) removeRealtimeSubscription(subscription, userID string) {
	if !isRealtimeMetricsTopic(subscription) {
		return
	}

	sm.realtimeMutex.Lock()
	defer sm.realtimeMutex.Unlock()
	info := sm.activeSubscriptions[subscription]
	if info == nil {
		return
	}
	if info.connectedClients > 0 {
		info.connectedClients--
	}
	if count := info.userIDs[userID]; count > 1 {
		info.userIDs[userID] = count - 1
	} else {
		delete(info.userIDs, userID)
	}
	if info.connectedClients == 0 {
		delete(sm.activeSubscriptions, subscription)
	}
	sm.stopRealtimeWorkerIfIdleLocked()
}

// startRealtimeWorker runs the main loop for fetching realtime data from agents.
func (sm *SystemManager) startRealtimeWorker(stopChan chan struct{}) {
	defer func() {
		sm.realtimeMutex.Lock()
		if sm.tickerStopChan == stopChan {
			sm.tickerStopChan = nil
			sm.workerRunning = false
		}
		sm.realtimeMutex.Unlock()
	}()

	sm.fetchRealtimeDataAndNotify()
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stopChan:
			return
		case <-ticker.C:
			if !sm.hasActiveRealtimeSubscriptions() {
				return
			}
			sm.fetchRealtimeDataAndNotify()
		}
	}
}

func (sm *SystemManager) hasActiveRealtimeSubscriptions() bool {
	sm.realtimeMutex.Lock()
	defer sm.realtimeMutex.Unlock()
	return len(sm.activeSubscriptions) > 0
}

type realtimeFetchTarget struct {
	systemID     string
	subscription string
}

func (sm *SystemManager) realtimeFetchTargets() []realtimeFetchTarget {
	sm.realtimeMutex.Lock()
	defer sm.realtimeMutex.Unlock()

	targets := make([]realtimeFetchTarget, 0, len(sm.activeSubscriptions))
	for _, info := range sm.activeSubscriptions {
		targets = append(targets, realtimeFetchTarget{
			systemID:     info.systemID,
			subscription: info.subscription,
		})
	}
	return targets
}

// fetchRealtimeDataAndNotify fetches realtime data for all active subscriptions and notifies clients.
func (sm *SystemManager) fetchRealtimeDataAndNotify() {
	for _, target := range sm.realtimeFetchTargets() {
		system, err := sm.GetSystem(target.systemID)
		if err != nil {
			continue
		}
		go func(system *System, subscription string) {
			data, err := system.fetchDataFromAgent(common.DataRequestOptions{
				CacheTimeMs:       1000,
				MonitoredServices: system.getMonitoredServiceNames(),
			})
			if err != nil {
				return
			}
			dataBytes, err := json.Marshal(data)
			if err == nil {
				_ = notify(sm.hub, subscription, dataBytes)
			}
		}(system, target.subscription)
	}
}

// notify broadcasts realtime data to all clients subscribed to a specific subscription.
func notify(app core.App, subscription string, data []byte) error {
	message := subscriptions.Message{
		Name: subscription,
		Data: data,
	}
	for _, client := range app.SubscriptionsBroker().Clients() {
		if !client.HasSubscription(subscription) {
			continue
		}
		client.Send(message)
	}
	return nil
}
