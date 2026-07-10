//go:build testing

package hub_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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
	require.Nil(t, findSuggestionByField(suggestions, "metadata.os"), "fields: %v", suggestionFields(suggestions))
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

func TestAssetEnrichmentDiscoversOfficialSourcesWithAIWhenNoReferenceURL(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-source-discovery@example.com")
	sourceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/redmik50/specs" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方规格</title><meta property="og:image" content="/redmi-k50.png"></head><body>Redmi K50 官方规格，天玑 8100，墨羽黑，银迹，幽芒。</body></html>`))
	}))
	t.Cleanup(sourceServer.Close)

	aiCalls := 0
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		aiCalls++
		w.Header().Set("Content-Type", "application/json")
		switch aiCalls {
		case 1:
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"source_urls\":[\"` + sourceServer.URL + `/redmik50/specs\"]}"}}]}`))
		default:
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽黑, 银迹, 幽芒\",\"confidence\":92,\"notes\":\"来自官方规格页。\",\"source_urls\":[\"` + sourceServer.URL + `/redmik50/specs\"]}]}"}}]}`))
		}
	}))
	t.Cleanup(aiServer.Close)
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENDPOINT", aiServer.URL+"/v1/chat/completions")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_API_KEY", "test-key")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_MODEL", "test-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	delete(metadata, "support_url")
	delete(metadata, "product_url")
	delete(metadata, "official_url")
	metadata["internal_model"] = "22041211AC"
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.GreaterOrEqual(t, aiCalls, 2, "expected source discovery and extraction calls")

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	sourceSummary := recordJSONField(t, reports[0], "source_summary")
	onlineMatch, ok := sourceSummary["online_match"].(map[string]any)
	require.True(t, ok, "source_summary: %v", sourceSummary)
	require.Equal(t, "ready", onlineMatch["status"], "online_match: %v", onlineMatch)
	require.Contains(t, fmt.Sprint(onlineMatch["providers"]), "asset_agent")
	require.Contains(t, fmt.Sprint(onlineMatch["sources"]), sourceServer.URL+"/redmik50/specs")
	require.Contains(t, fmt.Sprint(onlineMatch["sources"]), "official")

	suggestions := fixture.findSuggestions(t)
	requireSuggestionValue(t, suggestions, "metadata.colors_available", "墨羽黑, 银迹, 幽芒")
}

func TestAssetEnrichmentSkipsOversizedReferencePageBeforeParsing(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-oversized-reference-page@example.com")
	body := `<html><head><title>Redmi K50 官方支持</title></head><body>` + strings.Repeat("Redmi K50 规格资料。", 40*1024) + `</body></html>`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Length", fmt.Sprint(len([]byte(body))))
		_, _ = io.WriteString(w, body)
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
	require.NotEqual(t, "ready", onlineMatch["status"], "online_match: %v", onlineMatch)
	require.Empty(t, onlineMatch["sources"], "oversized page should not be parsed as a usable source: %v", onlineMatch)
	require.Contains(t, fmt.Sprint(onlineMatch["errors"]), "读取失败")
	require.Contains(t, fmt.Sprint(onlineMatch["errors"]), "超过抓取大小上限")

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.hardware_match_note"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentSkipsUnsupportedReferencePageContentType(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-unsupported-reference-page-type@example.com")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/pdf")
		_, _ = w.Write([]byte("%PDF-1.7 Redmi K50 官方支持资料"))
	}))
	t.Cleanup(server.Close)

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = server.URL + "/support/redmi-k50.pdf"
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
	require.NotEqual(t, "ready", onlineMatch["status"], "online_match: %v", onlineMatch)
	require.Empty(t, onlineMatch["sources"], "binary page should not be parsed as a usable source: %v", onlineMatch)
	require.Contains(t, fmt.Sprint(onlineMatch["errors"]), "读取失败")
	require.Contains(t, fmt.Sprint(onlineMatch["errors"]), "资料页类型不支持")
	require.Contains(t, fmt.Sprint(onlineMatch["errors"]), "application/pdf")

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.hardware_match_note"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentReportUsesProductURLSource(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-product-url@example.com")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 产品规格</title><meta property="og:image" content="/redmi-k50-product.png"></head><body>
			<h1>Redmi K50</h1>
			<p>天玑 8100，OLED 直屏，5500 mAh 电池，67W 快充。</p>
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
	})
	require.NoError(t, err)
	metadata := recordMetadata(t, phoneAsset)
	metadata["internal_model"] = "22041211AC"
	metadata["product_url"] = server.URL + "/product/redmik50/specs"
	phoneAsset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(phoneAsset))
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	sourceSummary := recordJSONField(t, reports[0], "source_summary")
	onlineMatch, ok := sourceSummary["online_match"].(map[string]any)
	require.True(t, ok, "source_summary: %v", sourceSummary)
	require.Equalf(t, "ready", onlineMatch["status"], "online_match: %v", onlineMatch)

	sources, ok := onlineMatch["sources"].([]any)
	require.True(t, ok, "online_match: %v", onlineMatch)
	require.NotEmpty(t, sources)
	firstSource, ok := sources[0].(map[string]any)
	require.True(t, ok, "sources: %v", sources)
	require.Equal(t, "product_url", firstSource["provider"])
	require.Equal(t, "official_product", firstSource["type"])

	suggestions := fixture.findSuggestions(t)
	requireSuggestionValue(t, suggestions, "metadata.cpu_model", "天玑 8100")
	requireSuggestionValue(t, suggestions, "metadata.official_image_url", server.URL+"/redmi-k50-product.png")
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

func TestAssetEnrichmentDoesNotSuggestOfficialImageFromLowTrustSupportURL(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-low-trust-image@example.com")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>个人博客 Redmi K50 图赏</title><meta property="og:image" content="/blog-redmi-k50.jpg"></head><body>
			<h1>非官方 Redmi K50 图赏</h1>
			<p>这是一篇普通博客文章，不是厂家官网、支持页、规格页或官方 CDN。</p>
		</body></html>`))
	}))
	t.Cleanup(server.Close)

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = server.URL + "/blog/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.official_image_url"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentDoesNotTreatSupportPathOnUnknownHostAsOfficial(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-unknown-host-support-path@example.com")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>第三方资料 Redmi K50</title><meta property="og:image" content="/third-party-redmi-k50.jpg"></head><body>
			<h1>Redmi K50 第三方资料页</h1>
			<p>这个页面路径虽然包含 support，但域名不是厂家官网。</p>
		</body></html>`))
	}))
	t.Cleanup(server.Close)

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = server.URL + "/support/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	asset.Set("vendor", "小米 / Redmi")
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
	sources, ok := onlineMatch["sources"].([]any)
	require.True(t, ok, "online_match: %v", onlineMatch)
	require.NotEmpty(t, sources)
	firstSource, ok := sources[0].(map[string]any)
	require.True(t, ok, "sources: %v", sources)
	require.Equal(t, "web_result", firstSource["type"])

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.official_image_url"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentDoesNotPromoteUnknownSupportPathWithoutOfficialSignal(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-unknown-support-neutral-title@example.com")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 Support Specs</title><meta property="og:image" content="/redmi-k50.jpg"></head><body>
			<h1>Redmi K50 Support Specs</h1>
			<p>这个页面没有厂家域名，也没有明确官方语义。</p>
		</body></html>`))
	}))
	t.Cleanup(server.Close)

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = server.URL + "/support/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	asset.Set("vendor", "小米 / Redmi")
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
	sources, ok := onlineMatch["sources"].([]any)
	require.True(t, ok, "online_match: %v", onlineMatch)
	require.NotEmpty(t, sources)
	firstSource, ok := sources[0].(map[string]any)
	require.True(t, ok, "sources: %v", sources)
	require.Equal(t, "web_result", firstSource["type"])

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.official_image_url"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentRejectsOfficialAIFieldsFromLowTrustSupportURL(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-low-trust-support-ai@example.com")
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>个人博客 Redmi K50 图赏</title><meta property="og:image" content="/blog-redmi-k50.jpg"></head><body>
			<h1>非官方 Redmi K50 图赏</h1>
			<p>普通博客文章提到了墨羽、星月白、藤野紫，但它不是厂家官方来源。</p>
		</body></html>`))
	}))
	t.Cleanup(supportServer.Close)
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽, 星月白, 藤野紫\",\"confidence\":96,\"notes\":\"模型从页面提取。\",\"source_urls\":[\"` + supportServer.URL + `/blog/redmi-k50\"]},{\"field\":\"official_image_url\",\"label\":\"官方图片\",\"value\":\"` + supportServer.URL + `/blog-redmi-k50.jpg\",\"confidence\":96,\"notes\":\"模型从页面提取。\",\"source_urls\":[\"` + supportServer.URL + `/blog/redmi-k50\"]}]}"}}]}`))
	}))
	t.Cleanup(aiServer.Close)
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_ENDPOINT", aiServer.URL+"/v1/chat/completions")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_API_KEY", "test-key")
	t.Setenv("PULSE_ASSET_ENRICHMENT_AI_MODEL", "test-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = supportServer.URL + "/blog/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	response := fixture.generateReportWithBody(t, map[string]any{"focus": "official_colors"})
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.colors_available"), "fields: %v", suggestionFields(suggestions))
	require.Nil(t, findSuggestionByField(suggestions, "metadata.official_image_url"), "fields: %v", suggestionFields(suggestions))
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
		rawBody, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		var payload struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, json.Unmarshal(rawBody, &payload))
		require.Len(t, payload.Messages, 2)
		require.NotContains(t, payload.Messages[1].Content, `"device_os"`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"mobile_network\",\"label\":\"蜂窝网络\",\"value\":\"5G / LTE / 全网通\",\"confidence\":82,\"notes\":\"来自规格资料。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]},{\"field\":\"device_os\",\"label\":\"系统\",\"value\":\"Android 12\",\"confidence\":82,\"notes\":\"软件版本不应进入资产主档。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]},{\"field\":\"not_allowed\",\"label\":\"非法\",\"value\":\"nope\",\"confidence\":90},{\"field\":\"wifi_standard\",\"label\":\"无线\",\"value\":\"Wi-Fi 6\",\"confidence\":90,\"notes\":\"没有来源不应该采纳。\",\"source_urls\":[]}]}"}}]}`))
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
	require.Nil(t, findSuggestionByField(suggestions, "metadata.device_os"), "fields: %v", suggestionFields(suggestions))
	require.Nil(t, findSuggestionByField(suggestions, "metadata.not_allowed"), "fields: %v", suggestionFields(suggestions))
	require.Nil(t, findSuggestionByField(suggestions, "metadata.wifi_standard"), "fields: %v", suggestionFields(suggestions))

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

