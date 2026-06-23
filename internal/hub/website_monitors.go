package hub

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/alerts"
)

const (
	websiteMonitorDefaultTimeout   = 10 * time.Second
	websiteMonitorHistoryLimit     = 50
	websiteMonitorContentReadLimit = 512 * 1024
)

func (h *Hub) checkDueWebsiteMonitors() {
	records, err := h.FindRecordsByFilter("website_monitors", "enabled = true", "+last_checked", 100, 0)
	if err != nil {
		h.Logger().Error("Failed to load website monitors", "err", err)
		return
	}
	now := time.Now().UTC()
	for _, record := range records {
		if !websiteMonitorDue(record, now) {
			continue
		}
		if _, err := h.runWebsiteMonitorCheck(context.Background(), record); err != nil {
			h.Logger().Warn("Website monitor check failed", "monitor", record.Id, "err", err)
		}
	}
}

func (h *Hub) bindWebsiteMonitorHooks() {
	h.App.OnRecordAfterDeleteSuccess("website_monitors").BindFunc(func(e *core.RecordEvent) error {
		if err := h.cleanupDeletedWebsiteMonitor(e.App, e.Record); err != nil {
			e.App.Logger().Warn("Failed to clean deleted website monitor data", "monitor", e.Record.Id, "err", err)
		}
		return e.Next()
	})
}

func (h *Hub) cleanupDeletedWebsiteMonitor(app core.App, monitor *core.Record) error {
	if monitor == nil || strings.TrimSpace(monitor.Id) == "" {
		return nil
	}
	if _, err := app.FindCollectionByNameOrId("website_monitor_checks"); err == nil {
		if _, err := app.DB().NewQuery("DELETE FROM website_monitor_checks WHERE monitor = {:monitor}").Bind(dbx.Params{
			"monitor": monitor.Id,
		}).Execute(); err != nil {
			return err
		}
	}
	_, err := h.resolveWebsiteMonitorAlertHistory(monitor)
	return err
}

func websiteMonitorDue(record *core.Record, now time.Time) bool {
	interval := record.GetInt("interval_seconds")
	if interval < 60 {
		interval = 300
	}
	lastChecked := strings.TrimSpace(record.GetString("last_checked"))
	if lastChecked == "" {
		return true
	}
	parsed, err := time.Parse(time.RFC3339Nano, lastChecked)
	if err != nil {
		parsed, err = time.Parse("2006-01-02 15:04:05.000Z", lastChecked)
	}
	if err != nil {
		return true
	}
	return now.Sub(parsed) >= time.Duration(interval)*time.Second
}

func (h *Hub) checkWebsiteMonitorNow(e *core.RequestEvent) error {
	id := strings.TrimSpace(e.Request.PathValue("id"))
	record, err := h.FindRecordById("website_monitors", id)
	if err != nil || record.GetString("user") != e.Auth.Id {
		return e.NotFoundError("", err)
	}
	result, err := h.runWebsiteMonitorCheck(e.Request.Context(), record)
	if err != nil {
		h.createOperationAudit(e, record.GetString("system"), "check_website_monitor", websiteMonitorAuditTarget(record), "", "failed", err.Error(), operationFailureInvalidRequest)
		return e.InternalServerError("", err)
	}
	h.createOperationAudit(e, record.GetString("system"), "check_website_monitor", websiteMonitorAuditTarget(record), "", "success", "检测完成："+result.Status)
	return e.JSON(http.StatusOK, result)
}

func websiteMonitorAuditTarget(record *core.Record) string {
	if record == nil {
		return ""
	}
	name := strings.TrimSpace(record.GetString("name"))
	if name == "" {
		name = record.Id
	}
	return name
}

type websiteMonitorCheckResult struct {
	Status          string `json:"status"`
	StatusCode      int    `json:"status_code"`
	LatencyMS       int64  `json:"latency_ms"`
	Error           string `json:"error"`
	FailureCategory string `json:"failure_category"`
	CheckedAt       string `json:"checked_at"`
	Target          string `json:"target"`
	URL             string `json:"url"`
	IPVersion       string `json:"ip_version"`
}

