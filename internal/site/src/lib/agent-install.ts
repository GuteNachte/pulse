export const AGENT_VERSION = "1.0.6-beta.5"
export const DEFAULT_LINUX_AGENT_IMAGE = `registry.example.com/infra/pulse-agent:${AGENT_VERSION}`
export const DEFAULT_LINUX_AGENT_DATA_DIR = "/opt/pulse-agent/data"
export const FLYNAS_LINUX_AGENT_DATA_DIR = "/vol1/1000/docker/pulse-agent/data"
export const UNRAID_LINUX_AGENT_DATA_DIR = "/mnt/user/appdata/pulse-agent"

export type LinuxInstallTarget = "linux-generic" | "flynas" | "unraid"

export type LinuxAgentDockerSocketMode = "rw" | "ro" | "none"

export type LinuxAgentInstallOptions = {
	dockerSocketMode?: LinuxAgentDockerSocketMode
	includeHostRoot?: boolean
	includeDmi?: boolean
	includeGpu?: boolean
}

export function getLinuxInstallDefaults(target: LinuxInstallTarget) {
	if (target === "flynas") {
		return {
			title: "飞牛 / NAS 容器版",
			dataDir: FLYNAS_LINUX_AGENT_DATA_DIR,
		}
	}
	if (target === "unraid") {
		return {
			title: "Unraid Docker 模板",
			dataDir: UNRAID_LINUX_AGENT_DATA_DIR,
		}
	}
	return {
		title: "Linux 通用容器版",
		dataDir: DEFAULT_LINUX_AGENT_DATA_DIR,
	}
}

export type WindowsAgentInstallOptions = {
	installDir?: string
	dataDir?: string
	logDir?: string
	cleanData?: boolean
	installNssm?: boolean
	startService?: boolean
	addFirewallRule?: boolean
}

const defaultLinuxAgentInstallOptions = {
	dockerSocketMode: "rw",
	includeHostRoot: true,
	includeDmi: true,
	includeGpu: true,
} satisfies Required<LinuxAgentInstallOptions>

export const DEFAULT_WINDOWS_AGENT_INSTALL_OPTIONS = {
	installDir: "$env:ProgramData\\pulse-agent",
	dataDir: "$env:WINDIR\\System32\\config\\systemprofile\\AppData\\Roaming\\pulse-agent",
	logDir: "$env:ProgramData\\pulse-agent\\logs",
	cleanData: true,
	installNssm: true,
	startService: true,
	addFirewallRule: false,
} satisfies Required<WindowsAgentInstallOptions>

export function normalizeLocalAgentDownloadUrl(url: string, agentHubURL: string) {
	try {
		const parsed = new URL(url)
		if (parsed.pathname.startsWith("/api/pulse/agent-releases/")) {
			return new URL(`${parsed.pathname}${parsed.search}`, agentHubURL).toString()
		}
	} catch (_error) {
		return url
	}
	return url
}

export function buildWindowsInstallCommand(
	token: string,
	agentHubURL: string,
	release: { version: string; url: string },
	options?: WindowsAgentInstallOptions
) {
	const params = buildWindowsInstallScriptParams({ token, release, options })
	const scriptUrl = new URL(`/api/pulse/agent-install/windows.ps1?${params.toString()}`, agentHubURL).toString()
	return buildPowerShellInstallCommand(scriptUrl)
}

export function buildWindowsPairingInstallCommand(
	code: string,
	agentHubURL: string,
	release: { version: string; url: string },
	options?: WindowsAgentInstallOptions
) {
	const params = buildWindowsInstallScriptParams({ code, release, options })
	const scriptUrl = new URL(`/api/pulse/agent-install/windows.ps1?${params.toString()}`, agentHubURL).toString()
	return buildPowerShellInstallCommand(scriptUrl)
}

export function buildDefaultWindowsAgentDownloadURL(agentHubURL: string, version = AGENT_VERSION) {
	return new URL(`/api/pulse/agent-releases/${version}/pulse-agent_windows_amd64.exe`, agentHubURL).toString()
}

