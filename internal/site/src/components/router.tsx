import { createRouter } from "@nanostores/router"

const routePaths = {
	home: "/",
	asset: "/assets/:id",
	assets: "/assets",
	smarthome: "/smarthome",
	network: "/network",
	clients: "/clients",
	containers: "/containers",
	websites: "/websites",
	alerts: "/alerts",
	notifications: "/notifications",
	smart: "/smart",
	system: `/system/:id`,
	settings: `/settings/:name?`,
} as const

/**
 * The base path of the application.
 * This is used to prepend the base path to all routes.
 */
export const basePath = globalThis.PULSE?.BASE_PATH || ""

/**
 * Prepends the base path to the given path.
 * @param path The path to prepend the base path to.
 * @returns The path with the base path prepended.
 */
export const prependBasePath = (path: string) => (basePath + path).replaceAll("//", "/")

const routes = Object.fromEntries(
	Object.entries(routePaths).map(([route, path]) => [route, prependBasePath(path)])
) as Record<keyof typeof routePaths, string>

export const $router = createRouter(routes, { links: false })

/** Navigate to url using router
 *  Base path is automatically prepended if serving from subpath
 */
export const navigate = (urlString: string) => {
	$router.open(urlString)
}

export function Link(props: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Internal SPA links intentionally intercept anchor clicks for the Nanostores router.
		// biome-ignore lint/a11y/useKeyWithClickEvents: Keyboard activation still uses the anchor's native href behavior.
		<a
			{...props}
			// biome-ignore lint/a11y/useValidAnchor: The href is provided by callers and handled by the client-side router.
			onClick={(e) => {
				e.preventDefault()
				const href = props.href || ""
				if (e.ctrlKey || e.metaKey) {
					window.open(href, "_blank")
				} else {
					navigate(href)
					props.onClick?.(e)
				}
			}}
		></a>
	)
}