type websiteMonitorCheckResponse struct {
	Status    string                      `json:"status"`
	CheckedAt string                      `json:"checked_at"`
	Results   []websiteMonitorCheckResult `json:"results"`
}

type websiteMonitorTarget struct {
	Name      string
	Label     string
	URL       string
	Scope     string
	IPVersion string
}

type websiteMonitorConfiguredTarget struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	URL       string `json:"url"`
	Scope     string `json:"scope"`
	IPVersion string `json:"ip_version"`
}

func (h *Hub) runWebsiteMonitorCheck(ctx context.Context, monitor *core.Record) (websiteMonitorCheckResponse, error) {
	targets := websiteMonitorTargets(monitor)
	if len(targets) == 0 {
		return websiteMonitorCheckResponse{}, fmt.Errorf("only HTTP/HTTPS URL is supported")
	}

	checkedAt := time.Now().UTC().Format(time.RFC3339Nano)
	results := make([]websiteMonitorCheckResult, 0, len(targets))
	for _, target := range targets {
		result, err := h.checkWebsiteMonitorTarget(ctx, monitor, target, checkedAt)
		if err != nil {
			return websiteMonitorCheckResponse{}, err
		}
		results = append(results, result)
	}
	if err := h.updateWebsiteMonitorSummary(monitor, results, checkedAt); err != nil {
		return websiteMonitorCheckResponse{}, err
	}
	return websiteMonitorCheckResponse{
		Status:    aggregateWebsiteMonitorStatus(results),
		CheckedAt: checkedAt,
		Results:   results,
	}, nil
}

func websiteMonitorTargets(monitor *core.Record) []websiteMonitorTarget {
	if targets := websiteMonitorTargetsFromJSON(monitor.GetString("targets")); len(targets) > 0 {
		return targets
	}

	candidates := []websiteMonitorTarget{
		{Name: "internal-ipv4", Label: "内网 IPv4", URL: strings.TrimSpace(monitor.GetString("internal_url")), Scope: "internal", IPVersion: "IPv4"},
		{Name: "external-ipv4", Label: "外网 IPv4", URL: strings.TrimSpace(monitor.GetString("external_url")), Scope: "external", IPVersion: "IPv4"},
	}
	if candidates[0].URL == "" && candidates[1].URL == "" {
		candidates[0].URL = strings.TrimSpace(monitor.GetString("url"))
	}

	targets := make([]websiteMonitorTarget, 0, 2)
	seen := make(map[string]struct{})
	for _, candidate := range candidates {
		if candidate.URL == "" {
			continue
		}
		if _, ok := seen[candidate.URL]; ok {
			continue
		}
		seen[candidate.URL] = struct{}{}
		targets = append(targets, candidate)
	}
	return targets
}

func websiteMonitorTargetsFromJSON(raw string) []websiteMonitorTarget {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	var configured []websiteMonitorConfiguredTarget
	if err := json.Unmarshal([]byte(raw), &configured); err != nil {
		return nil
	}
	targets := make([]websiteMonitorTarget, 0, len(configured))
	seenURLs := make(map[string]struct{})
	seenNames := make(map[string]struct{})
	for index, item := range configured {
		targetURL := strings.TrimSpace(item.URL)
		if targetURL == "" {
			continue
		}
		if _, ok := seenURLs[targetURL]; ok {
			continue
		}
		seenURLs[targetURL] = struct{}{}
		label := strings.TrimSpace(item.Label)
		if label == "" {
			label = fmt.Sprintf("地址 %d", index+1)
		}
		name := uniqueWebsiteMonitorTargetID(websiteMonitorTargetID(item.ID, label, index), seenNames)
		targets = append(targets, websiteMonitorTarget{
			Name:      name,
			Label:     label,
			URL:       targetURL,
			Scope:     websiteMonitorTargetScope(item.Scope, name),
			IPVersion: websiteMonitorTargetIPVersion(item.IPVersion, name),
		})
	}
	return targets
}

var websiteMonitorTargetIDPattern = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

func websiteMonitorTargetID(id string, label string, index int) string {
	id = strings.TrimSpace(id)
	if id == "" {
		id = label
	}
	id = strings.Trim(websiteMonitorTargetIDPattern.ReplaceAllString(id, "-"), "-")
	if id == "" {
		return fmt.Sprintf("target-%d", index+1)
	}
	return id
}

