package assetcatalog

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParameterRegistryContract(t *testing.T) {
	registry, err := LoadParameterRegistry()
	require.NoError(t, err)
	// 2026-10-18 对齐当前 16 分类：新增「显示输出」分类、移除「特色功能」分类（计算设备定稿分类体系用，
	// 其余分类维持原 registry 口径；外观组内小分类由字段 section 承载，不设独立顶级分类）
	// 2026-10-20 智能家居预设：新增「功能参数」（加湿器/净化器等 iot）与「电气参数」（插座/智能开关）分类
	require.Equal(t, []string{
		"外观", "功能参数", "CPU", "网络", "管理功能", "内存", "存储", "显示输出", "显卡", "主板与固件",
		"接口与扩展", "电气参数", "电源与散热", "系统", "显示", "影像", "音频", "传感器", "散热设计",
	}, registry.CategoryTitles())
	require.Nil(t, registry.Field("fixed_ipv6"))
	require.Equal(t, "line", registry.Field("public_ipv6").Scope)
	require.Equal(t, []string{"internet"}, registry.Field("public_ipv6").AssetTypes)
	require.Contains(t, registry.AllowedMetadataKeys("switch"), "ethernet_port_count")
	require.NotContains(t, registry.AllowedMetadataKeys("switch"), "public_ipv6")
	// 2026-10-20 用户反馈：交换机管理功能独立成组，支持功能/散热方式进入严格模板
	require.Contains(t, registry.AllowedMetadataKeys("switch"), "supported_features")
	require.Contains(t, registry.AllowedMetadataKeys("switch"), "cooling_method")
	require.Equal(t, "management", registry.Field("management_access").Category)
	require.Equal(t, "管理方式", registry.Field("management_access").Label)
	// 2026-10-20 智能家居电气/功能预设：额定功率/电流从电源组移入电气参数组，新键进入严格模板放行
	require.Equal(t, "electrical", registry.Field("rated_power_w").Category)
	require.Equal(t, "electrical", registry.Field("outlet_count").Category)
	require.Equal(t, "functions", registry.Field("function_features").Category)
	for _, assetType := range []string{"plug", "smart_switch"} {
		require.Contains(t, registry.AllowedMetadataKeys(assetType), "rated_voltage_v", assetType)
	}
	require.Contains(t, registry.AllowedMetadataKeys("iot"), "function_features")
	require.Contains(t, registry.AllowedMetadataKeys("iot"), "working_modes")
	require.Contains(t, registry.AllowedMetadataKeys("iot"), "applicable_area")
	// 2026-10-18 修复宽带/网络设备建档：资产编号 asset_tag 必须对所有可创建类型放行，
	// 否则前端自动写入 RS-/NW- 编号时会被严格模板拒绝
	for _, assetType := range []string{"ont", "switch", "smart_switch", "internet", "smart_ont"} {
		require.True(t, registry.AllowedMetadataKeys(assetType)["asset_tag"], assetType)
	}
	// 2026-10-12 外观组内小分类：机箱 / 形态与颜色 / 尺寸与重量；上市日期保留 parameter 供 Agent 提取
	require.Equal(t, "机箱", registry.Field("chassis_model").Section)
	require.Equal(t, "形态与颜色", registry.Field("device_color").Section)
	require.Equal(t, "尺寸与重量", registry.Field("length_mm").Section)
	require.Equal(t, "appearance", registry.Field("release_date").Category)
}
