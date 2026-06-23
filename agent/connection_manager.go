package agent

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"gutenacht.site/pulse/agent/health"
	"gutenacht.site/pulse/agent/utils"
	"gutenacht.site/pulse/internal/entities/system"
)

// ConnectionManager manages the WebSocket connection state and events for the agent.
type ConnectionManager struct {
	agent          *Agent               // Reference to the parent agent
	State          ConnectionState      // Current connection state
	eventChan      chan ConnectionEvent // Channel for connection events
	wsClient       *WebSocketClient     // WebSocket client for hub communication
	wsTicker       *time.Ticker         // Ticker for WebSocket connection attempts
	isConnecting   bool                 // Prevents multiple simultaneous reconnection attempts
	cancel         context.CancelFunc   // Stops the connection manager loop
	ConnectionType system.ConnectionType
}

// ConnectionState represents the current connection state of the agent.
type ConnectionState uint8

// ConnectionEvent represents connection-related events that can occur.
type ConnectionEvent uint8

// Connection states
const (
	Disconnected       ConnectionState = iota // No active connection
	WebSocketConnected                        // Connected via WebSocket
)

// Connection events
const (
	WebSocketConnect    ConnectionEvent = iota // WebSocket connection established
	WebSocketDisconnect                        // WebSocket connection lost
)

const wsTickerInterval = 10 * time.Second

// newConnectionManager creates a new connection manager for the given agent.
func newConnectionManager(agent *Agent) *ConnectionManager {
	cm := &ConnectionManager{
		agent: agent,
		State: Disconnected,
	}
	return cm
}

// startWsTicker starts or resets the WebSocket connection attempt ticker.
func (c *ConnectionManager) startWsTicker() {
	if c.wsTicker == nil {
		c.wsTicker = time.NewTicker(wsTickerInterval)
	} else {
		c.wsTicker.Reset(wsTickerInterval)
	}
}

// stopWsTicker stops the WebSocket connection attempt ticker.
func (c *ConnectionManager) stopWsTicker() {
	if c.wsTicker != nil {
		c.wsTicker.Stop()
	}
}

// Start begins connection attempts and enters the main event loop.
// It handles connection events, periodic health updates, and graceful shutdown.
func (c *ConnectionManager) Start() error {
	if c.eventChan != nil {
		return errors.New("already started")
	}

	wsClient, err := newWebSocketClient(c.agent)
	if err != nil {
		slog.Warn("Error creating WebSocket client", "err", err)
	}
	c.wsClient = wsClient

	c.eventChan = make(chan ConnectionEvent, 1)

	ctx, cancel := context.WithCancel(context.Background())
	c.cancel = cancel
	defer func() {
		cancel()
		c.cancel = nil
		c.eventChan = nil
	}()

	// signal handling for shutdown
	sigCtx, stopSignals := signal.NotifyContext(ctx, syscall.SIGINT, syscall.SIGTERM)
	defer stopSignals()

	c.startWsTicker()
	c.connect()

	// update health status immediately and every 90 seconds
	_ = health.Update()
	healthTicker := time.Tick(90 * time.Second)

	for {
		select {
		case connectionEvent := <-c.eventChan:
			c.handleEvent(connectionEvent)
		case <-c.wsTicker.C:
			_ = c.startWebSocketConnection()
		case <-healthTicker:
			_ = health.Update()
		case <-sigCtx.Done():
			slog.Info("Shutting down", "cause", context.Cause(sigCtx))
			return c.stop()
		}
	}
}

// Stop requests a graceful shutdown of the connection manager loop.
func (c *ConnectionManager) Stop() error {
	if c.cancel != nil {
		c.cancel()
		return nil
	}
	return c.stop()
}

func (c *ConnectionManager) stop() error {
	c.closeWebSocket()
	return health.CleanUp()
}

// handleEvent processes connection events and updates the connection state accordingly.
func (c *ConnectionManager) handleEvent(event ConnectionEvent) {
	switch event {
	case WebSocketConnect:
		c.handleStateChange(WebSocketConnected)
	case WebSocketDisconnect:
		if c.State == WebSocketConnected {
			c.handleStateChange(Disconnected)
		}
	}
}

// handleStateChange updates the connection state and performs necessary actions
// based on the new state, including stopping services and initiating reconnections.
func (c *ConnectionManager) handleStateChange(newState ConnectionState) {
	if c.State == newState {
		return
	}
	c.State = newState
	switch newState {
	case WebSocketConnected:
		slog.Info("WebSocket connected", "host", c.wsClient.hubURL.Host)
		c.ConnectionType = system.ConnectionTypeWebSocket
		c.stopWsTicker()
		c.isConnecting = false
	case Disconnected:
		c.ConnectionType = system.ConnectionTypeNone
		if c.isConnecting {
			// Already handling reconnection, avoid duplicate attempts
			return
		}
		c.isConnecting = true
		slog.Warn("Disconnected from hub")
		// make sure old ws connection is closed
		c.closeWebSocket()
		// reconnect
		go c.connect()
	}
}

// connect attempts a WebSocket connection and keeps retrying until the hub is available.
func (c *ConnectionManager) connect() {
	c.isConnecting = true
	defer func() {
		c.isConnecting = false
	}()

	if c.wsClient != nil && time.Since(c.wsClient.lastConnectAttempt) < 5*time.Second {
		time.Sleep(5 * time.Second)
	}

	err := c.startWebSocketConnection()
	if err != nil {
		if shouldExitOnErr(err) {
			time.Sleep(2 * time.Second) // prevent tight restart loop
			_ = c.stop()
			os.Exit(1)
		}
		if c.State == Disconnected {
			c.startWsTicker()
		}
	}
}

// startWebSocketConnection attempts to establish a WebSocket connection to the hub.
func (c *ConnectionManager) startWebSocketConnection() error {
	if c.State != Disconnected {
		return errors.New("already connected")
	}
	if c.wsClient == nil {
		return errors.New("WebSocket client not initialized")
	}
	if time.Since(c.wsClient.lastConnectAttempt) < 5*time.Second {
		return errors.New("already connecting")
	}

	err := c.wsClient.Connect()
	if err != nil {
		slog.Warn("WebSocket connection failed", "err", err)
		c.closeWebSocket()
	}
	return err
}

// closeWebSocket closes the WebSocket connection if it exists.
func (c *ConnectionManager) closeWebSocket() {
	if c.wsClient != nil {
		c.wsClient.Close()
	}
}

// shouldExitOnErr checks if the error is a DNS resolution failure and if the
// EXIT_ON_DNS_ERROR env var is set. https://gutenacht.site/pulse/issues/1924.
func shouldExitOnErr(err error) bool {
	if val, _ := utils.GetEnv("EXIT_ON_DNS_ERROR"); val == "true" {
		if opErr, ok := errors.AsType[*net.OpError](err); ok {
			return strings.Contains(opErr.Err.Error(), "lookup")
		}
	}
	return false
}
