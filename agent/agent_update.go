package agent

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/blang/semver"
	"gutenacht.site/pulse"
	"gutenacht.site/pulse/internal/entities/system"
)

type agentUpdateRequest struct {
	releaseID   string
	version     string
	channel     string
	platform    string
	arch        string
	downloadURL string
	checksum    string
}

func parseAgentUpdateRequest(params map[string]string) (agentUpdateRequest, error) {
	req := agentUpdateRequest{
		releaseID:   strings.TrimSpace(params["release_id"]),
		version:     strings.TrimSpace(params["version"]),
		channel:     strings.TrimSpace(params["channel"]),
		platform:    strings.TrimSpace(params["platform"]),
		arch:        strings.TrimSpace(params["arch"]),
		downloadURL: strings.TrimSpace(params["download_url"]),
		checksum:    strings.TrimSpace(params["checksum"]),
	}
	for key := range params {
		switch key {
		case "release_id", "version", "channel", "platform", "arch", "download_url", "checksum":
		default:
			return req, fmt.Errorf("unsupported agent update parameter: %s", key)
		}
	}
	if req.version == "" {
		return req, fmt.Errorf("version is required")
	}
	if strings.ContainsAny(req.version, " \t\r\n/\\") || len(req.version) > 64 {
		return req, fmt.Errorf("version is invalid")
	}
	if req.downloadURL == "" {
		return req, fmt.Errorf("download_url is required")
	}
	if strings.Contains(req.downloadURL, "://") {
		if !isHTTPAgentUpdateURL(req.downloadURL) {
			return req, fmt.Errorf("download_url must be http or https")
		}
	} else if !isAgentUpdateImageReference(req.downloadURL) {
		return req, fmt.Errorf("download_url image reference is invalid")
	}
	if req.channel != "" && req.channel != "stable" && req.channel != "beta" && req.channel != "dev" {
		return req, fmt.Errorf("channel must be stable, beta, or dev")
	}
	if req.checksum != "" {
		if _, err := normalizeSHA256Checksum(req.checksum); err != nil {
			return req, err
		}
	}
	return req, nil
}

func isHTTPAgentUpdateURL(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	return err == nil && (parsed.Scheme == "https" || parsed.Scheme == "http") && parsed.Host != ""
}

func isAgentUpdateImageReference(value string) bool {
	value = strings.TrimSpace(value)
	return value != "" && len(value) <= 512 && !strings.ContainsAny(value, " \t\r\n") && !strings.HasPrefix(value, "-")
}

func agentAlreadyAtOrAboveTarget(targetVersion string) bool {
	current, currentErr := parseAgentUpdateVersion(pulse.Version)
	target, targetErr := parseAgentUpdateVersion(targetVersion)
	return currentErr == nil && targetErr == nil && current.GTE(target)
}

func parseAgentUpdateVersion(value string) (semver.Version, error) {
	value = strings.TrimSpace(strings.TrimPrefix(strings.ToLower(value), "v"))
	parts := strings.Split(value, ".")
	for len(parts) < 3 {
		parts = append(parts, "0")
	}
	return semver.Parse(strings.Join(parts, "."))
}

func normalizeSHA256Checksum(value string) (string, error) {
	value = strings.TrimSpace(strings.ToLower(value))
	value = strings.TrimPrefix(value, "sha256:")
	if len(value) != sha256.Size*2 {
		return "", fmt.Errorf("checksum must be a sha256 hex digest")
	}
	if _, err := hex.DecodeString(value); err != nil {
		return "", fmt.Errorf("checksum must be a sha256 hex digest")
	}
	return value, nil
}

func verifySHA256(data []byte, expected string) error {
	expected, err := normalizeSHA256Checksum(expected)
	if err != nil {
		return err
	}
	sum := sha256.Sum256(data)
	actual := hex.EncodeToString(sum[:])
	if actual != expected {
		return fmt.Errorf("checksum mismatch")
	}
	return nil
}

func agentUpdateResultPath(dataDir string) string {
	if strings.TrimSpace(dataDir) == "" {
		dataDir = os.TempDir()
	}
	return filepath.Join(dataDir, ".pulse_agent_update", "update-result.json")
}

func readLastAgentUpdateResult(dataDir string) *system.AgentUpdateResult {
	body, err := os.ReadFile(agentUpdateResultPath(dataDir))
	if err != nil {
		return nil
	}
	var result system.AgentUpdateResult
	if err := json.Unmarshal(body, &result); err != nil {
		return nil
	}
	if result.Status != "succeeded" && result.Status != "failed" {
		return nil
	}
	return &result
}

func writeAgentUpdateResult(dataDir string, result *system.AgentUpdateResult) error {
	path := agentUpdateResultPath(dataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	body, err := json.Marshal(result)
	if err != nil {
		return err
	}
	return os.WriteFile(path, body, 0600)
}
