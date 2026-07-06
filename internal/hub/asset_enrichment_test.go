//go:build testing

package hub_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/core"
	"github.com/stretchr/testify/require"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

type assetEnrichmentFixture struct {
	hub     *pulseTests.TestHub
	user    *core.Record
	headers map[string]string
	asset   *core.Record
}

func TestAssetEnrichmentReportCreatesSuggestions(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-report@example.com")

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Contains(t, response.Body, `"suggestions":`)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	require.Contains(t, reports[0].GetString("report"), "分阶段硬件识别")
	require.Contains(t, reports[0].GetString("report"), "写回规则")

	suggestions := fixture.findSuggestions(t)
	require.NotEmpty(t, suggestions)
	require.NotNil(t, findSuggestionByField(suggestions, "metadata.os"), "fields: %v", suggestionFields(suggestions))
	require.NotNil(t, findSuggestionByField(suggestions, "metadata.cpu_model"), "fields: %v", suggestionFields(suggestions))
	require.NotNil(t, findSuggestionByField(suggestions, "metadata.memory_gb"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentReportIncludesOnlineSupportSource(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-online@example.com")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方支持</title></head><body>Redmi K50 规格与支持资料</body></html>`))
	}))
	t.Cleanup(server.Close)

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = server.URL + "/support/redmi-k50"
	metadata["internal_model"] = "22021211RC"
	asset.Set("vendor", "Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	sourceSummary := recordJSONField(t, reports[0], "source_summary")
	onlineMatch, ok := sourceSummary["online_match"].(map[string]any)
	require.True(t, ok, "source_summary: %v", sourceSummary)
	require.Equal(t, "ready", onlineMatch["status"])

	sources, ok := onlineMatch["sources"].([]any)
	require.True(t, ok, "online_match: %v", onlineMatch)
	require.NotEmpty(t, sources)
	firstSource, ok := sources[0].(map[string]any)
	require.True(t, ok, "sources: %v", sources)
	require.Equal(t, "support_url", firstSource["provider"])
	require.Equal(t, "official_support", firstSource["type"])
	require.Contains(t, firstSource["title"], "Redmi K50")

	suggestions := fixture.findSuggestions(t)
	onlineNote := findSuggestionByField(suggestions, "metadata.hardware_match_note")
	require.NotNil(t, onlineNote, "fields: %v", suggestionFields(suggestions))
	require.Equal(t, "online", onlineNote.GetString("source"))
	require.Contains(t, onlineNote.GetString("online_value"), server.URL)
}

func TestAssetEnrichmentOnlineDetailedSpecsFromSupportPage(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-phone-specs@example.com")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/product/redmik50/specs.js") {
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
			_, _ = w.Write([]byte(`e._v("天玑8100");e._v("工艺制程：台积电5nm");e._v("CPU架构：Cortex-A78 + Cortex-A55，最高主频可达2.85GHz");e._v("CPU核数：八核处理器");e._v("GPU：Mali-G610 六核");e._v("OLED 柔性直屏");e._v("尺寸：6.67英寸");e._v("分辨率：3200*1440（2K）");e._v("显示帧率：最高 120Hz");e._v("触控采样率：最高 480Hz");e._v("8bit｜DCI-P3｜HDR10/10+视频｜AI显示｜护眼模式｜阳光屏丨杜比视界");e._v("康宁®大猩猩®玻璃Victus™");e._v("后置 4800 万像素三摄");e._v("4800 万像素主摄： IMX582｜1/2英寸感光元件｜6P镜头｜1.6μm 融合像素｜OIS光学防抖");e._v("800万 像素超广角镜头：119° FOV");e._v("200万 像素微距镜头");e._v("5500mAh 大电量 + 67W 闪充");e._v("VC 液冷散热");e._v("立体声双扬声器");e._v("Hi-Res Audio认证｜Hi-Res Wireless认证｜杜比全景声");`))
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 规格</title><meta name="description" content="Redmi K50 天玑 8100、2K 直屏、5500mAh 电池、67W 快充"><meta property="og:image" content="/redmi-k50-official.png"><script src="/product/redmik50/specs.js"></script></head><body>
			<h1>Redmi K50</h1>
			<p>天玑 8100，5nm，Mali-G610，有点狠的 2K 直屏，OLED，3200 x 1440 pixels，120 Hz 屏幕刷新率，1200 nits，Corning Gorilla Glass Victus。</p>
			<p>5500 mAh Li-Po 电池，67W 充电，30W wireless charging，rear 48 MP camera，front 20 MP camera，4K video recording。</p>
			<p>8GB RAM，256GB ROM，UFS 3.1，5G / LTE 全网通，Nano-SIM 双卡，GPS GLONASS Galileo BeiDou，USB-C，NFC，红外。</p>
			<p>IP53，stereo speakers，指纹识别。</p>
			<p>Dimensions: 76.15 x 163.1 x 8.48 mm, Weight: 201 g.</p>
		</body></html>`))
	}))
	t.Cleanup(server.Close)

	phoneAsset, err := pulseTests.CreateRecord(fixture.hub, "assets", map[string]any{
		"user":   fixture.user.Id,
		"name":   "RedmiK50",
		"type":   "phone",
		"status": "active",
		"vendor": "小米 / Redmi",
		"model":  "Redmi K50",
		"metadata": map[string]any{
			"support_url": server.URL + "/redmik50/specs",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	requireSuggestionValue(t, suggestions, "metadata.cpu_model", "天玑 8100")
	requireSuggestionValue(t, suggestions, "metadata.official_image_url", server.URL+"/redmi-k50-official.png")
	requireSuggestionValue(t, suggestions, "metadata.cpu_vendor", "MediaTek")
	requireSuggestionValue(t, suggestions, "metadata.cpu_process", "5nm")
	requireSuggestionValue(t, suggestions, "metadata.cpu_architecture", "Cortex-A78 + Cortex-A55")
	requireSuggestionValue(t, suggestions, "metadata.cpu_cores", "八核处理器")
	requireSuggestionValue(t, suggestions, "metadata.cpu_frequency", "2.85GHz")
	requireSuggestionValue(t, suggestions, "metadata.gpu_model", "Mali-G610")
	requireSuggestionValue(t, suggestions, "metadata.gpu_detail", "Mali-G610 六核")
	requireSuggestionValue(t, suggestions, "metadata.screen_size", "6.67英寸")
	requireSuggestionValue(t, suggestions, "metadata.display_type", "OLED")
	requireSuggestionValue(t, suggestions, "metadata.display_resolution", "3200 x 1440 pixels")
	requireSuggestionValue(t, suggestions, "metadata.screen_refresh_rate", "120 Hz")
	requireSuggestionValue(t, suggestions, "metadata.touch_sampling_rate", "480 Hz")
	requireSuggestionValue(t, suggestions, "metadata.display_color_depth", "8bit / DCI-P3")
	requireSuggestionValue(t, suggestions, "metadata.hdr_support", "HDR10/10+视频 / AI显示 / 护眼模式 / 阳光屏 / 杜比视界")
	requireSuggestionValue(t, suggestions, "metadata.display_brightness", "1200 nits")
	requireSuggestionValue(t, suggestions, "metadata.display_protection", "Corning Gorilla Glass Victus")
	requireSuggestionValue(t, suggestions, "metadata.battery_capacity_mah", "5500 mAh")
	requireSuggestionValue(t, suggestions, "metadata.battery_type", "Li-Po")
	requireSuggestionValue(t, suggestions, "metadata.charging_power_w", "67W")
	requireSuggestionValue(t, suggestions, "metadata.wireless_charging", "30W wireless charging")
	requireSuggestionValue(t, suggestions, "metadata.rear_camera_detail", "rear 48 MP camera")
	requireSuggestionValue(t, suggestions, "metadata.rear_main_camera", "4800 万像素主摄： IMX582 / 1/2英寸感光元件 / 6P镜头 / 1.6μm 融合像素 / OIS光学防抖")
	requireSuggestionValue(t, suggestions, "metadata.rear_ultrawide_camera", "800万 像素超广角镜头：119° FOV")
	requireSuggestionValue(t, suggestions, "metadata.rear_macro_camera", "200万 像素微距镜头")
	requireSuggestionValue(t, suggestions, "metadata.front_camera_detail", "front 20 MP camera")
	requireSuggestionValue(t, suggestions, "metadata.video_recording", "4K video recording")
	requireSuggestionValue(t, suggestions, "metadata.storage_detail", "UFS 3.1")
	requireSuggestionValue(t, suggestions, "metadata.mobile_network", "5G / LTE / 全网通")
	requireSuggestionValue(t, suggestions, "metadata.positioning", "GPS GLONASS Galileo BeiDou")
	requireSuggestionValue(t, suggestions, "metadata.weight", "201 g")
	require.NotEqual(t, "5G", findSuggestionByField(suggestions, "metadata.weight").GetString("recommended_value"))
	requireSuggestionValue(t, suggestions, "metadata.dimensions", "76.15 x 163.1 x 8.48 mm")
	requireSuggestionValue(t, suggestions, "metadata.nfc", "支持 NFC")
	requireSuggestionValue(t, suggestions, "metadata.infrared", "支持红外")
	requireSuggestionValue(t, suggestions, "metadata.water_resistance", "IP53")
	requireSuggestionValue(t, suggestions, "metadata.speaker_detail", "stereo speakers")
	requireSuggestionValue(t, suggestions, "metadata.audio_detail", "Hi-Res Audio认证 / Hi-Res Wireless认证 / 杜比全景声")
	requireSuggestionValue(t, suggestions, "metadata.image_stabilization", "OIS 光学防抖")
	requireSuggestionValue(t, suggestions, "metadata.cooling_system", "VC 液冷散热")
	requireSuggestionValue(t, suggestions, "metadata.sensor_detail", "指纹识别")
	require.NotNil(t, findSuggestionByField(suggestions, "metadata.online_specs_summary"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentOnlineAIExtractorCreatesSuggestions(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai@example.com")
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 规格</title></head><body>Redmi K50 官方规格资料。</body></html>`))
	}))
	t.Cleanup(supportServer.Close)
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"mobile_network\",\"label\":\"蜂窝网络\",\"value\":\"5G / LTE / 全网通\",\"confidence\":82,\"notes\":\"来自规格资料。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]},{\"field\":\"not_allowed\",\"label\":\"非法\",\"value\":\"nope\",\"confidence\":90}]}"}}]}`))
	}))
	t.Cleanup(aiServer.Close)
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENDPOINT", aiServer.URL+"/v1/chat/completions")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_API_KEY", "test-key")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_MODEL", "test-model")

	phoneAsset, err := pulseTests.CreateRecord(fixture.hub, "assets", map[string]any{
		"user":   fixture.user.Id,
		"name":   "RedmiK50",
		"type":   "phone",
		"status": "active",
		"vendor": "小米 / Redmi",
		"model":  "Redmi K50",
		"metadata": map[string]any{
			"support_url": supportServer.URL + "/redmik50/specs",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	requireSuggestionValue(t, suggestions, "metadata.mobile_network", "5G / LTE / 全网通")
	require.Nil(t, findSuggestionByField(suggestions, "metadata.not_allowed"), "fields: %v", suggestionFields(suggestions))

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	sourceSummary := recordJSONField(t, reports[0], "source_summary")
	onlineMatch, ok := sourceSummary["online_match"].(map[string]any)
	require.True(t, ok, "source_summary: %v", sourceSummary)
	aiExtractor, ok := onlineMatch["ai_extractor"].(map[string]any)
	require.True(t, ok, "online_match: %v", onlineMatch)
	require.Equal(t, "ready", aiExtractor["status"])
	require.Equal(t, "test-model", aiExtractor["model"])
}

func TestAssetEnrichmentConfigEndpointReturnsAdminKeyAndSanitizesEndpoint(t *testing.T) {
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_PROVIDER", "test-provider")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENDPOINT", "https://llm.example.test/v1/chat/completions?key=should-not-leak")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_API_KEY", "super-secret-key")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_MODEL", "test-model")

	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(hub.Cleanup)
	hub.StartHub()

	adminUser, err := pulseTests.CreateUserWithRole(hub, "asset-enrichment-config-admin@example.com", "password", "admin")
	require.NoError(t, err)
	adminToken, err := adminUser.NewAuthToken()
	require.NoError(t, err)

	normalUser, err := pulseTests.CreateUser(hub, "asset-enrichment-config-user@example.com", "password")
	require.NoError(t, err)
	normalToken, err := normalUser.NewAuthToken()
	require.NoError(t, err)

	forbidden := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodGet,
		"/api/pulse/asset-enrichment/config",
		nil,
		map[string]string{"Authorization": normalToken},
	)
	require.Equal(t, http.StatusForbidden, forbidden.Status, forbidden.Body)

	response := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodGet,
		"/api/pulse/asset-enrichment/config",
		nil,
		map[string]string{"Authorization": adminToken},
	)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Contains(t, response.Body, "super-secret-key")
	require.NotContains(t, response.Body, "should-not-leak")

	var payload map[string]any
	require.NoError(t, json.Unmarshal([]byte(response.Body), &payload))
	require.NotContains(t, payload, "public_search_enabled")
	require.NotContains(t, payload, "brave_search_configured")
	require.NotContains(t, payload, "brave_search")

	ai, ok := payload["ai"].(map[string]any)
	require.True(t, ok, "payload: %v", payload)
	require.Equal(t, true, ai["enabled"])
	require.Equal(t, "agnes", ai["provider"])
	require.Equal(t, true, ai["endpoint_configured"])
	require.Equal(t, "llm.example.test", ai["endpoint_host"])
	require.Equal(t, "https://llm.example.test/v1/chat/completions", ai["endpoint"])
	require.Equal(t, "super-secret-key", ai["api_key"])
	require.Equal(t, true, ai["api_key_configured"])
	require.Equal(t, "test-model", ai["model"])
	require.Equal(t, true, ai["ready"])
}

func TestAssetEnrichmentConfigUsesAgnesDefaults(t *testing.T) {
	t.Setenv("PULSE_AGNES_API_KEY", "agnes-test-key")

	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(hub.Cleanup)
	hub.StartHub()

	adminUser, err := pulseTests.CreateUserWithRole(hub, "asset-enrichment-config-agnes@example.com", "password", "admin")
	require.NoError(t, err)
	adminToken, err := adminUser.NewAuthToken()
	require.NoError(t, err)

	response := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodGet,
		"/api/pulse/asset-enrichment/config",
		nil,
		map[string]string{"Authorization": adminToken},
	)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Contains(t, response.Body, "agnes-test-key")

	var payload map[string]any
	require.NoError(t, json.Unmarshal([]byte(response.Body), &payload))
	ai, ok := payload["ai"].(map[string]any)
	require.True(t, ok, "payload: %v", payload)
	require.Equal(t, true, ai["enabled"])
	require.Equal(t, "agnes", ai["provider"])
	require.Equal(t, "agnes-test-key", ai["api_key"])
	require.Equal(t, "apihub.agnes-ai.com", ai["endpoint_host"])
	require.Equal(t, "agnes-2.0-flash", ai["model"])
	require.Equal(t, true, ai["ready"])

	visualAI, ok := payload["visual_ai"].(map[string]any)
	require.True(t, ok, "payload: %v", payload)
	require.Equal(t, true, visualAI["enabled"])
	require.Equal(t, "agnes", visualAI["provider"])
	require.Equal(t, "agnes-test-key", visualAI["api_key"])
	require.Equal(t, "apihub.agnes-ai.com", visualAI["endpoint_host"])
	require.Equal(t, "agnes-image-2.1-flash", visualAI["model"])
	require.Equal(t, true, visualAI["ready"])
}

func TestAssetEnrichmentConfigUpdateStoresEditableSettingsAndReturnsAdminKeys(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(hub.Cleanup)
	hub.StartHub()

	adminUser, err := pulseTests.CreateUserWithRole(hub, "asset-enrichment-config-update@example.com", "password", "admin")
	require.NoError(t, err)
	adminToken, err := adminUser.NewAuthToken()
	require.NoError(t, err)

	requestBody, err := json.Marshal(map[string]any{
		"base_url": "https://proxy.example.test/v1?key=do-not-return",
		"ai": map[string]any{
			"enabled":  true,
			"provider": "agnes",
			"endpoint": "https://llm.example.test/v1/chat/completions?key=do-not-return",
			"api_key":  "ai-updated-secret",
			"model":    "agnes-2.0-flash",
		},
		"visual_ai": map[string]any{
			"enabled":     true,
			"provider":    "agnes",
			"endpoint":    "https://image.example.test/v1/images/generations?token=do-not-return",
			"api_key":     "visual-updated-secret",
			"model":       "agnes-image-2.1-flash",
			"frame_count": 5,
		},
	})
	require.NoError(t, err)

	response := pulseTests.PerformTestAPIRequest(
		t,
		hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment/config",
		bytes.NewReader(requestBody),
		map[string]string{"Authorization": adminToken},
	)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Contains(t, response.Body, "ai-updated-secret")
	require.Contains(t, response.Body, "visual-updated-secret")
	require.NotContains(t, response.Body, "do-not-return")

	var payload map[string]any
	require.NoError(t, json.Unmarshal([]byte(response.Body), &payload))
	require.NotContains(t, payload, "public_search_enabled")
	require.NotContains(t, payload, "brave_search_configured")
	require.NotContains(t, payload, "brave_search")
	ai, ok := payload["ai"].(map[string]any)
	require.True(t, ok, "payload: %v", payload)
	require.Equal(t, "agnes", ai["provider"])
	require.Equal(t, "https://proxy.example.test/v1/chat/completions", ai["endpoint"])
	require.Equal(t, "ai-updated-secret", ai["api_key"])
	require.Equal(t, true, ai["ready"])
	visualAI, ok := payload["visual_ai"].(map[string]any)
	require.True(t, ok, "payload: %v", payload)
	require.Equal(t, "agnes", visualAI["provider"])
	require.Equal(t, "https://proxy.example.test/v1/images/generations", visualAI["endpoint"])
	require.Equal(t, "visual-updated-secret", visualAI["api_key"])
	require.Equal(t, float64(6), visualAI["frame_count"])
	require.Equal(t, true, visualAI["ready"])
}

func TestAssetVisualCollectsTraceableImagesWithoutImageGeneration(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-agnes@example.com")
	var imageRequests []map[string]any
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "Bearer visual-test-key", r.Header.Get("Authorization"))
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		imageRequests = append(imageRequests, payload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"https://example.test/redmi-k50-frame.png"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title><meta property="og:image" content="/redmi-k50-official.png"></head><body>
			Redmi K50 官方产品资料。
			<img src="/redmi-k50-front.png" alt="Redmi K50">
			<img srcset="/redmi-k50-back.png 1x, /redmi-k50-side.png 2x" alt="Redmi K50">
		</body></html>`))
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = referenceServer.URL + "/products/redmi-k50"
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"frame_count": 4, "color": "墨羽黑"})
	require.NoError(t, err)
	response := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		fmt.Sprintf("/api/pulse/assets/%s/visuals/turntable", asset.Id),
		bytes.NewReader(requestBody),
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Empty(t, imageRequests)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Len(t, visuals, 1)
	require.Equal(t, "ready", visuals[0].GetString("status"))
	require.Equal(t, "official_reference", visuals[0].GetString("kind"))
	require.Equal(t, 4, visuals[0].GetInt("frame_count"))
	frames := recordJSONField(t, visuals[0], "frames")
	require.Contains(t, fmt.Sprint(frames), referenceServer.URL+"/redmi-k50-official.png")
	require.Contains(t, fmt.Sprint(frames), referenceServer.URL+"/redmi-k50-front.png")
	require.Contains(t, fmt.Sprint(frames), referenceServer.URL+"/redmi-k50-back.png")
	require.Contains(t, fmt.Sprint(frames), referenceServer.URL+"/redmi-k50-side.png")
}

