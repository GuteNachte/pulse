package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gutenacht.site/pulse/agent"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

type WindowStatus struct {
	Service    string `json:"service"`
	Connection string `json:"connection"`
	HubURL     string `json:"hub_url"`
}

type ConnectResult struct {
	Success bool         `json:"success"`
	Message string       `json:"message"`
	Status  WindowStatus `json:"status"`
}

// GetWindowStatus intentionally reports only the truthful initial state.
// The shared directory is selected by the installer through DATA_DIR. During
// an installed run, the fallback keeps the config window and service aligned
// under the same installation root instead of using per-user AppData.
func (a *App) GetWindowStatus() WindowStatus {
	return a.windowStatus()
}

// RefreshWindowStatus performs the same read as the initial status load and
// also checks the Hub with the locally stored Agent token.
func (a *App) RefreshWindowStatus() WindowStatus {
	return a.windowStatus()
}

func (a *App) windowStatus() WindowStatus {
	service := readAgentServiceStatus()
	credentials, err := readPairingCredentials()
	if err != nil {
		return WindowStatus{Service: service, Connection: "暂未配置连接"}
	}
	return WindowStatus{Service: service, Connection: checkHubConnection(credentials), HubURL: credentials.HubURL}
}

// Connect validates the six-digit long-lived pairing code with the Hub and
// stores only the returned Agent credentials. The original code is never saved.
func (a *App) Connect(hubURL string, pairingCode string) ConnectResult {
	hubURL, err := normalizeHubURL(hubURL)
	if err != nil {
		return connectionFailure("Hub 地址格式不正确，请填写 http:// 或 https:// 开头的完整地址。")
	}
	code := normalizeSixDigitPairingCode(pairingCode)
	if !isSixDigitPairingCode(code) {
		return connectionFailure("机器连接码错误，请填写网页显示的 6 位配对码。")
	}
	dataDir := sharedDataDir()
	credentials, err := agent.PairAgent(hubURL, code, dataDir, "")
	if err != nil {
		return connectionFailure(classifyPairingError(err))
	}
	if err := agent.SavePairingCredentials(dataDir, credentials); err != nil {
		return connectionFailure("连接验证成功，但连接设置未能保存。请使用管理员权限后重试。")
	}
	status := a.windowStatus()
	return ConnectResult{Success: true, Message: "连接成功", Status: status}
}

func connectionFailure(message string) ConnectResult {
	return ConnectResult{Success: false, Message: message}
}

func normalizeHubURL(value string) (string, error) {
	value = strings.TrimRight(strings.TrimSpace(value), "/")
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("invalid hub url")
	}
	return value, nil
}

func normalizeSixDigitPairingCode(value string) string {
	return strings.NewReplacer("-", "", " ", "", "\t", "", "\r", "", "\n", "").Replace(strings.TrimSpace(value))
}

func isSixDigitPairingCode(value string) bool {
	if len(value) != 6 {
		return false
	}
	for _, digit := range value {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return true
}

func classifyPairingError(err error) string {
	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "invalid or expired pairing code"), strings.Contains(message, "invalid pairing code"):
		return "机器连接码错误，请到 Pulse 网页确认当前配对码。"
	case strings.Contains(message, "已绑定其他设备"), strings.Contains(message, "bound to another device"):
		return "机器连接码已绑定其他设备，请先在 Pulse 网页重置配对码。"
	case strings.Contains(message, "配对码状态无效"):
		return "机器连接码已被重置，请到 Pulse 网页查看当前配对码。"
	default:
		return "地址无法访问或 Hub 暂时不可用，请检查 Hub 地址和网络后重试。"
	}
}

type pairingCredentials struct {
	HubURL string `json:"hub_url"`
	Token  string `json:"token"`
}

func readPairingCredentials() (pairingCredentials, error) {
	body, err := os.ReadFile(filepath.Join(sharedDataDir(), "pairing.json"))
	if err != nil {
		return pairingCredentials{}, err
	}
	var credentials pairingCredentials
	if err := json.Unmarshal(body, &credentials); err != nil {
		return pairingCredentials{}, err
	}
	if strings.TrimSpace(credentials.HubURL) == "" || strings.TrimSpace(credentials.Token) == "" {
		return pairingCredentials{}, os.ErrInvalid
	}
	return credentials, nil
}

func checkHubConnection(credentials pairingCredentials) string {
	request, err := http.NewRequest(http.MethodGet, strings.TrimRight(credentials.HubURL, "/")+"/api/pulse/agent-status", nil)
	if err != nil {
		return "连接失败"
	}
	request.Header.Set("X-Token", strings.TrimSpace(credentials.Token))
	request.Header.Set("Accept", "application/json")
	client := http.Client{Timeout: 5 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return "连接失败"
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return "连接失败"
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return "连接失败"
	}
	if strings.TrimSpace(body.Status) == "up" {
		return "连接成功"
	}
	return "连接失败"
}
func sharedDataDir() string {
	if value := os.Getenv("DATA_DIR"); value != "" {
		return value
	}
	exePath, err := os.Executable()
	if err != nil {
		return "data"
	}
	// Installed layout: <root>\bin\agent-config.exe. The service uses this
	// same root through --data-dir, so both processes share credentials.
	return filepath.Join(filepath.Dir(filepath.Dir(exePath)), "data")
}
