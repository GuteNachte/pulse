# Network Device Detail Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将六类网络设备详情页的单张“网络”卡拆成类型专属、稳定且不重复设备档案字段的细分参数卡。

**Architecture:** 在资产中心详情参数领域新增纯分组模块，以资产类型和字段键将已有网络参数行映射为展示组。`asset-detail-parameter-groups.ts` 继续负责读取字段和值，并在统一参数分类的 `network` 位置插入细分组；页面组件、Hub、数据库和编辑表单不感知这次变化。

**Tech Stack:** React 19、TypeScript、Node 直接契约测试、Vite、现有资产中心参数卡组件。

---

## 文件结构

- Create: `internal/site/src/modules/asset-center/asset-network-detail-groups.ts`：维护六类网络设备的字段到详情组映射，并提供纯分组函数。
- Create: `internal/site/src/modules/asset-center/asset-network-detail-groups.test.ts`：锁定各类型标题、顺序、字段归属、未知字段回退和空组隐藏。
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`：保留字段键并将网络类参数交给纯分组函数，继续合并交换机逐口状态。
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`：把光猫和交换机期望改为细分卡，并增加六类详情集成断言。
- Modify: `internal/site/package.json`：把新的纯领域测试加入 `test:asset-center`。
- Modify: `docs/release-notes-next.md`：记录用户可见的网络设备详情分类变化。
- Modify: `internal/site/src/components/routes/settings/release-history.ts`：同步设置页“关于”的 Web / Hub 开发记录。

### Task 1: 建立网络设备纯分组规则

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-network-detail-groups.test.ts`
- Create: `internal/site/src/modules/asset-center/asset-network-detail-groups.ts`

- [ ] **Step 1: 写失败测试**

测试构造带 `fieldKey` 的参数行，并断言：

```ts
const ontGroups = groupNetworkDeviceDetailRows("ont", [
	row("operating_role", "工作角色"),
	row("pon_standard", "PON 标准"),
	row("router_status", "主路由"),
	row("wifi_standard", "无线标准"),
	row("lan_port_count", "LAN 总数"),
	row("indicator_control", "指示灯控制"),
])
assert.deepEqual(ontGroups.map((group) => group.title), [
	"接入角色",
	"光纤接入",
	"路由与管理",
	"无线网络",
	"有线网络",
	"设备控制",
])
```

同一测试文件覆盖 `router`、`gateway`、`ap`、`firewall`、`switch`，并断言未知已注册字段进入末尾“网络”回退组、空组不出现。

- [ ] **Step 2: 运行测试并确认失败**

Run:

```powershell
node --experimental-strip-types internal/site/src/modules/asset-center/asset-network-detail-groups.test.ts
```

Expected: FAIL，提示找不到 `asset-network-detail-groups.ts` 或导出函数。

- [ ] **Step 3: 实现最小纯分组模块**

定义稳定输入输出：

```ts
export type NetworkDetailRow<T> = { fieldKey: string; row: T }
export type NetworkDetailGroup<T> = { id: string; title: string; rows: T[] }

