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

// 公开演示构建（vite build --mode demo）：替换 index.html 元数据为演示站口径，
// 主题引导改用 /static/demo-bootstrap.js（含 PULSE 全局与深色主题），删除 runtime-info 内联脚本。
const pulseHtmlMetadata = (demoMode: boolean) => ({
	name: "pulse:html-metadata",
	transformIndexHtml(html: string) {
		if (!demoMode) {
			return html
		}

		return html
			.replace('<html lang="en"', '<html lang="zh-CN"')
			.replace(
				'<meta name="robots" content="noindex, nofollow" />',
				'<meta name="description" content="Pulse 家庭资产、网络拓扑与设备监控公开演示" />\n\t\t<meta name="robots" content="index, follow" />'
			)
			.replace(
				/<script id="pulse-theme-bootstrap">[\s\S]*?<\/script>/,
				'<script src="/static/demo-bootstrap.js"></script>'
			)
			.replace(/\s*<script id="pulse-runtime-info">[\s\S]*?<\/script>/, "")
	},
})

export default defineConfig(({ mode }) => ({
	base: mode === "capacitor" || mode === "demo" ? "/" : "./",
	define: {
		// 公开演示模式的唯一开关来源：mode=demo 时恒为 "1"，其余构建恒为 "0"，
		// 保证正式构建不包含演示分支的运行时判断开销。
		"import.meta.env.VITE_PULSE_DEMO": JSON.stringify(mode === "demo" ? "1" : "0"),
		// 镜像仓库地址：演示构建只写入占位符，私有 Harbor 域名不进入公开站点产物。
		"import.meta.env.VITE_PULSE_REGISTRY_HOST": JSON.stringify(
			mode === "demo" ? "your-registry.example.com:443" : "registry.example.com:443"
		),
	},
	server: {
		proxy: {
			"/api": "http://127.0.0.1:8090",
			"/_/": "http://127.0.0.1:8090",
		},
	},
	plugins: [
		pulseHtmlMetadata(mode === "demo"),
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
