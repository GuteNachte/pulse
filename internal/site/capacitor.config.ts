import type { CapacitorConfig } from "@capacitor/cli"
import pkg from "./package.json" with { type: "json" }

const config: CapacitorConfig = {
	appId: "site.gutenacht.pulse",
	appName: "Pulse",
	webDir: "dist",
	bundledWebRuntime: false,
	server: {
		androidScheme: "https",
	},
	plugins: {
		LocalNotifications: {
			smallIcon: "ic_stat_icon_config_sample",
			iconColor: "#2ea889",
		},
		SystemBars: {
			insetsHandling: "disable",
			style: "DARK",
			hidden: false,
			animation: "NONE",
		},
	},
	android: {
		loggingBehavior: "none",
		versionName: pkg.version,
	},
}

export default config
