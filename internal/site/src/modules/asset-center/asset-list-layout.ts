export const assetListColumns = [
	{ key: "tag", label: "编号" },
	{ key: "asset", label: "资产" },
	{ key: "location", label: "位置" },
	{ key: "ipv4", label: "IPv4" },
	{ key: "network", label: "接入网络" },
	{ key: "status", label: "状态 / 资料" },
] as const

export const assetListDesktopGridClassName =
	"md:grid-cols-[minmax(5rem,.42fr)_minmax(12rem,1.25fr)_minmax(7.5rem,.72fr)_minmax(8rem,.72fr)_minmax(8rem,.82fr)_minmax(5.5rem,.55fr)]"
