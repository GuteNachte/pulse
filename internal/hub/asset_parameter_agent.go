package hub

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse/internal/assetcatalog"
)

// 2026-10-14 参数填写 Agent（用户拍板：联网参数获取下线，改为粘贴文本自动分类填写）。
// 用户把某资产的参数文本（官网/电商参数页、说明书等复制而来）粘贴进来，Agent 用两段 AI 调用处理：
//   - 第一段（提取）：逐条提取文本中出现的每一个参数（不遗漏、不改写）；
//   - 第二段（分类）：每条归类到固定分组——能对上 registry 字段目录的给出 field；对不上的
//     归入最合适的分类作为该组「自定义参数」（field 留空、以参数名为键）；连分类都无法判断的才进 unrecognized。
// 全部候选（含自定义）按分类持久化进 metadata._agent_results，各组编辑弹窗打开即展示（2026-10-14 用户要求完整识别、分类、显示到对应候选）。
// 与旧搜索链路的差别：来源是用户粘贴的文本（可信来源），不再联网搜索、抓取与交叉验证；
// 因此「实际装机」字段（内存容量/硬盘容量等）允许提取——文本描述的就是这台资产本身。

const (
	agentPasteTextMaxRunes  = 20000 // 粘贴文本截断上限（超长参数页只取前段，一次调用够用）
	agentParamValueMaxRunes = 120   // 单条参数值长度上限（沿用旧搜索链路口径）
	agentPasteNameMaxRunes  = 60    // 自定义参数名（键）长度上限
)

type assetParameterAgentCandidate struct {
	Field    string `json:"field"`
	Label    string `json:"label"`
	Value    string `json:"value"`
	Category string `json:"category"`
	// 2026-10-17 用户拍板：粘贴顺序（提取条目序号）——组编辑弹窗按此顺序直接写入参数行
	Order int `json:"order"`
}

type assetParameterAgentUnrecognized struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

// 2026-10-20 用户反馈：品牌/型号/设备类型被当成「无法分类」——它们属于基本信息，不是参数。
// 单独返回，前端在结果顶部按「基本信息」展示（不写入参数字段，避免覆盖档案主数据）。
type assetParameterAgentProfile struct {
	Field string `json:"field"` // vendor / model / type_description
	Label string `json:"label"`
	Value string `json:"value"`
}

type assetParameterAgentResult struct {
	Candidates   []assetParameterAgentCandidate
	Unrecognized []assetParameterAgentUnrecognized
	Profile      []assetParameterAgentProfile
	// errMessage 非空表示本轮没有任何产出（未配置 / AI 失败 / 文本无可识别参数）
	errMessage string
}

// agentPasteParameterRow AI 返回的原始行（第一段提取的产物）。
type agentPasteParameterRow struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// agentPasteClassifiedRow 第二段分类 AI 返回的单条结果：category=分组 id，field=预设字段 key（可为空）。
type agentPasteClassifiedRow struct {
	Name     string `json:"name"`
	Value    string `json:"value"`
	Category string `json:"category"`
	Field    string `json:"field"`
}

// agentHostAssetTypes 计算设备类型（固件分类映射等按此判断）
var agentHostAssetTypes = map[string]bool{
	"physical_host": true,
	"nas":           true,
	"server":        true,
	"mini_pc":       true,
}

// agentParameterGroupID 字段所属分组（与前端 resolveParameterGroupId 同一规则）：
// 计算设备的「主板与固件」（platform）并入「系统与软件」组；其余分类原样。
func agentParameterGroupID(category, assetType string) string {
	if agentHostAssetTypes[assetType] && category == "platform" {
		return "system"
	}
	return category
}

// agentParameterFieldLines 当前资产类型允许 Agent 填写的字段目录（key|分类id=标签）。
// 系统分类不进目录——预装操作系统是预设下拉，由用户自行维护（2026-10-12 用户拍板）；
// 主板与固件字段仍可采集，按映射归入 system 组（2026-10-17）。
func agentParameterFieldLines(assetType string) []string {
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	registry := assetcatalog.MustParameterRegistry()
	lines := make([]string, 0, 64)
	for key := range allowed {
		definition := registry.Field(key)
		if definition == nil || definition.Category == "" || definition.Scope != "parameter" {
			continue
		}
		if definition.Category == "system" {
			continue
		}
		lines = append(lines, fmt.Sprintf("%s|%s=%s", key, agentParameterGroupID(definition.Category, assetType), definition.Label))
	}
	sort.Strings(lines)
	return lines
}

// agentParameterCategoryLines 当前资产类型可用的分类目录（id=标题，按 registry order 排序，排除系统分类）——
// 第二段分类 AI 用它安置对不上预设字段的参数（作为该组自定义参数保留）。
// 主板与固件（platform）按映射并入 system 组，不单列分类（2026-10-17）。
func agentParameterCategoryLines(assetType string) []string {
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	registry := assetcatalog.MustParameterRegistry()
	byID := make(map[string]*assetcatalog.CategoryDefinition, len(registry.Categories))
	for index := range registry.Categories {
		byID[registry.Categories[index].ID] = &registry.Categories[index]
	}
	used := map[string]bool{}
	for key := range allowed {
		definition := registry.Field(key)
		if definition == nil || definition.Category == "" || definition.Category == "system" {
			continue
		}
		groupID := agentParameterGroupID(definition.Category, assetType)
		if _, ok := byID[groupID]; ok && groupID != "system" {
			used[groupID] = true
		}
	}
	ids := make([]string, 0, len(used))
	for id := range used {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(left, right int) bool { return byID[ids[left]].Order < byID[ids[right]].Order })
	lines := make([]string, 0, len(ids))
	for _, id := range ids {
		lines = append(lines, id+"="+byID[id].Title)
	}
	return lines
}