func TestAssetEnrichmentAIRetriesTransientModelFailure(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-retry@example.com")
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方规格</title></head><body>Redmi K50 官方规格资料，芯片为天玑 8100。</body></html>`))
	}))
	t.Cleanup(supportServer.Close)

	aiRequests := 0
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "Bearer test-key", r.Header.Get("Authorization"))
		aiRequests += 1
		if aiRequests == 1 {
			w.Header().Set("Retry-After", "0")
			http.Error(w, "temporary rate limit", http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"cpu_model\",\"label\":\"芯片 / SoC\",\"value\":\"天玑 8100\",\"confidence\":95,\"notes\":\"来自官方规格页。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    supportServer.URL + "/redmik50/specs",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Equal(t, 2, aiRequests)

	requireSuggestionValue(t, fixture.findSuggestions(t), "metadata.cpu_model", "天玑 8100")
	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	sourceSummary := recordJSONField(t, reports[0], "source_summary")
	onlineMatch, ok := sourceSummary["online_match"].(map[string]any)
	require.True(t, ok, "source_summary: %v", sourceSummary)
	aiExtractor, ok := onlineMatch["ai_extractor"].(map[string]any)
	require.True(t, ok, "online_match: %v", onlineMatch)
	require.Equal(t, "ready", aiExtractor["status"])
	require.Equal(t, float64(2), aiExtractor["attempts"])

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_enrichment'", "-created", -1, 0, map[string]any{
		"asset": phoneAsset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	outputSummary := recordJSONField(t, tasks[0], "output_summary")
	require.Equal(t, float64(2), outputSummary["ai_attempts"])
}

func TestAssetEnrichmentAIDoesNotRetryNonTransientModelFailure(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-no-retry@example.com")
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方规格</title></head><body>Redmi K50 官方规格资料。</body></html>`))
	}))
	t.Cleanup(supportServer.Close)

	aiRequests := 0
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		aiRequests += 1
		http.Error(w, "bad request", http.StatusBadRequest)
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
			"internal_model": "22041211AC",
			"support_url":    supportServer.URL + "/redmik50/specs",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Equal(t, 1, aiRequests)
	require.Nil(t, findSuggestionByField(fixture.findSuggestions(t), "metadata.cpu_model"), "fields: %v", suggestionFields(fixture.findSuggestions(t)))

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_enrichment'", "-created", -1, 0, map[string]any{
		"asset": phoneAsset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	require.Equal(t, "failed", tasks[0].GetString("status"))
	require.Contains(t, tasks[0].GetString("error"), "400")
	outputSummary := recordJSONField(t, tasks[0], "output_summary")
	require.Equal(t, float64(1), outputSummary["ai_attempts"])
}

func TestAssetEnrichmentOnlineAIExtractorKeepsLateRelevantSpecsInPayload(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-late-specs@example.com")
	filler := strings.Repeat("首页 导航 参数 总览 购买 链接。", 260)
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方规格</title></head><body>
			<p>` + filler + `</p>
			<section>官方配色：墨羽黑、银迹、幽芒。</section>
			<section>后置 4800 万像素三摄，5500 mAh 电池，67W 快充。</section>
		</body></html>`))
	}))
	t.Cleanup(supportServer.Close)
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		rawBody, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		var payload struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, json.Unmarshal(rawBody, &payload))
		require.Len(t, payload.Messages, 2)
		require.Contains(t, payload.Messages[1].Content, "官方配色：墨羽黑、银迹、幽芒")
		require.Contains(t, payload.Messages[1].Content, "后置 4800 万像素三摄")
		require.LessOrEqual(t, len([]rune(payload.Messages[1].Content)), 7000)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽黑, 银迹, 幽芒\",\"confidence\":92,\"notes\":\"来自官方规格页。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]},{\"field\":\"rear_camera_detail\",\"label\":\"后置影像\",\"value\":\"后置 4800 万像素三摄\",\"confidence\":90,\"notes\":\"来自官方规格页。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    supportServer.URL + "/redmik50/specs",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	requireSuggestionValue(t, suggestions, "metadata.colors_available", "墨羽黑, 银迹, 幽芒")
	requireSuggestionValue(t, suggestions, "metadata.rear_camera_detail", "后置 4800 万像素三摄")
}

func TestAssetEnrichmentOnlineAIExtractorCapsMultiSourceExcerptBudget(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-source-budget@example.com")
	filler := strings.Repeat("首页 导航 参数 总览 购买 链接。", 260)
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		switch r.URL.Path {
		case "/support/redmik50":
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方支持</title></head><body>
				<p>` + filler + `</p>
				<section>官方配色：墨羽黑、银迹、幽芒。</section>
			</body></html>`))
		case "/product/redmik50":
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
				<p>` + filler + `</p>
				<section>存储规格：UFS 3.1，存储容量 256 GB。</section>
			</body></html>`))
		case "/official/redmik50":
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官网资料页</title></head><body>
				<p>` + filler + `</p>
				<section>后置 4800 万像素光学防抖相机，5500 mAh 电池。</section>
			</body></html>`))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(supportServer.Close)
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		rawBody, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		var payload struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, json.Unmarshal(rawBody, &payload))
		require.Len(t, payload.Messages, 2)
		var userMessage struct {
			Sources []struct {
				URL     string `json:"url"`
				Excerpt string `json:"excerpt"`
			} `json:"sources"`
		}
		require.NoError(t, json.Unmarshal([]byte(payload.Messages[1].Content), &userMessage))
		require.Len(t, userMessage.Sources, 3)
		totalExcerptRunes := 0
		combinedExcerpts := ""
		for _, source := range userMessage.Sources {
			totalExcerptRunes += len([]rune(source.Excerpt))
			combinedExcerpts += source.Excerpt + "\n"
		}
		require.LessOrEqual(t, totalExcerptRunes, 1800)
		require.Contains(t, combinedExcerpts, "官方配色：墨羽黑、银迹、幽芒")
		require.Contains(t, combinedExcerpts, "UFS 3.1")
		require.Contains(t, combinedExcerpts, "4800 万像素")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    supportServer.URL + "/support/redmik50",
			"product_url":    supportServer.URL + "/product/redmik50",
			"official_url":   supportServer.URL + "/official/redmik50",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)
}

