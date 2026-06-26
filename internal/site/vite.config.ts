import { defineConfig } from "vite"
import path from "node:path"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { lingui, linguiTransformerBabelPreset } from "@lingui/vite-plugin"

const pocketbaseImportMethodCompat = () => ({
	name: "pulse:pocketbase-import-method-compat",
	enforce: "pre" as const,
	transform(code: string, id: string) {
		if (!id.includes("node_modules/pocketbase/dist/pocketbase.es.mjs")) {
			return
		}
		return code.replaceAll("async import(", 'async ["import"](')
	},
})

export default defineConfig(({ mode }) => ({
	base: mode === "capacitor" ? "/" : "./",
	server: {
		proxy: {
			"/api": "http://127.0.0.1:8090",
			"/_/": "http://127.0.0.1:8090",
		},
	},
	plugins: [
		pocketbaseImportMethodCompat(),
		react(),
		babel({
			presets: [linguiTransformerBabelPreset()],
		}),
		lingui(),
		tailwindcss(),
	],
	optimizeDeps: {
		exclude: ["pocketbase"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		target: "baseline-widely-available",
		rolldownOptions: {
			output: {
				manualChunks(id) {
					if (!id.includes("node_modules")) {
						return
					}
					if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
						return "vendor-react"
					}
					if (/[\\/]node_modules[\\/](@nanostores|nanostores|@lingui|pocketbase|valibot)[\\/]/.test(id)) {
						return "vendor-app-runtime"
					}
					if (
						/[\\/]node_modules[\\/](@radix-ui|input-otp|class-variance-authority|clsx|tailwind-merge)[\\/]/.test(id)
					) {
						return "vendor-ui"
					}
					if (/[\\/]node_modules[\\/](recharts|d3-)[\\/]/.test(id)) {
						return "vendor-charts"
					}
					if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) {
						return "vendor-tables"
					}
					if (/[\\/]node_modules[\\/](@capacitor|capacitor-secure-storage-plugin)[\\/]/.test(id)) {
						return "vendor-mobile-runtime"
					}
					if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) {
						return "vendor-icons"
					}
				},
			},
		},
	},
}))
