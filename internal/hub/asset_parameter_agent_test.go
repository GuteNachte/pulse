package hub

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// 2026-10-14 参数填写 Agent：粘贴文本分类的纯函数测试（AI 调用之外的全部规范化逻辑）。

func TestNormalizePasteCandidates(t *testing.T) {
	rows := []agentPasteParameterRow{
		{Key: "cpu_model", Value: "  AMD 锐龙 9\n6900HX "},
		{Key: "cpu_cores", Value: "8"},
		{Key: "memory_slots", Value: "2"},
		// 未知字段：目录外，丢弃
		{Key: "not_a_field", Value: "随便"},
		// 空值：丢弃
		{Key: "cpu_vendor", Value: "  "},
		// 同字段重复：保留第一条
		{Key: "cpu_cores", Value: "16"},
	}
	candidates := normalizePasteCandidates(rows, "mini_pc")
	byField := map[string]string{}
	for _, candidate := range candidates {
		byField[candidate.Field] = candidate.Value
	}
	require.Equal(t, "AMD 锐龙 9 6900HX", byField["cpu_model"], "换行压平、首尾去空白")
	require.Equal(t, "8", byField["cpu_cores"], "同字段重复保留第一条")
	require.Equal(t, "2", byField["memory_slots"])
	require.NotContains(t, byField, "not_a_field")
	require.NotContains(t, byField, "cpu_vendor")
}

func TestNormalizePasteCandidatesExcludesSystemCategory(t *testing.T) {
	// 2026-10-12 用户拍板：系统组（预装/支持操作系统等）是预设下拉，Agent 不填写系统字段
	candidates := normalizePasteCandidates([]agentPasteParameterRow{
		{Key: "preinstalled_os", Value: "Windows 11 专业版"},
		{Key: "cpu_model", Value: "6900HX"},
	}, "mini_pc")
	fields := map[string]bool{}
	for _, candidate := range candidates {
		fields[candidate.Field] = true
	}
	require.False(t, fields["preinstalled_os"])
	require.True(t, fields["cpu_model"])
}

func TestNormalizePasteCandidatesSplitsMixedMemoryType(t *testing.T) {
	// 2026-10-12 内存口径：DDR5-4800 → 类型 DDR5 + 支持频率 4800（粘贴链路沿用）
	candidates := normalizePasteCandidates([]agentPasteParameterRow{
		{Key: "supported_memory_type", Value: "DDR5-4800"},
	}, "mini_pc")
	byField := map[string]string{}
	for _, candidate := range candidates {
		byField[candidate.Field] = candidate.Value
	}
	require.Equal(t, "DDR5", byField["supported_memory_type"])
	require.Equal(t, "4800", byField["supported_memory_speed_mhz"])
}

func TestNormalizePasteCandidatesKeepsMemorySpeedAsIs(t *testing.T) {
	// 频率带单位：归一化剥离单位后落库（4800-6400 区间原样保留）
	candidates := normalizePasteCandidates([]agentPasteParameterRow{
		{Key: "supported_memory_type", Value: "DDR5"},
		{Key: "supported_memory_speed_mhz", Value: "4800-6400MHz"},
	}, "mini_pc")
	byField := map[string]string{}
	for _, candidate := range candidates {
		byField[candidate.Field] = candidate.Value
	}
	require.Equal(t, "DDR5", byField["supported_memory_type"])
	require.Equal(t, "4800-6400MHz", byField["supported_memory_speed_mhz"])
}

func TestNormalizePasteCandidatesAllowsCurrentInstallFields(t *testing.T) {
	// 2026-10-14 粘贴口径：文本描述的就是这台资产本身——「实际装机」字段（内存容量等）允许填写
	// （与旧搜索链路相反：搜索来源是外部页面，装机字段只能手动填）
	candidates := normalizePasteCandidates([]agentPasteParameterRow{
		{Key: "memory_gb", Value: "16"},
		{Key: "memory_type", Value: "DDR5"},
		{Key: "storage_vendor", Value: "三星"},
	}, "mini_pc")
	fields := map[string]bool{}
	for _, candidate := range candidates {
		fields[candidate.Field] = true
	}
	require.True(t, fields["memory_gb"])
	require.True(t, fields["memory_type"])
	require.True(t, fields["storage_vendor"])
}