export function buildWindowsAgentFullInstallScript({
	token = "",
	code = "",
	agentHubURL,
	release,
	options,
}: {
	token?: string
	code?: string
	agentHubURL: string
	release: { version: string; url: string }
	options?: WindowsAgentInstallOptions
}) {
	const normalizedOptions = normalizeWindowsAgentInstallOptions(options)
	return `# Pulse Windows Agent installer
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$AgentVersion = ${powerShellSingleQuotedString(release.version)}
$Token = ${powerShellSingleQuotedString(token)}
$PairingCode = ${powerShellSingleQuotedString(code)}
$HubUrl = ${powerShellSingleQuotedString(agentHubURL)}
$DownloadUrl = ${powerShellSingleQuotedString(release.url)}
$AgentDir = ${windowsPowerShellPathValue(normalizedOptions.installDir)}
$AgentPath = "$AgentDir\\pulse-agent.exe"
$LogDir = ${windowsPowerShellPathValue(normalizedOptions.logDir)}
$LogFile = "$LogDir\\pulse-agent.log"
$AgentDataDir = ${windowsPowerShellPathValue(normalizedOptions.dataDir)}

New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
New-Item -ItemType Directory -Force -Path $AgentDataDir | Out-Null

$Nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
${
	normalizedOptions.installNssm
		? `if (-not $Nssm) {
  Write-Host "Installing NSSM..."
  winget install -e --id NSSM.NSSM --accept-source-agreements --accept-package-agreements
  $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
  $Nssm = (Get-Command nssm -ErrorAction SilentlyContinue).Source
}
`
		: ""
}if (-not $Nssm) {
  throw "NSSM was not found. Install NSSM and run this command again."
}

$ExistingService = Get-Service -Name pulse-agent -ErrorAction SilentlyContinue
if ($ExistingService) {
  Write-Host "Replacing existing pulse-agent service..."
  & $Nssm stop pulse-agent 2>$null
  & $Nssm remove pulse-agent confirm 2>$null
}
Stop-Process -Name pulse-agent -Force -ErrorAction SilentlyContinue
${normalizedOptions.cleanData ? "Remove-Item -Recurse -Force -LiteralPath $AgentDataDir -ErrorAction SilentlyContinue\nNew-Item -ItemType Directory -Force -Path $AgentDataDir | Out-Null\n" : ""}Remove-Item -Force -LiteralPath $LogFile -ErrorAction SilentlyContinue

Write-Host "Downloading Pulse Agent $AgentVersion..."
Invoke-WebRequest -UseBasicParsing $DownloadUrl -OutFile $AgentPath

if ($PairingCode) {
  Write-Host "Pairing Pulse Agent with Hub..."
  $env:DATA_DIR = $AgentDataDir
  & $AgentPath pair --url $HubUrl --code $PairingCode
  if ($LASTEXITCODE -ne 0) {
    throw "Agent pairing failed. Check the pairing code and Hub URL."
  }
}

& $Nssm install pulse-agent $AgentPath
& $Nssm set pulse-agent AppEnvironmentExtra "+HUB_URL=$HubUrl"
& $Nssm set pulse-agent AppEnvironmentExtra "+DATA_DIR=$AgentDataDir"
& $Nssm set pulse-agent AppEnvironmentExtra "+INSTALL_METHOD=host"
& $Nssm set pulse-agent AppEnvironmentExtra "+RUN_MODE=windows_service"
& $Nssm set pulse-agent AppEnvironmentExtra "+AGENT_PROFILE=windows-host"
if ($Token) {
  & $Nssm set pulse-agent AppEnvironmentExtra "+TOKEN=$Token"
}
& $Nssm set pulse-agent AppDirectory $AgentDir
& $Nssm set pulse-agent AppStdout $LogFile
& $Nssm set pulse-agent AppStderr $LogFile
${
	normalizedOptions.addFirewallRule
		? `
if (Get-Command New-NetFirewallRule -ErrorAction SilentlyContinue) {
  Remove-NetFirewallRule -DisplayName "Allow pulse-agent" -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName "Allow pulse-agent" -Direction Outbound -Action Allow -Program $AgentPath | Out-Null
}
`
		: ""
}
${
	normalizedOptions.startService
		? `Write-Host "Starting pulse-agent service..."
& $Nssm start pulse-agent
Start-Sleep -Seconds 3
$Status = & $Nssm status pulse-agent
if ($Status -ne "SERVICE_RUNNING") {
  Write-Host "pulse-agent did not start. Status: $Status" -ForegroundColor Red
  Write-Host "Log file: $LogFile" -ForegroundColor Yellow
  if (Test-Path $LogFile) { Get-Content $LogFile -Tail 40 }
  exit 1
}

Write-Host "pulse-agent is running." -ForegroundColor Green
Write-Host "Log file: $LogFile"
Write-Host "If the client stays offline, check the log for WebSocket 401 or pairing errors."
`
		: `Write-Host "pulse-agent service has been installed but not started."
Write-Host "Start it later with: nssm start pulse-agent"
`
}`
}

