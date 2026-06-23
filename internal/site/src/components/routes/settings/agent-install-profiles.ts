import {
	AGENT_VERSION,
	buildDefaultWindowsAgentDownloadURL,
	buildLinuxAgentCompose,
	buildLinuxAgentPairCompose,
	buildLinuxAgentPairDockerRun,
	buildUnraidAgentTemplate,
	buildWindowsInstallCommand,
	DEFAULT_LINUX_AGENT_IMAGE,
	DEFAULT_LINUX_AGENT_DATA_DIR,
	FLYNAS_LINUX_AGENT_DATA_DIR,
	UNRAID_LINUX_AGENT_DATA_DIR,
} from "@/lib/agent-install"
import { selectAgentUpdateTarget } from "../system/agent-update-utils"
import type { AgentReleaseRecord } from "./agent-update-summary"

export type InstallProfile = {
	id: string
	title: string
	icon: "windows" | "linux"
	badges: string[]
	commandLabel: string
	command: string
	actions?: InstallProfileAction[]
}

export type InstallProfileAction = {
	id: string
	title: string
	description: string
	label: string
	content: string
	filename?: string
	downloadLabel?: string
	badges?: string[]
}

export function buildInstallProfiles({
	releases,
	hubUrl,
}: {
	releases: AgentReleaseRecord[]
	hubUrl: string
}): InstallProfile[] {
	const tokenValue = "<TOKEN>"
	const windowsRelease = selectAgentUpdateTarget(releases, "windows", "amd64").target
	const windowsDownloadUrl = windowsRelease?.download_url || buildDefaultWindowsAgentDownloadURL(hubUrl)
	const windowsVersion = windowsRelease?.version || AGENT_VERSION
	const linuxRelease = selectAgentUpdateTarget(releases, "linux", "amd64").target
	const linuxImage = linuxRelease?.download_url || DEFAULT_LINUX_AGENT_IMAGE
	const linuxVersion = linuxRelease?.version || AGENT_VERSION
	const windowsCommand = buildWindowsInstallCommand(tokenValue, hubUrl, {
		version: windowsVersion,
		url: windowsDownloadUrl,
	})
	const linuxCompose = buildLinuxAgentCompose({
		token: tokenValue,
		agentHubURL: hubUrl,
		image: linuxImage,
		version: linuxVersion,
		dataDir: DEFAULT_LINUX_AGENT_DATA_DIR,
		title: "Linux 通用容器版",
	})
	const linuxPairCompose = buildLinuxAgentPairCompose({
		code: tokenValue,
		agentHubURL: hubUrl,
		image: linuxImage,
		version: linuxVersion,
		dataDir: DEFAULT_LINUX_AGENT_DATA_DIR,
		title: "Linux 通用容器版",
		includeHeader: true,
	})
	const linuxRunCommand = buildLinuxAgentPairDockerRun({
		code: tokenValue,
		agentHubURL: hubUrl,
		image: linuxImage,
		version: linuxVersion,
		dataDir: DEFAULT_LINUX_AGENT_DATA_DIR,
		title: "Linux 通用容器版",
	})
	const flynasCompose = buildLinuxAgentCompose({
		token: tokenValue,
		agentHubURL: hubUrl,
		image: linuxImage,
		version: linuxVersion,
		dataDir: FLYNAS_LINUX_AGENT_DATA_DIR,
		title: "飞牛 / NAS 容器版",
		includeHeader: true,
	})
	const unraidTemplate = buildUnraidAgentTemplate({
		token: tokenValue,
		agentHubURL: hubUrl,
		image: linuxImage,
		version: linuxVersion,
		dataDir: UNRAID_LINUX_AGENT_DATA_DIR,
	})

	return [
		{
			id: "windows-host",
			title: "Windows 主机版",
			icon: "windows",
			badges: ["Windows", `版本 ${windowsVersion}`],
			commandLabel: "PowerShell 模板",
			command: windowsCommand,
		},
		{
			id: "linux-container",
			title: "Linux / NAS Docker 容器版",
			icon: "linux",
			badges: ["Linux", "飞牛", "Unraid", `镜像 ${linuxVersion}`],
			commandLabel: "Linux 安装模板",
			command: linuxPairCompose,
			actions: [
				{
					id: "linux-generic",
					title: "通用 Linux",
					description: `先配对再启动，Agent 数据固定保存到 ${DEFAULT_LINUX_AGENT_DATA_DIR}。`,
					label: "复制配对 Compose",
					content: linuxPairCompose,
					filename: "pulse-agent-linux-pair.yml",
					downloadLabel: "下载配对 yml",
					badges: ["Compose", DEFAULT_LINUX_AGENT_DATA_DIR, "配对安装"],
				},
				{
					id: "linux-generic-run",
					title: "通用 Linux 直接运行",
					description: `适合先验证运行命令，再决定是否用 Compose 管理。`,
					label: "复制运行命令",
					content: linuxRunCommand,
					filename: "pulse-agent-linux-run.sh",
					downloadLabel: "下载运行脚本",
					badges: ["Run", DEFAULT_LINUX_AGENT_DATA_DIR],
				},
				{
					id: "flynas",
					title: "飞牛 / NAS",
					description: `飞牛建议把 Agent 数据目录固定到 ${FLYNAS_LINUX_AGENT_DATA_DIR}，便于和应用数据分开备份。`,
					label: "复制飞牛 Compose",
					content: flynasCompose,
					filename: "pulse-agent-flynas.yml",
					downloadLabel: "下载飞牛 yml",
					badges: ["FlyNAS", FLYNAS_LINUX_AGENT_DATA_DIR, "配对安装"],
				},
				{
					id: "unraid",
					title: "Unraid",
					description: `Unraid 使用 root 直连下载命令把 XML 模板写入系统模板目录；建议保存到 ${UNRAID_LINUX_AGENT_DATA_DIR}。`,
					label: "复制下载命令",
					content: unraidTemplate,
					filename: "pulse-agent-unraid.xml.cmd",
					downloadLabel: "下载命令",
					badges: ["XML 下载", UNRAID_LINUX_AGENT_DATA_DIR, "模板安装"],
				},
			],
		},
	]
}
