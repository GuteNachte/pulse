import { expect, test, type Page, type Request } from "playwright/test"

// 2026-10-30 对齐 1.0.8 页面清单：首页即拓扑工作台，只读完整拓扑页与 clients/websites 已下线，
// 监控合并进 /monitoring；演示验收只做桌面视口（Pulse 仅在客户端桌面使用）。
const routes = [
	{ path: "/", title: /首页/, marker: "待处理事项" },
	{ path: "/assets", title: /资产中心/, marker: "Atlas NAS" },
	{ path: "/assets/demo-nas", title: /Atlas NAS/, marker: "Atlas NAS" },
	{ path: "/network/edit?canvas=home", title: /网络拓扑编辑/, marker: "家庭网" },
	{ path: "/monitoring", title: /Pulse/, marker: "Atlas NAS" },
	{ path: "/containers", title: /容器/, marker: "容器监控" },
	{ path: "/smarthome", title: /智能家居/, marker: "客厅灯带" },
	{ path: "/alerts", title: /告警中心/, marker: "告警" },
	{ path: "/settings/backups", title: /备份管理/, marker: "备份管理" },
	{ path: "/settings/about", title: /关于/, marker: "关于 Pulse" },
] as const

test.describe("public demo desktop", () => {
	test.use({ viewport: { width: 1440, height: 1000 } })

	for (const route of routes) {
		test(`${route.path} renders the public demo`, async ({ page, baseURL }) => {
			const browserErrors = collectBrowserErrors(page)
			const externalRequests = collectExternalRequests(page, baseURL ?? "")

			const response = await page.goto(route.path, { waitUntil: "domcontentloaded" })
			expect(response?.status()).toBe(200)
			await expect(page).toHaveTitle(route.title)
			await expect(page.locator("body")).toContainText("公开演示")
			await expect(page.locator("#app")).toContainText(route.marker)
			await expect(page.locator("#app")).not.toContainText("演示数据初始化失败")

			const hasHorizontalOverflow = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth
			)
			expect(hasHorizontalOverflow).toBe(false)
			expect(browserErrors, browserErrors.join("\n")).toEqual([])
			expect(externalRequests, externalRequests.join("\n")).toEqual([])
		})
	}
})

test("write controls cannot change demo assets", async ({ page }) => {
	const browserErrors = collectBrowserErrors(page)
	await page.goto("/assets", { waitUntil: "domcontentloaded" })
	await expect(page.locator("#app")).toContainText("Atlas NAS")

	const assetLinks = page.locator('a[href*="/assets/demo-"]')
	const beforeCount = await assetLinks.count()

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
	page.on("response", (response) => {
		if (response.status() >= 400) {
			messages.push(`http ${response.status()}: ${new URL(response.url()).pathname}`)
		}
	})
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