export function buildLinuxAgentCompose({
	token,
	agentHubURL,
	image = DEFAULT_LINUX_AGENT_IMAGE,
	version = AGENT_VERSION,
	includeHeader = false,
	dataDir = DEFAULT_LINUX_AGENT_DATA_DIR,
	title = getLinuxInstallDefaults("linux-generic").title,
	installOptions,
}: {
	token: string
	agentHubURL: string
	image?: string
	version?: string
	includeHeader?: boolean
	dataDir?: string
	title?: string
	installOptions?: LinuxAgentInstallOptions
}) {
	const options = normalizeLinuxAgentInstallOptions(installOptions)
	const header = includeHeader ? `# ${title} Agent ${version}，主动连接 Hub\n` : ""
	return `${header}${buildLinuxComposeService({
		image,
		dataDir,
		options,
		environment: [
			`TOKEN: "${token}"`,
			`HUB_URL: "${agentHubURL}"`,
			"INSTALL_METHOD: docker",
			"RUN_MODE: docker",
			"AGENT_PROFILE: linux-container",
		],
	})}`
}

export function buildLinuxAgentPairCompose({
	code,
	agentHubURL,
	image = DEFAULT_LINUX_AGENT_IMAGE,
	version = AGENT_VERSION,
	includeHeader = false,
	dataDir = DEFAULT_LINUX_AGENT_DATA_DIR,
	title = getLinuxInstallDefaults("linux-generic").title,
	installOptions,
}: {
	code: string
	agentHubURL: string
	image?: string
	version?: string
	includeHeader?: boolean
	dataDir?: string
	title?: string
	installOptions?: LinuxAgentInstallOptions
}) {
	const options = normalizeLinuxAgentInstallOptions(installOptions)
	const header = includeHeader ? `# ${title} Agent ${version}，首次启动时通过一次性配对码加入 Hub\n` : ""
	const pairCommand = `PAIR_MARKER=/var/lib/pulse-agent/paired.code
if [ ! -f "$$PAIR_MARKER" ] || ! grep -Fxq "$$PAIR_CODE" "$$PAIR_MARKER"; then
  rm -f /var/lib/pulse-agent/token /var/lib/pulse-agent/paired.env /var/lib/pulse-agent/pairing.json
  /agent pair --url "$$HUB_URL" --code "$$PAIR_CODE"
  printf "%s\n" "$$PAIR_CODE" > "$$PAIR_MARKER"
fi
exec /agent`
	const prelude = `    entrypoint:
      - /bin/sh
      - -lc
      - |
        ${pairCommand.replaceAll("\n", "\n        ")}`
	return `${header}${buildLinuxComposeService({
		image,
		dataDir,
		options,
		prelude,
		environment: [
			`HUB_URL: "${agentHubURL}"`,
			`PAIR_CODE: "${code}"`,
			"INSTALL_METHOD: docker",
			"RUN_MODE: docker",
			"AGENT_PROFILE: linux-container",
		],
	})}`
}

