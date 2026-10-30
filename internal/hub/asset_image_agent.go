package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// 2026-10-11 图片获取 Agent：图墙管线增强——
// ① AI 规划图片搜索查询变体（渲染图/宣传图/规格图/评测图/官方图，按设备类型定制）；
// ② 视觉模型评估候选图片内容（渲染图/图表/实拍拆解/其他），修正仅靠文件名推断的内容分级。
// 由 asset_enrichment settings 的 image_agent 节控制（enabled / assess_count），
// 视觉模型复用 visual_ai 公共配置。

type assetImageAgentStep struct {
	Step   string `json:"step"`
	Detail string `json:"detail"`
	Count  int    `json:"count"`
}

type assetImageAgentConfig struct {
	Enabled     bool
	AssessCount int
}

func (h *Hub) assetImageAgentConfig() assetImageAgentConfig {
	settings := h.loadAssetEnrichmentStoredSettings()
	config := assetImageAgentConfig{Enabled: true, AssessCount: 6}
	section := anyMap(settings["image_agent"])
	if value, ok := configBoolFromMap(section, "enabled"); ok {
		config.Enabled = value
	}
	if value, ok := configIntFromMap(section, "assess_count"); ok {
		config.AssessCount = value
	}
	if config.AssessCount < 0 {
		config.AssessCount = 0
	}
	if config.AssessCount > 12 {
		config.AssessCount = 12
	}
	return config
}

// agentImageConfigReady 视觉模型就绪（评估依赖视觉 AI）
func (h *Hub) agentImageConfigReady(config assetVisualAIConfig) bool {
	return config.Enabled && config.Endpoint != "" && config.APIKey != "" && config.Model != ""
}

// agentPlanImageQueries AI 生成图片搜索查询变体（比规则多一层设备类型定制）
func (h *Hub) agentPlanImageQueries(ctx context.Context, config assetOnlineAIConfig, identity string, assetType string) []string {
	typeHint := map[string]string{
		"mini_pc":      "迷你主机",
		"nas":          "NAS 存储",
		"server":       "服务器",
		"phone":        "手机",
		"router":       "路由器",
		"switch":       "交换机",
		"game_console": "游戏主机",
	}[assetType]
	if typeHint == "" {
		typeHint = assetType
	}
	system := "你是产品图片搜索策略规划器。只返回 JSON：{\"queries\":[\"...\"]}。为查找该设备的官方产品图片生成 4-6 个搜索查询（中文为主），覆盖：产品渲染图/宣传图、官方规格图、电商商品图、评测文章配图。查询要具体（带品牌+型号），不要输出解释。"
	payload := map[string]any{
		"model": config.Model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": fmt.Sprintf("设备：%s（类型：%s）", identity, typeHint)},
		},
		"temperature": 0.2,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	raw, _, errMessage := callAssetOnlineAIModelContext(ctx, config, body)
	if errMessage != "" {
		return nil
	}
	var parsed struct {
		Queries []string `json:"queries"`
	}
	content := strings.TrimSpace(extractAssetOnlineAIContent(raw))
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimSuffix(content, "```")
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return nil
	}
	queries := make([]string, 0, len(parsed.Queries))
	for _, query := range parsed.Queries {
		query = strings.TrimSpace(query)
		if query != "" {
			queries = append(queries, query)
		}
	}
	return queries
}