// callAIPasteJSON 调一次模型并把返回内容解析进 target（剥掉 markdown 代码围栏）。
func (h *Hub) callAIPasteJSON(ctx context.Context, config assetOnlineAIConfig, system, user string, target any) string {
	payload := map[string]any{
		"model": config.Model,
		"messages": []map[string]string{
			{"role": "system", "content": system},
			{"role": "user", "content": user},
		},
		"temperature": 0,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "AI 请求构造失败"
	}
	raw, _, errMessage := callAssetOnlineAIModelContext(ctx, config, body)
	if errMessage != "" {
		return "AI 调用失败：" + errMessage
	}
	content := strings.TrimSpace(extractAssetOnlineAIContent(raw))
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	if err := json.Unmarshal([]byte(content), target); err != nil {
		return "AI 返回格式异常，请重试"
	}
	return ""
}

// parsePasteTabbedItems 本地解析固定粘贴格式「一行一个参数（参数名 + Tab + 值）」：
// 所有非空行都含 Tab（参数名与值非空）时返回条目——不依赖 AI 提取，保证一行不漏；
// 任一非空行不含 Tab 时返回 nil，回退 AI 提取（兼容表格/冒号等其他文本）。
func parsePasteTabbedItems(text string) []agentPasteParameterRow {
	lines := strings.Split(text, "\n")
	items := make([]agentPasteParameterRow, 0, len(lines))
	expected := 0
	for _, raw := range lines {
		line := strings.TrimSpace(strings.TrimSuffix(raw, "\r"))
		if line == "" {
			continue
		}
		expected++
		tabIndex := strings.Index(line, "\t")
		if tabIndex <= 0 || tabIndex == len(line)-1 {
			return nil
		}
		name := strings.TrimSpace(line[:tabIndex])
		value := cleanPasteParameterValue(line[tabIndex+1:])
		if name == "" || value == "" {
			return nil
		}
		items = append(items, agentPasteParameterRow{Key: name, Value: value})
	}
	if expected == 0 || len(items) != expected {
		return nil
	}
	return items
}

// 2026-10-20 用户反馈「识别慢、分类不准」：粘贴文本先走本地确定性解析与分类——
// 常见参数（registry 标签/别名）直接命中字段，带明确关键词的自定义参数直接归组；
// 只有本地认不出的条目才发一次 AI 分类。固定格式/常见规格因此不再等待两段 AI。
// 品牌/型号/设备类型不是参数，单独归入「基本信息」返回。

var agentPasteParameterSpaces = regexp.MustCompile(`\s{2,}`)

var agentPasteUnitTokens = []string{
	"gbps", "mbps", "kbps", "ghz", "mhz", "kv", "gb", "tb", "mb", "kg", "g", "mm", "cm", "db", "rpm", "w", "v", "℃", "°c", "个", "口", "年", "月",
}

func isAgentPasteUnitToken(token string) bool {
	normalized := strings.ToLower(strings.TrimSpace(strings.Trim(token, "()（）")))
	for _, unit := range agentPasteUnitTokens {
		if normalized == unit {
			return true
		}
	}
	return false
}

// splitAgentParameterNameUnit 把参数名末尾的单位拆出来（「交换容量 Gbps」「防雷等级（kV）」），
// 名称本身保持纯名称；值里没有单位且是纯数字时由 applyAgentParameterUnit 补上。
func splitAgentParameterNameUnit(name string) (string, string) {
	trimmed := strings.TrimSpace(name)
	for _, pair := range [][2]string{{"(", ")"}, {"（", "）"}} {
		if strings.HasSuffix(trimmed, pair[1]) {
			if index := strings.LastIndex(trimmed, pair[0]); index > 0 {
				inner := strings.TrimSpace(trimmed[index+len(pair[0]) : len(trimmed)-len(pair[1])])
				if isAgentPasteUnitToken(inner) {
					return strings.TrimSpace(trimmed[:index]), inner
				}
			}
		}
	}
	if index := strings.LastIndexAny(trimmed, " \t"); index > 0 {
		token := strings.TrimSpace(trimmed[index+1:])
		if isAgentPasteUnitToken(token) {
			return strings.TrimSpace(trimmed[:index]), token
		}
	}
	return trimmed, ""
}

func isPlainNumericPasteValue(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	hasDigit := false
	for _, r := range trimmed {
		switch {
		case unicode.IsDigit(r):
			hasDigit = true
		case r == '.', r == ',', r == '-', r == '/', r == '~', r == '～', unicode.IsSpace(r):
		default:
			return false
		}
	}
	return hasDigit
}

func applyAgentParameterUnit(value, unit string) string {
	if unit == "" {
		return value
	}
	if strings.Contains(strings.ToLower(value), strings.ToLower(unit)) {
		return value
	}
	if isPlainNumericPasteValue(value) {
		return value + " " + unit
	}
	return value
}

func normalizeAgentMatchText(value string) string {
	var builder strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		if unicode.IsSpace(r) {
			continue
		}
		switch r {
		case '(', ')', '（', '）', '/', '·', '_', '-':
			continue
		}
		builder.WriteRune(r)
	}
	return builder.String()
}

