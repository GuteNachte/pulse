package hub

import (
	"strings"
	"testing"
)

// 2026-10-08 梳理④：多引擎聚合搜索契约——三个引擎的 HTML 解析必须能提取标题/链接/摘要，
// DDG 跳转包装要解包；链接去重统一在聚合层（collectAssetOnlineSearchSourcesSync）。

const bingSearchHTML = `<li class="b_algo"><h2><a href="https://www.minisforum.com/um890" target="_blank">UM890 官方规格</a></h2><p>MinisForum UM890 <em>Ryzen 9</em> 参数页</p></li>
<li class="b_algo"><h2><a href="https://jd.com/um890">UM890 京东页</a></h2><p>电商详情</p></li>
<li class="b_algo"><h2><a href="https://www.minisforum.com/um890">重复链接</a></h2><p>dup</p></li>`

const baiduSearchHTML = `<h3 class="t"><a href="http://www.baidu.com/link?url=abc">UM890 百度结果</a></h3><div class="c-abstract content-right">中文摘要</div>
<h3 class="c-title t"><a mu="https://www.zol.com.cn/um890">UM890 中关村在线</a></h3><div>参数表</div>`

const ddgSearchHTML = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.minisforum.com%2Fum890&amp;rut=xyz">UM890 DDG</a><a class="result__snippet" href="#">官方 <b>规格</b> 摘要</a>
<a rel="nofollow" class="result__a" href="https://www.techspot.com/um890">Techspot Review</a>`

func TestParseBingWebSearchResults(t *testing.T) {
	results := parseBingWebSearchResults(bingSearchHTML)
	if len(results) != 3 {
		t.Fatalf("expected 3 results (parse layer returns all; dedupe at aggregate layer), got %d", len(results))
	}
	if results[0].title != "UM890 官方规格" || results[0].url != "https://www.minisforum.com/um890" {
		t.Fatalf("unexpected first result: %+v", results[0])
	}
	if !strings.Contains(results[0].snippet, "Ryzen 9") {
		t.Fatalf("snippet should strip em tags: %q", results[0].snippet)
	}
}

func TestParseBaiduWebSearchResults(t *testing.T) {
	results := parseBaiduWebSearchResults(baiduSearchHTML)
	if len(results) != 1 {
		t.Fatalf("expected 1 result (mu= attribute only, link-less h3 dropped), got %d", len(results))
	}
	if results[0].title != "UM890 百度结果" {
		t.Fatalf("unexpected first result: %+v", results[0])
	}
}

func TestParseDuckDuckGoWebSearchResults(t *testing.T) {
	results := parseDuckDuckGoWebSearchResults(ddgSearchHTML)
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}
	if results[0].title != "UM890 DDG" {
		t.Fatalf("title should strip attribute noise: %+v", results[0])
	}
	if results[0].url != "https://www.minisforum.com/um890" {
		t.Fatalf("uddg wrapper should be unwrapped: %+v", results[0])
	}
	if results[1].url != "https://www.techspot.com/um890" {
		t.Fatalf("unexpected second result: %+v", results[1])
	}
}

func TestAssetWebSearchEngines(t *testing.T) {
	engines := assetWebSearchEngines()
	if len(engines) != 3 {
		t.Fatalf("expected 3 engines, got %d", len(engines))
	}
	for _, engine := range engines {
		if engine.provider == "" || engine.searchURL == nil || engine.parse == nil {
			t.Fatalf("engine %q is incomplete", engine.provider)
		}
	}
}

func TestCollectAssetOnlineSearchSourcesSyncEmptyQuery(t *testing.T) {
	h := &Hub{}
	if results := h.collectAssetOnlineSearchSourcesSync("", 10); len(results) != 0 {
		t.Fatalf("empty query should return no sources, got %d", len(results))
	}
}