func TestAssetEnrichmentOfficialColorFocusOnlyCreatesColorSuggestions(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-color-focus@example.com")
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方规格</title><meta property="og:image" content="/redmi-k50.png"></head><body>官方配色：墨羽黑、银迹、幽芒。天玑8100。</body></html>`))
	}))
	t.Cleanup(supportServer.Close)
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		rawBody, err := io.ReadAll(r.Body)
		require.NoError(t, err)
		var payload struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		require.NoError(t, json.Unmarshal(rawBody, &payload))
		require.Len(t, payload.Messages, 2)
		require.Equal(t, "user", payload.Messages[1].Role)
		var userMessage struct {
			Focus         string   `json:"focus"`
			AllowedFields []string `json:"allowed_fields"`
		}
		require.NoError(t, json.Unmarshal([]byte(payload.Messages[1].Content), &userMessage))
		require.Equal(t, "official_colors", userMessage.Focus)
		require.Equal(t, []string{"colors_available", "official_image_url"}, userMessage.AllowedFields)
		require.NotContains(t, payload.Messages[1].Content, `"cpu_model"`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽黑, 银迹, 幽芒\",\"confidence\":92,\"notes\":\"来自官方规格页。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]},{\"field\":\"cpu_model\",\"label\":\"芯片\",\"value\":\"天玑 8100\",\"confidence\":92,\"notes\":\"本次不应采纳。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    supportServer.URL + "/redmik50/specs",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReportWithBody(t, map[string]any{"focus": "official_colors"})
	require.Equal(t, http.StatusOK, response.Status, response.Body)
	require.Contains(t, response.Body, `"focus":"official_colors"`)

	suggestions := fixture.findSuggestions(t)
	requireSuggestionValue(t, suggestions, "metadata.colors_available", "墨羽黑, 银迹, 幽芒")
	requireSuggestionValue(t, suggestions, "metadata.official_image_url", supportServer.URL+"/redmi-k50.png")
	require.Nil(t, findSuggestionByField(suggestions, "metadata.cpu_model"), "fields: %v", suggestionFields(suggestions))

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	sourceSummary := recordJSONField(t, reports[0], "source_summary")
	require.Equal(t, "official_colors", sourceSummary["focus"])
}

func TestAssetEnrichmentOfficialColorSuggestionRequiresConfirmationBeforeMasterWrite(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-color-confirm@example.com")
	supportServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方规格</title></head><body>官方配色：墨羽黑、银迹、幽芒。</body></html>`))
	}))
	t.Cleanup(supportServer.Close)
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽黑, 银迹, 幽芒\",\"confidence\":94,\"notes\":\"来自官方规格页。\",\"source_urls\":[\"` + supportServer.URL + `/redmik50/specs\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    supportServer.URL + "/redmik50/specs",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReportWithBody(t, map[string]any{"focus": "official_colors"})
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	assetBeforeAccept, err := fixture.hub.FindRecordById("assets", phoneAsset.Id)
	require.NoError(t, err)
	metadataBeforeAccept := recordMetadata(t, assetBeforeAccept)
	require.Empty(t, metadataBeforeAccept["colors_available"])

	suggestion := findSuggestionByField(fixture.findSuggestions(t), "metadata.colors_available")
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

	assetAfterAccept, err := fixture.hub.FindRecordById("assets", phoneAsset.Id)
	require.NoError(t, err)
	metadataAfterAccept := recordMetadata(t, assetAfterAccept)
	require.Equal(t, "墨羽黑, 银迹, 幽芒", metadataAfterAccept["colors_available"])

	changes, err := fixture.hub.FindRecordsByFilter("asset_changes", "asset = {:asset} && source_collection = 'assets'", "-created", -1, 0, map[string]any{
		"asset": phoneAsset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, changes)
	require.Contains(t, changes[0].GetString("summary"), "确认补全建议")
}

