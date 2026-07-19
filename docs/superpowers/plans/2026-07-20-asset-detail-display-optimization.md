# 资产详情展示页布局优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将资产详情页改为单页自然滚动、桌面左侧吸顶档案与参数目录、移动端紧凑横向目录，并保持全部资产数据和操作逻辑不变。

**Architecture:** 保留 `AssetShowcaseWorkspace` 作为页面组合边界，新增一个只消费现有参数组的导航组件；参数卡提供稳定 DOM ID，导航通过原生锚点滚动和 `IntersectionObserver` 反馈当前分组。布局只修改资产中心展示组件，不改变 PocketBase、严格类型模板、编辑工作台或路由状态。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、shadcn/ui Card、Lucide、Node `assert` 契约测试、Codex Browser 真实页面验收。

---

## 文件结构

- Create: `internal/site/src/modules/asset-center/asset-parameter-navigation.ts` — 参数组 DOM ID 与滚动行为的纯规则。
- Create: `internal/site/src/modules/asset-center/asset-parameter-navigation.test.ts` — 纯规则回归测试。
- Create: `internal/site/src/modules/asset-center/components/asset-parameter-navigator.tsx` — 桌面纵向目录、移动端横向目录和当前分组反馈。
- Create: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts` — 展示组件布局契约。
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx` — 单页滚动、桌面吸顶侧栏和纵向参数目录。
- Modify: `internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx` — 参数卡锚点、移动端目录、取消内部滚动和档案字段响应式排布。
- Modify: `internal/site/src/modules/asset-center/components/asset-media-showcase.tsx` — 无封面时保留固定 16:9 中性图片框。
- Modify: `internal/site/package.json` — 将新回归加入 `test:asset-center`。
- Modify: `docs/release-notes-next.md` — 将设计记录更新为已实施行为。
- Modify: `internal/site/src/components/routes/settings/release-history.ts` — 同步设置页“关于”中的 1.0.6 Web / Hub 更新记录。

## Task 1：先锁定导航与布局契约

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-parameter-navigation.test.ts`
- Create: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`
- Modify: `internal/site/package.json`

- [ ] **Step 1：编写参数导航纯规则失败测试**

创建 `asset-parameter-navigation.test.ts`：

```ts
import assert from "node:assert/strict"
import {
	getAssetParameterSectionId,
	getAssetParameterScrollBehavior,
} from "./asset-parameter-navigation.ts"

assert.equal(getAssetParameterSectionId("hardware_ports"), "asset-parameter-hardware_ports")
assert.equal(getAssetParameterSectionId("network-wireless"), "asset-parameter-network-wireless")
assert.equal(getAssetParameterScrollBehavior(false), "smooth")
assert.equal(getAssetParameterScrollBehavior(true), "auto")

console.log("asset parameter navigation contract passed")
```

- [ ] **Step 2：编写展示布局失败测试**

创建 `components/asset-showcase-layout.test.ts`：

```ts
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const workspace = readFileSync(new URL("./asset-showcase-workspace.tsx", import.meta.url), "utf8")
const columns = readFileSync(new URL("./asset-parameter-columns.tsx", import.meta.url), "utf8")
const media = readFileSync(new URL("./asset-media-showcase.tsx", import.meta.url), "utf8")

assert.equal(workspace.includes("AssetParameterNavigator"), true, "desktop archive column must render parameter navigation")
assert.equal(workspace.includes("xl:sticky xl:top-4"), true, "desktop archive column must remain visible while the page scrolls")
assert.equal(workspace.includes("xl:h-full"), false, "workspace must not force a nested viewport height")
assert.equal(columns.includes("xl:overflow-y-auto"), false, "hardware archive must use page-level scrolling")
assert.equal(columns.includes("getAssetParameterSectionId(group.id)"), true, "every parameter card must expose a stable anchor")
assert.equal(columns.includes('variant="inline"'), true, "small screens must render compact inline navigation")
assert.equal(columns.includes("sm:grid-cols-2 xl:grid-cols-1"), true, "archive rows must remain readable inside the desktop sidebar")
assert.equal(workspace.includes("<AssetMediaShowcase covers={media?.covers ?? []} />"), true, "the media frame must always render")
assert.equal(media.includes("if (!primary) return null"), false, "missing covers must not remove the media frame")
assert.equal(media.includes("暂无图片"), true, "the empty media frame must use a neutral label")

console.log("asset showcase layout contract passed")
```