func uniqueWebsiteMonitorTargetID(id string, seen map[string]struct{}) string {
	next := id
	for suffix := 2; ; suffix++ {
		if _, ok := seen[next]; !ok {
			seen[next] = struct{}{}
			return next
		}
		next = fmt.Sprintf("%s-%d", id, suffix)
	}
}

func websiteMonitorTargetScope(scope string, name string) string {
	scope = strings.ToLower(strings.TrimSpace(scope))
	if scope == "external" {
		return "external"
	}
	if strings.HasPrefix(strings.ToLower(name), "external") {
		return "external"
	}
	return "internal"
}

func websiteMonitorTargetIPVersion(ipVersion string, name string) string {
	normalized := strings.ToLower(strings.TrimSpace(ipVersion))
	if normalized == "ipv6" {
		return "IPv6"
	}
	if strings.Contains(strings.ToLower(name), "ipv6") {
		return "IPv6"
	}
	return "IPv4"
}

func (h *Hub) checkWebsiteMonitorTarget(ctx context.Context, monitor *core.Record, target websiteMonitorTarget, checkedAt string) (websiteMonitorCheckResult, error) {
	targetURL := target.URL
	parsedURL, err := url.Parse(targetURL)
	if err != nil || parsedURL.Host == "" || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") {
		return websiteMonitorCheckResult{}, fmt.Errorf("only HTTP/HTTPS URL is supported")
	}

	timeoutSeconds := monitor.GetInt("timeout_seconds")
	if timeoutSeconds <= 0 || timeoutSeconds > 60 {
		timeoutSeconds = int(websiteMonitorDefaultTimeout.Seconds())
	}
	checkCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutSeconds)*time.Second)
	defer cancel()

	var ipVersion string
	dialer := &net.Dialer{Timeout: time.Duration(timeoutSeconds) * time.Second}
	network := "tcp"
	if target.IPVersion == "IPv4" {
		network = "tcp4"
	} else if target.IPVersion == "IPv6" {
		network = "tcp6"
	}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, _ string, address string) (net.Conn, error) {
			conn, err := dialer.DialContext(ctx, network, address)
			if err != nil {
				return nil, err
			}
			if tcpAddr, ok := conn.RemoteAddr().(*net.TCPAddr); ok {
				ipVersion = websiteMonitorIPVersion(tcpAddr.IP)
			}
			return conn, nil
		},
		TLSHandshakeTimeout:   time.Duration(timeoutSeconds) * time.Second,
		ResponseHeaderTimeout: time.Duration(timeoutSeconds) * time.Second,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12},
	}
	defer transport.CloseIdleConnections()
	client := http.Client{
		Timeout:   time.Duration(timeoutSeconds) * time.Second,
		Transport: transport,
	}
	start := time.Now()
	req, err := http.NewRequestWithContext(checkCtx, http.MethodGet, parsedURL.String(), nil)
	if err != nil {
		return websiteMonitorCheckResult{}, err
	}
	req.Header.Set("User-Agent", "Pulse-Website-Monitor/1.0")

	result := websiteMonitorCheckResult{
		Status:    "down",
		CheckedAt: checkedAt,
		Target:    target.Name,
		URL:       parsedURL.String(),
		IPVersion: target.IPVersion,
	}
	resp, err := client.Do(req)
	result.LatencyMS = time.Since(start).Milliseconds()
	result.IPVersion = websiteMonitorCheckIPVersion(result.IPVersion, ipVersion)
	if err != nil {
		result.FailureCategory = classifyWebsiteMonitorFailure(err)
		result.Error = formatWebsiteMonitorError(err)
	} else {
		defer resp.Body.Close()
		result.StatusCode = resp.StatusCode
		if resp.StatusCode >= 200 && resp.StatusCode < 400 {
			expectedContent := websiteMonitorExpectedContent(monitor)
			if expectedContent == "" {
				result.Status = "up"
			} else if body, readErr := readWebsiteMonitorBody(resp.Body); readErr != nil {
				result.FailureCategory = "network"
				result.Error = formatWebsiteMonitorError(readErr)
			} else if strings.Contains(body, expectedContent) {
				result.Status = "up"
			} else {
				result.FailureCategory = "content"
				result.Error = "内容校验失败：响应正文未包含期望内容"
			}
		} else {
			result.FailureCategory = "http"
			result.Error = resp.Status
		}
	}

	if err := h.saveWebsiteMonitorCheck(monitor, result); err != nil {
		return result, err
	}
	return result, nil
}