func TestAssetEnrichmentRejectsOfficialColorsFromLowTrustAISource(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-color-source-quality@example.com")
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"colors_available\",\"label\":\"官方配色\",\"value\":\"墨羽黑, 银迹, 幽芒\",\"confidence\":96,\"notes\":\"低可信网页提到的配色。\",\"source_urls\":[\"https://blog.example.test/redmi-k50-colors\"]},{\"field\":\"cpu_model\",\"label\":\"芯片\",\"value\":\"天玑 8100\",\"confidence\":96,\"notes\":\"低可信网页提到的规格。\",\"source_urls\":[\"https://blog.example.test/redmi-k50-specs\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReportWithBody(t, map[string]any{"focus": "official_colors"})
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.colors_available"), "fields: %v", suggestionFields(suggestions))
	require.Nil(t, findSuggestionByField(suggestions, "metadata.cpu_model"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentCapsLowTrustAISuggestionConfidence(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-low-trust@example.com")
	sourceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>普通规格页 Redmi K50</title></head><body>
			<p>这个低可信网页提到 Redmi K50 使用天玑 8100。</p>
		</body></html>`))
	}))
	t.Cleanup(sourceServer.Close)
	sourceURL := sourceServer.URL + "/redmi-k50-specs"
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"cpu_model\",\"label\":\"芯片\",\"value\":\"天玑 8100\",\"confidence\":96,\"notes\":\"低可信网页提到的规格。\",\"source_urls\":[\"` + sourceURL + `\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestion := findSuggestionByField(fixture.findSuggestions(t), "metadata.cpu_model")
	require.NotNil(t, suggestion, "fields: %v", suggestionFields(fixture.findSuggestions(t)))
	require.Equal(t, 70, suggestion.GetInt("confidence"))
	metadata := recordMetadata(t, suggestion)
	require.Contains(t, fmt.Sprint(metadata["source_urls"]), sourceURL)
	require.Contains(t, fmt.Sprint(metadata["source_titles"]), "普通规格页 Redmi K50")
}

func TestAssetEnrichmentRejectsOfficialReferenceURLFromLowTrustAISource(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-reference-url-source-quality@example.com")
	sourceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>普通评测 Redmi K50</title></head><body>
			<p>这个普通网页提到一个 Redmi K50 产品页链接，但不是厂家官网。</p>
		</body></html>`))
	}))
	t.Cleanup(sourceServer.Close)
	sourceURL := sourceServer.URL + "/redmi-k50-review"
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"product_url\",\"label\":\"厂家产品页\",\"value\":\"https://blog.example.test/redmi-k50-product\",\"confidence\":92,\"notes\":\"低可信网页提到的产品页。\",\"source_urls\":[\"` + sourceURL + `\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.product_url"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentAcceptsOfficialReferenceURLFromOfficialAISource(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-reference-url-official-source@example.com")
	sourceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方支持页</title></head><body>
			<h1>Redmi K50</h1><p>官方支持、规格与产品资料。</p>
		</body></html>`))
	}))
	t.Cleanup(sourceServer.Close)
	sourceURL := sourceServer.URL + "/support/redmik50"
	productURL := sourceServer.URL + "/product/redmik50"
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"product_url\",\"label\":\"厂家产品页\",\"value\":\"` + productURL + `\",\"confidence\":92,\"notes\":\"来自厂家官方支持页。\",\"source_urls\":[\"` + sourceURL + `\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    sourceURL,
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	requireSuggestionValue(t, fixture.findSuggestions(t), "metadata.product_url", productURL)
}

func TestAssetEnrichmentRejectsOfficialImageURLWhenAIValueIsNotImage(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-official-image-non-image@example.com")
	sourceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方支持页</title></head><body>
			<h1>Redmi K50</h1><p>官方支持、规格与产品资料。</p>
		</body></html>`))
	}))
	t.Cleanup(sourceServer.Close)
	sourceURL := sourceServer.URL + "/support/redmik50"
	productURL := sourceServer.URL + "/product/redmik50"
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"official_image_url\",\"label\":\"官方图片\",\"value\":\"` + productURL + `\",\"confidence\":92,\"notes\":\"AI 把产品页误当成了图片。\",\"source_urls\":[\"` + sourceURL + `\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    sourceURL,
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.official_image_url"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentRejectsOfficialImageURLWhenAIImageValueIsNotOfficial(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-official-image-third-party@example.com")
	sourceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方支持页</title></head><body>
			<h1>Redmi K50</h1><p>官方支持、规格与产品资料。</p>
		</body></html>`))
	}))
	t.Cleanup(sourceServer.Close)
	sourceURL := sourceServer.URL + "/support/redmik50"
	thirdPartyImageURL := "https://cdn.blog.example.test/redmi-k50.jpg"
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"official_image_url\",\"label\":\"官方图片\",\"value\":\"` + thirdPartyImageURL + `\",\"confidence\":92,\"notes\":\"AI 把第三方图片搭配官方来源页返回。\",\"source_urls\":[\"` + sourceURL + `\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
			"support_url":    sourceURL,
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.official_image_url"), "fields: %v", suggestionFields(suggestions))
}

func TestAssetEnrichmentRejectsAISuggestionWithUnreachableSourceURL(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-ai-unreachable-source@example.com")
	sourceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>临时来源</title></head><body>Redmi K50 天玑 8100。</body></html>`))
	}))
	sourceURL := sourceServer.URL + "/redmi-k50-specs"
	sourceServer.Close()

	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"suggestions\":[{\"field\":\"cpu_model\",\"label\":\"芯片\",\"value\":\"天玑 8100\",\"confidence\":92,\"notes\":\"不可访问来源。\",\"source_urls\":[\"` + sourceURL + `\"]}]}"}}]}`))
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
			"internal_model": "22041211AC",
		},
	})
	require.NoError(t, err)
	fixture.asset = phoneAsset

	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	require.Nil(t, findSuggestionByField(suggestions, "metadata.cpu_model"), "fields: %v", suggestionFields(suggestions))
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
	require.Equal(t, "agnes-2.0-flash", visualAI["model"])
	require.Equal(t, true, visualAI["model_discovery_enabled"])
	require.Equal(t, true, visualAI["official_only"])
	require.Equal(t, float64(12), visualAI["max_images"])
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
			"enabled":                  true,
			"provider":                 "agnes",
			"endpoint":                 "https://llm.example.test/v1/chat/completions?key=do-not-return",
			"api_key":                  "ai-updated-secret",
			"model":                    "agnes-2.0-flash",
			"source_discovery_enabled": true,
			"max_sources":              7,
		},
		"visual_ai": map[string]any{
			"enabled":                 true,
			"provider":                "agnes",
			"endpoint":                "https://image.example.test/v1/images/generations?token=do-not-return",
			"api_key":                 "visual-updated-secret",
			"model":                   "agnes-2.0-flash",
			"frame_count":             5,
			"model_discovery_enabled": true,
			"max_images":              8,
			"official_only":           true,
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
	require.Equal(t, true, ai["source_discovery_enabled"])
	require.Equal(t, float64(7), ai["max_sources"])
	require.Equal(t, true, ai["ready"])
	visualAI, ok := payload["visual_ai"].(map[string]any)
	require.True(t, ok, "payload: %v", payload)
	require.Equal(t, "agnes", visualAI["provider"])
	require.Equal(t, "https://proxy.example.test/v1/chat/completions", visualAI["endpoint"])
	require.Equal(t, "visual-updated-secret", visualAI["api_key"])
	require.Equal(t, float64(1), visualAI["frame_count"])
	require.Equal(t, true, visualAI["model_discovery_enabled"])
	require.Equal(t, float64(8), visualAI["max_images"])
	require.Equal(t, true, visualAI["official_only"])
	require.Equal(t, true, visualAI["ready"])
}

func TestAssetVisualUsesAIModelToDiscoverTraceableImages(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-ai-discovery@example.com")
	var imageServer *httptest.Server
	imageServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/official/redmi-k50-black.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(imageServer.Close)
	imageURL := imageServer.URL + "/official/redmi-k50-black.jpg"

	var aiRequests int
	aiServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		aiRequests++
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "Bearer visual-test-key", r.Header.Get("Authorization"))
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		require.Equal(t, "visual-search-model", payload["model"])
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"sources\":[{\"image_url\":\"` + imageURL + `\",\"source_url\":\"` + imageURL + `\",\"title\":\"Redmi K50 官方设备图\",\"color\":\"墨羽黑\",\"type\":\"official_image\",\"confidence\":92}]}"}}]}`))
	}))
	t.Cleanup(aiServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", aiServer.URL+"/v1/chat/completions")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "visual-search-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	delete(metadata, "support_url")
	delete(metadata, "product_url")
	delete(metadata, "official_url")
	delete(metadata, "official_image_url")
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"ready"`)
	require.Equal(t, 1, aiRequests)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset} && kind = 'official_reference'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, visuals)
	require.False(t, visuals[0].GetBool("primary"))
	visualMetadata := recordMetadata(t, visuals[0])
	require.Equal(t, "candidate_set", visualMetadata["visual_role"])
	frames := recordJSONArrayField(t, visuals[0], "frames")
	require.NotEmpty(t, frames)
	require.Equal(t, imageURL, fmt.Sprint(frames[0]["url"]))
	require.Equal(t, "墨羽黑", fmt.Sprint(frames[0]["color"]))

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	summary := recordJSONField(t, tasks[0], "output_summary")
	require.Equal(t, float64(1), summary["model_discovered_images"])
}

func TestAssetVisualCollectsUnquotedOfficialPageImages(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-unquoted-html@example.com")
	var imageRequests []map[string]any
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		imageRequests = append(imageRequests, payload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/images/redmi-k50-front.jpg", "/images/redmi-k50-back.webp":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
		default:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
				<picture>
					<source srcset=/images/redmi-k50-back.webp width=900 height=1200>
					<img src=/images/redmi-k50-front.jpg width=800 height=1200 alt="Redmi K50 墨羽黑 正面">
				</picture>
			</body></html>`))
		}
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
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"ready"`)
	require.Empty(t, imageRequests)
	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	referenceVisual := findVisualByKind(visuals, "official_reference")
	require.NotNil(t, referenceVisual)
	frames := recordJSONArrayField(t, referenceVisual, "frames")
	require.NotEmpty(t, frames)
	require.Contains(t, fmt.Sprint(frames), "redmi-k50")
}

func TestAssetVisualPreservesProductURLProviderForReferenceImages(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-product-url-provider@example.com")
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	var referenceServer *httptest.Server
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/product/redmik50/index.js":
			w.Header().Set("Content-Type", "application/javascript")
			_, _ = w.Write([]byte(`const imgPath="/redmik50/";const site={productFileSite:"` + referenceServer.URL + `"};
				imgPath+"sw2-1.jpg";imgPath+"front-product.jpg";
				const pic={imgPath:"".concat(site.productFileSite,"/redmik50/")};`))
		case "/redmik50/sw2-1.jpg", "/redmik50/front-product.jpg", "/images/redmi-k50-front.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
		case "/products/redmi-k50/specs":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方规格页</title></head><body>Redmi K50 规格参数。</body></html>`))
		default:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title><script src="/product/redmik50/index.js"></script></head><body>
				<img src="/images/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="900" height="1200">
			</body></html>`))
		}
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50/specs"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	referenceVisual := findVisualByKind(visuals, "official_reference")
	require.NotNil(t, referenceVisual)
	sources := recordJSONArrayField(t, referenceVisual, "sources")
	require.NotEmpty(t, sources)
	sawPageImage := false
	sawBundleImage := false
	for _, source := range sources {
		sourceType, _ := source["type"].(string)
		switch sourceType {
		case "official_page_image":
			sawPageImage = true
			require.Equal(t, "product_url", source["provider"], "source: %v", source)
		case "official_product_bundle_image":
			sawBundleImage = true
			require.Equal(t, "product_url", source["provider"], "source: %v", source)
		}
	}
	require.True(t, sawPageImage, "sources: %v", sources)
	require.True(t, sawBundleImage, "sources: %v", sources)
}

func TestAssetVisualPrioritizesDerivedProductPageBeforeSpecsImages(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-product-page-priority@example.com")
	var imageRequests []map[string]any
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		imageRequests = append(imageRequests, payload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	var referenceServer *httptest.Server
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/product/redmik50/index.js":
			w.Header().Set("Content-Type", "application/javascript")
			_, _ = w.Write([]byte(`const imgPath="/redmik50/";const site={productFileSite:"` + referenceServer.URL + `"};
				imgPath+"sw2-1.jpg";imgPath+"sw2-2.jpg";
				const pic={imgPath:"".concat(site.productFileSite,"/redmik50/")};`))
		case "/redmik50/sw2-1.jpg", "/redmik50/sw2-2.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
		case "/products/redmi-k50/specs":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			var body strings.Builder
			body.WriteString(`<html><head><title>Redmi K50 规格页</title></head><body>`)
			for index := 0; index < 12; index++ {
				body.WriteString(fmt.Sprintf(`<img src="/images/redmi-k50-specs-%02d.jpg" alt="Redmi K50 规格参数图" width="900" height="1200">`, index))
			}
			body.WriteString(`</body></html>`)
			_, _ = w.Write([]byte(body.String()))
		case "/products/redmi-k50":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 产品主页</title><script src="/product/redmik50/index.js"></script></head><body>Redmi K50 产品主页</body></html>`))
		default:
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
		}
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50/specs"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	referenceVisual := findVisualByKind(visuals, "official_reference")
	require.NotNil(t, referenceVisual)
	frames := recordJSONArrayField(t, referenceVisual, "frames")
	require.NotEmpty(t, frames)
	require.Contains(t, fmt.Sprint(frames), "sw2-1.jpg")
}