func TestAssetEnrichmentAcceptWritesMetadataAndChange(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-accept@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestion := findSuggestionByField(fixture.findSuggestions(t), "metadata.os")
	require.NotNil(t, suggestion)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+suggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, acceptResponse.Status, acceptResponse.Body)

	updatedAsset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, updatedAsset)
	require.Equal(t, "Windows 11 Pro", metadata["os"])

	updatedSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", suggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "accepted", updatedSuggestion.GetString("status"))

	changes, err := fixture.hub.FindRecordsByFilter("asset_changes", "asset = {:asset} && source_collection = 'assets'", "-created", -1, 0, map[string]any{
		"asset": fixture.asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, changes)
	require.Contains(t, changes[0].GetString("summary"), "确认补全建议")
}

func TestAssetEnrichmentAcceptRejectsStaleSuggestion(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-stale@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestion := findSuggestionByField(fixture.findSuggestions(t), "metadata.os")
	require.NotNil(t, suggestion)
	require.Empty(t, suggestion.GetString("current_value"))

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["os"] = "Manual OS"
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+suggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "资产主档当前值已变化")

	updatedSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", suggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "stale", updatedSuggestion.GetString("status"))
}

func TestAssetEnrichmentAcceptRejectsIllegalField(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-illegal@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	illegalSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "metadata.secret",
		"target_label":      "非法字段",
		"current_value":     "",
		"collected_value":   "should-not-write",
		"recommended_value": "should-not-write",
		"source":            "local",
		"confidence":        80,
		"conflict":          false,
		"status":            "pending",
		"notes":             "非法字段写回必须被 Hub 拦截。",
		"metadata":          map[string]any{},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+illegalSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "字段不允许")
}