export function buildLinuxAgentPairDockerRun({
	code,
	agentHubURL,
	image = DEFAULT_LINUX_AGENT_IMAGE,
	version = AGENT_VERSION,
	dataDir = DEFAULT_LINUX_AGENT_DATA_DIR,
	title = `${getLinuxInstallDefaults("linux-generic").title} 直接安装`,
	installOptions,
}: {
	code: string
	agentHubURL: string
	image?: string
	version?: string
	dataDir?: string
	title?: string
	installOptions?: LinuxAgentInstallOptions
}) {
	const options = normalizeLinuxAgentInstallOptions(installOptions)
	const shellCommand = `PAIR_MARKER=/var/lib/pulse-agent/paired.code
if [ ! -f "$PAIR_MARKER" ] || ! grep -Fxq "$PAIR_CODE" "$PAIR_MARKER"; then
  rm -f /var/lib/pulse-agent/token /var/lib/pulse-agent/paired.env /var/lib/pulse-agent/pairing.json
  /agent pair --url "$HUB_URL" --code "$PAIR_CODE"
  printf "%s\n" "$PAIR_CODE" > "$PAIR_MARKER"
fi
exec /agent`
	const dockerArgs = buildDockerRunPermissionArgs(options)
	const dockerPrelude = `DOCKER_BIN="\${DOCKER_BIN:-docker}"
if ! $DOCKER_BIN info >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  DOCKER_BIN="sudo docker"
fi`
	return `# ${title} Agent ${version}
mkdir -p ${shellSingleQuotedString(dataDir)}
${dockerPrelude}
$DOCKER_BIN rm -f pulse-agent 2>/dev/null || true
$DOCKER_BIN run -d \\
  --name pulse-agent \\
  --restart unless-stopped \\
  --network host \\
  --privileged \\
${dockerArgs}${dockerArgs ? "" : ""}  -v ${shellSingleQuotedString(`${dataDir}:/var/lib/pulse-agent`)} \\
  -e HUB_URL=${shellSingleQuotedString(agentHubURL)} \\
  -e PAIR_CODE=${shellSingleQuotedString(code)} \\
  -e INSTALL_METHOD=docker \\
  -e RUN_MODE=docker \\
  -e AGENT_PROFILE=linux-container \\
  --entrypoint /bin/sh \\
  ${image} \\
  -lc ${shellSingleQuotedString(shellCommand)}`
}

export function buildUnraidAgentTemplate({
	token,
	code,
	agentHubURL,
	image = DEFAULT_LINUX_AGENT_IMAGE,
	version = AGENT_VERSION,
	dataDir = UNRAID_LINUX_AGENT_DATA_DIR,
	installOptions,
}: {
	token?: string
	code?: string
	agentHubURL: string
	image?: string
	version?: string
	dataDir?: string
	installOptions?: LinuxAgentInstallOptions
}) {
	const params = buildUnraidTemplateXmlParams({
		token,
		code,
		agentHubURL,
		image,
		version,
		dataDir,
		installOptions,
	})
	const xmlUrl = new URL(`/api/pulse/agent-install/unraid.xml?${params.toString()}`, agentHubURL).toString()
	return buildShellDownloadCommand(xmlUrl, "/boot/config/plugins/dockerMan/templates-user/pulse-agent-unraid.xml")
}

