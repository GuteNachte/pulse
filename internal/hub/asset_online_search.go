package hub

import (
	"context"
	"net/url"
	"os"
	"strings"
)

// 2026-10-08 梳理④：多引擎聚合搜索（asset-center 子能力）——
// 必应 / 百度 / DuckDuckGo 三个免费引擎的网页结果解析，聚合去重后作为资产
// 在线获取的来源发现通道；不依赖 AI 配置，AI key 未配时来源发现照常工作。
// 搜索引擎改版时只需要修对应的 parse 函数。

type assetWebSearchResult struct {
	title   string
	url     string
	snippet string
}

type assetWebSearchEngine struct {
	provider  string
	searchURL func(string) string
	parse     func(string) []assetWebSearchResult
}

func assetWebSearchEngines() []assetWebSearchEngine {
	return []assetWebSearchEngine{
		{
			provider:  "必应",
			searchURL: func(query string) string { return "https://cn.bing.com/search?q=" + url.QueryEscape(query) },
			parse:     parseBingWebSearchResults,
		},
		{
			provider:  "百度",
			searchURL: func(query string) string { return "https://www.baidu.com/s?wd=" + url.QueryEscape(query) },
			parse:     parseBaiduWebSearchResults,
		},
		{
			provider:  "DuckDuckGo",
			searchURL: func(query string) string { return "https://html.duckduckgo.com/html/?q=" + url.QueryEscape(query) },
			parse:     parseDuckDuckGoWebSearchResults,
		},
	}
}

// collectAssetOnlineSearchSources 用聚合搜索为资产发现来源页面（并行查多引擎，合并去重）。
func (h *Hub) collectAssetOnlineSearchSources(ctx context.Context, query string, limit int) []assetOnlineSource {
	_ = ctx
	return h.collectAssetOnlineSearchSourcesSync(query, limit)
}

func (h *Hub) collectAssetOnlineSearchSourcesSync(query string, limit int) []assetOnlineSource {
	if strings.TrimSpace(query) == "" {
		return nil
	}
	// 测试隔离：聚合搜索访问真实外网引擎，测试通过环境变量禁用，
	// 避免真实搜索结果混入来源断言导致测试随网络环境波动。
	if strings.TrimSpace(os.Getenv("PULSE_ASSET_ONLINE_SEARCH_DISABLED")) == "1" {
		return nil
	}
	sources := make([]assetOnlineSource, 0, limit)
	seenURLs := map[string]bool{}
	for _, engine := range assetWebSearchEngines() {
		if len(sources) >= limit {
			break
		}
		body, err := h.fetchAssetOnlineURL(engine.searchURL(query), 512*1024)
		if err != nil {
			continue
		}
		for _, hit := range engine.parse(body) {
			if len(sources) >= limit {
				break
			}
			hitURL := strings.TrimSpace(hit.url)
			if hitURL == "" || !strings.HasPrefix(hitURL, "http") {
				continue
			}
			key := strings.ToLower(hitURL)
			if seenURLs[key] {
				continue
			}
			seenURLs[key] = true
			sources = append(sources, assetOnlineSource{
				Provider:   engine.provider,
				Type:       "search",
				Title:      strings.TrimSpace(hit.title),
				URL:        hitURL,
				Snippet:    strings.TrimSpace(hit.snippet),
				Confidence: 40,
			})
		}
	}
	return sources
}

// 从 HTML 中按前缀提取第一个属性值（href/content 等），属性顺序无关时退化为 strings.Index 查找。
func extractHTMLAttribute(body string, marker string, attr string) string {
	idx := strings.Index(body, marker)
	if idx < 0 {
		return ""
	}
	segment := body[idx:]
	attrIdx := strings.Index(segment, attr+"=\"")
	if attrIdx < 0 {
		return ""
	}
	rest := segment[attrIdx+len(attr)+2:]
	end := strings.Index(rest, "\"")
	if end < 0 {
		return ""
	}
	value := rest[:end]
	value = strings.ReplaceAll(value, "&#58;", ":")
	value = strings.ReplaceAll(value, "&amp;", "&")
	return strings.TrimSpace(value)
}

