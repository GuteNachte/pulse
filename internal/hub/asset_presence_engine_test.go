package hub_test

import (
	"context"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/hub"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

// 2026-10-25 设备在线探测：资产筛选与 upsert 状态落库测试（外部测试包，
// 经 NewTestHub 跑真实迁移）。状态机纯函数在 asset_presence_state_test.go（hub 包内）。

func newPresenceTestHub(t *testing.T) *pulseTests.TestHub {
	t.Helper()
	testHub, err := pulseTests.NewTestHub(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { testHub.Cleanup() })
	return testHub
}

// newPresenceTestAsset 每次用唯一邮箱建 owner，避免同库多资产撞唯一约束。
func newPresenceTestAsset(t *testing.T, testHub *pulseTests.TestHub, typ string, ip string) *core.Record {
	t.Helper()
	collection, err := testHub.App.FindCachedCollectionByNameOrId("assets")
	if err != nil {
		t.Fatal(err)
	}
	email := "presence-owner-" + strings.ToLower(strings.ReplaceAll(t.Name(), "/", "-")) + "-" + ip + "@test.local"
	owner, err := pulseTests.CreateUser(testHub.App, email, "presence-test-123456")
	if err != nil {
		t.Fatalf("创建测试用户失败: %v", err)
	}
	record := core.NewRecord(collection)
	record.Set("name", "presence-test-"+typ)
	record.Set("type", typ)
	record.Set("management_ip", ip)
	record.Set("status", "active")
	record.Set("user", owner.Id)
	if err := testHub.App.SaveNoValidate(record); err != nil {
		t.Fatalf("保存测试资产失败: %v", err)
	}
	return record
}

func presenceEngine(testHub *pulseTests.TestHub) *hub.Hub {
	return testHub.Hub
}

func TestAssetPresenceEligible(t *testing.T) {
	testHub := newPresenceTestHub(t)

	cases := []struct {
		name string
		typ  string
		ip   string
		want bool
	}{
		{"正常内网IP", "nas", "192.168.1.30", true},
		{"手机类型排除", "phone", "192.168.1.99", false},
		{"空IP排除", "switch", "", false},
		{"回环地址排除", "switch", "127.0.0.1", false},
		{"链路本地排除", "switch", "169.254.1.1", false},
		{"非法IP排除", "switch", "not-an-ip", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			record := newPresenceTestAsset(t, testHub, tc.typ, tc.ip)
			if got := hub.AssetPresenceEligible(record); got != tc.want {
				t.Fatalf("AssetPresenceEligible(type=%q, ip=%q) = %v, want %v", tc.typ, tc.ip, got, tc.want)
			}
		})
	}
}

func TestUpsertAssetPresenceSeed(t *testing.T) {
	testHub := newPresenceTestHub(t)

	asset := newPresenceTestAsset(t, testHub, "switch", "192.168.1.2")

	// 合规资产：生成 unknown 种子
	if err := hub.UpsetAssetPresenceSeedForTest(testHub, asset); err != nil {
		t.Fatal(err)
	}
	seed, err := testHub.App.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": asset.Id})
	if err != nil || seed == nil {
		t.Fatalf("合规资产应有 presence 种子: %v", err)
	}
	if seed.GetString("status") != "unknown" {
		t.Fatalf("种子状态应为 unknown，实际 %q", seed.GetString("status"))
	}

	// 再次调用不覆盖已有状态
	seed.Set("status", "online")
	if err := testHub.App.SaveNoValidate(seed); err != nil {
		t.Fatal(err)
	}
	if err := hub.UpsetAssetPresenceSeedForTest(testHub, asset); err != nil {
		t.Fatal(err)
	}
	seed, _ = testHub.App.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": asset.Id})
	if seed.GetString("status") != "online" {
		t.Fatalf("重复种子不应覆盖已有状态，实际 %q", seed.GetString("status"))
	}

	// 资产改为手机（退出范围）：记录被清理
	asset.Set("type", "phone")
	if err := testHub.App.Save(asset); err != nil {
		t.Fatal(err)
	}
	if err := hub.UpsetAssetPresenceSeedForTest(testHub, asset); err != nil {
		t.Fatal(err)
	}
	seed, _ = testHub.App.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": asset.Id})
	if seed != nil {
		t.Fatal("退出探测范围的资产记录应被清理")
	}

	// 资产删除：记录级联清理
	asset.Set("type", "switch")
	if err := testHub.App.Save(asset); err != nil {
		t.Fatal(err)
	}
	if err := hub.UpsetAssetPresenceSeedForTest(testHub, asset); err != nil {
		t.Fatal(err)
	}
	if err := testHub.App.Delete(asset); err != nil {
		t.Fatal(err)
	}
	seed, _ = testHub.App.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": asset.Id})
	if seed != nil {
		t.Fatal("资产删除后 presence 记录应级联清理")
	}
}

func TestApplyAssetPresenceResultUpsert(t *testing.T) {
	testHub := newPresenceTestHub(t)
	engine := presenceEngine(testHub)
	asset := newPresenceTestAsset(t, testHub, "nas", "192.168.1.30")
	target := hub.AssetPresenceTargetForTest(asset.Id, "192.168.1.30")

	// 首次失败：unknown + streak 1
	if err := hub.ApplyAssetPresenceResultForTest(testHub, engine, target, false, 0); err != nil {
		t.Fatal(err)
	}
	record, err := testHub.App.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": asset.Id})
	if err != nil {
		t.Fatalf("结果应自动建记录: %v", err)
	}
	if record.GetString("status") != "unknown" || record.GetInt("fail_streak") != 1 {
		t.Fatalf("首次失败应为 unknown/1，实际 %q/%d", record.GetString("status"), record.GetInt("fail_streak"))
	}

	// 成功：online + 延迟 + last_seen
	if err := hub.ApplyAssetPresenceResultForTest(testHub, engine, target, true, 12); err != nil {
		t.Fatal(err)
	}
	record, _ = testHub.App.FindFirstRecordByFilter("asset_presence", "asset = {:asset}", map[string]any{"asset": asset.Id})
	if record.GetString("status") != "online" || record.GetInt("latency_ms") != 12 {
		t.Fatalf("成功应为 online/12ms，实际 %q/%d", record.GetString("status"), record.GetInt("latency_ms"))
	}
	if strings.TrimSpace(record.GetString("last_seen")) == "" {
		t.Fatal("成功应记录 last_seen")
	}
}

func TestProbeHostPingLocalhost(t *testing.T) {
	success, _, err := hub.ProbeHostPingForTest(context.Background(), "127.0.0.1")
	if err != nil {
		t.Fatal(err)
	}
	if !success {
		t.Fatal("ping 回环地址应成功")
	}
}