export function groupNetworkDeviceDetailRows<T>(
	type: AssetType,
	items: readonly NetworkDetailRow<T>[]
): NetworkDetailGroup<T>[]
```

映射规则使用显式字段键集合：

```ts
const groupDefinitions = {
	ont: [
		definition("ont-access-role", "接入角色", ["carrier", "operating_role", "radio_approval_code"]),
		definition("ont-fiber-access", "光纤接入", ["pon_standard", "pon_uplink_capacity", "pon_sn", "onu_type", "optical_connector", "downstream_optical_port_count", "downstream_optical_status"]),
		definition("ont-routing-management", "路由与管理", ["router_status", "gateway_status", "dhcp_status", "lan_subnet"]),
		definition("ont-wireless", "无线网络", ["wifi_standard", "wifi_24_supported", "wifi_24_enabled", "wifi_5_supported", "wifi_5_enabled", "wps_supported", "wireless_control"]),
		definition("ont-wired", "有线网络", ["lan_port_count", "lan_2500_count", "lan_1000_count"]),
		definition("ont-device-controls", "设备控制", ["indicator_control", "reset_supported", "power_switch_supported"]),
	],
	router: [
		definition("router-wired", "有线网络", ["port_count", "default_port_speed_mbps", "wan_port_count"]),
		definition("router-wireless", "无线网络", ["wifi_standard", "wifi_band", "wifi_streams", "antenna_type"]),
		definition("router-planning", "网络规划", ["ssid_note", "vlan_note"]),
	],
	gateway: [
		definition("gateway-forwarding", "接口与转发", ["port_count", "default_port_speed_mbps", "wan_port_count"]),
		definition("gateway-planning", "网络规划", ["vlan_note"]),
	],
	ap: [
		definition("ap-wired", "有线接入", ["port_count", "default_port_speed_mbps", "poe_standard"]),
		definition("ap-wireless", "无线网络", ["wifi_standard", "wifi_band", "wifi_streams", "antenna_type", "ssid_note"]),
		definition("ap-planning", "网络规划", ["vlan_note"]),
	],
	firewall: [
		definition("firewall-forwarding", "接口与转发", ["port_count", "default_port_speed_mbps"]),
		definition("firewall-security", "安全性能", ["security_throughput_gbps", "vpn_throughput_gbps", "session_capacity"]),
		definition("firewall-planning", "网络规划", ["vlan_note"]),
	],
	switch: [
		definition("switch-network-functions", "网络功能", ["vlan_status", "management_level", "management_access", "port_isolation_status", "link_aggregation_status", "switching_capacity_gbps", "mac_table_entries", "forwarding_method"]),
	],
} satisfies Partial<Record<AssetType, readonly NetworkDetailGroupDefinition[]>>
```

函数按定义顺序收集行，删除空组，并把未映射行原顺序放入 `network-fallback` / “网络”。

- [ ] **Step 4: 运行纯领域测试并确认通过**

Run:

```powershell
node --experimental-strip-types internal/site/src/modules/asset-center/asset-network-detail-groups.test.ts
```

Expected: PASS，输出 `network device detail grouping contract passed`。

- [ ] **Step 5: 提交纯规则**

```powershell
git add internal/site/src/modules/asset-center/asset-network-detail-groups.ts internal/site/src/modules/asset-center/asset-network-detail-groups.test.ts
git commit -m "feat: define network device detail groups"
```

### Task 2: 接入资产详情参数构造

**Files:**
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1: 先更新集成测试并确认失败**

将光猫期望改为：

```ts
assert.deepEqual(
	buildAssetParameterGroups(ont).map((group) => group.title),
	["电源", "主板与平台", "接入角色", "光纤接入", "路由与管理", "无线网络", "有线网络"]
)
```

将交换机期望改为 `["网络功能", "网口状态"]`，并为路由器、网关、AP、防火墙分别断言现有字段进入设计规格中的卡片。

Run:

```powershell
node --experimental-strip-types internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts
```

Expected: FAIL，当前实现仍返回单张“网络”卡。

- [ ] **Step 2: 在详情构造器接入纯分组函数**

网络类参数行保留字段键：

```ts
const networkDetailRows: NetworkDetailRow<AssetParameterRow>[] = []
if (definition.category === "network" && NETWORK_ASSET_TYPES.includes(asset.type)) {
	networkDetailRows.push({ fieldKey: field.key, row })
	continue
}
```

遍历统一参数分类时，在 `network` 位置调用 `groupNetworkDeviceDetailRows`，为每组补齐 `summary` 和 `NetworkIcon`。交换机端口能力继续只进入“网口状态”，逐口明细继续追加到同一卡。

- [ ] **Step 3: 注册新测试并运行资产中心定向测试**

在 `test:asset-center` 中把 `asset-network-detail-groups.test.ts` 放在详情参数测试之前。

Run:

```powershell
npm.cmd --prefix internal/site run test:asset-center
```

Expected: PASS；六类网络设备分组与既有资产中心契约全部通过。

- [ ] **Step 4: 提交详情集成**

```powershell
git add internal/site/src/modules/asset-center/asset-detail-parameter-groups.ts internal/site/src/modules/asset-center/asset-detail-parameter-groups.test.ts internal/site/package.json
git commit -m "feat: split network device detail cards"
```

### Task 3: 同步版本记录

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1: 更新开发记录**

在 `1.0.6` 的 Web / Hub 小节加入同一口径：六类网络设备按类型拆分网络详情卡，档案字段不重复，空组不显示，交换机继续保留网口状态。

- [ ] **Step 2: 更新关于页并运行版本记录测试**

Run:

```powershell
node --experimental-strip-types internal/site/src/components/routes/settings/release-history-ont.test.ts
```

Expected: PASS，关于页记录仍可解析且包含光猫相关历史条目。

- [ ] **Step 3: 提交版本记录**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts
git commit -m "docs: record network detail grouping"
```

### Task 4: 完整验证与浏览器验收

**Files:**
- Verify only; no planned source changes.

- [ ] **Step 1: 运行类型检查和生产构建**

```powershell
npm.cmd --prefix internal/site run typecheck
npm.cmd --prefix internal/site run build
```

Expected: 两条命令均以 exit code 0 完成。

- [ ] **Step 2: 验证当前光猫详情**

在 `http://localhost:5173/assets/0avxx79kdk4v2ui` 刷新页面，确认细分卡片顺序正确、参数无丢失、左侧设备档案没有重复到右侧、页面无横向溢出和新增控制台错误。

- [ ] **Step 3: 验证交换机详情**

打开现有交换机资产，确认“网络功能”和“网口状态”分开，逐口状态、关系对端和速率仍正确显示。

- [ ] **Step 4: 检查工作区和提交记录**

```powershell
git status --short
git log -4 --oneline
```

Expected: 工作区干净，设计、纯规则、详情集成和版本记录提交均存在。
