import { expect, test, type Page, type Request } from "playwright/test"

const routes = [
	{ path: "/", title: /监控大屏/, marker: "今日状态" },
	{ path: "/assets", title: /资产中心/, marker: "Atlas NAS" },
	{ path: "/assets/demo-nas", title: /Atlas NAS/, marker: "Atlas NAS" },
	{ path: "/network/home", title: /家庭网络拓扑/, marker: "家庭网络" },
	{ path: "/network/technology", title: /科技网拓扑/, marker: "科技网" },
	{ path: "/clients", title: /所有客户端/, marker: "Atlas NAS" },
	{ path: "/containers", title: /所有容器/, marker: "容器监控" },
	{ path: "/websites", title: /互联网服务监控/, marker: "状态页" },
	{ path: "/settings/backups", title: /设置/, marker: "备份" },
	{ path: "/settings/about", title: /设置/, marker: "关于 Pulse" },
] as const

const viewports = [
	{ name: "desktop", width: 1440, height: 1000 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "mobile", width: 390, height: 844 },
] as const

for (const viewport of viewports) {
	test.describe(viewport.name, () => {
		test.use({ viewport })

		for (const route of routes) {
			test(`${route.path} renders the public demo`, async ({ page, baseURL }) => {
				const browserErrors = collectBrowserErrors(page)
				const externalRequests = collectExternalRequests(page, baseURL ?? "")

				const response = await page.goto(route.path, { waitUntil: "domcontentloaded" })
				expect(response?.status()).toBe(200)
				await expect(page).toHaveTitle(route.title)
				if (viewport.width <= 768) {
					const menuButton = page.getByRole("button", { name: "打开菜单" })
					await expect(menuButton).toHaveCount(1)
					await menuButton.click()
				}
				await expect(page.locator("body")).toContainText("公开演示")
				await expect(page.locator("#app")).toContainText(route.marker)
				await expect(page.locator("#app")).not.toContainText("演示数据初始化失败")
				await expect(page.locator("#app")).not.toContainText("读取失败")

				const hasHorizontalOverflow = await page.evaluate(
					() => document.documentElement.scrollWidth > document.documentElement.clientWidth
				)
				expect(hasHorizontalOverflow).toBe(false)
				expect(browserErrors, browserErrors.join("\n")).toEqual([])
				expect(externalRequests, externalRequests.join("\n")).toEqual([])
			})
		}
	})
}

test("write controls cannot change demo assets", async ({ page }) => {
	const browserErrors = collectBrowserErrors(page)
	await page.goto("/assets", { waitUntil: "domcontentloaded" })
	await expect(page.locator("#app")).toContainText("Atlas NAS")

	const assetLinks = page.locator('a[href*="/assets/demo-"]')
	const beforeCount = await assetLinks.count()
	const addAsset = page.getByRole("button", { name: "添加资产" })
	if ((await addAsset.count()) === 1 && (await addAsset.isVisible())) {
		expect(await addAsset.isEnabled()).toBe(false)
	}

	await page.reload({ waitUntil: "domcontentloaded" })
	await expect(page.locator("#app")).toContainText("Atlas NAS")
	expect(await assetLinks.count()).toBe(beforeCount)
	expect(browserErrors, browserErrors.join("\n")).toEqual([])
})

function collectBrowserErrors(page: Page) {
	const messages: string[] = []
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning") {
			messages.push(`${message.type()}: ${message.text()}`)
		}
	})
	page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`))
	return messages
}

function collectExternalRequests(page: Page, baseURL: string) {
	const requests: string[] = []
	const allowedHosts = new Set(["127.0.0.1", "localhost", new URL(baseURL).hostname])
	page.on("request", (request: Request) => {
		const url = new URL(request.url())
		if ((url.protocol === "http:" || url.protocol === "https:") && !allowedHosts.has(url.hostname)) {
			requests.push(`${request.method()} ${url.origin}${url.pathname}`)
		}
	})
	return requests
}
