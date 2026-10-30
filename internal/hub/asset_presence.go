package hub

import (
	"context"
	"net"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

// 2026-10-25 设备在线探测：对登记了管理 IP 且非手机类的资产做 Hub 侧 ping 探测，
// 结果写入 asset_presence 集合（拓扑与后续展示消费）。手机类锁屏断网不响应 ping，
// 按用户决策不参与判定，避免频繁误报。
const (
	assetPresenceMethod            = "ping"
	assetPresenceOfflineStreak     = 2
	assetPresenceConcurrency       = 8
	assetPresenceCommandTimeout    = 3 * time.Second
	assetPresenceStatusOnline      = "online"
	assetPresenceStatusOffline     = "offline"
	assetPresenceStatusUnknown     = "unknown"
	assetPresenceExcludedTypePhone = "phone"
)

type assetPresenceTarget struct {
	AssetID string
	Name    string
	IP      string
}

type assetPresenceProbeResult struct {
	Target    assetPresenceTarget
	Success   bool
	LatencyMs int64
	Err       string
}

// checkAssetPresence 是定时任务入口（每分钟）：加载探测名单、并发 ping、按状态机
// 防抖后写入 asset_presence。模块关闭时跳过。
func (h *Hub) checkAssetPresence() {
	enabled, _, err := h.pulseModuleEnabledForUser("", "asset-presence")
	if err != nil {
		h.Logger().Warn("Unable to resolve asset presence module state", "err", err)
		return
	}
	if !enabled {
		return
	}
	targets, err := h.loadAssetPresenceTargets()
	if err != nil {
		h.Logger().Error("Failed to load asset presence targets", "err", err)
		return
	}
	if len(targets) == 0 {
		return
	}

	results := h.probeAssetPresenceTargets(context.Background(), targets)
	for _, result := range results {
		if err := h.applyAssetPresenceResult(result); err != nil {
			h.Logger().Warn("Failed to save asset presence result", "asset", result.Target.AssetID, "err", err)
		}
	}
}

func (h *Hub) loadAssetPresenceTargets() ([]assetPresenceTarget, error) {
	records, err := h.FindRecordsByFilter("assets", "management_ip != ''", "name", -1, 0)
	if err != nil {
		return nil, err
	}
	targets := []assetPresenceTarget{}
	for _, record := range records {
		if !AssetPresenceEligible(record) {
			continue
		}
		targets = append(targets, assetPresenceTarget{
			AssetID: record.Id,
			Name:    record.GetString("name"),
			IP:      strings.TrimSpace(record.GetString("management_ip")),
		})
	}
	return targets, nil
}

// AssetPresenceEligible 判断资产是否参与在线探测：需要合法的管理 IP（排除回环 /
// 链路本地 / 未指定地址），手机类不参与（用户决策：锁屏断网会频繁误报），
// 宽带（internet，广域服务）不适用局域网在线探测（用户决策：不探测、不显示未探测标识）。
func AssetPresenceEligible(record *core.Record) bool {
	if record == nil {
		return false
	}
	assetType := record.GetString("type")
	if assetType == assetPresenceExcludedTypePhone || assetType == "internet" {
		return false
	}
	ip := net.ParseIP(strings.TrimSpace(record.GetString("management_ip")))
	if ip == nil || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return false
	}
	return true
}

func (h *Hub) probeAssetPresenceTargets(ctx context.Context, targets []assetPresenceTarget) []assetPresenceProbeResult {
	sem := make(chan struct{}, assetPresenceConcurrency)
	results := make([]assetPresenceProbeResult, len(targets))
	var wg sync.WaitGroup
	for i, target := range targets {
		wg.Add(1)
		go func(index int, t assetPresenceTarget) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			success, latencyMs, err := probeHostPing(ctx, t.IP)
			result := assetPresenceProbeResult{Target: t, Success: success, LatencyMs: latencyMs}
			if err != nil {
				result.Err = err.Error()
			}
			results[index] = result
		}(i, target)
	}
	wg.Wait()
	return results
}

func (h *Hub) applyAssetPresenceResult(result assetPresenceProbeResult) error {
	record, err := h.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": result.Target.AssetID})
	if err != nil {
		collection, colErr := h.FindCachedCollectionByNameOrId("asset_presence")
		if colErr != nil {
			return colErr
		}
		record = core.NewRecord(collection)
		record.Set("asset", result.Target.AssetID)
	}
	nextStatus, nextStreak := NextAssetPresenceState(record.GetString("status"), record.GetInt("fail_streak"), result.Success)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	record.Set("status", nextStatus)
	record.Set("method", assetPresenceMethod)
	record.Set("last_checked", now)
	record.Set("fail_streak", nextStreak)
	if result.Success {
		record.Set("last_seen", now)
		record.Set("latency_ms", result.LatencyMs)
	} else {
		record.Set("latency_ms", 0)
	}
	return h.SaveNoValidate(record)
}

