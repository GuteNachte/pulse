//go:build linux

package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"runtime"
	"strings"
	"time"

	"gutenacht.site/pulse/internal/common"
	"gutenacht.site/pulse/internal/entities/system"
)

const linuxAgentUpdateTimeout = 5 * time.Minute

func (a *Agent) controlAgentUpdate(params map[string]string) common.OperationResult {
	req, err := parseAgentUpdateRequest(params)
	if err != nil {
		return common.OperationResult{Status: "denied", Message: err.Error()}
	}
	if req.platform != "" && req.platform != "all" && req.platform != "linux" {
		return common.OperationResult{Status: "denied", Message: "release platform does not match this agent"}
	}
	if req.arch != "" && req.arch != runtime.GOARCH {
		return common.OperationResult{Status: "denied", Message: "release architecture does not match this agent"}
	}
	if agentAlreadyAtOrAboveTarget(req.version) {
		result := &system.AgentUpdateResult{
			Status:  "succeeded",
			Version: req.version,
			Message: "Agent is already at the latest version.",
			Time:    time.Now().UTC().Format(time.RFC3339),
		}
		_ = writeAgentUpdateResult(a.dataDir, result)
		return common.OperationResult{Status: "succeeded", Message: "Agent 已经是最新版。"}
	}
	if !isAgentUpdateImageReference(req.downloadURL) {
		return common.OperationResult{Status: "denied", Message: "Linux container update requires a Docker image reference"}
	}
	if !isContainerRunMode(detectInstallMethod(), detectRunMode()) {
		return common.OperationResult{Status: "unsupported", Message: "Linux self-update is only available for container agents"}
	}
	if a.dockerManager == nil || !a.dockerManager.available() {
		return common.OperationResult{Status: "unsupported", Message: "Docker / Podman socket is not available on this agent"}
	}

	ctx, cancel := context.WithTimeout(context.Background(), linuxAgentUpdateTimeout)
	current, err := a.dockerManager.inspectCurrentContainer(ctx)
	cancel()
	if err != nil {
		return common.OperationResult{Status: "unsupported", Message: err.Error()}
	}

	go a.applyLinuxContainerAgentUpdate(req, current)
	return common.OperationResult{
		Status:  "succeeded",
		Message: fmt.Sprintf("agent container update to %s staged; image pull and recreate started", req.version),
	}
}

func (a *Agent) applyLinuxContainerAgentUpdate(req agentUpdateRequest, current *dockerContainerInspect) {
	result := &system.AgentUpdateResult{
		Status:  "failed",
		Version: req.version,
		Time:    time.Now().UTC().Format(time.RFC3339),
	}
	defer func() {
		if recovered := recover(); recovered != nil {
			result.Status = "failed"
			result.Message = fmt.Sprintf("agent container update panicked: %v", recovered)
			result.Time = time.Now().UTC().Format(time.RFC3339)
			_ = writeAgentUpdateResult(a.dataDir, result)
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), linuxAgentUpdateTimeout)
	defer cancel()

	if err := a.dockerManager.pullImageReference(ctx, req.downloadURL); err != nil {
		result.Message = fmt.Sprintf("image pull failed: %v", err)
		_ = writeAgentUpdateResult(a.dataDir, result)
		return
	}
	cleanupOld, err := a.dockerManager.recreateCurrentContainer(ctx, current, req.downloadURL)
	if err != nil {
		result.Message = fmt.Sprintf("container recreate failed: %v", err)
		_ = writeAgentUpdateResult(a.dataDir, result)
		return
	}

	result.Status = "succeeded"
	result.Message = "Agent container recreated with target image."
	result.Time = time.Now().UTC().Format(time.RFC3339)
	_ = writeAgentUpdateResult(a.dataDir, result)
	if cleanupOld != nil {
		_ = cleanupOld(context.Background())
	}
}

type dockerContainerInspect struct {
	ID               string         `json:"Id"`
	Name             string         `json:"Name"`
	Config           map[string]any `json:"Config"`
	HostConfig       map[string]any `json:"HostConfig"`
	NetworkingConfig map[string]any `json:"NetworkingConfig"`
}

