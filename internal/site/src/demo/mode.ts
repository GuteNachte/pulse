export function demoModeFromEnv(value: string | undefined) {
	return value === "1" || value === "true"
}

export const isDemoMode = () => demoModeFromEnv(import.meta.env.VITE_PULSE_DEMO)

export const demoRepositoryUrl = "https://github.com/GuteNachte/pulse"
export const demoReleaseUrl = "https://github.com/GuteNachte/pulse/releases"