func websiteMonitorExpectedContent(monitor *core.Record) string {
	if monitor == nil {
		return ""
	}
	return strings.TrimSpace(monitor.GetString("expected_content"))
}

func readWebsiteMonitorBody(body io.Reader) (string, error) {
	if body == nil {
		return "", nil
	}
	bytes, err := io.ReadAll(io.LimitReader(body, websiteMonitorContentReadLimit))
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func websiteMonitorIPVersion(ip net.IP) string {
	if ip == nil {
		return ""
	}
	if ip.To4() != nil {
		return "IPv4"
	}
	if ip.To16() != nil {
		return "IPv6"
	}
	return ""
}

func websiteMonitorCheckIPVersion(requested string, actual string) string {
	if actual != "" {
		return actual
	}
	return requested
}

func formatWebsiteMonitorError(err error) string {
	message := err.Error()
	lower := strings.ToLower(message)
	switch {
	case strings.Contains(lower, "wrong version number"):
		return "TLS 握手失败：这个端口看起来是 HTTP 服务，请把 URL 从 https:// 改成 http://"
	case strings.Contains(lower, "certificate") || strings.Contains(lower, "x509"):
		return "证书校验失败：目标站点使用了无效或不受信任的 HTTPS 证书"
	case strings.Contains(lower, "timeout") || strings.Contains(lower, "deadline exceeded"):
		return "请求超时：Hub 无法在设定时间内访问该地址"
	case strings.Contains(lower, "network is unreachable"):
		return "网络不可达：Hub 当前网络无法访问该地址"
	case strings.Contains(lower, "connection refused"):
		return "连接被拒绝：目标端口没有服务监听或被防火墙拦截"
	case strings.Contains(lower, "no such host"):
		return "域名解析失败：Hub 无法解析该地址"
	default:
		return message
	}
}

func classifyWebsiteMonitorFailure(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout"
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "timeout"
	}
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		return "dns"
	}
	message := strings.ToLower(err.Error())
	switch {
	case strings.Contains(message, "no such host") || strings.Contains(message, "server misbehaving"):
		return "dns"
	case strings.Contains(message, "certificate") ||
		strings.Contains(message, "x509") ||
		strings.Contains(message, "tls") ||
		strings.Contains(message, "wrong version number"):
		return "tls"
	case strings.Contains(message, "timeout") || strings.Contains(message, "deadline exceeded"):
		return "timeout"
	case strings.Contains(message, "connection refused") ||
		strings.Contains(message, "connection reset") ||
		strings.Contains(message, "connectex") ||
		strings.Contains(message, "actively refused"):
		return "tcp"
	case strings.Contains(message, "network is unreachable") ||
		strings.Contains(message, "no route to host") ||
		strings.Contains(message, "host is down"):
		return "network"
	case strings.Contains(message, "too many redirects"):
		return "redirect"
	case strings.Contains(message, "unsupported protocol scheme") ||
		strings.Contains(message, "invalid url") ||
		strings.Contains(message, "missing protocol scheme"):
		return "unknown"
	default:
		return "unknown"
	}
}

func (h *Hub) saveWebsiteMonitorCheck(monitor *core.Record, result websiteMonitorCheckResult) error {
	collection, err := h.FindCachedCollectionByNameOrId("website_monitor_checks")
	if err != nil {
		return err
	}
	check := core.NewRecord(collection)
	check.Set("user", monitor.GetString("user"))
	check.Set("monitor", monitor.Id)
	check.Set("target", result.Target)
	check.Set("url", result.URL)
	check.Set("ip_version", result.IPVersion)
	check.Set("status", result.Status)
	check.Set("status_code", result.StatusCode)
	check.Set("latency_ms", result.LatencyMS)
	check.Set("error", result.Error)
	check.Set("failure_category", result.FailureCategory)
	return h.SaveNoValidate(check)
}