func TestAssetVisualExcludesMarketingBundleImagesFromModelReferences(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-marketing-filter@example.com")
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	var referenceServer *httptest.Server
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/product/redmik50/index.js":
			w.Header().Set("Content-Type", "application/javascript")
			_, _ = w.Write([]byte(`const imgPath="/redmik50/";const site={productFileSite:"` + referenceServer.URL + `"};
				imgPath+"main-hero.jpg";imgPath+"gallery-promo.jpg";imgPath+"color-overview.jpg";imgPath+"product-poster.jpg";imgPath+"sw2-1.jpg";imgPath+"sw2-2.jpg";
				const pic={imgPath:"".concat(site.productFileSite,"/redmik50/")};`))
		case "/products/redmi-k50":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title><script src="/product/redmik50/index.js"></script></head><body>Redmi K50 产品主页</body></html>`))
		default:
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
		}
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["official_image_url"] = referenceServer.URL + "/redmi-k50-black-poster.jpg"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	summary := recordJSONField(t, tasks[0], "output_summary")
	referenceInputURLs := fmt.Sprint(summary["reference_input_urls"])
	require.Contains(t, referenceInputURLs, "sw2-1.jpg")
	require.Contains(t, referenceInputURLs, "sw2-2.jpg")
	require.NotContains(t, referenceInputURLs, "main-hero.jpg")
	require.NotContains(t, referenceInputURLs, "gallery-promo.jpg")
	require.NotContains(t, referenceInputURLs, "color-overview.jpg")
	require.NotContains(t, referenceInputURLs, "product-poster.jpg")
}

func TestAssetVisualCollectsSelectedColorReferencesBeforeUserSelectsPrimaryDisplay(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-selected-color-display@example.com")
	var referenceServer *httptest.Server
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/product/redmik50/index.js":
			w.Header().Set("Content-Type", "application/javascript")
			_, _ = w.Write([]byte(`const imgPath="/redmik50/";const site={productFileSite:"` + referenceServer.URL + `"};
				imgPath+"sw2-1.jpg";imgPath+"sw2-2.jpg";imgPath+"sw2-3.jpg";
				const pic={imgPath:"".concat(site.productFileSite,"/redmik50/")};`))
		case "/products/redmi-k50":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title><script src="/product/redmik50/index.js"></script></head><body>Redmi K50 产品主页。</body></html>`))
		case "/redmik50/sw2-1.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 66, G: 156, B: 230, A: 255}))
		case "/redmik50/sw2-2.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
		case "/redmik50/sw2-3.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 232, G: 234, B: 236, A: 255}))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(referenceServer.Close)

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"ready"`)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	referenceVisual := findVisualByKind(visuals, "official_reference")
	require.NotNil(t, referenceVisual)
	require.False(t, referenceVisual.GetBool("primary"))
	visualMetadata := recordMetadata(t, referenceVisual)
	require.Equal(t, "candidate_set", visualMetadata["visual_role"])
	frames := recordJSONArrayField(t, referenceVisual, "frames")
	require.Len(t, frames, 3)
	for _, frame := range frames {
		require.Equal(t, "墨羽黑", frame["color"])
	}
	require.Contains(t, fmt.Sprint(frames), "sw2-1.jpg")
	require.Contains(t, fmt.Sprint(frames), "sw2-2.jpg")
	require.Contains(t, fmt.Sprint(frames), "sw2-3.jpg")

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	summary := recordJSONField(t, tasks[0], "output_summary")
	require.Equal(t, "reference_image_collection", summary["mode"])
	require.Equal(t, float64(0), summary["generated_images"])

	selectResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		fmt.Sprintf("/api/pulse/assets/%s/visuals/%s/select", asset.Id, referenceVisual.Id),
		strings.NewReader(`{"frame_index":1}`),
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, selectResponse.Status, selectResponse.Body)
	selectedVisuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset} && primary = true", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, selectedVisuals)
	selectedMetadata := recordMetadata(t, selectedVisuals[0])
	require.Equal(t, "final_reference", selectedMetadata["visual_role"])
	require.Equal(t, referenceVisual.Id, selectedMetadata["selected_from_visual"])
	selectedFrames := recordJSONArrayField(t, selectedVisuals[0], "frames")
	require.Len(t, selectedFrames, 1)
	require.Contains(t, fmt.Sprint(selectedFrames[0]["url"]), "sw2-2.jpg")
}

func TestAssetVisualPrioritizesSelectedColorReferenceForImageModel(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-selected-color-reference@example.com")
	var imageRequests []map[string]any
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		imageRequests = append(imageRequests, payload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	var referenceServer *httptest.Server
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/product/redmik50/index.js":
			w.Header().Set("Content-Type", "application/javascript")
			_, _ = w.Write([]byte(`const imgPath="/redmik50/";const site={productFileSite:"` + referenceServer.URL + `"};
				imgPath+"sw2-1.jpg";imgPath+"sw2-2.jpg";imgPath+"sw2-3.jpg";
				const pic={imgPath:"".concat(site.productFileSite,"/redmik50/")};`))
		case "/products/redmi-k50":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title><script src="/product/redmik50/index.js"></script></head><body>Redmi K50 产品主页<img src="/official-small.png" width="85" height="28" alt="Redmi K50 墨羽黑 官方图"></body></html>`))
		case "/official-small.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(makeSolidPNG(t, 85, 28, color.RGBA{R: 12, G: 12, B: 12, A: 255}))
		case "/redmik50/sw2-1.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 66, G: 156, B: 230, A: 255}))
		case "/redmik50/sw2-2.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
		case "/redmik50/sw2-3.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 232, G: 234, B: 236, A: 255}))
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["official_image_url"] = referenceServer.URL + "/official-small.png"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Len(t, imageRequests, 2)
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "not a 3D redesign task")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "keep the reference device as the product layer")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "replace only the scene/background")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "Do not create a new render")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "Never place two different colors")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "Reference fidelity is mandatory")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "Do not invent or garble brand text")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "Do not turn the device blue")
	require.Contains(t, fmt.Sprint(imageRequests[1]["prompt"]), "The background must be truly dark")
	require.Contains(t, fmt.Sprint(imageRequests[1]["prompt"]), "silver, and light gray backgrounds are forbidden")

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	summary := recordJSONField(t, tasks[0], "output_summary")
	referenceInputURLs := fmt.Sprint(summary["reference_input_urls"])
	require.Contains(t, referenceInputURLs, "sw2-2.jpg")
	require.NotContains(t, referenceInputURLs, "sw2-1.jpg")
	require.NotContains(t, referenceInputURLs, "sw2-3.jpg")
	require.NotContains(t, referenceInputURLs, "official-small.png")
	require.Contains(t, fmt.Sprint(summary["image_model_reference_color_scores"]), "100")
	require.Contains(t, fmt.Sprint(summary["reference_skip_reasons"]), "参考图尺寸过小")
}

func TestAssetVisualCropsWideOfficialPosterBeforeImageModel(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-wide-poster-crop@example.com")
	var imageRequests []map[string]any
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		var payload map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		imageRequests = append(imageRequests, payload)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	widePoster := makeWidePosterJPEG(t, 2000, 900, color.RGBA{R: 8, G: 9, B: 12, A: 255})
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/redmi-k50-black-official.jpg":
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write(widePoster)
		default:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
				<img src="/redmi-k50-black-official.jpg" alt="Redmi K50 墨羽黑 官方外观图" width="2000" height="900">
			</body></html>`))
		}
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["official_image_url"] = referenceServer.URL + "/redmi-k50-black-official.jpg"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Len(t, imageRequests, 2)
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "Remove the original poster scene")
	require.Contains(t, fmt.Sprint(imageRequests[0]["prompt"]), "reconstruct only the missing outer body edge")

	firstInput := firstAssetVisualImageModelReferenceInput(t, imageRequests[0])
	require.True(t, strings.HasPrefix(firstInput, "data:image/jpeg;base64,"))
	width, height := decodeDataURIImageSize(t, firstInput)
	require.Less(t, width, 900)
	require.Greater(t, height, width)
	require.LessOrEqual(t, height, 900)
	require.Greater(t, height, 700)
}

func TestAssetVisualDarkensNightOutputBackground(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-night-background@example.com")
	lightCatalogOutput := base64.StdEncoding.EncodeToString(makeLightCatalogPhonePNG(t, 320, 480))
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"` + lightCatalogOutput + `"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["official_image_url"] = referenceServer.URL + "/redmi-k50-black.jpg"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset} && kind = 'ai_turntable'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Len(t, visuals, 1)
	frames := recordJSONArrayField(t, visuals[0], "frames")
	require.Len(t, frames, 2)
	require.Equal(t, "day", frames[0]["theme"])
	require.Equal(t, "night", frames[1]["theme"])
	dayCorner := decodeDataURIPixel(t, fmt.Sprint(frames[0]["url"]), 4, 4)
	nightCorner := decodeDataURIPixel(t, fmt.Sprint(frames[1]["url"]), 4, 4)
	require.Greater(t, pixelLuma(dayCorner), 180)
	require.Less(t, pixelLuma(nightCorner), 40)
}

func TestAssetVisualRejectsLandscapePhoneModelOutput(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-reject-landscape-phone@example.com")
	landscapeOutput := base64.StdEncoding.EncodeToString(makeLightCatalogPhonePNG(t, 640, 360))
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"` + landscapeOutput + `"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["official_image_url"] = referenceServer.URL + "/redmi-k50-black.jpg"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	var payload map[string]any
	require.NoError(t, json.Unmarshal([]byte(response.Body), &payload))
	require.Equal(t, "failed", payload["status"])
	require.Contains(t, fmt.Sprint(payload["message"]), "竖向全貌图")

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	require.Equal(t, "failed", tasks[0].GetString("status"))
	summary := recordJSONField(t, tasks[0], "output_summary")
	require.Contains(t, fmt.Sprint(summary["image_model_output_rejections"]), "竖向全貌图")

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset} && kind = 'ai_turntable' && status = 'ready'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Empty(t, visuals)
}

func TestAssetVisualAvoidsDuplicateProductPageFetchWhenImagesAreEnough(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-fetch-once@example.com")
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	productPageRequests := 0
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/products/redmi-k50":
			productPageRequests++
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			var body strings.Builder
			body.WriteString(`<html><head><title>Redmi K50 产品主页</title></head><body>`)
			for index := 0; index < 12; index++ {
				body.WriteString(fmt.Sprintf(`<img src="/images/redmi-k50-gallery-%02d.jpg" alt="Redmi K50 墨羽黑 外观图" width="900" height="1200">`, index))
			}
			body.WriteString(`</body></html>`)
			_, _ = w.Write([]byte(body.String()))
		case strings.HasPrefix(r.URL.Path, "/images/redmi-k50-gallery-"):
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Equal(t, 1, productPageRequests)
}

func TestAssetVisualRejectsLowTrustPageImages(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-low-trust-page@example.com")
	var imageRequestCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		imageRequestCount++
		http.Error(w, `{"error":"should not be called"}`, http.StatusInternalServerError)
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasPrefix(r.URL.Path, "/images/"):
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
		default:
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(`<html><head><title>第三方 Redmi K50 支持资料</title></head><body>
				<p>这个页面路径像 support，但它是第三方非官方资料页。</p>
				<img src="/images/redmi-k50-front.jpg" alt="Redmi K50 外观图" width="900" height="1200">
			</body></html>`))
		}
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["support_url"] = referenceServer.URL + "/support/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"no_sources"`)
	require.Zero(t, imageRequestCount)
}

