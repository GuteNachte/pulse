import { compareSemVer, parseSemVer } from "@/lib/utils"

export type AgentReleasePlatform = "all" | "windows" | "linux" | "darwin" | "android" | "freebsd"
export type AgentReleaseChannel = "stable" | "beta" | "dev"

export interface AgentReleaseLike {
	version: string
	channel: AgentReleaseChannel
	platform: AgentReleasePlatform
	arch?: string
	download_url?: string
	enabled: boolean
}

export function selectAgentUpdateTarget(releases: AgentReleaseLike[], platform: AgentReleasePlatform, arch: string) {
	const matching = releases.filter((release) => release.enabled && releaseMatchesSystem(release, platform, arch))
	const latest = pickHighestRelease(matching)
	return {
		latest,
		target: latest,
	}
}

export function pickHighestRelease(releases: AgentReleaseLike[]) {
	return releases.reduce<AgentReleaseLike | null>((latest, release) => {
		if (!latest) {
			return release
		}
		return compareVersionStrings(release.version, latest.version) > 0 ? release : latest
	}, null)
}

export function releaseMatchesSystem(release: AgentReleaseLike, platform: AgentReleasePlatform, arch: string) {
	const releasePlatform = normalizePlatform(release.platform)
	const releaseArch = release.arch?.trim().toLowerCase()
	const currentArch = arch.trim().toLowerCase()
	return (
		(releasePlatform === "all" || releasePlatform === platform) &&
		(!releaseArch || !currentArch || releaseArch === currentArch)
	)
}

export function compareVersionStrings(a: string, b: string) {
	return compareSemVer(parseSemVer(normalizeVersion(a)), parseSemVer(normalizeVersion(b)))
}

export function normalizeVersion(version = "") {
	return version.trim().replace(/^v/i, "")
}

export function normalizePlatform(platform = ""): AgentReleasePlatform {
	const value = platform.trim().toLowerCase()
	if (value === "windows") return "windows"
	if (value === "linux") return "linux"
	if (value === "darwin" || value === "macos") return "darwin"
	if (value === "android") return "android"
	if (value === "freebsd") return "freebsd"
	return "all"
}