- [ ] **Step 3：把新测试加入资产中心测试入口**

在 `internal/site/package.json` 的 `test:asset-center` 命令中，紧跟 `asset-interface-sync.test.ts` 后加入：

```json
"node --experimental-strip-types src/modules/asset-center/asset-parameter-navigation.test.ts && node --experimental-strip-types src/modules/asset-center/components/asset-showcase-layout.test.ts"
```

保持命令使用 `&&` 与现有测试串联。

- [ ] **Step 4：运行测试确认先失败**

Run:

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
npm run test:asset-center
```

Expected: FAIL，首先报告无法找到 `asset-parameter-navigation.ts`；创建空文件后应继续因缺少导航组件、吸顶布局或仍存在 `xl:overflow-y-auto` 而失败。

- [ ] **Step 5：提交失败测试**

```powershell
git add internal/site/package.json internal/site/src/modules/asset-center/asset-parameter-navigation.test.ts internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts
git commit -m "test: define asset detail navigation layout"
```

## Task 2：实现参数目录规则与导航组件

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-parameter-navigation.ts`
- Create: `internal/site/src/modules/asset-center/components/asset-parameter-navigator.tsx`
- Test: `internal/site/src/modules/asset-center/asset-parameter-navigation.test.ts`

- [ ] **Step 1：实现稳定 DOM ID 与滚动行为**

创建 `asset-parameter-navigation.ts`：

```ts
export function getAssetParameterSectionId(groupId: string) {
	return `asset-parameter-${groupId}`
}

export function getAssetParameterScrollBehavior(prefersReducedMotion: boolean): ScrollBehavior {
	return prefersReducedMotion ? "auto" : "smooth"
}
```

- [ ] **Step 2：运行纯规则测试确认通过**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/asset-parameter-navigation.test.ts
```

Expected: PASS，并输出 `asset parameter navigation contract passed`。

- [ ] **Step 3：实现桌面与移动端共用导航组件**

创建 `components/asset-parameter-navigator.tsx`：

```tsx
import { ListTreeIcon } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { cn } from "@/lib/utils"
import { getAssetParameterScrollBehavior, getAssetParameterSectionId } from "../asset-parameter-navigation"
import type { AssetParameterGroup } from "./asset-parameter-columns"

type AssetParameterNavigatorProps = {
	groups: AssetParameterGroup[]
	variant: "sidebar" | "inline"
	className?: string
}