func TestNormalizePasteUnrecognized(t *testing.T) {
	// 2026-10-14 两段式分类：预设字段候选 + 自定义参数候选 + 未识别（无法分类才进未识别）
	rows := []agentPasteClassifiedRow{
		{Name: "处理器", Value: "AMD 锐龙 9 6900HX", Category: "processor", Field: "cpu_model"},
		// 对不上预设字段、但分类有效 → 该组自定义参数（以参数名为键）
		{Name: "RGB 灯效", Value: "支持", Category: "appearance", Field: ""},
		{Name: "存档接口", Value: "支持", Category: "appearance", Field: "not_a_field"},
		// 分类无效 → 未识别
		{Name: "五年质保", Value: "是", Category: "", Field: ""},
		{Name: "包邮", Value: "是", Category: "system", Field: ""},
		// 参数名恰好是可填字段 key（AI 漏填 field 的兜底）→ 预设候选
		{Name: "memory_slots", Value: "2", Category: "memory", Field: ""},
		// 参数名是字段 key 但不可填（系统分类）→ 未识别
		{Name: "preinstalled_os", Value: "Windows 11", Category: "system", Field: ""},
		// 自定义名重复 → 去重保留第一条
		{Name: "RGB 灯效", Value: "支持 2", Category: "appearance", Field: ""},
		// 保留键 / 运行时前缀 → 未识别
		{Name: "_hidden_params", Value: "x", Category: "appearance", Field: ""},
		{Name: "current_cpu_load", Value: "12%", Category: "processor", Field: ""},
		{Name: "nic_port_type", Value: "电口", Category: "network", Field: ""},
	}
	candidates, unrecognized := normalizeClassifiedPasteRows(rows, "mini_pc")

	byField := map[string]assetParameterAgentCandidate{}
	for _, candidate := range candidates {
		byField[candidate.Field] = candidate
	}
	require.Equal(t, "AMD 锐龙 9 6900HX", byField["cpu_model"].Value)
	require.Equal(t, "processor", byField["cpu_model"].Category)
	require.Equal(t, "2", byField["memory_slots"].Value, "参数名为可填字段 key 时兜底为预设候选")
	require.Equal(t, "支持", byField["RGB 灯效"].Value, "自定义参数以参数名为键保留")
	require.Equal(t, "appearance", byField["RGB 灯效"].Category)
	require.Equal(t, "支持", byField["存档接口"].Value, "field 无效但分类有效时仍走自定义参数")
	require.Len(t, candidates, 4)

	byName := map[string]string{}
	for _, item := range unrecognized {
		byName[item.Name] = item.Value
	}
	require.Equal(t, "是", byName["五年质保"], "分类为空 → 未识别")
	require.Equal(t, "是", byName["包邮"], "系统分类 → 未识别")
	require.Equal(t, "Windows 11", byName["preinstalled_os"], "不可填字段名 → 未识别")
	require.Equal(t, "x", byName["_hidden_params"], "保留键 → 未识别")
	require.Equal(t, "12%", byName["current_cpu_load"], "运行时前缀 → 未识别")
	require.Equal(t, "电口", byName["nic_port_type"], "网络表格结构键不允许被自定义参数占用 → 未识别")
	require.NotContains(t, byName, "RGB 灯效", "自定义参数不进未识别")
	require.Len(t, unrecognized, 6)
}

func TestNormalizeClassifiedPasteRowsSortsByCategoryOrder(t *testing.T) {
	candidates, _ := normalizeClassifiedPasteRows([]agentPasteClassifiedRow{
		{Name: "电源", Value: "120W", Category: "power", Field: ""},
		{Name: "处理器", Value: "6900HX", Category: "processor", Field: "cpu_model"},
		{Name: "机箱品牌", Value: "MINISFORUM", Category: "appearance", Field: ""},
	}, "mini_pc")
	require.Len(t, candidates, 3)
	require.Equal(t, "appearance", candidates[0].Category, "外观 order 在前")
	require.Equal(t, "processor", candidates[1].Category)
	require.Equal(t, "power", candidates[2].Category)
}