export function buildUnraidAgentTemplateXml({
	token,
	code,
	agentHubURL,
	image = DEFAULT_LINUX_AGENT_IMAGE,
	version = AGENT_VERSION,
	dataDir = UNRAID_LINUX_AGENT_DATA_DIR,
	installOptions,
}: {
	token?: string
	code?: string
	agentHubURL: string
	image?: string
	version?: string
	dataDir?: string
	installOptions?: LinuxAgentInstallOptions
}) {
	const options = normalizeLinuxAgentInstallOptions(installOptions)
	const isPairing = Boolean(code)
	const postArgs = isPairing
		? `-lc ${shellSingleQuotedString(
				`PAIR_MARKER=/var/lib/pulse-agent/paired.code
if [ ! -f "$PAIR_MARKER" ] || ! grep -Fxq ${shellSingleQuotedString(code || "")} "$PAIR_MARKER"; then
  rm -f /var/lib/pulse-agent/token /var/lib/pulse-agent/paired.env /var/lib/pulse-agent/pairing.json
  /agent pair --url ${shellSingleQuotedString(agentHubURL)} --code ${shellSingleQuotedString(code || "")}
  printf "%s\n" ${shellSingleQuotedString(code || "")} > "$PAIR_MARKER"
fi; exec /agent`
			)}`
		: ""
	const extraParams = [
		"--restart unless-stopped",
		options.includeDmi ? "--security-opt systempaths=unconfined" : "",
		options.includeGpu ? "--device /dev/dri:/dev/dri" : "",
		options.includeDmi ? "--device /dev/mem:/dev/mem" : "",
		options.includeGpu ? "--cap-add CAP_PERFMON" : "",
		options.includeDmi ? "--cap-add CAP_SYS_RAWIO" : "",
		isPairing ? "--entrypoint /bin/sh" : "",
	]
		.filter(Boolean)
		.join(" ")
	const dockerSocketConfig =
		options.dockerSocketMode === "none"
			? ""
			: `  <Config Name="Docker Socket" Target="/var/run/docker.sock" Default="/var/run/docker.sock" Mode="${options.dockerSocketMode}" Description="用于${options.dockerSocketMode === "rw" ? "监控并控制" : "只读监控"} Unraid 上的 Docker 容器。" Type="Path" Display="advanced" Required="true" Mask="false">/var/run/docker.sock</Config>\n`
	const hostRootConfig = options.includeHostRoot
		? `  <Config Name="Host Root" Target="/host" Default="/" Mode="ro" Description="只读挂载宿主机根目录，用于读取主机级指标。" Type="Path" Display="advanced" Required="true" Mask="false">/</Config>\n`
		: ""
	const dmiConfig = options.includeDmi
		? `  <Config Name="DMI" Target="/sys/firmware/dmi" Default="/sys/firmware/dmi" Mode="ro" Description="读取 SMBIOS / DMI 硬件信息。" Type="Path" Display="advanced" Required="false" Mask="false">/sys/firmware/dmi</Config>\n`
		: ""

	return `<?xml version="1.0"?>
<Container version="2">
  <Name>pulse-agent</Name>
  <Repository>${xmlEscape(image)}</Repository>
  <Registry>https://registry.example.com/harbor/projects/infra/repositories/pulse-agent</Registry>
  <Network>host</Network>
  <Privileged>true</Privileged>
  <Support/>
  <Project>Pulse</Project>
  <Overview>Pulse Agent ${xmlEscape(version)} for Unraid. It connects to Pulse Hub over WebSocket and collects host metrics, Docker containers, SMART and optional hardware information. Toggle Docker socket, host root, DMI and GPU mappings in the template before deployment.</Overview>
  <Category>Tools: System:</Category>
  <WebUI/>
  <TemplateURL/>
  <Icon/>
  <ExtraParams>${xmlEscape(extraParams)}</ExtraParams>
  <PostArgs>${xmlEscape(postArgs)}</PostArgs>
  <CPUset/>
  <Config Name="Agent Data" Target="/var/lib/pulse-agent" Default="${xmlEscape(dataDir)}" Mode="rw" Description="Pulse Agent 专用数据目录，用于保存配对凭据和本地状态。" Type="Path" Display="always" Required="true" Mask="false">${xmlEscape(dataDir)}</Config>
${dockerSocketConfig}${hostRootConfig}${dmiConfig}  <Config Name="HUB_URL" Target="HUB_URL" Default="${xmlEscape(agentHubURL)}" Mode="" Description="Pulse Hub 地址。" Type="Variable" Display="always" Required="true" Mask="false">${xmlEscape(agentHubURL)}</Config>
  ${
		isPairing
			? ""
			: `<Config Name="TOKEN" Target="TOKEN" Default="${xmlEscape(token || "<TOKEN>")}" Mode="" Description="Agent 接入 Token。" Type="Variable" Display="always" Required="true" Mask="true">${xmlEscape(token || "<TOKEN>")}</Config>`
	}
  <Config Name="INSTALL_METHOD" Target="INSTALL_METHOD" Default="docker" Mode="" Description="安装方式标识。" Type="Variable" Display="advanced" Required="true" Mask="false">docker</Config>
  <Config Name="RUN_MODE" Target="RUN_MODE" Default="docker" Mode="" Description="运行模式标识。" Type="Variable" Display="advanced" Required="true" Mask="false">docker</Config>
  <Config Name="AGENT_PROFILE" Target="AGENT_PROFILE" Default="linux-container" Mode="" Description="Agent 能力 profile。" Type="Variable" Display="advanced" Required="true" Mask="false">linux-container</Config>
</Container>`
}

