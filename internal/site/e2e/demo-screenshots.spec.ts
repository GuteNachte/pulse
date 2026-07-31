import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { expect, test, type Page } from "playwright/test"

const repositoryRoot = resolve(import.meta.dirname, "../../..")
const screenshotRoot = resolve(repositoryRoot, "docs/media/screenshots")
const socialPreviewPath = resolve(repositoryRoot, "docs/media/social-preview.png")

const captures = [
	{ name: "dashboard", path: "/", marker: "今日状态" },
	{ name: "assets", path: "/assets", marker: "Atlas NAS" },
	{ name: "asset-detail", path: "/assets/demo-nas", marker: "设备档案" },
	{ name: "network-home", path: "/network/home", marker: "家庭网络" },
	{ name: "network-technology", path: "/network/technology", marker: "科技网" },
	{ name: "clients", path: "/clients", marker: "所有客户端" },
	{ name: "containers", path: "/containers", marker: "容器监控" },
	{ name: "websites", path: "/websites", marker: "状态页" },
] as const

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const NativeDate = Date
		const fixedTimestamp = NativeDate.parse("2026-07-31T10:00:00+08:00")
		const FixedDate = new Proxy(NativeDate, {
			apply(target, thisArg, argumentsList) {
				return argumentsList.length === 0
					? new NativeDate(fixedTimestamp).toString()
					: Reflect.apply(target, thisArg, argumentsList)
			},
			construct(target, argumentsList, newTarget) {
				return Reflect.construct(target, argumentsList.length === 0 ? [fixedTimestamp] : argumentsList, newTarget)
			},
		})
		FixedDate.now = () => fixedTimestamp
		globalThis.Date = FixedDate
		localStorage.setItem("pulse-theme", "light")
	})
})

for (const capture of captures) {
	test(`${capture.name} public screenshot`, async ({ page }) => {
		await page.setViewportSize({ width: 1600, height: 1000 })
		await openStableDemoPage(page, capture.path, capture.marker)
		await mkdir(screenshotRoot, { recursive: true })
		await page.screenshot({
			path: resolve(screenshotRoot, `${capture.name}.png`),
			animations: "disabled",
		})
	})
}

test("social preview", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 640 })
	await openStableDemoPage(page, "/", "今日状态")
	await mkdir(dirname(socialPreviewPath), { recursive: true })
	await page.screenshot({ path: socialPreviewPath, animations: "disabled" })
})

async function openStableDemoPage(page: Page, path: string, marker: string) {
	await page.goto(path, { waitUntil: "domcontentloaded" })
	await expect(page.locator("body")).toContainText("公开演示")
	await expect(page.locator("#app")).toContainText(marker)
	await expect(page.locator("#app")).not.toContainText(/正在加载|正在读取|加载中|读取失败|初始化失败/)
	await page.evaluate(() => document.fonts.ready)

	await waitForStableVisuals(page)

	const hasHorizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	)
	expect(hasHorizontalOverflow).toBe(false)
}

async function waitForStableVisuals(page: Page) {
	let previous = await page.evaluate(captureVisualState)
	let stableSamples = 0

	await expect
		.poll(
			async () => {
				const current = await page.evaluate(captureVisualState)
				stableSamples = current === previous ? stableSamples + 1 : 0
				previous = current
				return stableSamples
			},
			{ timeout: 10_000, intervals: [100] }
		)
		.toBeGreaterThanOrEqual(3)
}

function captureVisualState() {
	const geometry = Array.from(document.querySelectorAll<HTMLElement>("[data-slot='card'], .react-flow"))
		.filter((element) => element.offsetParent !== null)
		.slice(0, 24)
		.map((element) => {
			const rect = element.getBoundingClientRect()
			return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10)
		})
	const charts = Array.from(document.querySelectorAll<SVGElement>(".recharts-wrapper svg")).map(
		(element) => element.outerHTML
	)
	const topology = Array.from(document.querySelectorAll<HTMLElement>(".react-flow")).map((element) => element.innerHTML)
	const progress = Array.from(document.querySelectorAll<HTMLElement>("[role='progressbar']")).map(
		(element) => `${element.getAttribute("aria-valuenow")}|${element.getAttribute("style")}`
	)
	const images = Array.from(document.images).map((image) => [
		image.currentSrc,
		image.complete,
		image.naturalWidth,
		image.naturalHeight,
	])

	return JSON.stringify({ geometry, charts, topology, progress, images })
}