func agentProfileFieldForName(name string) (field string, label string) {
	switch normalizeAgentMatchText(name) {
	case "品牌", "品牌名称", "厂商", "制造商", "生产厂商":
		return "vendor", "品牌"
	case "型号", "产品型号", "设备型号", "规格型号":
		return "model", "型号"
	case "设备类型", "产品类型", "类型", "产品类别":
		return "type_description", "设备类型"
	}
	return "", ""
}

// agentLocalFieldAliases 常见叫法与 registry 字段的对应（registry 标签之外的补充，不改 registry）。
var agentLocalFieldAliases = map[string]string{
	"管理方式":     "management_access",
	"管理入口":     "management_access",
	"管理界面":     "management_access",
	"主要管理入口":   "management_access",
	"交换容量":     "switching_capacity_gbps",
	"背板带宽":     "switching_capacity_gbps",
	"防雷等级":     "lightning_protection_kv",
	"防雷":       "lightning_protection_kv",
	"VLAN":     "vlan_status",
	"VLAN支持":   "vlan_status",
	"端口隔离":     "port_isolation_status",
	"链路聚合":     "link_aggregation_status",
	"电口数量":     "ethernet_port_count",
	"光口数量":     "optical_port_count",
	"其他端口数量":   "other_port_count",
	"管理级别":     "management_level",
	"支持功能":     "supported_features",
	"散热方式":     "cooling_method",
	"转发方式":     "forwarding_method",
	"MAC地址表容量": "mac_table_entries",
}

func agentLocalFieldIndex(assetType string) map[string]string {
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	registry := assetcatalog.MustParameterRegistry()
	index := make(map[string]string, 64)
	for key := range allowed {
		definition := registry.Field(key)
		if definition == nil || definition.Category == "" || definition.Scope != "parameter" || definition.Category == "system" {
			continue
		}
		index[normalizeAgentMatchText(definition.Label)] = key
		cleanLabel, _ := splitAgentParameterNameUnit(definition.Label)
		index[normalizeAgentMatchText(cleanLabel)] = key
	}
	for alias, key := range agentLocalFieldAliases {
		if allowed[key] {
			index[normalizeAgentMatchText(alias)] = key
		}
	}
	return index
}

func localAgentFieldIndexLookup(index map[string]string, name string) string {
	if key := index[normalizeAgentMatchText(name)]; key != "" {
		return key
	}
	cleanName, _ := splitAgentParameterNameUnit(name)
	return index[normalizeAgentMatchText(cleanName)]
}

func agentCategorySet(assetType string) map[string]bool {
	categories := map[string]bool{}
	for _, line := range agentParameterCategoryLines(assetType) {
		if id, _, ok := strings.Cut(line, "="); ok {
			categories[id] = true
		}
	}
	return categories
}

// localAgentCategory 关键词归类（只在当前资产类型允许的分类里选），解决「VLAN 划分/端口隔离/带宽控制
// 被塞进 VLAN」这类问题：管理功能类关键词优先归 management，散热类归 thermal_environment。
func localAgentCategory(name string, categories map[string]bool) string {
	normalized := normalizeAgentMatchText(name)
	rules := []struct {
		category string
		keywords []string
	}{
		{"management", []string{"管理", "vlan", "隔离", "带宽控制", "聚合", "组播", "风暴", "qos", "acl", "功能", "特性"}},
		{"thermal_environment", []string{"散热", "温度", "湿度", "防雷", "风扇", "噪声", "环境"}},
		{"appearance", []string{"尺寸", "重量", "颜色", "材质", "安装", "机箱", "外形"}},
		{"power", []string{"电源", "供电", "功耗", "功率", "电池", "充电"}},
		{"processor", []string{"处理器", "cpu", "主频", "核心", "线程", "制程"}},
		{"graphics", []string{"显卡", "gpu", "显存", "图形"}},
		{"memory", []string{"内存", "ddr"}},
		{"storage", []string{"存储", "硬盘", "闪存", "盘位", "固态", "机械硬盘"}},
		{"display_output", []string{"显示输出", "hdmi", "displayport", "dp接口", "分辨率", "刷新率"}},
		{"network", []string{"端口", "网口", "电口", "光口", "网卡", "速率", "转发", "mac", "交换容量", "背板", "吞吐", "poe", "ip地址", "网关"}},
		{"io", []string{"接口", "按键", "指示灯", "复位", "usb"}},
		{"display", []string{"屏幕", "触控"}},
		{"imaging", []string{"镜头", "像素", "摄像"}},
		{"audio", []string{"扬声器", "麦克风", "音频"}},
		{"sensors", []string{"传感器"}},
		{"system", []string{"系统", "固件", "操作系统", "软件"}},
	}
	for _, rule := range rules {
		if !categories[rule.category] {
			continue
		}
		for _, keyword := range rule.keywords {
			if strings.Contains(normalized, keyword) {
				return rule.category
			}
		}
	}
	return ""
}

func agentKnownPasteNames(assetType string) []string {
	registry := assetcatalog.MustParameterRegistry()
	names := make([]string, 0, len(registry.Fields)+32)
	for _, field := range registry.Fields {
		names = append(names, field.Label)
		cleanLabel, _ := splitAgentParameterNameUnit(field.Label)
		if cleanLabel != field.Label {
			names = append(names, cleanLabel)
		}
	}
	for alias := range agentLocalFieldAliases {
		names = append(names, alias)
	}
	names = append(names, "品牌", "品牌名称", "厂商", "制造商", "生产厂商", "型号", "产品型号", "设备型号", "设备类型", "产品类型", "产品类别")
	sort.SliceStable(names, func(left, right int) bool {
		return utf8.RuneCountInString(names[left]) > utf8.RuneCountInString(names[right])
	})
	return names
}