func TestNormalizeClassifiedPasteRowsSplitsMixedMemoryType(t *testing.T) {
	candidates, _ := normalizeClassifiedPasteRows([]agentPasteClassifiedRow{
		{Name: "内存类型", Value: "DDR5-4800", Category: "memory", Field: "supported_memory_type"},
	}, "mini_pc")
	byField := map[string]string{}
	for _, candidate := range candidates {
		byField[candidate.Field] = candidate.Value
	}
	require.Equal(t, "DDR5", byField["supported_memory_type"])
	require.Equal(t, "4800", byField["supported_memory_speed_mhz"])
}

func TestAgentParameterCategoryLines(t *testing.T) {
	lines := agentParameterCategoryLines("mini_pc")
	require.NotEmpty(t, lines)
	joined := strings.Join(lines, "\n")
	require.Contains(t, joined, "appearance=")
	require.Contains(t, joined, "processor=")
	require.NotContains(t, joined, "system=", "系统分类不进分类目录")
	// order 升序：外观（10）在处理器（20）之前
	appearanceIdx := strings.Index(joined, "appearance=")
	processorIdx := strings.Index(joined, "processor=")
	require.Greater(t, processorIdx, appearanceIdx)
}

func TestAgentMemorySpeedSuffix(t *testing.T) {
	cases := []struct {
		raw    string
		want   string
		wantOK bool
	}{
		{"4800", "4800", true},
		{"4800MHz", "4800", true},
		{"4800MT/s", "4800", true},
		{"4800-6400", "4800-6400", true},
		{"4800/5600", "4800/5600", true},
		{"4800~6400", "4800~6400", true},
		{"DDR5", "", false},
		{"48000", "", false},
		{"", "", false},
	}
	for _, testCase := range cases {
		got, ok := agentMemorySpeedSuffix(testCase.raw)
		require.Equal(t, testCase.wantOK, ok, "input: %s", testCase.raw)
		require.Equal(t, testCase.want, got, "input: %s", testCase.raw)
	}
}

func TestAgentParameterFieldLinesExcludesSystem(t *testing.T) {
	lines := agentParameterFieldLines("mini_pc")
	require.NotEmpty(t, lines)
	for _, line := range lines {
		require.NotContains(t, line, "=预装", "系统分类不应出现在填写目录")
	}
}

func TestNormalizeClassifiedPasteRowsPreservesPasteOrder(t *testing.T) {
	// 2026-10-17 用户拍板：组编辑按粘贴顺序直接写入——同分类候选保持提取顺序（Order 升序）
	rows := []agentPasteClassifiedRow{
		{Name: "架构代号", Value: "Rembrandt", Category: "processor", Field: ""},
		{Name: "CPU 型号", Value: "6900HX", Category: "processor", Field: "cpu_model"},
		{Name: "制程", Value: "6nm", Category: "processor", Field: ""},
	}
	candidates, _ := normalizeClassifiedPasteRows(rows, "mini_pc")
	require.Len(t, candidates, 3)
	require.Equal(t, "架构代号", candidates[0].Field)
	require.Equal(t, 0, candidates[0].Order)
	require.Equal(t, "cpu_model", candidates[1].Field)
	require.Equal(t, 1, candidates[1].Order)
	require.Equal(t, "制程", candidates[2].Field)
	require.Equal(t, 2, candidates[2].Order)
}

func TestAgentParameterFieldLinesMapsPlatformToSystem(t *testing.T) {
	// 2026-10-17：计算设备主板与固件字段并入 system 组（展示与弹窗同一映射），但仍可被 Agent 采集
	lines := agentParameterFieldLines("mini_pc")
	found := false
	for _, line := range lines {
		if strings.HasPrefix(line, "motherboard_model|system=") {
			found = true
		}
		require.NotContains(t, line, "|platform=", "主板与固件不应作为独立分组出现")
	}
	require.True(t, found, "主板字段应以 system 分组出现在填写目录")
}

