export const APP_NAME = "Pulse"

export function pageTitle(title?: string) {
	return title ? `${title} / ${APP_NAME}` : APP_NAME
}
