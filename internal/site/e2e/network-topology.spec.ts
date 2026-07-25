import { expect, test, type Page } from "playwright/test"

const email = process.env.PULSE_E2E_EMAIL
const password = process.env.PULSE_E2E_PASSWORD
const desktopViewports = [
	{ name: "wide", width: 2494, height: 1194 },
	{ name: "compact", width: 1727, height: 1272 },
] as const

test.beforeAll(() => {
	if (!email || !password) {
		throw new Error("网络拓扑验收需要设置 PULSE_E2E_EMAIL 和 PULSE_E2E_PASSWORD，且账号不能启用 MFA。")
	}
})

for (const viewport of desktopViewports) {
	test(`${viewport.name} desktop topology workspace`, async ({ page }, testInfo) => {
		test.setTimeout(60_000)
		await page.setViewportSize(viewport)
		const browserMessages = collectBrowserErrors(page)
		await openAuthenticatedPage(page, "/network/home")

		await expect(page).toHaveURL(/\/network\/home$/)
		await expect(page).toHaveTitle(/家庭网络拓扑/)
		await expect(page.getByRole("heading", { name: "网络拓扑" })).toBeVisible()
		await expect(page.locator(".pulse-matrix-band")).toHaveCount(0)
		await expect(page.locator(".react-flow__node").first()).toBeVisible()
		await expect(page.locator(".react-flow__background")).toBeVisible()

		await verifyToolbarDoesNotOverlapCanvas(page)
		await verifyMediaRendering(page)
		await verifyNodeDrag(page)
		await verifyNodeInspector(page)
		await verifyRelationInspector(page)
		await verifyWaypointEditing(page)

		await page.getByRole("link", { name: "科技网" }).click()
		await expect(page).toHaveURL(/\/network\/technology$/)
		await expect(page).toHaveTitle(/科技网拓扑/)
		await expect(page.locator(".react-flow__node").first()).toBeVisible()
		await expect(page.locator(".pulse-matrix-band")).toHaveCount(0)
		await verifyToolbarDoesNotOverlapCanvas(page)

		await page.screenshot({ path: testInfo.outputPath(`network-topology-${viewport.name}.png`) })
		expect(browserMessages, browserMessages.join("\n")).toEqual([])
	})
}

async function openAuthenticatedPage(page: Page, path: string) {
	await page.goto(path)
	const identityInput = page.locator('input[name="identity"], input[name="email"]').first()
	await identityInput.waitFor({ state: "visible", timeout: 15_000 })
	await identityInput.fill(email ?? "")
	await page.locator('input[name="password"]').fill(password ?? "")
	await page.getByRole("button", { name: "登录" }).click()
	await page.getByRole("heading", { name: "网络拓扑" }).waitFor({ state: "visible", timeout: 15_000 })
	await page.waitForURL(new RegExp(`${path}$`))
}

async function verifyToolbarDoesNotOverlapCanvas(page: Page) {
	const toolbar = page.getByRole("heading", { name: "网络拓扑" }).locator("..")
	const canvas = page.locator(".pulse-topology-flow")
	const [toolbarBox, canvasBox] = await Promise.all([toolbar.boundingBox(), canvas.boundingBox()])
	expect(toolbarBox).not.toBeNull()
	expect(canvasBox).not.toBeNull()
	expect((canvasBox?.y ?? 0) >= (toolbarBox?.y ?? 0) + (toolbarBox?.height ?? 0) - 1).toBe(true)
}

async function verifyMediaRendering(page: Page) {
	for (const selector of [".pulse-free-edge-wired", ".pulse-free-edge-wifi", ".pulse-free-edge-fiber"]) {
		const edge = page.locator(selector).first()
		await expect(edge).toHaveCount(1)
		expect(await edge.getAttribute("d")).toMatch(/^M /)
	}
}

async function verifyNodeDrag(page: Page) {
	const node = page.locator(".react-flow__node").first()
	const before = await node.boundingBox()
	expect(before).not.toBeNull()
	if (!before) return
	await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
	await page.mouse.down()
	await page.mouse.move(before.x + before.width / 2 + 72, before.y + before.height / 2 + 36, { steps: 6 })
	await page.mouse.up()
	const after = await node.boundingBox()
	expect(after).not.toBeNull()
	expect(Math.abs((after?.x ?? before.x) - before.x)).toBeGreaterThan(20)
}

async function verifyNodeInspector(page: Page) {
	await page.locator(".react-flow__node").first().dblclick()
	const dialog = page.getByRole("dialog")
	await expect(dialog.getByText(/设备档案|待建档设备/)).toBeVisible()
	await page.keyboard.press("Escape")
	await expect(dialog).toBeHidden()
}

async function verifyRelationInspector(page: Page) {
	await clickEdgeAtPathMidpoint(page)
	const dialog = page.getByRole("dialog")
	await expect(dialog.getByText("接入方向")).toBeVisible()
	await page.keyboard.press("Escape")
	await expect(dialog).toBeHidden()
}

async function verifyWaypointEditing(page: Page) {
	const addWaypoint = page.locator(".pulse-free-waypoint-add").first()
	await expect(addWaypoint).toBeVisible()
	await addWaypoint.click()
	await expect(page.locator(".pulse-free-waypoint").first()).toBeVisible()
}

async function clickEdgeAtPathMidpoint(page: Page) {
	const point = await page
		.locator(".react-flow__edge-interaction")
		.first()
		.evaluate((element) => {
			const path = element as SVGPathElement
			const pathPoint = path.getPointAtLength(path.getTotalLength() / 2)
			const matrix = path.getScreenCTM()
			if (!matrix) throw new Error("无法读取链路屏幕坐标")
			const screenPoint = new DOMPoint(pathPoint.x, pathPoint.y).matrixTransform(matrix)
			return { x: screenPoint.x, y: screenPoint.y }
		})
	await page.mouse.click(point.x, point.y)
}

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
