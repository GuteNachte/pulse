export const APP_NAME = "Pulse"
export const APP_TAGLINE = "设备、容器与服务监控中枢"

export function pageTitle(title?: string) {
	return title ? `${title} / ${APP_NAME}` : APP_NAME
}
