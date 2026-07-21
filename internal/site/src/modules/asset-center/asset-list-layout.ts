export const assetListColumns = [
	{ key: "tag", label: "编号" },
	{ key: "asset", label: "资产" },
	{ key: "location", label: "位置" },
	{ key: "ipv4", label: "IPv4" },
	{ key: "uplink", label: "网络上联" },
	{ key: "access", label: "网络接入方式" },
	{ key: "status", label: "状态 / 资料" },
] as const

export const assetListDesktopGridClassName =
	"md:grid-cols-[minmax(5rem,.38fr)_minmax(12rem,1.25fr)_minmax(7rem,.62fr)_minmax(7.5rem,.68fr)_minmax(10rem,1.05fr)_minmax(8.5rem,.78fr)_minmax(5.5rem,.52fr)]"
