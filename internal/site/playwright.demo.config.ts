import { tmpdir } from "node:os"
import { join } from "node:path"
import { defineConfig } from "playwright/test"

const localBaseURL = "http://127.0.0.1:4173"
const baseURL = process.env.PULSE_DEMO_BASE_URL?.replace(/\/$/, "") || localBaseURL

export default defineConfig({
	testDir: "./e2e",
	testMatch: /demo-.*\.spec\.ts/,
	outputDir: join(tmpdir(), "pulse-demo-playwright-results"),
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	use: {
		baseURL,
		colorScheme: "light",
		reducedMotion: "reduce",
		trace: "retain-on-failure",
	},
	webServer: process.env.PULSE_DEMO_BASE_URL
		? undefined
		: {
				command: "npm run dev:demo -- --host 127.0.0.1 --port 4173",
				url: localBaseURL,
				reuseExistingServer: false,
				timeout: 120_000,
			},
})