func TestReconcileClassifiedPasteRowsRestoresDroppedItems(t *testing.T) {
	// 2026-10-17 用户报「只识别出一条」：分类模型漏掉的条目按提取清单补回（未分类，前端作为自定义参数）
	extracted := []agentPasteParameterRow{
		{Key: "视频输出接口", Value: "HDMI ×2 + USB4 ×1"},
		{Key: "最高分辨率与刷新率", Value: "HDMI: 4K@60Hz；USB4: 8K@60Hz"},
		{Key: "多屏输出", Value: "支持多屏扩展"},
	}
	classified := []agentPasteClassifiedRow{
		{Name: "视频输出接口", Value: "HDMI  ×2 + USB4 ×1", Category: "display_output", Field: "display_outputs"},
	}
	reconciled := reconcileClassifiedPasteRows(extracted, classified)
	require.Len(t, reconciled, 3)
	require.Equal(t, "display_outputs", reconciled[0].Field)
	require.Equal(t, "最高分辨率与刷新率", reconciled[1].Name)
	require.Empty(t, reconciled[1].Category, "补回条目按未分类处理")
	require.Equal(t, "多屏输出", reconciled[2].Name)
}

func TestParsePasteTabbedItems(t *testing.T) {
	// 2026-10-17 固定格式本地解析：一行一个「参数名 + Tab + 值」，不依赖 AI、保证一行不漏
	items := parsePasteTabbedItems("视频输出接口\tHDMI ×2 + USB4 ×1\n最高分辨率与刷新率\tHDMI: 4K@60Hz；USB4: 8K@60Hz\n\n多屏输出\t支持多屏扩展\r\n")
	require.Len(t, items, 3)
	require.Equal(t, "视频输出接口", items[0].Key)
	require.Equal(t, "HDMI ×2 + USB4 ×1", items[0].Value)
	require.Equal(t, "最高分辨率与刷新率", items[1].Key)
	require.Equal(t, "多屏输出", items[2].Key)

	// 任一行不含 Tab → 回退 AI 提取
	require.Nil(t, parsePasteTabbedItems("CPU：AMD 锐龙 9 6900HX\n内存：16GB DDR5"))
	// 空文本
	require.Nil(t, parsePasteTabbedItems("   "))
}

func TestNormalizeClassifiedPasteRowsKeepsRepeatedFieldAsCustom(t *testing.T) {
	// 2026-10-17 用户报「只识别出一条」：同一字段的第二条起，名称不同时保留为自定义参数（不再静默去重丢弃）
	rows := []agentPasteClassifiedRow{
		{Name: "视频输出接口", Value: "HDMI ×2 + USB4 ×1", Category: "display_output", Field: "display_outputs"},
		{Name: "最高分辨率与刷新率", Value: "HDMI: 4K@60Hz；USB4: 8K@60Hz", Category: "display_output", Field: "display_outputs"},
		{Name: "显示输出", Value: "HDMI ×2 + USB4 ×1", Category: "display_output", Field: "display_outputs"},
		{Name: "多屏输出", Value: "支持多屏扩展", Category: "display_output", Field: "display_outputs"},
	}
	candidates, unrecognized := normalizeClassifiedPasteRows(rows, "mini_pc")
	require.Empty(t, unrecognized)
	require.Len(t, candidates, 3)
	require.Equal(t, "display_outputs", candidates[0].Field)
	require.Equal(t, "最高分辨率与刷新率", candidates[1].Field)
	require.Equal(t, "display_output", candidates[1].Category)
	require.Equal(t, "多屏输出", candidates[2].Field)
	require.Equal(t, 1, candidates[1].Order)
	require.Equal(t, 3, candidates[2].Order)
}

