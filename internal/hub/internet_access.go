package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	publicIPv4DetectorURL                        = "https://api4.ipify.org"
	publicIPv6DetectorURL                        = "https://api6.ipify.org"
	internetAddressRefreshSchedule               = "*/15 * * * *"
	activeInternetAssetFilter                    = "type = 'internet' && status = 'active'"
	defaultInternetAddressRefreshIntervalMinutes = 30
)

var allowedInternetAddressRefreshIntervals = map[int]struct{}{
	15: {}, 30: {}, 60: {}, 360: {}, 720: {}, 1440: {},
}

type publicInternetAddresses struct {
	IPv4      string `json:"ipv4"`
	IPv6      string `json:"ipv6"`
	IPv4Error string `json:"ipv4_error,omitempty"`
	IPv6Error string `json:"ipv6_error,omitempty"`
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

func (h *Hub) updateInternetPublicAddressSettings(e *core.RequestEvent) error {
	assetID := strings.TrimSpace(e.Request.PathValue("id"))
	asset, err := h.findUserAssetRecord(assetID, e.Auth.Id)
	if err != nil {
		return e.NotFoundError("Asset not found.", err)
	}
	if asset.GetString("type") != "internet" {
		return e.BadRequestError("仅互联网接入资源可以设置公网地址更新。", nil)
	}
	var request struct {
		Enabled         *bool `json:"enabled"`
		IntervalMinutes int   `json:"interval_minutes"`
	}
	if err := e.BindBody(&request); err != nil {
		return e.BadRequestError("自动更新设置无效。", err)
	}
	if request.Enabled == nil {
		return e.BadRequestError("必须设置是否启用自动更新。", nil)
	}
	if !isAllowedInternetAddressRefreshInterval(request.IntervalMinutes) {
		return e.BadRequestError("更新时间只能选择 15 分钟、30 分钟、1 小时、6 小时、12 小时或 24 小时。", nil)
	}
	metadata := recordJSONMap(asset, "metadata")
	metadata["public_ip_auto_refresh"] = yesNoValue(*request.Enabled)
	metadata["public_ip_refresh_interval_minutes"] = request.IntervalMinutes
	delete(metadata, "public_ip_next_check_at")
	asset.Set("metadata", metadata)
	if err := h.Save(asset); err != nil {
		return e.InternalServerError("无法保存公网地址自动更新设置。", err)
	}
	if !*request.Enabled {
		return e.JSON(http.StatusOK, map[string]any{
			"enabled": false, "interval_minutes": request.IntervalMinutes,
		})
	}
	result, err := h.refreshInternetAssetAddresses(e.Request.Context(), asset)
	if err != nil {
		return e.InternalServerError("自动更新设置已保存，但立即刷新公网地址失败。", err)
	}
	return e.JSON(http.StatusOK, map[string]any{
		"enabled": true, "interval_minutes": request.IntervalMinutes, "result": result,
	})
}

func (h *Hub) refreshInternetAssetAddresses(ctx context.Context, asset *core.Record) (publicInternetAddresses, error) {
	ipv4URL, ipv6URL := publicInternetDetectorURLs()
	result := detectPublicInternetAddresses(ctx, publicInternetHTTPClient(), ipv4URL, ipv6URL)
	metadata := recordJSONMap(asset, "metadata")
	checkedAtTime := time.Now().UTC()
	checkedAt := checkedAtTime.Format(time.RFC3339)
	changedKeys := applyDetectedInternetAddresses(metadata, result, checkedAt)
	applyInternetAddressNextCheck(metadata, asset.GetString("status"), checkedAtTime)
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
	now := time.Now().UTC()
	for _, asset := range assets {
		if !internetAddressAutoRefreshDue(recordJSONMap(asset, "metadata"), now) {
			continue
		}
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
	if applyDetectedInternetAddress(metadata, "public_ipv4", result.IPv4, result.IPv4Error) {
		changed = append(changed, "public_ipv4")
	}
	if applyDetectedInternetAddress(metadata, "public_ipv6", result.IPv6, result.IPv6Error) {
		changed = append(changed, "public_ipv6")
	}
	return changed
}

func applyDetectedInternetAddress(metadata map[string]any, addressKey string, detected string, detectionError string) bool {
	errorKey := addressKey + "_error"
	current := metadataString(metadata, addressKey)
	delete(metadata, addressKey+"_source")
	delete(metadata, addressKey+"_candidate")
	delete(metadata, addressKey+"_candidate_checked_at")
	if detected == "" {
		if detectionError != "" {
			metadata[errorKey] = detectionError
		}
		return false
	}
	delete(metadata, errorKey)
	metadata[addressKey] = detected
	return current != "" && current != detected
}

func applyInternetAddressNextCheck(metadata map[string]any, status string, checkedAt time.Time) {
	if status != "active" || !internetAddressAutoRefreshEnabled(metadata) {
		delete(metadata, "public_ip_next_check_at")
		return
	}
	interval := time.Duration(internetAddressRefreshIntervalMinutes(metadata)) * time.Minute
	metadata["public_ip_next_check_at"] = checkedAt.Add(interval).UTC().Format(time.RFC3339)
}

func internetAddressAutoRefreshDue(metadata map[string]any, now time.Time) bool {
	if !internetAddressAutoRefreshEnabled(metadata) {
		return false
	}
	nextCheckAt := metadataString(metadata, "public_ip_next_check_at")
	if nextCheckAt == "" {
		return true
	}
	next, err := time.Parse(time.RFC3339, nextCheckAt)
	return err != nil || !next.After(now)
}

func internetAddressAutoRefreshEnabled(metadata map[string]any) bool {
	return metadataString(metadata, "public_ip_auto_refresh") != "no"
}

func internetAddressRefreshIntervalMinutes(metadata map[string]any) int {
	minutes, ok := parseInternetAddressRefreshIntervalMinutes(metadata["public_ip_refresh_interval_minutes"])
	if ok && isAllowedInternetAddressRefreshInterval(minutes) {
		return minutes
	}
	return defaultInternetAddressRefreshIntervalMinutes
}

func parseInternetAddressRefreshIntervalMinutes(value any) (int, bool) {
	minutes := 0
	parsed := true
	switch typed := value.(type) {
	case int:
		minutes = typed
	case int64:
		minutes = int(typed)
	case float64:
		minutes = int(typed)
	case json.Number:
		var err error
		minutes, err = strconv.Atoi(typed.String())
		parsed = err == nil
	case string:
		var err error
		minutes, err = strconv.Atoi(strings.TrimSpace(typed))
		parsed = err == nil
	default:
		parsed = false
	}
	return minutes, parsed
}

func isAllowedInternetAddressRefreshInterval(minutes int) bool {
	_, ok := allowedInternetAddressRefreshIntervals[minutes]
	return ok
}

func yesNoValue(value bool) string {
	if value {
		return "yes"
	}
	return "no"
}

func metadataString(metadata map[string]any, key string) string {
	value, _ := metadata[key].(string)
	return strings.TrimSpace(value)
}
