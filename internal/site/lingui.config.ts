import { defineConfig } from "@lingui/cli"

export default defineConfig({
	locales: ["zh-CN"],
	sourceLocale: "en",
	compileNamespace: "ts",
	formatOptions: {
		lineNumbers: false,
	},
	catalogs: [
		{
			path: "<rootDir>/src/locales/{locale}/{locale}",
			include: ["src"],
		},
	],
})