export function AssetParameterNavigator({ groups, variant, className }: AssetParameterNavigatorProps) {
	const groupIds = useMemo(() => groups.map((group) => group.id), [groups])
	const [activeGroupId, setActiveGroupId] = useState(groupIds[0] ?? "")

	useEffect(() => {
		if (!groupIds.includes(activeGroupId)) setActiveGroupId(groupIds[0] ?? "")
	}, [activeGroupId, groupIds])

	useEffect(() => {
		if (typeof IntersectionObserver === "undefined") return
		const elements = groupIds
			.map((groupId) => document.getElementById(getAssetParameterSectionId(groupId)))
			.filter((element): element is HTMLElement => Boolean(element))
		const observer = new IntersectionObserver(
			(entries) => {
				const visible = entries
					.filter((entry) => entry.isIntersecting)
					.sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
				const groupId = visible?.target.getAttribute("data-asset-parameter-group-id")
				if (groupId) setActiveGroupId(groupId)
			},
			{ rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.15, 0.35] }
		)
		for (const element of elements) observer.observe(element)
		return () => observer.disconnect()
	}, [groupIds])

	function scrollToGroup(groupId: string) {
		const target = document.getElementById(getAssetParameterSectionId(groupId))
		if (!target) return
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
		target.scrollIntoView({ behavior: getAssetParameterScrollBehavior(reducedMotion), block: "start" })
		setActiveGroupId(groupId)
	}

	if (groups.length < 2) return null

	return (
		<nav
			aria-label="参数目录"
			className={cn(
				variant === "sidebar"
					? "rounded-lg border border-border/70 bg-card p-3"
					: "-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1",
				className
			)}
		>
			{variant === "sidebar" ? (
				<div className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold text-muted-foreground">
					<ListTreeIcon className="size-3.5" />
					参数目录
				</div>
			) : null}
			<div className={cn(variant === "sidebar" ? "grid gap-1" : "flex gap-1.5")}>
				{groups.map((group) => {
					const active = group.id === activeGroupId
					return (
						<button
							key={group.id}
							type="button"
							aria-current={active ? "location" : undefined}
							onClick={() => scrollToGroup(group.id)}
							className={cn(
								"min-w-0 rounded-md border px-2.5 py-2 text-left transition-colors",
								variant === "inline" && "shrink-0 py-1.5",
								active
									? "border-border bg-surface-soft text-foreground"
									: "border-transparent text-muted-foreground hover:border-border/70 hover:bg-surface-soft"
							)}
						>
							<span className="block truncate text-xs font-medium">{group.title}</span>
							{variant === "sidebar" ? (
								<span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{group.summary}</span>
							) : null}
						</button>
					)
				})}
			</div>
		</nav>
	)
}
```

- [ ] **Step 4：运行类型检查**

Run:

```powershell
npm run typecheck
```

Expected: PASS，无 TypeScript 错误。

- [ ] **Step 5：提交导航组件**

```powershell
git add internal/site/src/modules/asset-center/asset-parameter-navigation.ts internal/site/src/modules/asset-center/components/asset-parameter-navigator.tsx
git commit -m "feat: add asset parameter navigation"
```

## Task 3：接入单页滚动和响应式详情布局

**Files:**
- Modify: `internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx`
- Modify: `internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx`
- Test: `internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts`

- [ ] **Step 1：改造展示工作区外层和桌面侧栏**

在 `asset-showcase-workspace.tsx` 引入导航：

```tsx
import { AssetParameterNavigator } from "./asset-parameter-navigator"
```

将当前返回的最外层布局替换为：

```tsx
<section className="grid items-start gap-5 xl:grid-cols-[minmax(22rem,0.78fr)_minmax(0,1.62fr)] 2xl:grid-cols-[minmax(24rem,0.72fr)_minmax(0,1.68fr)]">
	<aside className="grid content-start gap-5 xl:sticky xl:top-4">
		<AssetMediaShowcase covers={media?.covers ?? []} />
		<AssetOverviewColumn
			sections={identitySections}
			title={asset.type === "internet" ? "线路档案" : "设备档案"}
			subtitle={asset.type === "internet" ? null : "主档与接入信息"}
		/>
		<AssetParameterNavigator groups={parameterGroups} variant="sidebar" className="hidden xl:block" />
	</aside>
	<AssetHardwareSpecsColumn
		groups={parameterGroups}
		groupActions={internetAddressGroupActions}
		title={asset.type === "internet" ? "线路参数" : "硬件档案"}
		description={asset.type === "internet" ? "已确认的线路与套餐参数" : undefined}
		emptyLabel={asset.type === "internet" ? "暂无已确认的线路参数。" : "暂无已确认的硬件参数。"}
	/>
</section>
```

- [ ] **Step 2：让档案字段在桌面侧栏内保持可读**

在 `AssetOverviewColumn` 中将：

```tsx
<div className="grid gap-2 sm:grid-cols-2">
```

替换为：

```tsx
<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
```

移动端与平板继续双列；进入桌面双栏后左侧档案改为单列，避免型号、IPv4 和管理页面被过度截断。

- [ ] **Step 3：取消硬件档案内部滚动并加入移动端目录**

在 `asset-parameter-columns.tsx` 引入：

```tsx
import { getAssetParameterSectionId } from "../asset-parameter-navigation"
import { AssetParameterNavigator } from "./asset-parameter-navigator"
```

将硬件档案外层 Card 改为：

```tsx
<Card className="border-border/70 bg-card shadow-none">
```

在 `CardHeader` 的标题行之后加入：

```tsx
<AssetParameterNavigator groups={groups} variant="inline" className="mt-3 xl:hidden" />
```

将内容容器改为：

```tsx
<CardContent className="grid gap-3 p-4 sm:grid-cols-2">
```

- [ ] **Step 4：给真实参数卡增加稳定锚点**

将 `HardwareSpecGroup` 的 section 开头改为：

```tsx
<section
	id={getAssetParameterSectionId(group.id)}
	data-asset-parameter-group-id={group.id}
	className={cn(
		"grid min-w-0 scroll-mt-28 content-start gap-3 rounded-md border border-border/70 bg-surface-soft p-3",
		group.rows.length > 6 && "sm:col-span-2"
	)}
