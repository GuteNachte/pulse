import { defineConfig } from "vite"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react-swc"
import { lingui } from "@lingui/vite-plugin"

export default defineConfig(({ mode }) => ({
	base: mode === "capacitor" ? "/" : "./",
	server: {
		proxy: {
			"/api": "http://127.0.0.1:8090",
			"/_/": "http://127.0.0.1:8090",
		},
	},
	plugins: [
		react({
			plugins: [["@lingui/swc-plugin", {}]],
		}),
		lingui(),
		tailwindcss(),
	],
	esbuild: {
		legalComments: "external",
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		rollupOptions: {
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