// 2026-10-20 用户反馈的交换机 11 行原始文本：本地解析 + 本地分类应一次完成（不调 AI），
// 品牌/型号/设备类型归基本信息，VLAN 等功能归管理功能，防雷/散热/温度归散热设计。
func TestAgentFeedbackSwitchTextClassifiesLocally(t *testing.T) {
	text := `品牌 绿联 (UGREEN)
型号 CM754-15812
设备类型 9口光电混合2.5G轻管理交换机
电口数量 8个2.5G RJ45电口
光口数量 1个10G SFP+光口
交换容量 60Gbps
管理方式 Web轻管理
支持功能 VLAN划分、端口隔离、带宽控制
防雷等级 4kV端口防雷
散热方式 全铝散热器+钢壳机身
工作温度 0℃~40℃`

	items := parsePasteParameterItems(text, "switch")
	require.Len(t, items, 11, "空格分隔的 11 行应本地解析，不依赖 AI 提取")
	require.Equal(t, "品牌", items[0].Key)
	require.Equal(t, "交换容量", items[5].Key)
	require.Equal(t, "60Gbps", items[5].Value)

	rows, leftovers, profile := classifyPasteItemsLocally("switch", items)
	require.Empty(t, leftovers, "常见交换机参数应全部本地命中")
	require.Len(t, profile, 3)
	require.Equal(t, "vendor", profile[0].Field)
	require.Equal(t, "绿联 (UGREEN)", profile[0].Value)
	require.Equal(t, "model", profile[1].Field)
	require.Equal(t, "type_description", profile[2].Field)

	candidates, unrecognized := normalizeClassifiedPasteRows(rows, "switch")
	require.Empty(t, unrecognized)
	byField := map[string]assetParameterAgentCandidate{}
	for _, candidate := range candidates {
		byField[candidate.Field] = candidate
	}
	require.Equal(t, "8个2.5G RJ45电口", byField["ethernet_port_count"].Value)
	require.Equal(t, "network", byField["ethernet_port_count"].Category)
	require.Equal(t, "1个10G SFP+光口", byField["optical_port_count"].Value)
	require.Equal(t, "60Gbps", byField["switching_capacity_gbps"].Value)
	require.Equal(t, "Web轻管理", byField["management_access"].Value)
	require.Equal(t, "management", byField["management_access"].Category)
	require.Equal(t, "VLAN划分、端口隔离、带宽控制", byField["supported_features"].Value)
	require.Equal(t, "management", byField["supported_features"].Category)
	require.Equal(t, "4kV端口防雷", byField["lightning_protection_kv"].Value)
	require.Equal(t, "thermal_environment", byField["lightning_protection_kv"].Category)
	require.Equal(t, "全铝散热器+钢壳机身", byField["cooling_method"].Value)
	require.Equal(t, "thermal_environment", byField["cooling_method"].Category)
	require.Equal(t, "0℃~40℃", byField["operating_temperature_range"].Value)
	// 排序：网络（25）→ 管理功能（26）→ 散热设计（150）
	require.Equal(t, "network", candidates[0].Category)
	require.Equal(t, "management", candidates[3].Category)
	require.Equal(t, "thermal_environment", candidates[5].Category)
}

func TestSplitAgentParameterNameUnit(t *testing.T) {
	name, unit := splitAgentParameterNameUnit("交换容量 Gbps")
	require.Equal(t, "交换容量", name)
	require.Equal(t, "Gbps", unit)
	name, unit = splitAgentParameterNameUnit("防雷等级（kV）")
	require.Equal(t, "防雷等级", name)
	require.Equal(t, "kV", unit)
	normalized := normalizeLocalPasteItem(agentPasteParameterRow{Key: "交换容量 Gbps", Value: "60"})
	require.Equal(t, "交换容量", normalized.Key)
	require.Equal(t, "60 Gbps", normalized.Value, "纯数字值补上名称里的单位")
	normalized = normalizeLocalPasteItem(agentPasteParameterRow{Key: "交换容量 Gbps", Value: "60Gbps"})
	require.Equal(t, "60Gbps", normalized.Value, "值已带单位时不重复追加")
}