func TestAssetVisualAllowsPhoneImageCollectionWithoutPreselectedColor(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-color-optional@example.com")
	var imageRequestCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		imageRequestCount++
		http.Error(w, `{"error":"should not be called"}`, http.StatusInternalServerError)
	}))
	t.Cleanup(imageServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["internal_model"] = "22041211AC"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{})
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
	require.Contains(t, response.Body, `"status":"no_sources"`)
	require.Contains(t, response.Body, "没有找到可追溯设备图片")
	require.Zero(t, imageRequestCount)
}

func TestAssetVisualBlocksPhoneImageGenerationWhenSelectedColorIsNotOfficial(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-visual-color-mismatch@example.com")
	var imageRequestCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		imageRequestCount++
		http.Error(w, `{"error":"should not be called"}`, http.StatusInternalServerError)
	}))
	t.Cleanup(imageServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "星月白, 藤野紫"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"blocked"`)
	require.Contains(t, response.Body, "当前颜色不在")
	require.Zero(t, imageRequestCount)
}

func TestAssetVisualDoesNotRetryNonTransientImageModelFailure(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-non-transient@example.com")
	var imageRequestCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		imageRequestCount++
		http.Error(w, `{"error":"invalid image request"}`, http.StatusBadRequest)
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"failed"`)
	require.Contains(t, response.Body, "400")
	require.Equal(t, 1, imageRequestCount)
}

func TestAssetVisualDoesNotRetryTimedOutImageModelRequest(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-timeout@example.com")
	var imageRequestCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		imageRequestCount++
		time.Sleep(300 * time.Millisecond)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		_, _ = w.Write(makeSolidJPEG(t, color.RGBA{R: 22, G: 23, B: 26, A: 255}))
	}))
	t.Cleanup(referenceServer.Close)
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENABLED", "true")
	t.Setenv("PULSE_ASSET_VISUAL_AI_ENDPOINT", imageServer.URL+"/v1/images/generations")
	t.Setenv("PULSE_ASSET_VISUAL_AI_API_KEY", "visual-test-key")
	t.Setenv("PULSE_ASSET_VISUAL_AI_MODEL", "test-image-model")
	t.Setenv("PULSE_ASSET_VISUAL_AI_REQUEST_TIMEOUT_MS", "1")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["official_image_url"] = referenceServer.URL + "/official-redmi-k50.jpg"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"failed"`)
	require.Contains(t, response.Body, "Client.Timeout")
	require.Equal(t, 1, imageRequestCount)
}

func TestAssetVisualRejectsNonImageModelOutputURL(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-non-image-output@example.com")
	var referenceServer *httptest.Server
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"` + referenceServer.URL + `/products/redmi-k50"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"failed"`)
	require.Contains(t, response.Body, "没有返回可显示图片")

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Nil(t, findVisualByKind(visuals, "ai_turntable"))
}

func TestAssetVisualRejectsImageSuffixModelOutputWhenContentIsNotImage(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-fake-image-output@example.com")
	var referenceServer *httptest.Server
	var generatedProbeCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"` + referenceServer.URL + `/generated-redmi-k50.png"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/generated-redmi-k50.png" {
			generatedProbeCount++
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`<html><body>not an image</body></html>`))
			return
		}
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"failed"`)
	require.Contains(t, response.Body, "没有返回可显示图片")
	require.NotZero(t, generatedProbeCount)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Nil(t, findVisualByKind(visuals, "ai_turntable"))
}

func TestAssetVisualRejectsModelOutputWhenHeaderClaimsImageButBytesAreNotImage(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-fake-image-bytes-output@example.com")
	var referenceServer *httptest.Server
	var generatedHeadCount int
	var generatedGetCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"` + referenceServer.URL + `/generated-redmi-k50.png"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/generated-redmi-k50.png" {
			w.Header().Set("Content-Type", "image/png")
			w.WriteHeader(http.StatusOK)
			if r.Method == http.MethodHead {
				generatedHeadCount++
				return
			}
			generatedGetCount++
			_, _ = w.Write([]byte(`<html><body>not an image</body></html>`))
			return
		}
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"failed"`)
	require.Contains(t, response.Body, "没有返回可显示图片")
	require.Zero(t, generatedHeadCount)
	require.NotZero(t, generatedGetCount)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Nil(t, findVisualByKind(visuals, "ai_turntable"))
}

func TestAssetVisualRejectsNonImageBase64ModelOutput(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-non-image-base64@example.com")
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"bm90IGFuIGltYWdl"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"failed"`)
	require.Contains(t, response.Body, "没有返回可显示图片")

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Nil(t, findVisualByKind(visuals, "ai_turntable"))

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	summary := recordJSONField(t, tasks[0], "output_summary")
	require.Equal(t, "1", fmt.Sprint(summary["image_model_output_candidates"]))
	require.Equal(t, "1", fmt.Sprint(summary["image_model_output_rejected"]))
	require.Contains(t, fmt.Sprint(summary["image_model_output_rejections"]), "模型返回的 Base64 不是可识别图片")
}

func TestAssetVisualRejectsModelDataURIWhenBytesAreNotImage(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-non-image-data-uri@example.com")
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"data:image/png;base64,AAAAAA=="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"failed"`)
	require.Contains(t, response.Body, "没有返回可显示图片")

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.Nil(t, findVisualByKind(visuals, "ai_turntable"))

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	summary := recordJSONField(t, tasks[0], "output_summary")
	require.Equal(t, "1", fmt.Sprint(summary["image_model_output_candidates"]))
	require.Equal(t, "1", fmt.Sprint(summary["image_model_output_rejected"]))
	require.Contains(t, fmt.Sprint(summary["image_model_output_rejections"]), "模型返回的 Data URI 不是可识别图片")
}

func TestAssetVisualUsesLaterValidModelOutputWhenFirstCandidateIsInvalid(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-later-valid-output@example.com")
	var referenceServer *httptest.Server
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"` + referenceServer.URL + `/products/redmi-k50"},{"b64_json":"iVBORw0KGgo="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"ready"`)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	generated := findVisualByKind(visuals, "ai_turntable")
	require.NotNil(t, generated)
	frames := recordJSONArrayField(t, generated, "frames")
	require.Len(t, frames, 2)
	require.True(t, strings.HasPrefix(fmt.Sprint(frames[0]["url"]), "data:image/png;base64,"))
	require.True(t, strings.HasPrefix(fmt.Sprint(frames[1]["url"]), "data:image/png;base64,"))

	tasks, err := fixture.hub.FindRecordsByFilter("ai_tasks", "asset = {:asset} && kind = 'asset_visual'", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	require.NotEmpty(t, tasks)
	summary := recordJSONField(t, tasks[0], "output_summary")
	require.Equal(t, "4", fmt.Sprint(summary["image_model_output_candidates"]))
	require.Equal(t, "2", fmt.Sprint(summary["image_model_output_selected"]))
	require.Equal(t, "2", fmt.Sprint(summary["image_model_output_rejected"]))
	require.Contains(t, fmt.Sprint(summary["image_model_output_rejections"]), "模型返回的 URL 不是可验证图片")
}

func TestAssetVisualReusesImageModelOutputURLProbeWithinTask(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-output-probe-cache@example.com")
	var referenceServer *httptest.Server
	var generatedHeadCount int
	var generatedGetCount int
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"` + referenceServer.URL + `/generated-redmi-k50.png"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/generated-redmi-k50.png" {
			w.Header().Set("Content-Type", "image/png")
			w.WriteHeader(http.StatusOK)
			if r.Method == http.MethodHead {
				generatedHeadCount++
				return
			}
			generatedGetCount++
			_, _ = w.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
			return
		}
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"ready"`)
	require.Equal(t, 0, generatedHeadCount)
	require.Equal(t, 1, generatedGetCount)
}

