package hub

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"os"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	publicIPv4DetectorURL = "https://api4.ipify.org"
	publicIPv6DetectorURL = "https://api6.ipify.org"
	internetAddressRefreshSchedule = "*/30 * * * *"
	activeInternetAssetFilter = "type = 'internet' && status = 'active'"
)

type publicInternetAddresses struct {
	IPv4          string `json:"ipv4"`
	IPv6          string `json:"ipv6"`
	IPv4Error     string `json:"ipv4_error,omitempty"`
	IPv6Error     string `json:"ipv6_error,omitempty"`
	IPv4Candidate string `json:"ipv4_candidate,omitempty"`
	IPv6Candidate string `json:"ipv6_candidate,omitempty"`
}

func (h *Hub) refreshInternetPublicAddresses(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	if asset.GetString("type") != "internet" {
		return e.BadRequestError("仅互联网接入资源可以检测公网地址。", nil)
	}

	result, err := h.refreshInternetAssetAddresses(e.Request.Context(), asset)
	if err != nil {
		return e.InternalServerError("无法保存公网地址检测结果。", err)
	}
	return e.JSON(http.StatusOK, result)
}

func (h *Hub) confirmInternetPublicAddress(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	if asset.GetString("type") != "internet" {
		return e.BadRequestError("仅互联网接入资源可以确认公网地址。", nil)
	}
	var request struct {
		Protocol string `json:"protocol"`
	}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("确认参数无效。", err)
	}
	addressKey := ""
	switch strings.ToLower(strings.TrimSpace(request.Protocol)) {
	case "ipv4":
		addressKey = "public_ipv4"
	case "ipv6":
		addressKey = "public_ipv6"
	default:
		return e.BadRequestError("协议必须是 ipv4 或 ipv6。", nil)
	}
	metadata := recordJSONMap(asset, "metadata")
	current := metadataString(metadata, addressKey)
	candidateKey := addressKey + "_candidate"
	candidateCheckedAtKey := candidateKey + "_checked_at"
	candidate := metadataString(metadata, candidateKey)
	confirmed := current
	if candidate != "" {
		confirmed = candidate
	}
	if confirmed == "" {
		return e.BadRequestError("当前没有可确认的公网地址。", nil)
	}
	metadata[addressKey] = confirmed
	metadata[addressKey+"_source"] = "manual"
	delete(metadata, candidateKey)
	delete(metadata, candidateCheckedAtKey)
	asset.Set("metadata", metadata)
	if err := h.Save(asset); err != nil {
		return e.InternalServerError("无法保存公网地址确认结果。", err)
	}
	if confirmed != current {
		if err := h.createAssetChange(
			asset.GetString("user"),
			asset.Id,
			"assets",
			asset.Id,
			"update",
			"确认公网地址变化",
			map[string]any{"changed_fields": []string{addressKey}, addressKey: confirmed},
		); err != nil {
			h.Logger().Warn("Failed to record confirmed public internet address change", "asset", asset.Id, "error", err)
		}
	}
	return e.JSON(http.StatusOK, map[string]any{"protocol": request.Protocol, "address": confirmed, "source": "manual"})
}

func (h *Hub) refreshInternetAssetAddresses(ctx context.Context, asset *core.Record) (publicInternetAddresses, error) {
	ipv4URL, ipv6URL := publicInternetDetectorURLs()
	result := detectPublicInternetAddresses(ctx, publicInternetHTTPClient(), ipv4URL, ipv6URL)
	metadata := recordJSONMap(asset, "metadata")
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	changedKeys := applyDetectedInternetAddresses(metadata, result, checkedAt)
	result.IPv4Candidate = metadataString(metadata, "public_ipv4_candidate")
	result.IPv6Candidate = metadataString(metadata, "public_ipv6_candidate")
	asset.Set("metadata", metadata)
	if err := h.Save(asset); err != nil {
		return result, err
	}
	if len(changedKeys) > 0 {
		diff := map[string]any{"changed_fields": changedKeys}
		for _, key := range changedKeys {
			diff[key] = metadata[key]
		}
		if err := h.createAssetChange(asset.GetString("user"), asset.Id, "assets", asset.Id, "update", "公网地址已变化", diff); err != nil {
			h.Logger().Warn("Failed to record public internet address change", "asset", asset.Id, "error", err)
		}
	}
	return result, nil
}