func splitAgentPasteLine(line string, knownNames []string) (string, string, bool) {
	line = strings.TrimSpace(strings.ReplaceAll(line, "\u3000", " "))
	if line == "" {
		return "", "", false
	}
	for _, separator := range []string{"：", ":", "="} {
		if index := strings.Index(line, separator); index > 0 && index < len(line)-len(separator) {
			return strings.TrimSpace(line[:index]), strings.TrimSpace(line[index+len(separator):]), true
		}
	}
	if match := agentPasteParameterSpaces.FindStringIndex(line); match != nil && match[0] > 0 {
		return strings.TrimSpace(line[:match[0]]), strings.TrimSpace(line[match[1]:]), true
	}
	for _, name := range knownNames {
		if !strings.HasPrefix(line, name) || len(line) == len(name) {
			continue
		}
		rest := line[len(name):]
		if rest[0] == ' ' || rest[0] == '\t' {
			value := strings.TrimSpace(rest)
			if value != "" {
				return name, value, true
			}
		}
	}
	if index := strings.Index(line, " "); index > 0 && index < len(line)-1 {
		name := strings.TrimSpace(line[:index])
		value := strings.TrimSpace(line[index+1:])
		if name != "" && value != "" && utf8.RuneCountInString(name) <= 12 {
			return name, value, true
		}
	}
	return "", "", false
}

// parsePasteSeparatedItems 解析非 Tab 格式：冒号/等号、两个以上空格、已知字段名前缀、单空格。
// 任一非空行无法解析时返回 nil，回退 AI 提取，避免把整段说明文字误当成参数。
func parsePasteSeparatedItems(text string, assetType string) []agentPasteParameterRow {
	lines := strings.Split(text, "\n")
	items := make([]agentPasteParameterRow, 0, len(lines))
	knownNames := agentKnownPasteNames(assetType)
	for _, raw := range lines {
		line := strings.TrimSpace(strings.TrimSuffix(raw, "\r"))
		if line == "" {
			continue
		}
		name, value, ok := splitAgentPasteLine(line, knownNames)
		if !ok {
			return nil
		}
		name = strings.TrimSpace(name)
		value = cleanPasteParameterValue(value)
		if name == "" || value == "" {
			return nil
		}
		items = append(items, agentPasteParameterRow{Key: name, Value: value})
	}
	if len(items) == 0 {
		return nil
	}
	return items
}

func parsePasteParameterItems(text string, assetType string) []agentPasteParameterRow {
	if items := parsePasteTabbedItems(text); len(items) > 0 {
		return items
	}
	return parsePasteSeparatedItems(text, assetType)
}

// normalizeLocalPasteItem 拆分名称里的单位，并把单位补到纯数字值后面（「交换容量 Gbps」+「60」→ 60 Gbps）。
func normalizeLocalPasteItem(item agentPasteParameterRow) agentPasteParameterRow {
	name, unit := splitAgentParameterNameUnit(item.Key)
	return agentPasteParameterRow{Key: name, Value: applyAgentParameterUnit(item.Value, unit)}
}

func (h *Hub) runAssetParameterAgent(ctx context.Context, asset *core.Record, text string) assetParameterAgentResult {
	result := assetParameterAgentResult{}
	assetType := asset.GetString("type")
	fieldLines := agentParameterFieldLines(assetType)
	if len(fieldLines) == 0 {
		result.errMessage = "该资产类型没有可填写的参数字段"
		return result
	}
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		result.errMessage = "粘贴的参数文本为空"
		return result
	}
	runes := []rune(trimmed)
	if len(runes) > agentPasteTextMaxRunes {
		trimmed = string(runes[:agentPasteTextMaxRunes])
	}
	config := h.assetOnlineAIConfig()
	aiReady := config.Enabled && config.Endpoint != "" && config.APIKey != "" && config.Model != ""
	identity := strings.Join(nonEmptyStrings(asset.GetString("vendor"), asset.GetString("model"), asset.GetString("name")), " ")

	// 2026-10-20 本地优先：Tab/冒号/空格等常见格式先本地解析；本地解析成功就不需要第一段 AI 提取。
	items := parsePasteParameterItems(trimmed, assetType)
	if len(items) == 0 {
		if !aiReady {
			result.errMessage = "AI 未配置（设置 → AI 服务接入）"
			return result
		}
		extracted, extractErr := h.extractPasteRowsWithAI(ctx, config, identity, trimmed)
		if extractErr != "" {
			result.errMessage = extractErr
			return result
		}
		items = extracted
	}

	// 拆出基本信息（品牌/型号/设备类型）——它们不是参数，单独返回给前端展示，避免落进「无法分类」；
	// 常见参数由本地规则直接命中，剩下的才发 AI。
	rows, leftovers, profile := classifyPasteItemsLocally(assetType, items)
	result.Profile = profile

	if len(leftovers) > 0 {
		if !aiReady {
			// 没配置 AI 也先把本地结果交出来，剩下的如实列为无法分类（不再整单失败）。
			for _, item := range leftovers {
				rows = append(rows, agentPasteClassifiedRow{Name: item.Key, Value: item.Value})
			}
		} else {
			aiRows, classifyErr := h.classifyPasteRowsWithAI(ctx, config, assetType, fieldLines, leftovers)
			if classifyErr != "" {
				if len(rows) == 0 && len(result.Profile) == 0 {
					result.errMessage = classifyErr
					return result
				}
				for _, item := range leftovers {
					rows = append(rows, agentPasteClassifiedRow{Name: item.Key, Value: item.Value})
				}
			} else {
				rows = append(rows, aiRows...)
			}
		}
	}

	result.Candidates, result.Unrecognized = normalizeClassifiedPasteRows(rows, assetType)
	if len(result.Candidates) == 0 && len(result.Unrecognized) == 0 && len(result.Profile) == 0 {
		result.errMessage = "文本里没有识别到参数"
	}
	return result
}