function buildLinuxComposeService({
	image,
	dataDir,
	options,
	environment,
	prelude,
}: {
	image: string
	dataDir: string
	options: Required<LinuxAgentInstallOptions>
	environment: string[]
	prelude?: string
}) {
	const securityOpt = options.includeDmi
		? `    security_opt:
      # Docker 默认会屏蔽 /sys/firmware；放开后才能读取 DMI 内存条详情
      - systempaths=unconfined`
		: ""
	const volumeLines = [
		buildDockerSocketVolumeLine(options.dockerSocketMode),
		options.includeHostRoot ? "      - /:/host:ro" : "",
		options.includeDmi
			? `      # 读取 SMBIOS / DMI 硬件信息，用于内存条型号、容量、频率等详情采集
      - /sys/firmware/dmi:/sys/firmware/dmi:ro`
			: "",
		`      # Agent 专用数据目录，保存配对凭据和本地状态
      - ${dataDir}:/var/lib/pulse-agent`,
	].filter(Boolean)
	const deviceLines = [
		options.includeGpu
			? `      # Intel / AMD 核显基础指标采集需要把宿主机 GPU 设备交给容器
      - /dev/dri:/dev/dri`
			: "",
		options.includeDmi
			? `      # 部分 NAS 系统的 dmidecode 需要读取 /dev/mem 才能拿到内存条详情
      - /dev/mem:/dev/mem`
			: "",
	].filter(Boolean)
	const capLines = [
		options.includeGpu ? "      - CAP_PERFMON" : "",
		options.includeDmi ? "      - CAP_SYS_RAWIO" : "",
	].filter(Boolean)
	const sections = [
		"services:",
		"  pulse-agent:",
		`    image: ${image}`,
		"    container_name: pulse-agent",
		"    restart: unless-stopped",
		"    network_mode: host",
		"    privileged: true",
		prelude || "",
		securityOpt,
		"    volumes:",
		volumeLines.join("\n"),
		deviceLines.length ? `    devices:\n${deviceLines.join("\n")}` : "",
		capLines.length ? `    cap_add:\n${capLines.join("\n")}` : "",
		"    environment:",
		environment.map((line) => `      ${line}`).join("\n"),
	]
	return sections.filter(Boolean).join("\n")
}

function buildDockerRunPermissionArgs(options: Required<LinuxAgentInstallOptions>) {
	const lines = [
		options.includeDmi ? "  --security-opt systempaths=unconfined \\" : "",
		buildDockerSocketRunVolumeLine(options.dockerSocketMode),
		options.includeHostRoot ? "  -v /:/host:ro \\" : "",
		options.includeDmi ? "  -v /sys/firmware/dmi:/sys/firmware/dmi:ro \\" : "",
		options.includeGpu ? "  --device /dev/dri:/dev/dri \\" : "",
		options.includeDmi ? "  --device /dev/mem:/dev/mem \\" : "",
		options.includeGpu ? "  --cap-add CAP_PERFMON \\" : "",
		options.includeDmi ? "  --cap-add CAP_SYS_RAWIO \\" : "",
	].filter(Boolean)
	return lines.length ? `${lines.join("\n")}\n` : ""
}