func extractHTMLText(body string, marker string, endMarker string, max int) string {
	idx := strings.Index(body, marker)
	if idx < 0 {
		return ""
	}
	rest := body[idx:]
	end := strings.Index(rest, endMarker)
	if end < 0 {
		end = len(rest)
	}
	segment := rest[:end]
	// 剥掉所有标签取纯文本（标题里常见嵌套 <a>、摘要里常见 <em>/<b>）
	var builder strings.Builder
	for {
		lt := strings.Index(segment, "<")
		if lt < 0 {
			builder.WriteString(segment)
			break
		}
		builder.WriteString(segment[:lt])
		gt := strings.Index(segment, ">")
		if gt < 0 {
			break
		}
		segment = segment[gt+1:]
	}
	text := strings.TrimSpace(builder.String())
	if len(text) > max {
		text = text[:max]
	}
	return text
}

func parseBingWebSearchResults(body string) []assetWebSearchResult {
	results := make([]assetWebSearchResult, 0, 8)
	rest := body
	for len(results) < 8 {
		idx := strings.Index(rest, "<li class=\"b_algo\"")
		if idx < 0 {
			break
		}
		rest = rest[idx:]
		link := extractHTMLAttribute(rest, "<h2", "href")
		title := extractHTMLText(rest, "<h2", "</h2>", 200)
		snippet := extractHTMLText(rest, "<p", "</p>", 300)
		if link != "" && title != "" {
			results = append(results, assetWebSearchResult{title: title, url: link, snippet: snippet})
		}
		next := strings.Index(rest[1:], "<li class=\"b_algo\"")
		if next < 0 {
			break
		}
		rest = rest[next+1:]
	}
	return results
}

func parseBaiduWebSearchResults(body string) []assetWebSearchResult {
	results := make([]assetWebSearchResult, 0, 8)
	rest := body
	for len(results) < 8 {
		idx := strings.Index(rest, "<h3")
		if idx < 0 {
			break
		}
		segment := rest[idx:]
		link := extractHTMLAttribute(segment, "<h3", "href")
		title := extractHTMLText(segment, "<h3", "</h3>", 200)
		snippet := extractHTMLText(segment, "content-right", "</div>", 300)
		if link == "" {
			link = extractHTMLAttribute(segment, "<h3", "mu=")
		}
		if title != "" && strings.HasPrefix(link, "http") {
			results = append(results, assetWebSearchResult{title: title, url: link, snippet: snippet})
		}
		next := strings.Index(segment[1:], "<h3")
		if next < 0 {
			break
		}
		rest = segment[next+1:]
	}
	return results
}

func parseDuckDuckGoWebSearchResults(body string) []assetWebSearchResult {
	results := make([]assetWebSearchResult, 0, 8)
	rest := body
	for len(results) < 8 {
		idx := strings.Index(rest, "class=\"result__a\"")
		if idx < 0 {
			break
		}
		// href 在 class 之前——从 <a 标签起点提取（DDG 属性顺序：rel/class/href）
		tagStart := strings.LastIndex(rest[:idx], "<a")
		if tagStart < 0 {
			break
		}
		segment := rest[tagStart:]
		link := extractHTMLAttribute(segment, "<a", "href")
		aClose := strings.Index(segment, "</a>")
		title := ""
		snippet := ""
		if aClose > 0 {
			title = stripHTMLTags(segment[:aClose])
			snippetSegment := segment[aClose+len("</a>"):]
			snippetEnd := strings.Index(snippetSegment, "<a")
			if snippetEnd < 0 {
				snippetEnd = len(snippetSegment)
			}
			snippet = stripHTMLTags(snippetSegment[:snippetEnd])
		}
		// DDG 的 href 可能是跳转包装（//duckduckgo.com/l/?uddg=编码URL）
		if strings.Contains(link, "uddg=") {
			if u, err := url.QueryUnescape(link); err == nil {
				if start := strings.Index(u, "http"); start >= 0 {
					link = u[start:]
					if cut := strings.Index(link, "&"); cut > 0 {
						link = link[:cut]
					}
				}
			}
		}
		if title != "" && strings.HasPrefix(link, "http") {
			results = append(results, assetWebSearchResult{title: title, url: link, snippet: snippet})
		}
		// 推进：从当前条目的 </a> 之后继续找下一条（避免死循环在同一条上）
		rest = segment[aClose+len("</a>"):]
	}
	return results
}

// stripHTMLTags 剥掉 HTML 片段里的所有标签取纯文本
func stripHTMLTags(html string) string {
	var builder strings.Builder
	for {
		lt := strings.Index(html, "<")
		if lt < 0 {
			builder.WriteString(html)
			break
		}
		builder.WriteString(html[:lt])
		gt := strings.Index(html, ">")
		if gt < 0 {
			break
		}
		html = html[gt+1:]
	}
	return strings.TrimSpace(builder.String())
}