// NextAssetPresenceState 是探测状态机（纯函数）：成功立即转在线并清零连败；
// 失败累计连败，连续达到阈值（2 次）才转离线——单次丢包不抖动。
func NextAssetPresenceState(current string, failStreak int, success bool) (string, int) {
	if success {
		return assetPresenceStatusOnline, 0
	}
	streak := failStreak + 1
	if streak >= assetPresenceOfflineStreak {
		return assetPresenceStatusOffline, streak
	}
	if current == "" {
		return assetPresenceStatusUnknown, streak
	}
	return current, streak
}

// probeHostPing 用系统 ping 命令探测（按退出码判定，不解析输出文本，规避中文编码）：
// Windows 开发态以普通用户运行也没有权限问题。
func probeHostPing(ctx context.Context, ip string) (bool, int64, error) {
	start := time.Now()
	cmd := assetPresencePingCommand(ctx, ip)
	err := cmd.Run()
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return false, latency, nil
	}
	return true, latency, nil
}

// assetPresencePingCommand 构造跨平台的一次性 ping 命令（按退出码判定）。
func assetPresencePingCommand(ctx context.Context, ip string) *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.CommandContext(ctx, "ping", "-n", "1", "-w", "1500", ip)
	}
	return exec.CommandContext(ctx, "ping", "-c", "1", "-W", "2", ip)
}

// bindAssetPresenceHooks 让探测名单跟随资产变化：新建/改出合规 IP 的资产生成
// unknown 记录，删除资产或退出探测范围时清理对应记录。
func (h *Hub) bindAssetPresenceHooks() {
	syncPresence := func(app core.App, record *core.Record) {
		if err := upsertAssetPresenceSeed(app, record); err != nil {
			app.Logger().Warn("Failed to sync asset presence record", "asset", record.Id, "err", err)
		}
	}
	h.App.OnRecordAfterCreateSuccess("assets").BindFunc(func(e *core.RecordEvent) error {
		syncPresence(e.App, e.Record)
		return e.Next()
	})
	h.App.OnRecordAfterUpdateSuccess("assets").BindFunc(func(e *core.RecordEvent) error {
		syncPresence(e.App, e.Record)
		return e.Next()
	})
	h.App.OnRecordAfterDeleteSuccess("assets").BindFunc(func(e *core.RecordEvent) error {
		if err := deleteAssetPresenceRecord(e.App, e.Record.Id); err != nil {
			e.App.Logger().Warn("Failed to delete asset presence record", "asset", e.Record.Id, "err", err)
		}
		return e.Next()
	})
}

// upsertAssetPresenceSeed 资产进入探测范围时确保存在 presence 记录（不覆盖已有状态）；
// 退出范围（改类型为手机 / 清空或非法 IP）时删除记录。
func upsertAssetPresenceSeed(app core.App, record *core.Record) error {
	if record == nil {
		return nil
	}
	if _, err := app.FindCollectionByNameOrId("asset_presence"); err != nil {
		return nil
	}
	if !AssetPresenceEligible(record) {
		return deleteAssetPresenceRecord(app, record.Id)
	}
	existing, err := app.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": record.Id})
	if err == nil && existing != nil {
		return nil
	}
	collection, err := app.FindCachedCollectionByNameOrId("asset_presence")
	if err != nil {
		return err
	}
	seed := core.NewRecord(collection)
	seed.Set("asset", record.Id)
	seed.Set("status", assetPresenceStatusUnknown)
	seed.Set("method", assetPresenceMethod)
	return app.SaveNoValidate(seed)
}

func deleteAssetPresenceRecord(app core.App, assetID string) error {
	if strings.TrimSpace(assetID) == "" {
		return nil
	}
	if _, err := app.FindCollectionByNameOrId("asset_presence"); err != nil {
		return nil
	}
	records, err := app.FindRecordsByFilter("asset_presence", "asset = {:asset}", "", -1, 0, map[string]any{"asset": assetID})
	if err != nil {
		return err
	}
	for _, record := range records {
		if err := app.Delete(record); err != nil {
			return err
		}
	}
	return nil
}

// ---- 测试桥（仅供 hub_test 外部测试包使用，业务代码勿调）----

// UpsetAssetPresenceSeedForTest 测试桥：upsertAssetPresenceSeed。
func UpsetAssetPresenceSeedForTest(app core.App, record *core.Record) error {
	return upsertAssetPresenceSeed(app, record)
}

// AssetPresenceTargetForTest 测试桥：构造探测目标。
func AssetPresenceTargetForTest(assetID string, ip string) assetPresenceTarget {
	return assetPresenceTarget{AssetID: assetID, IP: ip}
}

// ApplyAssetPresenceResultForTest 测试桥：应用探测结果。
func ApplyAssetPresenceResultForTest(app core.App, h *Hub, target assetPresenceTarget, success bool, latencyMs int64) error {
	return h.applyAssetPresenceResult(assetPresenceProbeResult{Target: target, Success: success, LatencyMs: latencyMs})
}

// ProbeHostPingForTest 测试桥：probeHostPing。
func ProbeHostPingForTest(ctx context.Context, ip string) (bool, int64, error) {
	return probeHostPing(ctx, ip)
}