function normalizeLinuxAgentInstallOptions(options?: LinuxAgentInstallOptions): Required<LinuxAgentInstallOptions> {
	return {
		...defaultLinuxAgentInstallOptions,
		...options,
	}
}

export function normalizeWindowsAgentInstallOptions(
	options?: WindowsAgentInstallOptions
): Required<WindowsAgentInstallOptions> {
	return {
		...DEFAULT_WINDOWS_AGENT_INSTALL_OPTIONS,
		...options,
	}
}

function buildWindowsInstallScriptParams({
	token,
	code,
	release,
	options,
}: {
	token?: string
	code?: string
	release: { version: string; url: string }
	options?: WindowsAgentInstallOptions
}) {
	const normalizedOptions = normalizeWindowsAgentInstallOptions(options)
	const params = new URLSearchParams()
	if (token) params.set("token", token)
	if (code) params.set("code", code)
	params.set("version", release.version)
	params.set("download_url", release.url)
	params.set("install_dir", normalizedOptions.installDir)
	params.set("data_dir", normalizedOptions.dataDir)
	params.set("log_dir", normalizedOptions.logDir)
	params.set("clean_data", boolParam(normalizedOptions.cleanData))
	params.set("install_nssm", boolParam(normalizedOptions.installNssm))
	params.set("start_service", boolParam(normalizedOptions.startService))
	params.set("add_firewall_rule", boolParam(normalizedOptions.addFirewallRule))
	return params
}

function boolParam(value: boolean) {
	return value ? "1" : "0"
}

function buildDockerSocketVolumeLine(mode: LinuxAgentDockerSocketMode) {
	if (mode === "none") {
		return ""
	}
	const modeLabel = mode === "rw" ? "监控并控制同机 Docker / Compose 容器" : "只读监控同机 Docker / Compose 容器"
	return `      # 用于${modeLabel}
      - /var/run/docker.sock:/var/run/docker.sock${mode === "ro" ? ":ro" : ""}`
}

function buildDockerSocketRunVolumeLine(mode: LinuxAgentDockerSocketMode) {
	if (mode === "none") {
		return ""
	}
	return `  -v /var/run/docker.sock:/var/run/docker.sock${mode === "ro" ? ":ro" : ""} \\`
}

function shellSingleQuotedString(value: string) {
	return `'${value.replaceAll("'", "'\"'\"'")}'`
}

function xmlEscape(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;")
}

function buildPowerShellInstallCommand(scriptUrl: string) {
	return `powershell -NoProfile -ExecutionPolicy Bypass -Command "irm ${powerShellSingleQuotedString(scriptUrl)} | iex"`
}

function buildShellDownloadCommand(url: string, targetPath: string) {
	return `mkdir -p "/boot/config/plugins/dockerMan/templates-user" && curl -fsSL '${url}' -o '${targetPath}'`
}

function buildUnraidTemplateXmlParams({
	token,
	code,
	agentHubURL,
	image,
	version,
	dataDir,
	installOptions,
}: {
	token?: string
	code?: string
	agentHubURL: string
	image: string
	version: string
	dataDir: string
	installOptions?: LinuxAgentInstallOptions
}) {
	const params = new URLSearchParams()
	if (token) params.set("token", token)
	if (code) params.set("code", code)
	params.set("hub_url", agentHubURL)
	params.set("image", image)
	params.set("version", version)
	params.set("data_dir", dataDir)
	const options = normalizeLinuxAgentInstallOptions(installOptions)
	params.set("docker_socket_mode", options.dockerSocketMode)
	params.set("include_host_root", boolParam(options.includeHostRoot))
	params.set("include_dmi", boolParam(options.includeDmi))
	params.set("include_gpu", boolParam(options.includeGpu))
	return params
}

function powerShellSingleQuotedString(value: string) {
	return `'${value.replaceAll("'", "''")}'`
}

function windowsPowerShellPathValue(value: string) {
	if (value.startsWith("$env:")) {
		return `"${value.replaceAll('"', '`"')}"`
	}
	return powerShellSingleQuotedString(value)
}
