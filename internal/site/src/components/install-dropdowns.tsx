import { memo } from "react"
import { pb } from "@/lib/api"
import {
	AGENT_VERSION,
	buildDefaultWindowsAgentDownloadURL,
	buildLinuxAgentCompose,
	buildUnraidAgentTemplate,
	buildLinuxAgentPairCompose,
	buildLinuxAgentPairDockerRun,
	buildWindowsPairingInstallCommand,
	buildWindowsInstallCommand,
	DEFAULT_LINUX_AGENT_IMAGE,
	FLYNAS_LINUX_AGENT_DATA_DIR,
	UNRAID_LINUX_AGENT_DATA_DIR,
	normalizeLocalAgentDownloadUrl,
} from "@/lib/agent-install"
import { syncAgentHubURLFromRuntime } from "@/lib/runtime-info"
import { copyToClipboard, getAgentHubURL } from "@/lib/utils"
import {
	compareVersionStrings,
	normalizeVersion,
	releaseMatchesSystem,
	selectAgentUpdateTarget,
	type AgentReleaseLike,
	type AgentReleasePlatform,
} from "./routes/system/agent-update-utils"
import { DropdownMenuContent, DropdownMenuItem } from "./ui/dropdown-menu"

async function getLiveAgentHubURL() {
	try {
		const info = await syncAgentHubURLFromRuntime()
		if (info.agent_hub_url) {
			return info.agent_hub_url
		}
	} catch (error) {
		console.error(error)
	}
	return getAgentHubURL()
}

async function getAgentReleaseDownload(platform: AgentReleasePlatform, agentHubURL: string, arch = "amd64") {
	try {
		const releases = await pb.collection<AgentReleaseLike>("agent_releases").getFullList({
			sort: "-enabled,-created",
			fields: "id,version,channel,platform,arch,download_url,enabled",
		})
		const currentVersionRelease = releases.find(
			(release) =>
				release.enabled &&
				normalizeVersion(release.version) === normalizeVersion(AGENT_VERSION) &&
				releaseMatchesSystem(release, platform, arch)
		)
		if (currentVersionRelease?.download_url) {
			return {
				version: currentVersionRelease.version,
				url: normalizeLocalAgentDownloadUrl(currentVersionRelease.download_url, agentHubURL),
			}
		}
		const target = selectAgentUpdateTarget(releases, platform, arch).target
		if (target?.download_url && compareVersionStrings(target.version, AGENT_VERSION) > 0) {
			return {
				version: target.version,
				url: normalizeLocalAgentDownloadUrl(target.download_url, agentHubURL),
			}
		}
	} catch (error) {
		console.error(error)
	}
	return {
		version: AGENT_VERSION,
		url: platform === "windows" ? buildDefaultWindowsAgentDownloadURL(agentHubURL) : DEFAULT_LINUX_AGENT_IMAGE,
	}
}

export async function copyDockerCompose(token: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("linux", agentHubURL, "amd64")
	await copyToClipboard(
		buildLinuxAgentCompose({
			token,
			agentHubURL,
			image: release.url,
			version: release.version,
			title: "Linux 通用容器版",
			includeHeader: true,
		})
	)
}

export async function copyPairingDockerCompose(code: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("linux", agentHubURL, "amd64")
	await copyToClipboard(
		buildLinuxAgentPairCompose({
			code,
			agentHubURL,
			image: release.url,
			version: release.version,
			includeHeader: true,
		})
	)
}

export async function copyPairingFlynasCompose(code: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("linux", agentHubURL, "amd64")
	await copyToClipboard(
		buildLinuxAgentPairCompose({
			code,
			agentHubURL,
			image: release.url,
			version: release.version,
			includeHeader: true,
			dataDir: FLYNAS_LINUX_AGENT_DATA_DIR,
			title: "飞牛 / NAS 容器版",
		})
	)
}

export async function downloadPairingFlynasCompose(code: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("linux", agentHubURL, "amd64")
	downloadTextFile(
		"pulse-agent-flynas.yml",
		buildLinuxAgentPairCompose({
			code,
			agentHubURL,
			image: release.url,
			version: release.version,
			includeHeader: true,
			dataDir: FLYNAS_LINUX_AGENT_DATA_DIR,
			title: "飞牛 / NAS 容器版",
		})
	)
}

export async function copyPairingDockerRun(code: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("linux", agentHubURL, "amd64")
	await copyToClipboard(
		buildLinuxAgentPairDockerRun({
			code,
			agentHubURL,
			image: release.url,
			version: release.version,
		})
	)
}

export async function copyPairingUnraidTemplate(code: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("linux", agentHubURL, "amd64")
	await copyToClipboard(
		buildUnraidAgentTemplate({
			code,
			agentHubURL,
			image: release.url,
			version: release.version,
			dataDir: UNRAID_LINUX_AGENT_DATA_DIR,
		})
	)
}

export async function downloadPairingUnraidTemplate(code: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("linux", agentHubURL, "amd64")
	downloadTextFile(
		"pulse-agent-unraid.xml.cmd",
		buildUnraidAgentTemplate({
			code,
			agentHubURL,
			image: release.url,
			version: release.version,
			dataDir: UNRAID_LINUX_AGENT_DATA_DIR,
		})
	)
}

export async function copyWindowsCommand(token: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("windows", agentHubURL, "amd64")
	await copyToClipboard(buildWindowsInstallCommand(token, agentHubURL, release))
}

function downloadTextFile(filename: string, content: string) {
	const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
	const url = URL.createObjectURL(blob)
	const link = document.createElement("a")
	link.href = url
	link.download = filename
	document.body.appendChild(link)
	link.click()
	document.body.removeChild(link)
	URL.revokeObjectURL(url)
}

export async function copyPairingWindowsCommand(code: string) {
	const agentHubURL = await getLiveAgentHubURL()
	const release = await getAgentReleaseDownload("windows", agentHubURL, "amd64")
	await copyToClipboard(buildWindowsPairingInstallCommand(code, agentHubURL, release))
}

export interface DropdownItem {
	text: string
	onClick?: () => void
	url?: string
	icons?: React.ComponentType<React.SVGProps<SVGSVGElement>>[]
}

export const InstallDropdown = memo(({ items }: { items: DropdownItem[] }) => {
	return (
		<DropdownMenuContent align="end">
			{items.map((item, index) => {
				const className = "flex cursor-pointer items-center gap-1.5"
				return item.url ? (
					<DropdownMenuItem key={index} asChild>
						<a href={item.url} className={className} target="_blank" rel="noopener noreferrer">
							{item.text}{" "}
							{item.icons?.map((Icon, iconIndex) => (
								<Icon key={iconIndex} className="size-4" />
							))}
						</a>
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem key={index} onClick={item.onClick} className={className}>
						{item.text}{" "}
						{item.icons?.map((Icon, iconIndex) => (
							<Icon key={iconIndex} className="size-4" />
						))}
					</DropdownMenuItem>
				)
			})}
		</DropdownMenuContent>
	)
})
