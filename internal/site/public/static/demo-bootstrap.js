try {
	const theme = localStorage.getItem("ui-theme")
	const isDark = theme === "dark" || (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches)
	document.documentElement.classList.add(isDark ? "dark" : "light")
} catch {}

globalThis.PULSE = {
	BASE_PATH: "",
	DEV_BUILD: true,
	HUB_VERSION: "1.0.6-beta.6",
}