func classifyPasteItemsLocally(
	assetType string,
	items []agentPasteParameterRow,
) (rows []agentPasteClassifiedRow, leftovers []agentPasteParameterRow, profile []assetParameterAgentProfile) {
	fieldIndex := agentLocalFieldIndex(assetType)
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	categories := agentCategorySet(assetType)
	registry := assetcatalog.MustParameterRegistry()
	rows = make([]agentPasteClassifiedRow, 0, len(items))
	leftovers = make([]agentPasteParameterRow, 0)
	for _, item := range items {
		normalized := normalizeLocalPasteItem(item)
		if normalized.Key == "" || normalized.Value == "" {
			continue
		}
		if field, label := agentProfileFieldForName(normalized.Key); field != "" {
			profile = append(profile, assetParameterAgentProfile{Field: field, Label: label, Value: normalized.Value})
			continue
		}
		field := localAgentFieldIndexLookup(fieldIndex, normalized.Key)
		if field != "" && allowed[field] {
			if definition := registry.Field(field); definition != nil {
				rows = append(rows, agentPasteClassifiedRow{
					Name: normalized.Key, Value: normalized.Value, Category: definition.Category, Field: field,
				})
				continue
			}
		}
		if category := localAgentCategory(normalized.Key, categories); category != "" {
			rows = append(rows, agentPasteClassifiedRow{Name: normalized.Key, Value: normalized.Value, Category: category})
			continue
		}
		leftovers = append(leftovers, normalized)
	}
	return rows, leftovers, dedupeAgentProfile(profile)
}

func dedupeAgentProfile(rows []assetParameterAgentProfile) []assetParameterAgentProfile {
	seen := map[string]bool{}
	result := make([]assetParameterAgentProfile, 0, len(rows))
	for _, row := range rows {
		if seen[row.Field] {
			continue
		}
		seen[row.Field] = true
		result = append(result, row)
	}
	return result
}

// extractPasteRowsWithAI 本地无法解析格式时的第一段提取（保留原文、一条不漏）。
func (h *Hub) extractPasteRowsWithAI(
	ctx context.Context,
	config assetOnlineAIConfig,
	identity string,
	text string,
) ([]agentPasteParameterRow, string) {
	var extracted struct {
		Items []agentPasteParameterRow `json:"items"`
	}
	extractSystem := "你是硬件参数提取器。用户会粘贴一段某资产的参数文本（可能来自官网、电商参数页或说明书，也可能是表格复制出来的两列文字）。请把文本中出现的每一个参数逐条提取出来。严格规则：一条不漏——每行一个参数（参数名 + Tab/空格/冒号 + 值）的格式、表格行、冒号分隔、等号分隔、顿号并列的规格都要拆成独立条目；参数名保持原文（不翻译、不改写、不补全）；值保持原文写法和单位；只取目标设备本身的参数，同系列其他型号的跳过；营销文案、服务承诺、价格、与硬件参数无关的内容跳过；没有任何可提取参数时返回空数组。只返回 JSON：{\"items\":[{\"key\":\"参数名\",\"value\":\"参数值\"}]}"
	extractUser := "目标设备：" + identity + "\n\n参数文本：\n" + text
	var extractErr string
	for attempt := 0; attempt < 2; attempt++ {
		extracted.Items = nil
		if errMessage := h.callAIPasteJSON(ctx, config, extractSystem, extractUser, &extracted); errMessage != "" {
			extractErr = errMessage
			continue
		}
		extractErr = ""
		if len(extracted.Items) > 0 {
			return extracted.Items, ""
		}
	}
	if extractErr != "" {
		return nil, extractErr
	}
	return nil, "文本里没有识别到参数"
}

// classifyPasteRowsWithAI 只把本地认不出的条目送去分类，返回补回漏条后的结果。
func (h *Hub) classifyPasteRowsWithAI(
	ctx context.Context,
	config assetOnlineAIConfig,
	assetType string,
	fieldLines []string,
	leftovers []agentPasteParameterRow,
) ([]agentPasteClassifiedRow, string) {
	items, err := json.Marshal(map[string]any{"items": leftovers})
	if err != nil {
		return nil, "AI 请求构造失败"
	}
	var classified struct {
		Items []agentPasteClassifiedRow `json:"items"`
	}
	classifySystem := "你是硬件参数分类器。下面给你同一台设备的参数清单（JSON：{\"items\":[...]}，每条形如 {\"key\":\"参数名\",\"value\":\"值\"}；这些是本地规则未覆盖的条目），请给每一条分类并返回。返回格式：{\"items\":[{\"name\":\"参数名\",\"value\":\"值\",\"category\":\"分类id\",\"field\":\"字段key\"}]}，其中 name 和 value 用输入条目的 key 和 value 原样填充。目录说明：字段目录每行格式「字段key|分类id=含义」；分类目录每行格式「分类id=标题」。分类规则：参数能对应字段目录里某个字段时，field 填该字段的 key、category 填该字段行竖线后的分类 id；对不上任何字段的参数也是有用的，field 留空字符串、category 从分类目录里选最合适的一个（它将作为该分类的自定义参数保留）；连分类都无法判断的（营销文案、无关内容、含义不明），category 和 field 都留空字符串。严格规则：只分类不改写——name 和 value 原样返回、不要丢弃任何一条、不要合并拆分。只返回 JSON。\n分类目录：\n" + strings.Join(agentParameterCategoryLines(assetType), "\n") + "\n字段目录：\n" + strings.Join(fieldLines, "\n")
	var classifyErr string
	for attempt := 0; attempt < 2; attempt++ {
		classified.Items = nil
		if errMessage := h.callAIPasteJSON(ctx, config, classifySystem, string(items), &classified); errMessage != "" {
			classifyErr = errMessage
			continue
		}
		classifyErr = ""
		if len(classified.Items) > 0 {
			break
		}
	}
	if classifyErr != "" {
		return nil, classifyErr
	}
	return reconcileClassifiedPasteRows(leftovers, classified.Items), ""
}

