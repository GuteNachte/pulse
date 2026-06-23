package agent

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"gutenacht.site/pulse"
)

type PairingCredentials struct {
	HubURL      string `json:"hub_url"`
	AgentID     string `json:"agent_id"`
	AgentSecret string `json:"agent_secret"`
	Token       string `json:"token"`
}

type pairingRequest struct {
	Code          string         `json:"code"`
	Hostname      string         `json:"hostname"`
	Name          string         `json:"name,omitempty"`
	Fingerprint   string         `json:"fingerprint"`
	Port          string         `json:"port,omitempty"`
	ReportedIPs   []string       `json:"reported_ips,omitempty"`
	Platform      string         `json:"platform"`
	Arch          string         `json:"arch"`
	AgentVersion  string         `json:"agent_version"`
	InstallMethod string         `json:"install_method,omitempty"`
	RunMode       string         `json:"run_mode,omitempty"`
	Capabilities  map[string]any `json:"capabilities,omitempty"`
}

func PairAgent(hubURL string, code string, dataDir string, port string) (PairingCredentials, error) {
	if strings.TrimSpace(hubURL) == "" || strings.TrimSpace(code) == "" {
		return PairingCredentials{}, errors.New("hub url and pairing code are required")
	}
	endpoint, err := url.Parse(strings.TrimRight(hubURL, "/"))
	if err != nil {
		return PairingCredentials{}, err
	}
	endpoint.Path = path.Join(endpoint.Path, "/api/pulse/agent-pair")

	hostname, _ := os.Hostname()
	installMethod := detectInstallMethod()
	runMode := detectRunMode()
	req := pairingRequest{
		Code:          code,
		Hostname:      hostname,
		Name:          hostname,
		Fingerprint:   GetFingerprint(dataDir, hostname, ""),
		Port:          port,
		ReportedIPs:   collectPairingReportedIPs(),
		Platform:      runtime.GOOS,
		Arch:          runtime.GOARCH,
		AgentVersion:  pulse.Version,
		InstallMethod: installMethod,
		RunMode:       runMode,
		Capabilities:  buildPairingCapabilities(installMethod, runMode),
	}
	body, err := json.Marshal(req)
	if err != nil {
		return PairingCredentials{}, err
	}
	client := http.Client{Timeout: 15 * time.Second}
	resp, err := client.Post(endpoint.String(), "application/json", bytes.NewReader(body))
	if err != nil {
		return PairingCredentials{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return PairingCredentials{}, fmt.Errorf("pairing failed: hub returned %s", resp.Status)
	}
	var credentials PairingCredentials
	if err := json.NewDecoder(resp.Body).Decode(&credentials); err != nil {
		return PairingCredentials{}, err
	}
	if credentials.Token == "" || credentials.AgentID == "" || credentials.AgentSecret == "" {
		return PairingCredentials{}, errors.New("pairing response missing credentials")
	}
	if credentials.HubURL == "" {
		credentials.HubURL = strings.TrimRight(hubURL, "/")
	}
	return credentials, nil
}

func buildPairingCapabilities(installMethod string, runMode string) map[string]any {
	return map[string]any{
		"platform":       runtime.GOOS,
		"arch":           runtime.GOARCH,
		"agent_version":  pulse.Version,
		"install_method": strings.TrimSpace(installMethod),
		"run_mode":       strings.TrimSpace(runMode),
		"agent_profile":  detectAgentProfile(installMethod, runMode),
		"privilege":      detectPrivilege(),
	}
}

func collectPairingReportedIPs() []string {
	addresses, err := net.InterfaceAddrs()
	if err != nil {
		return nil
	}
	seen := map[string]struct{}{}
	ips := make([]string, 0, len(addresses))
	for _, address := range addresses {
		var ip net.IP
		switch typed := address.(type) {
		case *net.IPNet:
			ip = typed.IP
		case *net.IPAddr:
			ip = typed.IP
		default:
			continue
		}
		if ip == nil || ip.IsLoopback() || ip.IsUnspecified() || ip.IsMulticast() {
			continue
		}
		value := ip.String()
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		ips = append(ips, value)
	}
	sort.Strings(ips)
	if len(ips) > 16 {
		return ips[:16]
	}
	return ips
}

func SavePairingCredentials(dataDir string, credentials PairingCredentials) error {
	if dataDir == "" {
		return errors.New("data directory is required")
	}
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dataDir, "token"), []byte(credentials.Token), 0o600); err != nil {
		return err
	}
	env := strings.Join([]string{
		"HUB_URL=" + credentials.HubURL,
		"TOKEN=" + credentials.Token,
		"AGENT_ID=" + credentials.AgentID,
		"AGENT_SECRET=" + credentials.AgentSecret,
		"",
	}, "\n")
	if err := os.WriteFile(filepath.Join(dataDir, "paired.env"), []byte(env), 0o600); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(credentials, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dataDir, "pairing.json"), raw, 0o600)
}
