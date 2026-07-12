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
)

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

	ipv4URL, ipv6URL := publicInternetDetectorURLs()
	result := detectPublicInternetAddresses(e.Request.Context(), publicInternetHTTPClient(), ipv4URL, ipv6URL)
	metadata := recordJSONMap(asset, "metadata")
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	metadata["public_ip_checked_at"] = checkedAt
	updatePublicInternetAddressMetadata(metadata, "public_ipv4", "public_ipv4_error", result.IPv4, result.IPv4Error)
	updatePublicInternetAddressMetadata(metadata, "public_ipv6", "public_ipv6_error", result.IPv6, result.IPv6Error)
	asset.Set("metadata", metadata)
	if err := h.Save(asset); err != nil {
		return e.InternalServerError("无法保存公网地址检测结果。", err)
	}
	return e.JSON(http.StatusOK, result)
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

func updatePublicInternetAddressMetadata(metadata map[string]any, addressKey string, errorKey string, address string, detectionError string) {
	if address != "" {
		metadata[addressKey] = address
		delete(metadata, errorKey)
		return
	}
	if detectionError != "" {
		metadata[errorKey] = detectionError
	}
}