// reconcileClassifiedPasteRows 对照提取清单补回分类阶段漏掉的条目（模型偶发漏条）：
// 以参数名 + 值（空白归一后）匹配，缺失的条目追加为「未分类」行（name/value 原样、category 与 field 留空），
// 由前端作为当前分组的自定义参数处理或在报告中列为无法分类。
func reconcileClassifiedPasteRows(extracted []agentPasteParameterRow, classified []agentPasteClassifiedRow) []agentPasteClassifiedRow {
	matchKey := func(name, value string) string {
		return strings.Join(strings.Fields(name), " ") + "\x00" + strings.Join(strings.Fields(value), " ")
	}
	seen := make(map[string]bool, len(classified))
	for _, row := range classified {
		seen[matchKey(row.Name, row.Value)] = true
	}
	result := classified
	for _, item := range extracted {
		name := strings.TrimSpace(item.Key)
		value := strings.TrimSpace(item.Value)
		if name == "" || value == "" {
			continue
		}
		key := matchKey(name, value)
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, agentPasteClassifiedRow{Name: name, Value: value})
	}
	return result
}

// isReservedPasteKey 判断自定义参数名是否为保留键（下划线开头的协议键 / Agent 运行时前缀 / 网络表格结构键）。
func isReservedPasteKey(key string) bool {
	if strings.HasPrefix(key, "_") || strings.HasPrefix(key, "current_") {
		return true
	}
	switch key {
	case "nic_port_type", "wifi_port_type", "nic_connector_type", "wifi_connector_type":
		// 网络表格的结构键（非 registry 字段），不允许被自定义参数占用
		return true
	}
	return false
}

// normalizeClassifiedPasteRows 把第二段分类结果规范化为候选（预设 + 自定义）与未识别：
//   - field 命中 registry（允许类型、parameter scope、非系统分类）→ 预设字段候选（复用 normalizePasteCandidates：
//     registry 校验、值清洗、内存类型/频率拆分、同字段取首个）；
//   - field 无效但分类有效 → 自定义参数候选（以参数名为键，label 同名）；
//   - 分类也无效 → 未识别（只进完成报告，不写入）。
func normalizeClassifiedPasteRows(rows []agentPasteClassifiedRow, assetType string) ([]assetParameterAgentCandidate, []assetParameterAgentUnrecognized) {
	registry := assetcatalog.MustParameterRegistry()
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	// 2026-10-20 自定义参数只能落在当前资产类型真正可用的分类里（管理功能等新分类随目录自动生效），
	// 避免 AI 把参数塞到该类型没有的分类下、前端找不到分组。
	validCategory := agentCategorySet(assetType)
	categoryOrder := map[string]int{}
	for _, category := range registry.Categories {
		categoryOrder[category.ID] = category.Order
	}
	presetRows := make([]agentPasteParameterRow, 0, len(rows))
	customCandidates := make([]assetParameterAgentCandidate, 0, len(rows))
	unrecognized := make([]assetParameterAgentUnrecognized, 0)
	seenUnrecognized := map[string]bool{}
	seenCustom := map[string]bool{}
	// 2026-10-17 用户拍板：记录每条参数的粘贴顺序（first occurrence），前端组编辑按此顺序直接写入行列表
	orderByField := map[string]int{}
	// 2026-10-17 用户报「只识别出一条」：分类模型常把同一分组的多条参数都标到该组唯一字段上
	// （如三行显示输出都标 display_outputs）——字段已用过后，名称不同的后续条目保留为自定义参数，避免被去重静默丢弃
	usedPresetFields := map[string]bool{}
	addUnrecognized := func(name, value string) {
		if !seenUnrecognized[name] {
			seenUnrecognized[name] = true
			unrecognized = append(unrecognized, assetParameterAgentUnrecognized{Name: name, Value: value})
		}
	}
	for rowIndex, row := range rows {
		name := strings.TrimSpace(row.Name)
		value := cleanPasteParameterValue(row.Value)
		if name == "" || value == "" {
			continue
		}
		// 预设字段路径：field 命中目录且字段本身可填
		field := strings.TrimSpace(row.Field)
		if field != "" && allowed[field] && isFillableRegistryField(field) {
			if !usedPresetFields[field] {
				usedPresetFields[field] = true
				if _, ok := orderByField[field]; !ok {
					orderByField[field] = rowIndex
				}
				presetRows = append(presetRows, agentPasteParameterRow{Key: field, Value: value})
				continue
			}
			// 同一字段的后续条目：名称与该字段标签相同视为重复丢弃；名称不同则落到下面的自定义路径
			if definition := registry.Field(field); definition != nil && name == strings.TrimSpace(definition.Label) {
				continue
			}
		}
		// 自定义路径：分类有效才能保留
		category := strings.TrimSpace(row.Category)
		if category == "" || !validCategory[category] {
			addUnrecognized(name, value)
			continue
		}
		key := name
		if len([]rune(key)) > agentPasteNameMaxRunes || isReservedPasteKey(key) {
			addUnrecognized(name, value)
			continue
		}
		if definition := registry.Field(key); definition != nil {
			// 参数名恰好是字段 key：能填的按预设字段兜底（AI 漏填 field 的补救），其余进未识别
			if allowed[key] && isFillableRegistryField(key) {
				if _, ok := orderByField[key]; !ok {
					orderByField[key] = rowIndex
				}
				presetRows = append(presetRows, agentPasteParameterRow{Key: key, Value: value})
				continue
			}
			addUnrecognized(name, value)
			continue
		}
		if seenCustom[key] {
			continue
		}
		seenCustom[key] = true
		if _, ok := orderByField[key]; !ok {
			orderByField[key] = rowIndex
		}
		customCandidates = append(customCandidates, assetParameterAgentCandidate{
			Field:    key,
			Label:    key,
			Value:    value,
			Category: category,
		})
	}
	candidates := normalizePasteCandidates(presetRows, assetType)
	presetFields := make(map[string]bool, len(candidates))
	for _, candidate := range candidates {
		presetFields[candidate.Field] = true
	}
	for _, candidate := range customCandidates {
		if presetFields[candidate.Field] {
			continue
		}
		candidates = append(candidates, candidate)
	}
	// 记录粘贴顺序（内存类型拆出的频率沿用类型行的顺序；其余无记录的行排在末尾）
	for index := range candidates {
		order, ok := orderByField[candidates[index].Field]
		if !ok && candidates[index].Field == "supported_memory_speed_mhz" {
			order, ok = orderByField["supported_memory_type"]
		}
		if !ok {
			order = len(rows)
		}
		candidates[index].Order = order
	}
	// 排序：分类 order → 粘贴顺序 → 字段 key（同组聚合且保持用户文本顺序）
	sort.SliceStable(candidates, func(left, right int) bool {
		if categoryOrder[candidates[left].Category] != categoryOrder[candidates[right].Category] {
			return categoryOrder[candidates[left].Category] < categoryOrder[candidates[right].Category]
		}
		if candidates[left].Order != candidates[right].Order {
			return candidates[left].Order < candidates[right].Order
		}
		return candidates[left].Field < candidates[right].Field
	})
	return candidates, unrecognized
}