func TestAssetVisualStoresRemoteModelOutputAsStableDataURI(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-output-data-uri@example.com")
	var referenceServer *httptest.Server
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"url":"` + referenceServer.URL + `/generated-redmi-k50.png"}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/generated-redmi-k50.png" {
			w.Header().Set("Content-Type", "image/png")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
			return
		}
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"ready"`)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	generated := findVisualByKind(visuals, "ai_turntable")
	require.NotNil(t, generated)
	frames := recordJSONArrayField(t, generated, "frames")
	require.Len(t, frames, 2)
	for _, frame := range frames {
		frameURL := fmt.Sprint(frame["url"])
		require.True(t, strings.HasPrefix(frameURL, "data:image/png;base64,"), "frame url should be stable data URI: %s", frameURL)
		require.NotContains(t, frameURL, referenceServer.URL)
	}
}

func TestAssetVisualPreservesDetectedMimeForBase64ModelOutput(t *testing.T) {
	t.Skip("设备图片 Agent 已改为收集真实参考图，不再调用图片模型生成。")
	fixture := newAssetEnrichmentFixture(t, "asset-visual-base64-mime@example.com")
	imageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"b64_json":"/9j/4AAQSkZJRgAB/9k="}]}`))
	}))
	t.Cleanup(imageServer.Close)
	referenceServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, ".jpg") {
			w.Header().Set("Content-Type", "image/jpeg")
			_, _ = w.Write([]byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9})
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<html><head><title>Redmi K50 官方产品页</title></head><body>
			<img src="/redmi-k50-front.jpg" alt="Redmi K50 墨羽黑 正面" width="800" height="1200">
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
	metadata["product_url"] = referenceServer.URL + "/products/redmi-k50"
	metadata["internal_model"] = "22041211AC"
	metadata["colors_available"] = "墨羽黑, 银迹, 幽芒"
	asset.Set("type", "phone")
	asset.Set("vendor", "小米 / Redmi")
	asset.Set("model", "Redmi K50")
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{"color": "墨羽黑"})
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
	require.Contains(t, response.Body, `"status":"ready"`)

	visuals, err := fixture.hub.FindRecordsByFilter("asset_visuals", "asset = {:asset}", "-created", -1, 0, map[string]any{
		"asset": asset.Id,
	})
	require.NoError(t, err)
	generated := findVisualByKind(visuals, "ai_turntable")
	require.NotNil(t, generated)
	frames := recordJSONArrayField(t, generated, "frames")
	require.Len(t, frames, 2)
	require.True(t, strings.HasPrefix(fmt.Sprint(frames[0]["url"]), "data:image/jpeg;base64,"))
	require.True(t, strings.HasPrefix(fmt.Sprint(frames[1]["url"]), "data:image/jpeg;base64,"))
}

func TestAssetEnrichmentAcceptBatchWritesSuggestionsAndChanges(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-accept-batch@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	cpuSuggestion := findSuggestionByField(suggestions, "metadata.cpu_model")
	memorySuggestion := findSuggestionByField(suggestions, "metadata.memory_gb")
	require.NotNil(t, cpuSuggestion, "fields: %v", suggestionFields(suggestions))
	require.NotNil(t, memorySuggestion, "fields: %v", suggestionFields(suggestions))

	requestBody, err := json.Marshal(map[string]any{
		"suggestion_ids": []string{cpuSuggestion.Id, memorySuggestion.Id},
	})
	require.NoError(t, err)
	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/accept-batch",
		bytes.NewReader(requestBody),
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, `"accepted":2`)

	updatedAsset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, updatedAsset)
	require.Equal(t, "13th Gen Intel(R) Core(TM) i7-13700K", metadata["cpu_model"])
	require.Equal(t, float64(32), metadata["memory_gb"])

	updatedCPUSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", cpuSuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "accepted", updatedCPUSuggestion.GetString("status"))
	updatedMemorySuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", memorySuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "accepted", updatedMemorySuggestion.GetString("status"))

	changes, err := fixture.hub.FindRecordsByFilter("asset_changes", "asset = {:asset} && source_collection = 'assets'", "-created", -1, 0, map[string]any{
		"asset": fixture.asset.Id,
	})
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(changes), 2)
}

func TestAssetEnrichmentAcceptBatchRejectsAtomicallyWhenSuggestionIsStale(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-accept-batch-stale@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestions := fixture.findSuggestions(t)
	cpuSuggestion := findSuggestionByField(suggestions, "metadata.cpu_model")
	memorySuggestion := findSuggestionByField(suggestions, "metadata.memory_gb")
	require.NotNil(t, cpuSuggestion, "fields: %v", suggestionFields(suggestions))
	require.NotNil(t, memorySuggestion, "fields: %v", suggestionFields(suggestions))
	require.Empty(t, cpuSuggestion.GetString("current_value"))

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["cpu_model"] = "Manual CPU"
	asset.Set("metadata", metadata)
	require.NoError(t, fixture.hub.Save(asset))

	requestBody, err := json.Marshal(map[string]any{
		"suggestion_ids": []string{memorySuggestion.Id, cpuSuggestion.Id},
	})
	require.NoError(t, err)
	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/accept-batch",
		bytes.NewReader(requestBody),
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "资产主档当前值已变化")

	updatedAsset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata = recordMetadata(t, updatedAsset)
	require.Equal(t, "Manual CPU", metadata["cpu_model"])
	require.Empty(t, metadata["memory_gb"])

	updatedCPUSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", cpuSuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", updatedCPUSuggestion.GetString("status"))
	updatedMemorySuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", memorySuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", updatedMemorySuggestion.GetString("status"))

	changes, err := fixture.hub.FindRecordsByFilter("asset_changes", "asset = {:asset} && source_collection = 'assets'", "-created", -1, 0, map[string]any{
		"asset": fixture.asset.Id,
	})
	require.NoError(t, err)
	require.Empty(t, changes)
}

func TestAssetEnrichmentAcceptWritesMetadataAndChange(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-accept@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	suggestion := findSuggestionByField(fixture.findSuggestions(t), "metadata.cpu_model")
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
	require.Equal(t, "13th Gen Intel(R) Core(TM) i7-13700K", metadata["cpu_model"])

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

	suggestion := findSuggestionByField(fixture.findSuggestions(t), "metadata.cpu_model")
	require.NotNil(t, suggestion)
	require.Empty(t, suggestion.GetString("current_value"))

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	metadata["cpu_model"] = "Manual CPU"
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

func TestAssetEnrichmentAcceptRejectsMetadataFieldWithoutPrefix(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-metadata-prefix@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	prefixlessSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "cpu_model",
		"target_label":      "CPU 型号",
		"current_value":     "",
		"collected_value":   "Fake CPU",
		"recommended_value": "Fake CPU",
		"source":            "online",
		"confidence":        90,
		"conflict":          false,
		"status":            "pending",
		"notes":             "metadata 字段必须带 metadata. 前缀。",
		"metadata":          map[string]any{},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+prefixlessSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "字段不允许")
}

func TestAssetEnrichmentAcceptWritesOfficialURLMetadataFields(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-official-url-accept@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	productURLSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "metadata.product_url",
		"target_label":      "厂家官方产品页",
		"current_value":     "",
		"collected_value":   "https://www.mi.com/redmi-k50",
		"recommended_value": "https://www.mi.com/redmi-k50",
		"source":            "online",
		"confidence":        95,
		"conflict":          false,
		"status":            "pending",
		"notes":             "厂家官方产品页必须允许确认写回 metadata。",
		"metadata":          map[string]any{},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+productURLSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, acceptResponse.Status, acceptResponse.Body)

	updatedAsset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, updatedAsset)
	require.Equal(t, "https://www.mi.com/redmi-k50", metadata["product_url"])
}

func TestAssetEnrichmentAcceptRejectsDuplicateAssetName(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-duplicate-name@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	_, err := pulseTests.CreateRecord(fixture.hub, "assets", map[string]any{
		"user":   fixture.user.Id,
		"name":   "书房主机",
		"type":   "physical_host",
		"status": "active",
	})
	require.NoError(t, err)

	duplicateNameSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "name",
		"target_label":      "资产名称",
		"current_value":     "Archive Host",
		"collected_value":   "书房主机",
		"recommended_value": "书房主机",
		"source":            "online",
		"confidence":        92,
		"conflict":          true,
		"status":            "pending",
		"notes":             "补全建议不能绕过资产主档重复约束。",
		"metadata":          map[string]any{},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+duplicateNameSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "同类型同名资产已存在")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	require.Equal(t, "Archive Host", asset.GetString("name"))

	updatedSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", duplicateNameSuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", updatedSuggestion.GetString("status"))
}

func TestAssetEnrichmentAcceptRejectsDuplicateAssetSerialNumber(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-duplicate-serial@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	_, err := pulseTests.CreateRecord(fixture.hub, "assets", map[string]any{
		"user":          fixture.user.Id,
		"name":          "另一台主机",
		"type":          "physical_host",
		"status":        "active",
		"serial_number": "SN-EXISTING-001",
	})
	require.NoError(t, err)

	duplicateSerialSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "serial_number",
		"target_label":      "序列号",
		"current_value":     "",
		"collected_value":   "sn-existing-001",
		"recommended_value": "sn-existing-001",
		"source":            "online",
		"confidence":        90,
		"conflict":          false,
		"status":            "pending",
		"notes":             "补全建议不能写入已存在的资产序列号。",
		"metadata":          map[string]any{},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+duplicateSerialSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "资产序列号已存在")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	require.Empty(t, asset.GetString("serial_number"))

	updatedSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", duplicateSerialSuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", updatedSuggestion.GetString("status"))
}

func TestAssetEnrichmentAcceptRejectsNonImageOfficialImageURL(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-official-image-url-accept@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	nonImageURL := "https://www.mi.com/redmi-k50"
	officialImageSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "metadata.official_image_url",
		"target_label":      "官方图片",
		"current_value":     "",
		"collected_value":   nonImageURL,
		"recommended_value": nonImageURL,
		"source":            "online",
		"confidence":        90,
		"conflict":          false,
		"status":            "pending",
		"notes":             "错误建议不能把产品页当作官方图片写入。",
		"metadata": map[string]any{
			"source_urls": []string{nonImageURL},
		},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+officialImageSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "官方图片必须是可识别的图片 URL")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	require.Empty(t, metadata["official_image_url"])

	updatedSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", officialImageSuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", updatedSuggestion.GetString("status"))
}