func (dm *dockerManager) inspectCurrentContainer(ctx context.Context) (*dockerContainerInspect, error) {
	hostname, _ := os.Hostname()
	hostname = strings.TrimSpace(hostname)
	candidates := []string{}
	if hostname != "" {
		candidates = append(candidates, hostname)
	}
	candidates = append(candidates, "pulse-agent")

	var lastErr error
	for _, candidate := range candidates {
		current, err := dm.inspectContainerForUpdate(ctx, candidate)
		if err == nil {
			return current, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return nil, fmt.Errorf("cannot identify current agent container: %v", lastErr)
	}
	return nil, fmt.Errorf("cannot identify current agent container")
}

func (dm *dockerManager) inspectContainerForUpdate(ctx context.Context, containerID string) (*dockerContainerInspect, error) {
	endpoint, err := buildDockerContainerEndpoint(containerID, "json", nil)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := dm.dockerControlClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("container inspect request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var current dockerContainerInspect
	if err := json.NewDecoder(resp.Body).Decode(&current); err != nil {
		return nil, err
	}
	if strings.TrimSpace(current.ID) == "" {
		return nil, fmt.Errorf("container inspect response is missing id")
	}
	return &current, nil
}

func (dm *dockerManager) recreateCurrentContainer(ctx context.Context, current *dockerContainerInspect, image string) (func(context.Context) error, error) {
	if current == nil || strings.TrimSpace(current.ID) == "" {
		return nil, fmt.Errorf("current container is unknown")
	}
	name := strings.Trim(strings.TrimSpace(current.Name), "/")
	if name == "" {
		name = "pulse-agent"
	}
	body, err := buildContainerCreateBody(current, image)
	if err != nil {
		return nil, err
	}
	if err := dm.renameContainer(ctx, current.ID, fmt.Sprintf("%s-old-%d", name, time.Now().Unix())); err != nil {
		return nil, err
	}
	createdID, err := dm.createContainer(ctx, name, body)
	if err != nil {
		_ = dm.renameContainer(ctx, current.ID, name)
		return nil, err
	}
	if err := dm.startContainer(ctx, createdID); err != nil {
		_ = dm.removeContainer(ctx, createdID)
		_ = dm.renameContainer(ctx, current.ID, name)
		return nil, err
	}
	return func(cleanupCtx context.Context) error {
		ctx, cancel := context.WithTimeout(cleanupCtx, 30*time.Second)
		defer cancel()
		return dm.removeContainer(ctx, current.ID)
	}, nil
}

func buildContainerCreateBody(current *dockerContainerInspect, image string) ([]byte, error) {
	body := copyStringAnyMap(current.Config)
	body["Image"] = image
	delete(body, "Hostname")
	body["HostConfig"] = current.HostConfig
	if len(current.NetworkingConfig) > 0 {
		body["NetworkingConfig"] = current.NetworkingConfig
	}
	return json.Marshal(body)
}

func copyStringAnyMap(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func (dm *dockerManager) renameContainer(ctx context.Context, containerID string, name string) error {
	query := url.Values{"name": []string{name}}
	endpoint, err := buildDockerContainerEndpoint(containerID, "rename", query)
	if err != nil {
		return err
	}
	return dm.postDockerNoBody(ctx, endpoint, http.StatusNoContent)
}

func (dm *dockerManager) createContainer(ctx context.Context, name string, body []byte) (string, error) {
	endpoint := (&url.URL{
		Scheme:   "http",
		Host:     "localhost",
		Path:     "/containers/create",
		RawQuery: url.Values{"name": []string{name}}.Encode(),
	}).String()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := dm.dockerControlClient().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("container create request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var created struct {
		ID string `json:"Id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&created); err != nil {
		return "", err
	}
	if strings.TrimSpace(created.ID) == "" {
		return "", fmt.Errorf("container create response is missing id")
	}
	return created.ID, nil
}

func (dm *dockerManager) startContainer(ctx context.Context, containerID string) error {
	endpoint, err := buildDockerContainerEndpoint(containerID, "start", nil)
	if err != nil {
		return err
	}
	return dm.postDockerNoBody(ctx, endpoint, http.StatusNoContent, http.StatusNotModified)
}

func (dm *dockerManager) removeContainer(ctx context.Context, containerID string) error {
	if err := validateContainerID(containerID); err != nil {
		return err
	}
	query := url.Values{"force": []string{"1"}}
	endpoint := (&url.URL{
		Scheme:   "http",
		Host:     "localhost",
		Path:     fmt.Sprintf("/containers/%s", url.PathEscape(containerID)),
		RawQuery: query.Encode(),
	}).String()
	return dm.deleteDockerNoBody(ctx, endpoint, http.StatusNoContent, http.StatusNotFound)
}

func (dm *dockerManager) deleteDockerNoBody(ctx context.Context, endpoint string, expected ...int) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := dm.dockerControlClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	for _, code := range expected {
		if resp.StatusCode == code {
			return nil
		}
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("docker request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
}

func (dm *dockerManager) postDockerNoBody(ctx context.Context, endpoint string, expected ...int) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return err
	}
	resp, err := dm.dockerControlClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	for _, code := range expected {
		if resp.StatusCode == code {
			return nil
		}
	}
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	return fmt.Errorf("docker request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
}