func newAssetEnrichmentFixture(t testing.TB, email string) assetEnrichmentFixture {
	t.Helper()

	hub, err := pulseTests.NewTestHub(t.TempDir())
	require.NoError(t, err)
	t.Cleanup(hub.Cleanup)
	hub.StartHub()

	user, err := pulseTests.CreateUser(hub, email, "password")
	require.NoError(t, err)
	token, err := user.NewAuthToken()
	require.NoError(t, err)
	headers := map[string]string{"Authorization": token}

	asset, err := pulseTests.CreateRecord(hub, "assets", map[string]any{
		"user":          user.Id,
		"name":          "Archive Host",
		"type":          "physical_host",
		"status":        "active",
		"management_ip": "192.168.1.10",
		"model":         "Custom PC",
		"metadata": map[string]any{
			"fixed_ipv4": "192.168.1.10",
		},
	})
	require.NoError(t, err)
	system, err := pulseTests.CreateRecord(hub, "systems", map[string]any{
		"name":         "agent-host",
		"display_name": "Agent Host",
		"users":        []string{user.Id},
		"asset":        asset.Id,
		"status":       "up",
		"target_ip":    "192.168.1.10",
		"connect_ip":   "192.168.1.10",
		"info": map[string]any{
			"ip": "192.168.1.10",
			"m":  "13th Gen Intel(R) Core(TM) i7-13700K",
			"o":  "Windows",
		},
	})
	require.NoError(t, err)
	_, err = pulseTests.CreateRecord(hub, "system_details", map[string]any{
		"system":     system.Id,
		"hostname":   "agent-host",
		"os_name":    "Windows 11 Pro",
		"cpu":        "13th Gen Intel(R) Core(TM) i7-13700K",
		"cpu_vendor": "Intel",
		"memory":     float64(32 * 1024 * 1024 * 1024),
		"memory_modules": []map[string]any{
			{
				"manufacturer": "Kingston",
				"part_number":  "KF560C36",
				"capacity":     float64(16 * 1024 * 1024 * 1024),
				"speed_mhz":    6000,
			},
			{
				"manufacturer": "Kingston",
				"part_number":  "KF560C36",
				"capacity":     float64(16 * 1024 * 1024 * 1024),
				"speed_mhz":    6000,
			},
		},
		"network_interfaces": []map[string]any{
			{
				"name":         "Ethernet",
				"display_name": "Intel I226-V",
				"mac":          "AA:BB:CC:DD:EE:01",
				"ipv4":         []string{"192.168.1.10"},
				"ipv6":         []string{"fe80::1"},
				"link_speed":   2500,
			},
		},
	})
	require.NoError(t, err)

	return assetEnrichmentFixture{
		hub:     hub,
		user:    user,
		headers: headers,
		asset:   asset,
	}
}

