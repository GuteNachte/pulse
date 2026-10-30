import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig } from "playwright/test"

export default defineConfig({
	testDir: "./e2e",
	outputDir: join(tmpdir(), "pulse-playwright-results"),
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	use: {
		baseURL: "http://127.0.0.1:5173",
		trace: "retain-on-failure",
	},
	webServer: {
		command: "npm run dev -- --host 127.0.0.1",
		url: "http://127.0.0.1:5173",
		reuseExistingServer: true,
	},
})