// agentAssessImageContents 视觉模型批量评估候选图片内容类型。
// 返回每个输入的内容分级：0=产品渲染图/官方图（优质），1=其他内容，2=实拍/拆解/图表（低质）。
func (h *Hub) agentAssessImageContents(ctx context.Context, config assetVisualAIConfig, asset *core.Record, inputs []assetVisualVerificationInput) map[int]int {
	result := map[int]int{}
	if len(inputs) == 0 {
		return result
	}
	content := make([]any, 0, len(inputs)+1)
	content = append(content, map[string]any{
		"type": "text",
		"text": mustJSON(map[string]any{
			"task":   "判断这些候选图片的内容类型：render=产品渲染图/官方宣传图，diagram=规格图表/参数表截图，hands_on=实拍照片/拆解/开箱，other=其他无关内容。",
			"asset":  map[string]any{"name": asset.GetString("name"), "type": asset.GetString("type"), "vendor": asset.GetString("vendor"), "model": asset.GetString("model")},
			"rules":  []string{"只根据图片可见内容判断", "无法判断时用 other"},
			"output": `{"candidates":[{"index":0,"content":"render"}]}`,
		}),
	})
	for _, input := range inputs {
		content = append(content, map[string]any{
			"type":      "image_url",
			"image_url": map[string]any{"url": input.DataURI, "detail": "low"},
		})
	}
	payload := map[string]any{
		"model":       config.Model,
		"temperature": 0,
		"messages": []map[string]any{
			{"role": "system", "content": "你是产品图片内容分类器。只能返回 JSON，不得查找或生成图片 URL。"},
			{"role": "user", "content": content},
		},
		"response_format": map[string]string{"type": "json_object"},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return result
	}
	raw, _, errMessage := callAssetOnlineAIModelContext(ctx, assetOnlineAIConfig{
		Enabled:  config.Enabled,
		Endpoint: config.Endpoint,
		APIKey:   config.APIKey,
		Model:    config.Model,
	}, body)
	if errMessage != "" {
		return result
	}
	var parsed struct {
		Candidates []struct {
			Index   int    `json:"index"`
			Content string `json:"content"`
		} `json:"candidates"`
	}
	respContent := strings.TrimSpace(extractAssetOnlineAIContent(raw))
	respContent = strings.TrimPrefix(respContent, "```json")
	respContent = strings.TrimSuffix(respContent, "```")
	if err := json.Unmarshal([]byte(respContent), &parsed); err != nil {
		return result
	}
	for _, candidate := range parsed.Candidates {
		switch strings.ToLower(strings.TrimSpace(candidate.Content)) {
		case "render":
			result[candidate.Index] = 0
		case "diagram":
			result[candidate.Index] = 1
		case "hands_on":
			result[candidate.Index] = 2
		default:
			result[candidate.Index] = 1
		}
	}
	return result
}

// assetImageAgentAssess 图片 Agent 视觉评估步骤：候选图已随搜索下载（bytes 留存于候选），
// 取前 assessCount 张直接喂视觉模型判断内容类型，返回 entries 下标 → 内容分级（0=渲染图/1=其他/2=实拍拆解）。
func (h *Hub) assetImageAgentAssess(ctx context.Context, asset *core.Record, entries []assetImageWallEntry, assessCount int) (map[int]int, []assetImageAgentStep) {
	steps := []assetImageAgentStep{}
	visualConfig := h.assetVisualAIConfig()
	if assessCount <= 0 || !h.agentImageConfigReady(visualConfig) {
		return nil, steps
	}
	inputs := make([]assetVisualVerificationInput, 0, assessCount)
	entryIndexes := make([]int, 0, assessCount)
	downloaded := 0
	for entryIndex, entry := range entries {
		if len(inputs) >= assessCount || len(entry.bytes) == 0 {
			continue
		}
		processed, err := normalizeAssetVisualImage(entry.bytes, entry.imageURL)
		if err != nil {
			continue
		}
		dataURI, err := assetVisualVerificationDataURI(processed)
		if err != nil {
			continue
		}
		inputs = append(inputs, assetVisualVerificationInput{Index: downloaded, DataURI: dataURI})
		entryIndexes = append(entryIndexes, entryIndex)
		downloaded++
	}
	if downloaded == 0 {
		emptyBytes := 0
		for _, entry := range entries {
			if len(entry.bytes) == 0 {
				emptyBytes++
			}
		}
		steps = append(steps, assetImageAgentStep{Step: "assess-skip", Detail: fmt.Sprintf("可评估 0 张：entries=%d，其中 %d 张字节为空", len(entries), emptyBytes), Count: 0})
		return nil, steps
	}
	steps = append(steps, assetImageAgentStep{Step: "assess", Detail: fmt.Sprintf("视觉模型评估 %d 张候选图片内容", downloaded), Count: downloaded})
	verdicts := h.agentAssessImageContents(ctx, visualConfig, asset, inputs)
	result := map[int]int{}
	for inputIndex, entryIndex := range entryIndexes {
		if tier, ok := verdicts[inputIndex]; ok {
			result[entryIndex] = tier
		}
	}
	return result, steps
}
