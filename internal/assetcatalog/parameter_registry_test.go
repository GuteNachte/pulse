package assetcatalog

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParameterRegistryContract(t *testing.T) {
	registry, err := LoadParameterRegistry()
	require.NoError(t, err)
	require.Equal(t, []string{
		"外观与尺寸", "电源", "主板与平台", "处理器", "显卡", "内存", "存储",
		"网络", "接口与扩展", "显示", "影像", "音频", "传感器", "散热与环境",
	}, registry.CategoryTitles())
	require.Nil(t, registry.Field("fixed_ipv6"))
	require.Equal(t, "line", registry.Field("public_ipv6").Scope)
	require.Equal(t, []string{"internet"}, registry.Field("public_ipv6").AssetTypes)
	require.Contains(t, registry.AllowedMetadataKeys("switch"), "ethernet_port_count")
	require.NotContains(t, registry.AllowedMetadataKeys("switch"), "public_ipv6")
}
