import { expect, test, type Page } from "playwright/test"

const email = process.env.PULSE_E2E_EMAIL
const password = process.env.PULSE_E2E_PASSWORD
const topologyViewports = [
	{ name: "wide", width: 2494, height: 1194 },
	{ name: "compact", width: 1727, height: 1272 },
	{ name: "narrow", width: 1280, height: 800 },
] as const

test.beforeAll(() => {
	if (!email || !password) {
		throw new Error("网络拓扑验收需要设置 PULSE_E2E_EMAIL 和 PULSE_E2E_PASSWORD，且账号不能启用 MFA。")
	}
})

for (const viewport of topologyViewports) {
	test(`${viewport.name} desktop shared topology workspace`, async ({ page }, testInfo) => {
		test.setTimeout(60_000)
		await page.setViewportSize(viewport)
		const browserMessages = collectBrowserErrors(page)
		await openAuthenticatedPage(page, "/network/home")

		await expect(page).toHaveURL(/\/network\/home$/)
		await expect(page).toHaveTitle(/家庭网络拓扑/)
		await expect(page.locator(".react-flow")).toBeVisible()
		await expect(page.getByText(/拓扑\s*\d+\s*节点/)).toBeVisible()
		await expect(page.getByRole("button", { name: "家庭网" })).toBeVisible()
		await expect(page.getByRole("button", { name: "科技网" })).toBeVisible()

		await verifyNodeInspector(page)
		await verifyNodeDoubleClick(page)
		await verifyNoHorizontalOverflow(page)

		await page.getByRole("button", { name: "科技网" }).click()
		await expect(page).toHaveURL(/\/network\/technology$/)
		await expect(page).toHaveTitle(/科技网拓扑/)
		await expect(page.locator(".react-flow")).toBeVisible()
		await expect(page.getByText(/小米 BE7000/)).toBeVisible()
		await verifyNoHorizontalOverflow(page)

		await page.screenshot({ path: testInfo.outputPath(`network-topology-${viewport.name}.png`) })
		expect(browserMessages, browserMessages.join("\n")).toEqual([])
	})
}

test("topology editor exposes library canvas inspector and save", async ({ page }) => {
	test.setTimeout(60_000)
	await page.setViewportSize({ width: 1727, height: 1272 })
	await openAuthenticatedPage(page, "/network/edit")
	await expect(page.locator(".pulse-topology-editor")).toBeVisible()
	await expect(page.getByText("网络拓扑编辑")).toBeVisible()
	await expect(page.getByText(/节点：\d+ 个/)).toBeVisible()
	await expect(page.locator(".react-flow__node").first()).toBeVisible()
	await page.locator(".react-flow__node").first().click()
	await expect(page.getByText("节点属性")).toBeVisible()
	await expect(page.getByRole("button", { name: /^保存$/ })).toBeDisabled()
})

async function openAuthenticatedPage(page: Page, path: string) {
	await page.goto(path)
	const identityInput = page.locator('input[name="identity"], input[name="email"]').first()
	if (await identityInput.isVisible()) {
		await identityInput.fill(email ?? "")
		await page.locator('input[name="password"]').fill(password ?? "")
		await page.getByRole("button", { name: "登录" }).click()
	}
	await page.waitForURL(new RegExp(`${path}$`))
	await page.locator(".react-flow").waitFor({ state: "visible", timeout: 15_000 })
}

async function verifyNodeInspector(page: Page) {
	await page.locator(".react-flow__node").first().click()
	await expect(page.getByRole("link", { name: "查看详情" })).toBeVisible()
	const editTopology = page.getByRole("button", { name: "编辑拓扑" })
	await expect(editTopology).toBeVisible()
	await editTopology.click()
	await expect(page).toHaveURL(/\/network\/edit\?asset=/)
	await expect(page.locator(".pulse-topology-editor")).toBeVisible()
	await expect(page.getByText("节点属性")).toBeVisible()
	await page.goBack()
	await page.locator(".react-flow").waitFor({ state: "visible" })
	await expect(page).toHaveURL(/\/network\/home$/)
}

async function verifyNodeDoubleClick(page: Page) {
	await page.locator(".react-flow__node").first().dblclick()
	await expect(page).toHaveURL(/\/assets\/[^/]+$/)
	await page.goBack()
	await page.locator(".react-flow").waitFor({ state: "visible" })
	await expect(page).toHaveURL(/\/network\/home$/)
}

async function verifyNoHorizontalOverflow(page: Page) {
	const dimensions = await page.evaluate(() => ({
		clientWidth: document.documentElement.clientWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}))
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
}

function collectBrowserErrors(page: Page) {
	const messages: string[] = []
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning")
			messages.push(`${message.type()}: ${message.text()}`)
	})
	page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`))
	return messages
}
