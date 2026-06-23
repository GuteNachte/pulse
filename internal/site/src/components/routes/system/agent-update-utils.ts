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

export function getAgentUpdateState(
	currentVersion: string,
	targetRelease: AgentReleaseLike | null,
	loading: boolean,
	_usesRecommended: boolean
) {
	if (loading) {
		return {
			kind: "loading",
			label: "检查中",
			reason: "正在读取 Hub 端 Agent 版本仓库。",
			variant: "warning" as const,
		}
	}
	if (!currentVersion) {
		return {
			kind: "unknown",
			label: "未知",
			reason: "当前设备没有上报 Agent 版本，无法判断是否需要升级。",
			variant: "outline" as const,
		}
	}
	if (!targetRelease) {
		return {
			kind: "missing",
			label: "无目标版本",
			reason: "还没有启用且适配当前平台和架构的 Agent 版本。",
			variant: "outline" as const,
		}
	}
	const compare = compareVersionStrings(currentVersion, targetRelease.version)
	const targetKind = "最新启用版本"
	if (compare < 0) {
		return {
			kind: "upgrade",
			label: "可升级",
			reason: `当前 Agent 低于${targetKind} ${targetRelease.version}，可以发起受控升级请求。`,
			variant: "warning" as const,
		}
	}
	if (compare > 0) {
		return {
			kind: "ahead",
			label: "高于目标",
			reason: `当前 Agent 版本高于${targetKind}，可能是手动安装或版本仓库未更新。`,
			variant: "outline" as const,
		}
	}
	return {
		kind: "current",
		label: "已是最新版",
		reason: `当前 Agent 与${targetKind}一致。`,
		variant: "success" as const,
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

export function normalizeChannel(channel = ""): AgentReleaseChannel {
	const value = channel.trim().toLowerCase()
	if (value === "beta") return "beta"
	if (value === "dev") return "dev"
	return "stable"
}