func (h *Hub) updateWebsiteMonitorSummary(monitor *core.Record, results []websiteMonitorCheckResult, checkedAt string) error {
	previousStatus := strings.TrimSpace(monitor.GetString("last_status"))
	status := aggregateWebsiteMonitorStatus(results)
	statusCode := 0
	latencyTotal := int64(0)
	latencyCount := int64(0)
	var errors []string
	failureCategory := ""
	for _, result := range results {
		if result.StatusCode > 0 {
			statusCode = result.StatusCode
		}
		if result.LatencyMS > 0 {
			latencyTotal += result.LatencyMS
			latencyCount++
		}
		if result.Error != "" {
			errors = append(errors, websiteMonitorTargetLabel(monitor, result.Target)+": "+result.Error)
		}
		if failureCategory == "" && result.Status != "up" {
			failureCategory = strings.TrimSpace(result.FailureCategory)
			if failureCategory == "" && result.StatusCode > 0 {
				failureCategory = "http"
			}
		}
	}
	latency := int64(0)
	if latencyCount > 0 {
		latency = latencyTotal / latencyCount
	}

	monitor.Set("last_status", status)
	monitor.Set("last_status_code", statusCode)
	monitor.Set("last_latency_ms", latency)
	monitor.Set("last_error", strings.Join(errors, "\n"))
	monitor.Set("last_failure_category", failureCategory)
	monitor.Set("last_checked", checkedAt)
	monitor.Set("uptime_24h", h.calculateWebsiteMonitorUptime(monitor.Id))
	if err := h.SaveNoValidate(monitor); err != nil {
		return err
	}
	return h.syncWebsiteMonitorAlert(monitor, previousStatus, status, results)
}

func (h *Hub) syncWebsiteMonitorAlert(monitor *core.Record, previousStatus string, status string, results []websiteMonitorCheckResult) error {
	systemID := strings.TrimSpace(monitor.GetString("system"))
	if systemID == "" {
		return nil
	}
	systemRecord, err := h.FindRecordById("systems", systemID)
	if err != nil {
		return nil
	}

	if status == "down" {
		created, err := h.createWebsiteMonitorAlertHistory(monitor, systemRecord, results)
		if err != nil {
			return err
		}
		if created {
			h.sendWebsiteMonitorNotification(monitor, systemRecord, status, results)
		}
		return nil
	}

	if status == "up" && previousStatus == "down" {
		resolved, err := h.resolveWebsiteMonitorAlertHistory(monitor)
		if err != nil {
			return err
		}
		if resolved {
			h.sendWebsiteMonitorNotification(monitor, systemRecord, status, results)
		}
	}
	return nil
}

func (h *Hub) createWebsiteMonitorAlertHistory(monitor *core.Record, systemRecord *core.Record, results []websiteMonitorCheckResult) (bool, error) {
	alertID := websiteMonitorAlertID(monitor.Id)
	existing, err := h.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && resolved=null",
		dbx.Params{"alert_id": alertID},
	)
	if err == nil && existing != nil {
		return false, nil
	}

	collection, err := h.FindCachedCollectionByNameOrId("alerts_history")
	if err != nil {
		return false, err
	}
	record := core.NewRecord(collection)
	record.Set("alert_id", alertID)
	record.Set("user", monitor.GetString("user"))
	record.Set("system", systemRecord.Id)
	record.Set("name", websiteMonitorAlertName(monitor))
	record.Set("value", countDownWebsiteMonitorTargets(results))
	if err := h.SaveNoValidate(record); err != nil {
		return false, err
	}
	return true, nil
}

func (h *Hub) resolveWebsiteMonitorAlertHistory(monitor *core.Record) (bool, error) {
	record, err := h.FindFirstRecordByFilter(
		"alerts_history",
		"alert_id={:alert_id} && resolved=null",
		dbx.Params{"alert_id": websiteMonitorAlertID(monitor.Id)},
	)
	if err != nil || record == nil {
		return false, nil
	}
	record.Set("resolved", time.Now().UTC())
	if err := h.SaveNoValidate(record); err != nil {
		return false, err
	}
	return true, nil
}