>
```

- [ ] **Step 5：实现无封面图片空框**

在运行测试前，将 `asset-media-showcase.tsx` 的 Lucide 导入改为：

```tsx
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from "lucide-react"
```

并将 `if (!primary) return null` 替换为：

```tsx
if (!primary) {
	return (
		<div className="grid gap-2">
			<div
				data-testid="asset-media-main-preview"
				className="grid aspect-[16/9] place-items-center overflow-hidden rounded-lg border border-border/70 bg-surface-soft"
			>
				<div className="grid place-items-center gap-2 text-muted-foreground">
					<ImageIcon className="size-5" />
					<span className="text-xs">暂无图片</span>
				</div>
			</div>
		</div>
	)
}
```

空框不得读取图片库、候选图或历史图片。

- [ ] **Step 6：运行布局测试和完整资产中心测试**

Run:

```powershell
node --experimental-strip-types src/modules/asset-center/components/asset-showcase-layout.test.ts
npm run test:asset-center
npm run typecheck
```

Expected: 三条命令全部 PASS，输出包含 `asset showcase layout contract passed`，类型检查无错误。

- [ ] **Step 7：提交详情布局实现**

```powershell
git add internal/site/src/modules/asset-center/components/asset-showcase-workspace.tsx internal/site/src/modules/asset-center/components/asset-parameter-columns.tsx internal/site/src/modules/asset-center/components/asset-media-showcase.tsx internal/site/src/modules/asset-center/components/asset-showcase-layout.test.ts internal/site/package.json
git commit -m "feat: optimize asset detail browsing layout"
```

## Task 4：版本记录与真实页面验收

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [ ] **Step 1：把设计记录更新为已实施说明**

两处版本记录统一使用：

```text
优化资产详情展示页：桌面端改为单页自然滚动，左侧吸顶显示固定图片框、档案和可点击参数目录；无封面时保留“暂无图片”中性空框，不使用图库或历史图片补位。右侧参数卡随页面自然展开，不再出现硬件档案内部滚动条；移动端使用单列布局和紧凑横向目录。资产数据、严格类型模板、编辑入口和现有操作保持不变。
```

- [ ] **Step 2：运行静态与自动化验证**

Run:

```powershell
cd C:\Users\Nacht\Documents\PL\internal\site
npm run test:asset-center
npm run typecheck
cd C:\Users\Nacht\Documents\PL
git diff --check
```

Expected: 资产中心测试全部 PASS，TypeScript 无错误，`git diff --check` 无输出。

- [ ] **Step 3：使用 Codex Browser 验收桌面交换机详情**

URL: `http://localhost:5173/assets/yk7dkjdriwdaage`

检查：

- 页面标题、设备档案和硬件档案正常渲染。
- 页面只有主滚动条，硬件档案内部没有滚动条。
- 左侧图片框与档案吸顶，型号、IPv4 与管理页面可读；无封面资产显示固定 16:9“暂无图片”空框。
- 参数目录显示三个真实分组，点击后滚动到对应卡片，当前项反馈更新。
- 接口、关系、维护、附件、编辑与更多按钮仍可见且可打开。
- Console 没有相关 warning 或 error。

- [ ] **Step 4：验收 iFTTR、宽带和空状态**

依次检查：

```text
http://localhost:5173/assets/0avxx79kdk4v2ui
http://localhost:5173/assets/hvpbl3jmc8w02qp
```

确认 iFTTR 的多个参数分组、接入关系和管理页面正常；宽带的线路档案、动态公网地址操作与目录正常；只有一个分组或没有参数时不出现无意义目录。

- [ ] **Step 5：验收手机视口**

使用 `390x844`：

- 页面自然单列滚动。
- 参数目录位于硬件档案标题下方，可横向滚动。
- 长 IPv6、URL 和参数文本不造成页面横向溢出。
- 所有标题栏操作仍可访问。

- [ ] **Step 6：对比前后截图并修正可见偏差**

使用实施前截图 `pulse-asset-detail-before-design.png` 与同视口实施后截图并排检查：

- 左侧信息是否更易读。
- 嵌套滚动条是否消失。
- 参数目录是否填补左侧无用途空白但没有制造新噪音。
- 卡片边框、圆角、间距、字号和图标是否与 Pulse 现有页面一致。

发现偏差时只修复本设计范围内的布局问题，然后重新执行 Step 2–5。

- [ ] **Step 7：提交版本记录和最终修正**

```powershell
git add docs/release-notes-next.md internal/site/src/components/routes/settings/release-history.ts internal/site/src/modules/asset-center internal/site/package.json
git commit -m "docs: record asset detail layout optimization"
```

最终确认 `git status --short` 无输出。