// isFillableRegistryField 字段可被 Agent 填写的 registry 条件：parameter scope、有分类、非系统分类。
func isFillableRegistryField(key string) bool {
	definition := assetcatalog.MustParameterRegistry().Field(key)
	return definition != nil && definition.Scope == "parameter" && definition.Category != "" && definition.Category != "system"
}

// normalizePasteCandidates 校验并规范化 AI 分类结果：
// registry 校验（预设参数字段）、值清洗、内存类型/频率混写拆分、同字段取首个值。
func normalizePasteCandidates(rows []agentPasteParameterRow, assetType string) []assetParameterAgentCandidate {
	registry := assetcatalog.MustParameterRegistry()
	allowed := assetEnrichmentAllowedMetadataFieldSet(assetType)
	rows = splitPasteMemoryType(rows)
	candidates := make([]assetParameterAgentCandidate, 0, len(rows))
	seen := map[string]bool{}
	for _, row := range rows {
		key := strings.TrimSpace(row.Key)
		value := cleanPasteParameterValue(row.Value)
		if key == "" || value == "" || seen[key] {
			continue
		}
		if !allowed[key] {
			continue
		}
		definition := registry.Field(key)
		if definition == nil || definition.Category == "" || definition.Scope != "parameter" || definition.Category == "system" {
			continue
		}
		seen[key] = true
		candidates = append(candidates, assetParameterAgentCandidate{
			Field:    key,
			Label:    definition.Label,
			Value:    value,
			Category: definition.Category,
		})
	}
	sort.SliceStable(candidates, func(left, right int) bool { return candidates[left].Field < candidates[right].Field })
	return candidates
}

// cleanPasteParameterValue 参数值清洗：去首尾空白、压平换行、限长。
func cleanPasteParameterValue(raw string) string {
	value := strings.Join(strings.Fields(raw), " ")
	if len([]rune(value)) > agentParamValueMaxRunes {
		value = string([]rune(value)[:agentParamValueMaxRunes])
	}
	return value
}

// splitPasteMemoryType 内存类型混写拆分（沿用 2026-10-12 搜索链路口径）：
// DDR5-4800 → 类型 DDR5 + 支持频率 4800；频率支持单值与区间（4800-6400 / 4800/5600），
// 可带 MHz、MT/s 单位；代际本身不含连字符，按第一个连字符切分。
func splitPasteMemoryType(rows []agentPasteParameterRow) []agentPasteParameterRow {
	hasSpeed := false
	for _, row := range rows {
		if strings.TrimSpace(row.Key) == "supported_memory_speed_mhz" && strings.TrimSpace(row.Value) != "" {
			hasSpeed = true
			break
		}
	}
	result := rows
	for index, row := range result {
		if strings.TrimSpace(row.Key) != "supported_memory_type" {
			continue
		}
		value := strings.TrimSpace(row.Value)
		dashIdx := strings.Index(value, "-")
		if dashIdx <= 0 || dashIdx == len(value)-1 {
			continue
		}
		suffix, ok := agentMemorySpeedSuffix(value[dashIdx+1:])
		if !ok {
			continue
		}
		result[index].Value = strings.TrimSpace(value[:dashIdx])
		if !hasSpeed {
			result = append(result, agentPasteParameterRow{Key: "supported_memory_speed_mhz", Value: suffix})
			hasSpeed = true
		}
	}
	return result
}