func (h *Hub) sendWebsiteMonitorNotification(monitor *core.Record, systemRecord *core.Record, status string, results []websiteMonitorCheckResult) {
	if h.AlertManager == nil {
		return
	}
	monitorName := strings.TrimSpace(monitor.GetString("name"))
	if monitorName == "" {
		monitorName = "网站监控"
	}
	systemName := strings.TrimSpace(systemRecord.GetString("name"))
	if systemName == "" {
		systemName = systemRecord.Id
	}
	title := fmt.Sprintf("网站 %s 异常", monitorName)
	message := fmt.Sprintf("%s 上的网站监控异常。", systemName)
	if status == "up" {
		title = fmt.Sprintf("网站 %s 已恢复", monitorName)
		message = fmt.Sprintf("%s 上的网站监控已恢复。", systemName)
	} else if detail := websiteMonitorAlertDetail(monitor, results); detail != "" {
		message += "\n" + detail
	}
	if err := h.SendAlert(alerts.AlertMessageData{
		UserID:   monitor.GetString("user"),
		SystemID: systemRecord.Id,
		AlertID:  websiteMonitorAlertID(monitor.Id),
		Title:    title,
		Message:  message,
		Link:     h.MakeLink("system", systemRecord.Id),
		LinkText: "查看机器",
		Resolved: status == "up",
	}); err != nil {
		h.Logger().Warn("Failed to send website monitor alert", "monitor", monitor.Id, "err", err)
	}
}

func websiteMonitorAlertID(monitorID string) string {
	return "website:" + monitorID
}

func websiteMonitorAlertName(monitor *core.Record) string {
	name := strings.TrimSpace(monitor.GetString("name"))
	if name == "" {
		name = monitor.Id
	}
	return "网站：" + name
}

func countDownWebsiteMonitorTargets(results []websiteMonitorCheckResult) int {
	count := 0
	for _, result := range results {
		if result.Status != "up" {
			count++
		}
	}
	return count
}

func websiteMonitorAlertDetail(monitor *core.Record, results []websiteMonitorCheckResult) string {
	details := make([]string, 0, len(results))
	for _, result := range results {
		if result.Status == "up" {
			continue
		}
		label := websiteMonitorTargetLabel(monitor, result.Target)
		message := strings.TrimSpace(result.Error)
		if message == "" && result.StatusCode > 0 {
			message = fmt.Sprintf("HTTP %d", result.StatusCode)
		}
		if message == "" {
			message = "检测失败"
		}
		details = append(details, fmt.Sprintf("%s：%s", label, message))
	}
	return strings.Join(details, "\n")
}

func aggregateWebsiteMonitorStatus(results []websiteMonitorCheckResult) string {
	if len(results) == 0 {
		return "down"
	}
	for _, result := range results {
		if result.Status != "up" {
			return "down"
		}
	}
	return "up"
}

func websiteMonitorTargetLabel(monitor *core.Record, target string) string {
	for _, item := range websiteMonitorTargets(monitor) {
		if item.Name == target {
			return item.Label
		}
	}
	switch target {
	case "internal":
		return "内网"
	case "external":
		return "外网"
	case "internal-ipv4":
		return "内网 IPv4"
	case "internal-ipv6":
		return "内网 IPv6"
	case "external-ipv4":
		return "外网 IPv4"
	case "external-ipv6":
		return "外网 IPv6"
	default:
		return "地址"
	}
}
func (h *Hub) calculateWebsiteMonitorUptime(monitorID string) float64 {
	since := time.Now().UTC().Add(-24 * time.Hour).Format(time.RFC3339Nano)
	records, err := h.FindRecordsByFilter(
		"website_monitor_checks",
		"monitor = {:monitor} && created >= {:since}",
		"-created",
		websiteMonitorHistoryLimit,
		0,
		dbx.Params{"monitor": monitorID, "since": since},
	)
	if err != nil || len(records) == 0 {
		return 0
	}
	up := 0
	for _, record := range records {
		if record.GetString("status") == "up" {
			up++
		}
	}
	return float64(up) / float64(len(records)) * 100
}