func (h *Hub) refreshActiveInternetAddresses() {
	assets, err := h.FindRecordsByFilter("assets", activeInternetAssetFilter, "name", -1, 0)
	if err != nil {
		h.Logger().Warn("Failed to load active internet assets for public address refresh", "error", err)
		return
	}
	for _, asset := range assets {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		_, refreshErr := h.refreshInternetAssetAddresses(ctx, asset)
		cancel()
		if refreshErr != nil {
			h.Logger().Warn("Failed to refresh internet public addresses", "asset", asset.Id, "error", refreshErr)
		}
	}
}

func detectPublicInternetAddresses(ctx context.Context, client *http.Client, ipv4URL string, ipv6URL string) publicInternetAddresses {
	result := publicInternetAddresses{}
	result.IPv4, result.IPv4Error = detectPublicInternetAddress(ctx, client, ipv4URL, true)
	result.IPv6, result.IPv6Error = detectPublicInternetAddress(ctx, client, ipv6URL, false)
	return result
}

func detectPublicInternetAddress(ctx context.Context, client *http.Client, endpoint string, expectedIPv4 bool) (string, string) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", "检测请求无效"
	}
	response, err := client.Do(request)
	if err != nil {
		return "", "检测服务不可达"
	}
	defer response.Body.Close()
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Sprintf("检测服务返回 %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 128))
	if err != nil {
		return "", "读取检测结果失败"
	}
	address, err := netip.ParseAddr(strings.TrimSpace(string(body)))
	if err != nil || address.Is4() != expectedIPv4 {
		return "", "检测结果不是预期的公网地址"
	}
	return address.String(), ""
}

func publicInternetHTTPClient() *http.Client {
	return &http.Client{Timeout: 5 * time.Second}
}

func publicInternetDetectorURLs() (string, string) {
	ipv4URL := strings.TrimSpace(os.Getenv("PULSE_PUBLIC_IPV4_DETECTOR_URL"))
	ipv6URL := strings.TrimSpace(os.Getenv("PULSE_PUBLIC_IPV6_DETECTOR_URL"))
	if ipv4URL == "" {
		ipv4URL = publicIPv4DetectorURL
	}
	if ipv6URL == "" {
		ipv6URL = publicIPv6DetectorURL
	}
	return ipv4URL, ipv6URL
}

func applyDetectedInternetAddresses(metadata map[string]any, result publicInternetAddresses, checkedAt string) []string {
	metadata["public_ip_checked_at"] = checkedAt
	changed := make([]string, 0, 2)
	if applyDetectedInternetAddress(metadata, "public_ipv4", result.IPv4, result.IPv4Error, checkedAt) {
		changed = append(changed, "public_ipv4")
	}
	if applyDetectedInternetAddress(metadata, "public_ipv6", result.IPv6, result.IPv6Error, checkedAt) {
		changed = append(changed, "public_ipv6")
	}
	return changed
}

func applyDetectedInternetAddress(metadata map[string]any, addressKey string, detected string, detectionError string, checkedAt string) bool {
	errorKey := addressKey + "_error"
	candidateKey := addressKey + "_candidate"
	candidateCheckedAtKey := candidateKey + "_checked_at"
	sourceKey := addressKey + "_source"
	current := metadataString(metadata, addressKey)
	source := metadataString(metadata, sourceKey)
	if detected == "" {
		if detectionError != "" {
			metadata[errorKey] = detectionError
		}
		return false
	}
	delete(metadata, errorKey)
	if source == "manual" && current != "" && current != detected {
		metadata[candidateKey] = detected
		metadata[candidateCheckedAtKey] = checkedAt
		return false
	}
	delete(metadata, candidateKey)
	delete(metadata, candidateCheckedAtKey)
	if source != "manual" {
		metadata[sourceKey] = "dynamic"
	}
	metadata[addressKey] = detected
	return current != "" && current != detected
}

func metadataString(metadata map[string]any, key string) string {
	value, _ := metadata[key].(string)
	return strings.TrimSpace(value)
}
