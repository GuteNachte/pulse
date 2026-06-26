import { defineConfig } from "@lingui/cli"

export default defineConfig({
	locales: ["zh-CN"],
	sourceLocale: "en",
	compileNamespace: "ts",
	catalogs: [
		{
			path: "<rootDir>/src/locales/{locale}/{locale}",
			include: ["src"],
		},
	],
})
