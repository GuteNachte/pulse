package hub

import (
	"net"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/common"
)

const (
	autoAssetSourceHubLocalAgent      = "hub_local_agent"
	autoAssetSourceUniversalToken     = "universal_token_agent"
	autoAssetCreatedFromAgentConnect  = "agent_connect"
	autoAssetDefaultType              = "physical_host"
	autoAssetDefaultStatus            = "active"
	autoAssetLocalRole                = "Hub 所在机器"
	autoAssetUniversalTokenAgentRole  = "Agent 自动接入主机"
	autoAssetLocalNotes               = "由 Hub 同机 Agent 自动创建的最小资产档案，可在资产中心补充长期信息。"
	autoAssetUniversalTokenAgentNotes = "由通用 Token Agent 自动创建的最小资产档案，可在资产中心补充长期信息。"
)

func (h *Hub) ensureSystemAssetBinding(record *core.Record, userID string, agentFingerprint common.FingerprintResponse, remoteIP string, source string) (string, error) {
	if record == nil {
		return "", nil
	}
	if assetID := strings.TrimSpace(record.GetString("asset")); assetID != "" {
		if _, err := h.FindRecordById("assets", assetID); err == nil {
			return assetID, nil
		}
	}

	assetID, err := h.createAutomaticSystemAsset(userID, agentFingerprint, remoteIP, source)
	if err != nil {
		return "", err
	}
	record.Set("asset", assetID)
	return assetID, nil
}

func firstSystemUserID(record *core.Record) string {
	if record == nil {
		return ""
	}
	for _, userID := range record.GetStringSlice("users") {
		if userID = strings.TrimSpace(userID); userID != "" {
			return userID
		}
	}
	return ""
}

func (h *Hub) createAutomaticSystemAsset(userID string, agentFingerprint common.FingerprintResponse, remoteIP string, source string) (string, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return "", nil
	}
	collection, err := h.FindCachedCollectionByNameOrId("assets")
	if err != nil {
		return "", err
	}

	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("name", automaticSystemAssetName(agentFingerprint, remoteIP))
	record.Set("type", autoAssetDefaultType)
	record.Set("status", autoAssetDefaultStatus)
	record.Set("role", automaticSystemAssetRole(source))
	record.Set("notes", automaticSystemAssetNotes(source))
	managementIP := automaticSystemAssetManagementIP(remoteIP)
	if managementIP != "" {
		record.Set("management_ip", managementIP)
	}
	record.Set("metadata", map[string]any{
		"auto_created":        true,
		"auto_created_by":     source,
		"created_from":        autoAssetCreatedFromAgentConnect,
		"agent_name":          strings.TrimSpace(agentFingerprint.Name),
		"agent_hostname":      strings.TrimSpace(agentFingerprint.Hostname),
		"fingerprint_summary": summarizeFingerprint(agentFingerprint.Fingerprint),
		"remote_ip":           strings.TrimSpace(remoteIP),
	})

	if err := h.Save(record); err != nil {
		return "", err
	}
	if managementIP != "" {
		if err := h.createAutomaticSystemAssetInterface(userID, record.Id, managementIP, source); err != nil {
			return "", err
		}
	}
	return record.Id, nil
}

func (h *Hub) createAutomaticSystemAssetInterface(userID string, assetID string, managementIP string, source string) error {
	collection, err := h.FindCachedCollectionByNameOrId("asset_interfaces")
	if err != nil {
		return err
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("asset", assetID)
	record.Set("name", "Agent 接入地址")
	record.Set("kind", "management")
	record.Set("ipv4", managementIP)
	record.Set("connected", true)
	record.Set("primary", true)
	record.Set("source", "agent")
	record.Set("metadata", map[string]any{
		"auto_created":    true,
		"auto_created_by": source,
		"created_from":    autoAssetCreatedFromAgentConnect,
	})
	return h.Save(record)
}

func automaticSystemAssetName(agentFingerprint common.FingerprintResponse, remoteIP string) string {
	name := strings.TrimSpace(agentFingerprint.Name)
	if name == "" || name == "本机" {
		name = strings.TrimSpace(agentFingerprint.Hostname)
	}
	if name == "" || name == "本机" {
		name = strings.TrimSpace(remoteIP)
	}
	if name == "" {
		return "自动接入主机"
	}
	return name
}

func automaticSystemAssetRole(source string) string {
	if source == autoAssetSourceHubLocalAgent {
		return autoAssetLocalRole
	}
	return autoAssetUniversalTokenAgentRole
}

func automaticSystemAssetNotes(source string) string {
	if source == autoAssetSourceHubLocalAgent {
		return autoAssetLocalNotes
	}
	return autoAssetUniversalTokenAgentNotes
}

func automaticSystemAssetManagementIP(remoteIP string) string {
	remoteIP = strings.TrimSpace(remoteIP)
	if remoteIP == "" {
		return ""
	}
	ip := net.ParseIP(remoteIP)
	if ip == nil || ip.IsLoopback() {
		return ""
	}
	return remoteIP
}
