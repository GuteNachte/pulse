export const demoWorkerOptions = {
	onUnhandledRequest: "error",
	serviceWorker: { url: "/mockServiceWorker.js" },
	quiet: true,
} as const