func TestAssetEnrichmentAcceptRejectsThirdPartyOfficialImageURL(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-third-party-official-image-url-accept@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	thirdPartyImageURL := "https://cdn.example.test/redmi-k50.jpg"
	officialImageSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "metadata.official_image_url",
		"target_label":      "官方图片",
		"current_value":     "",
		"collected_value":   thirdPartyImageURL,
		"recommended_value": thirdPartyImageURL,
		"source":            "online",
		"confidence":        90,
		"conflict":          false,
		"status":            "pending",
		"notes":             "不能只因为来源页是官方，就把第三方图片写成官方图片。",
		"metadata": map[string]any{
			"source_urls":  []string{"https://www.mi.com/redmi-k50/specs"},
			"source_types": []string{"official_product"},
		},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+officialImageSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "官方图片必须来自官方图片来源")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	require.Empty(t, metadata["official_image_url"])

	updatedSuggestion, err := fixture.hub.FindRecordById("asset_enrichment_suggestions", officialImageSuggestion.Id)
	require.NoError(t, err)
	require.Equal(t, "pending", updatedSuggestion.GetString("status"))
}

func TestAssetEnrichmentAcceptRejectsSparseSourceArrayImageURLMismatch(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-sparse-source-image-url-accept@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	thirdPartyImageURL := "https://cdn.example.test/redmi-k50.jpg"
	officialImageSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "metadata.official_image_url",
		"target_label":      "官方图片",
		"current_value":     "",
		"collected_value":   thirdPartyImageURL,
		"recommended_value": thirdPartyImageURL,
		"source":            "online",
		"confidence":        90,
		"conflict":          false,
		"status":            "pending",
		"notes":             "旧报告里的稀疏数组不能把第三方图片错配到官方来源页。",
		"metadata": map[string]any{
			"source_urls":       []string{"https://www.mi.com/redmi-k50/specs"},
			"source_types":      []string{"official_product"},
			"source_image_urls": []string{thirdPartyImageURL},
		},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+officialImageSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusBadRequest, acceptResponse.Status, acceptResponse.Body)
	require.Contains(t, acceptResponse.Body, "官方图片必须来自官方图片来源")

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	require.Empty(t, metadata["official_image_url"])
}

func TestAssetEnrichmentAcceptAllowsStructuredOfficialSourceImageURL(t *testing.T) {
	fixture := newAssetEnrichmentFixture(t, "asset-enrichment-structured-official-image-url-accept@example.com")
	response := fixture.generateReport(t)
	require.Equal(t, http.StatusOK, response.Status, response.Body)

	reports := fixture.findReports(t)
	require.Len(t, reports, 1)
	officialPageImageURL := "https://cdn.example.test/redmi-k50-official-page-image.jpg"
	officialImageSuggestion, err := pulseTests.CreateRecord(fixture.hub, "asset_enrichment_suggestions", map[string]any{
		"user":              fixture.user.Id,
		"asset":             fixture.asset.Id,
		"report":            reports[0].Id,
		"target_collection": "assets",
		"target_record":     fixture.asset.Id,
		"target_field":      "metadata.official_image_url",
		"target_label":      "官方图片",
		"current_value":     "",
		"collected_value":   officialPageImageURL,
		"recommended_value": officialPageImageURL,
		"source":            "online",
		"confidence":        90,
		"conflict":          false,
		"status":            "pending",
		"notes":             "结构化来源行能证明该图片由官方产品页暴露。",
		"metadata": map[string]any{
			"sources": []map[string]any{
				{
					"url":       "https://www.mi.com/redmi-k50/specs",
					"type":      "official_product",
					"title":     "Redmi K50 官方规格",
					"image_url": officialPageImageURL,
				},
			},
		},
	})
	require.NoError(t, err)

	acceptResponse := pulseTests.PerformTestAPIRequest(
		t,
		fixture.hub.TestApp,
		http.MethodPost,
		"/api/pulse/asset-enrichment-suggestions/"+officialImageSuggestion.Id+"/accept",
		nil,
		fixture.headers,
	)
	require.Equal(t, http.StatusOK, acceptResponse.Status, acceptResponse.Body)

	asset, err := fixture.hub.FindRecordById("assets", fixture.asset.Id)
	require.NoError(t, err)
	metadata := recordMetadata(t, asset)
	require.Equal(t, officialPageImageURL, metadata["official_image_url"])
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

func (f assetEnrichmentFixture) generateReportWithBody(t testing.TB, body map[string]any) pulseTests.TestAPIResponse {
	t.Helper()
	rawBody, err := json.Marshal(body)
	require.NoError(t, err)
	return pulseTests.PerformTestAPIRequest(
		t,
		f.hub.TestApp,
		http.MethodPost,
		fmt.Sprintf("/api/pulse/assets/%s/enrichment-reports", f.asset.Id),
		bytes.NewReader(rawBody),
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

func findVisualByKind(visuals []*core.Record, kind string) *core.Record {
	for _, visual := range visuals {
		if visual.GetString("kind") == kind {
			return visual
		}
	}
	return nil
}

func makeNoisyJPEG(t testing.TB, width int, height int, quality int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{
				R: uint8((x*31 + y*17) % 256),
				G: uint8((x*13 + y*29) % 256),
				B: uint8((x*7 + y*11) % 256),
				A: 255,
			})
		}
	}
	var output bytes.Buffer
	require.NoError(t, jpeg.Encode(&output, img, &jpeg.Options{Quality: quality}))
	return output.Bytes()
}

func makeWidePosterJPEG(t testing.TB, width int, height int, deviceColor color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 180, G: 210, B: 245, A: 255})
		}
	}
	deviceWidth := width * 16 / 100
	x0 := width/2 - deviceWidth/2
	x1 := x0 + deviceWidth
	y0 := height * 8 / 100
	y1 := height * 94 / 100
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			img.SetRGBA(x, y, deviceColor)
		}
	}
	var output bytes.Buffer
	require.NoError(t, jpeg.Encode(&output, img, &jpeg.Options{Quality: 90}))
	return output.Bytes()
}

func makeSolidJPEG(t testing.TB, value color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 640, 640))
	for y := 0; y < 640; y++ {
		for x := 0; x < 640; x++ {
			img.SetRGBA(x, y, value)
		}
	}
	var output bytes.Buffer
	require.NoError(t, jpeg.Encode(&output, img, &jpeg.Options{Quality: 90}))
	return output.Bytes()
}

func makeSolidPNG(t testing.TB, width int, height int, value color.RGBA) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, value)
		}
	}
	var output bytes.Buffer
	require.NoError(t, png.Encode(&output, img))
	return output.Bytes()
}

func makeLightCatalogPhonePNG(t testing.TB, width int, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 236, G: 236, B: 234, A: 255})
		}
	}
	x0 := width * 36 / 100
	x1 := width * 64 / 100
	y0 := height * 18 / 100
	y1 := height * 86 / 100
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			img.SetRGBA(x, y, color.RGBA{R: 18, G: 20, B: 24, A: 255})
		}
	}
	var output bytes.Buffer
	require.NoError(t, png.Encode(&output, img))
	return output.Bytes()
}

func decodeDataURIPixel(t testing.TB, dataURI string, x int, y int) color.RGBA {
	t.Helper()
	_, payload, ok := strings.Cut(dataURI, ",")
	require.True(t, ok)
	raw, err := base64.StdEncoding.DecodeString(payload)
	require.NoError(t, err)
	img, _, err := image.Decode(bytes.NewReader(raw))
	require.NoError(t, err)
	r, g, b, a := img.At(x, y).RGBA()
	return color.RGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: uint8(a >> 8)}
}

func pixelLuma(pixel color.RGBA) int {
	return (int(pixel.R)*299 + int(pixel.G)*587 + int(pixel.B)*114) / 1000
}

func firstAssetVisualImageModelReferenceInput(t testing.TB, payload map[string]any) string {
	t.Helper()
	extraBody, ok := payload["extra_body"].(map[string]any)
	require.True(t, ok)
	images, ok := extraBody["image"].([]any)
	require.True(t, ok)
	require.NotEmpty(t, images)
	input, ok := images[0].(string)
	require.True(t, ok)
	return input
}

func decodeDataURIImageSize(t testing.TB, dataURI string) (int, int) {
	t.Helper()
	_, payload, ok := strings.Cut(dataURI, ",")
	require.True(t, ok)
	raw, err := base64.StdEncoding.DecodeString(payload)
	require.NoError(t, err)
	config, _, err := image.DecodeConfig(bytes.NewReader(raw))
	require.NoError(t, err)
	return config.Width, config.Height
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

func recordJSONArrayField(t testing.TB, record *core.Record, field string) []map[string]any {
	t.Helper()
	var values []map[string]any
	if err := record.UnmarshalJSONField(field, &values); err != nil || values == nil {
		raw := strings.TrimSpace(record.GetString(field))
		require.True(t, raw == "" || json.Unmarshal([]byte(raw), &values) == nil)
	}
	if values == nil {
		values = []map[string]any{}
	}
	return values
}
