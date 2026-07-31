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
		Date.now = () => Date.parse("2026-07-31T10:00:00+08:00")
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

	await expect
		.poll(() => page.evaluate(measureStableElements), { timeout: 10_000 })
		.toEqual(await page.evaluate(measureStableElements))

	const hasHorizontalOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth
	)
	expect(hasHorizontalOverflow).toBe(false)
}

async function measureStableElements() {
	const measure = () =>
		Array.from(document.querySelectorAll<HTMLElement>("[data-slot='card'], .react-flow"))
			.filter((element) => element.offsetParent !== null)
			.slice(0, 24)
			.map((element) => {
				const rect = element.getBoundingClientRect()
				return [rect.x, rect.y, rect.width, rect.height].map((value) => Math.round(value * 10) / 10)
			})

	const before = measure()
	await new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame())))
	return { before, after: measure() }
}