func (f assetEnrichmentFixture) generateReport(t testing.TB) pulseTests.TestAPIResponse {
	t.Helper()
	return pulseTests.PerformTestAPIRequest(
		t,
		f.hub.TestApp,
		http.MethodPost,
		fmt.Sprintf("/api/pulse/assets/%s/enrichment-reports", f.asset.Id),
		nil,
		f.headers,
	)
}

func (f assetEnrichmentFixture) findReports(t testing.TB) []*core.Record {
	t.Helper()
	reports, err := f.hub.FindRecordsByFilter("asset_enrichment_reports", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": f.asset.Id,
	})
	require.NoError(t, err)
	return reports
}

func (f assetEnrichmentFixture) findSuggestions(t testing.TB) []*core.Record {
	t.Helper()
	suggestions, err := f.hub.FindRecordsByFilter("asset_enrichment_suggestions", "asset = {:asset}", "target_field", -1, 0, map[string]any{
		"asset": f.asset.Id,
	})
	require.NoError(t, err)
	return suggestions
}

func findSuggestionByField(suggestions []*core.Record, field string) *core.Record {
	for _, suggestion := range suggestions {
		if suggestion.GetString("target_field") == field {
			return suggestion
		}
	}
	return nil
}

func suggestionFields(suggestions []*core.Record) []string {
	fields := make([]string, 0, len(suggestions))
	for _, suggestion := range suggestions {
		fields = append(fields, suggestion.GetString("target_field"))
	}
	return fields
}

func requireSuggestionValue(t testing.TB, suggestions []*core.Record, field string, value string) {
	t.Helper()
	suggestion := findSuggestionByField(suggestions, field)
	require.NotNil(t, suggestion, "fields: %v", suggestionFields(suggestions))
	require.Equal(t, value, suggestion.GetString("recommended_value"))
}

func recordMetadata(t testing.TB, record *core.Record) map[string]any {
	t.Helper()
	return recordJSONField(t, record, "metadata")
}

func recordJSONField(t testing.TB, record *core.Record, field string) map[string]any {
	t.Helper()
	var values map[string]any
	if err := record.UnmarshalJSONField(field, &values); err != nil || values == nil {
		raw := strings.TrimSpace(record.GetString(field))
		require.True(t, raw == "" || json.Unmarshal([]byte(raw), &values) == nil)
	}
	if values == nil {
		values = map[string]any{}
	}
	return values
}