// agentMemorySpeedSuffix 校验并返回内存频率后缀：接受单值与区间
// （4800 / 4800-6400 / 4800/5600 / 4800~6400，可带 MHz、MT/s 单位），每段须为 3-4 位数字。
func agentMemorySpeedSuffix(raw string) (string, bool) {
	suffix := strings.TrimSpace(raw)
	upper := strings.ToUpper(suffix)
	if strings.HasSuffix(upper, "MHZ") {
		suffix = strings.TrimSpace(suffix[:len(suffix)-3])
	} else if strings.HasSuffix(upper, "MT/S") {
		suffix = strings.TrimSpace(suffix[:len(suffix)-4])
	}
	if suffix == "" {
		return "", false
	}
	tokens := strings.FieldsFunc(suffix, func(r rune) bool {
		return r == '-' || r == '/' || r == '~' || r == '～'
	})
	if len(tokens) == 0 {
		return "", false
	}
	for _, token := range tokens {
		if len(token) < 3 || len(token) > 4 {
			return "", false
		}
		for _, r := range token {
			if r < '0' || r > '9' {
				return "", false
			}
		}
	}
	return suffix, true
}

// 2026-10-14 参数填写 Agent 端点：POST /api/pulse/assets/parameter-agent
type assetParameterAgentRequest struct {
	Name   string `json:"name"`
	Type   string `json:"type"`
	Vendor string `json:"vendor"`
	Model  string `json:"model"`
	// Text 用户粘贴的参数文本（必填）
	Text string `json:"text"`
	// AssetID 关联资产（可选）：执行记录挂到该资产，执行日志可追溯
	AssetID string `json:"asset_id"`
}

// agentRecordRun 记录一次执行（设置页消耗统计与执行日志的数据源）。
func (h *Hub) agentRecordRun(userID, assetID string, config assetOnlineAIConfig, result *assetParameterAgentResult) {
	collection, err := h.FindCachedCollectionByNameOrId("ai_tasks")
	if err != nil {
		return
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	if assetID != "" {
		record.Set("asset", assetID)
	}
	record.Set("kind", "asset_enrichment")
	record.Set("provider", config.Provider)
	record.Set("model", config.Model)
	record.Set("input_summary", map[string]any{"mode": "paste"})
	if len(result.Candidates) > 0 || len(result.Unrecognized) > 0 || len(result.Profile) > 0 {
		record.Set("status", "ready")
		record.Set("output_summary", map[string]any{
			"paste":        true,
			"candidates":   len(result.Candidates),
			"unrecognized": len(result.Unrecognized),
			"profile":      len(result.Profile),
		})
	} else {
		record.Set("status", "failed")
		record.Set("error", result.errMessage)
		record.Set("output_summary", map[string]any{"paste": true})
	}
	if err := h.Save(record); err != nil {
		return
	}
}

func (h *Hub) assetParameterAgent(e *core.RequestEvent) error {
	var req assetParameterAgentRequest
	if err := json.NewDecoder(e.Request.Body).Decode(&req); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return e.BadRequestError("Missing asset name.", nil)
	}
	assetType := strings.TrimSpace(req.Type)
	if assetType == "" {
		return e.BadRequestError("Missing asset type.", nil)
	}
	if strings.TrimSpace(req.Text) == "" {
		return e.BadRequestError("Missing parameter text.", nil)
	}
	collection, err := h.FindCachedCollectionByNameOrId("assets")
	if err != nil {
		return e.InternalServerError("Failed to load assets collection.", err)
	}
	pseudo := core.NewRecord(collection)
	pseudo.Set("user", e.Auth.Id)
	pseudo.Set("name", name)
	pseudo.Set("type", assetType)
	if vendor := strings.TrimSpace(req.Vendor); vendor != "" {
		pseudo.Set("vendor", vendor)
	}
	if model := strings.TrimSpace(req.Model); model != "" {
		pseudo.Set("model", model)
	}

	result := h.runAssetParameterAgent(e.Request.Context(), pseudo, req.Text)
	config := h.assetOnlineAIConfig()
	h.agentRecordRun(e.Auth.Id, strings.TrimSpace(req.AssetID), config, &result)
	if result.errMessage != "" && len(result.Candidates) == 0 && len(result.Unrecognized) == 0 && len(result.Profile) == 0 {
		return e.JSON(http.StatusOK, map[string]any{
			"candidates":   []assetParameterAgentCandidate{},
			"unrecognized": []assetParameterAgentUnrecognized{},
			"profile":      []assetParameterAgentProfile{},
			"error":        result.errMessage,
		})
	}
	if result.Candidates == nil {
		result.Candidates = []assetParameterAgentCandidate{}
	}
	if result.Unrecognized == nil {
		result.Unrecognized = []assetParameterAgentUnrecognized{}
	}
	if result.Profile == nil {
		result.Profile = []assetParameterAgentProfile{}
	}
	return e.JSON(http.StatusOK, map[string]any{
		"candidates":   result.Candidates,
		"unrecognized": result.Unrecognized,
		"profile":      result.Profile,
		"error":        "",
	})
}
