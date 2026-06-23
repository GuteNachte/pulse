package hub

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse"
)

type linuxAgentInstallOptions struct {
	DockerSocketMode string
	IncludeHostRoot  bool
	IncludeDMI       bool
	IncludeGPU       bool
}

func (h *Hub) downloadUnraidAgentTemplateXml(e *core.RequestEvent) error {
	token := strings.TrimSpace(e.Request.URL.Query().Get("token"))
	code := strings.TrimSpace(e.Request.URL.Query().Get("code"))
	hubURL := strings.TrimRight(strings.TrimSpace(e.Request.URL.Query().Get("hub_url")), "/")
	image := strings.TrimSpace(e.Request.URL.Query().Get("image"))
	version := strings.TrimSpace(e.Request.URL.Query().Get("version"))
	dataDir := strings.TrimSpace(e.Request.URL.Query().Get("data_dir"))
	options := linuxAgentInstallOptions{
		DockerSocketMode: queryStringDefault(e.Request.URL.Query().Get("docker_socket_mode"), "rw"),
		IncludeHostRoot:  queryBoolDefault(e.Request.URL.Query().Get("include_host_root"), true),
		IncludeDMI:       queryBoolDefault(e.Request.URL.Query().Get("include_dmi"), true),
		IncludeGPU:       queryBoolDefault(e.Request.URL.Query().Get("include_gpu"), true),
	}
	if version == "" {
		version = pulse.Version
	}
	if hubURL == "" {
		hubURL = strings.TrimRight(getHubURLFromRequest(e.Request), "/")
	}
	if image == "" {
		image = fmt.Sprintf("%s/api/pulse/agent-releases/%s/pulse-agent_linux_amd64", hubURL, version)
	}
	if dataDir == "" {
		dataDir = "/mnt/user/appdata/pulse-agent"
	}
	if token == "" && code == "" {
		return e.BadRequestError("token or code is required", nil)
	}
	if !isInstallerValueSafe(token) ||
		!isInstallerValueSafe(code) ||
		!isInstallerValueSafe(hubURL) ||
		!isInstallerValueSafe(image) ||
		!isInstallerValueSafe(version) ||
		!isInstallerValueSafe(dataDir) {
		return e.BadRequestError("installer parameter is invalid", nil)
	}

	e.Response.Header().Set("Cache-Control", "no-store")
	return e.String(http.StatusOK, buildUnraidAgentTemplateXml(token, code, hubURL, image, version, dataDir, options))
}

func buildUnraidAgentTemplateXml(token string, code string, hubURL string, image string, version string, dataDir string, options linuxAgentInstallOptions) string {
	if dataDir == "" {
		dataDir = "/mnt/user/appdata/pulse-agent"
	}
	extraParams := []string{"--restart unless-stopped"}
	if options.IncludeDMI {
		extraParams = append(extraParams, "--security-opt systempaths=unconfined", "--device /dev/mem:/dev/mem", "--cap-add CAP_SYS_RAWIO")
	}
	if options.IncludeGPU {
		extraParams = append(extraParams, "--device /dev/dri:/dev/dri", "--cap-add CAP_PERFMON")
	}
	isPairing := strings.TrimSpace(code) != ""
	if isPairing {
		extraParams = append(extraParams, "--entrypoint /bin/sh")
	}
	postArgs := ""
	if isPairing {
		postArgs = `-lc 'PAIR_MARKER=/var/lib/pulse-agent/paired.code; if [ ! -f "$PAIR_MARKER" ] || ! grep -Fxq "$PAIR_CODE" "$PAIR_MARKER"; then rm -f /var/lib/pulse-agent/token /var/lib/pulse-agent/paired.env /var/lib/pulse-agent/pairing.json; /agent pair --url "$HUB_URL" --code "$PAIR_CODE"; printf "%s\n" "$PAIR_CODE" > "$PAIR_MARKER"; fi; exec /agent'`
	}
	tokenConfig := ""
	pairCodeConfig := ""
	if !isPairing {
		if token == "" {
			token = "<TOKEN>"
		}
		tokenConfig = fmt.Sprintf(`  <Config Name="TOKEN" Target="TOKEN" Default="%s" Mode="" Description="Agent 接入 Token。" Type="Variable" Display="always" Required="true" Mask="true">%s</Config>
`, xmlEscape(token), xmlEscape(token))
	} else {
		if code == "" {
			code = "<PAIR_CODE>"
		}
		pairCodeConfig = fmt.Sprintf(`  <Config Name="PAIR_CODE" Target="PAIR_CODE" Default="%s" Mode="" Description="一次性配对码。" Type="Variable" Display="always" Required="true" Mask="true">%s</Config>
`, xmlEscape(code), xmlEscape(code))
	}
	dockerSocketConfig := ""
	if options.DockerSocketMode != "none" {
		mode := options.DockerSocketMode
		desc := "只读监控"
		if mode == "rw" {
			desc = "监控并控制"
		}
		dockerSocketConfig = fmt.Sprintf(`  <Config Name="Docker Socket" Target="/var/run/docker.sock" Default="/var/run/docker.sock" Mode="%s" Description="用于%s Unraid 上的 Docker 容器。" Type="Path" Display="advanced" Required="true" Mask="false">/var/run/docker.sock</Config>
`, xmlEscape(mode), desc)
	}
	hostRootConfig := ""
	if options.IncludeHostRoot {
		hostRootConfig = `  <Config Name="Host Root" Target="/host" Default="/" Mode="ro" Description="只读挂载宿主机根目录，用于读取主机级指标。" Type="Path" Display="advanced" Required="true" Mask="false">/</Config>
`
	}
	dmiConfig := ""
	if options.IncludeDMI {
		dmiConfig = `  <Config Name="DMI" Target="/sys/firmware/dmi" Default="/sys/firmware/dmi" Mode="ro" Description="读取 SMBIOS / DMI 硬件信息。" Type="Path" Display="advanced" Required="false" Mask="false">/sys/firmware/dmi</Config>
`
	}
	return fmt.Sprintf(`<?xml version="1.0"?>
<Container version="2">
  <Name>pulse-agent</Name>
  <Repository>%s</Repository>
  <Registry>https://registry.example.com/harbor/projects/infra/repositories/pulse-agent</Registry>
  <Network>host</Network>
  <Privileged>true</Privileged>
  <Support/>
  <Project>Pulse</Project>
  <Overview>Pulse Agent %s for Unraid. It connects to Pulse Hub over WebSocket and collects host metrics, Docker containers, SMART and optional hardware information. Toggle Docker socket, host root, DMI and GPU mappings in the template before deployment.</Overview>
  <Category>Tools: System:</Category>
  <WebUI/>
  <TemplateURL/>
  <Icon/>
  <ExtraParams>%s</ExtraParams>
  <PostArgs>%s</PostArgs>
  <CPUset/>
  <Config Name="Agent Data" Target="/var/lib/pulse-agent" Default="%s" Mode="rw" Description="Pulse Agent 专用数据目录，用于保存配对凭据和本地状态。" Type="Path" Display="always" Required="true" Mask="false">%s</Config>
%s%s%s  <Config Name="HUB_URL" Target="HUB_URL" Default="%s" Mode="" Description="Pulse Hub 地址。" Type="Variable" Display="always" Required="true" Mask="false">%s</Config>
%s%s  <Config Name="INSTALL_METHOD" Target="INSTALL_METHOD" Default="docker" Mode="" Description="安装方式标识。" Type="Variable" Display="advanced" Required="true" Mask="false">docker</Config>
  <Config Name="RUN_MODE" Target="RUN_MODE" Default="docker" Mode="" Description="运行模式标识。" Type="Variable" Display="advanced" Required="true" Mask="false">docker</Config>
  <Config Name="AGENT_PROFILE" Target="AGENT_PROFILE" Default="linux-container" Mode="" Description="Agent 能力 profile。" Type="Variable" Display="advanced" Required="true" Mask="false">linux-container</Config>
</Container>`,
		xmlEscape(image),
		xmlEscape(version),
		xmlEscape(strings.Join(extraParams, " ")),
		xmlEscape(postArgs),
		xmlEscape(dataDir),
		xmlEscape(dataDir),
		dockerSocketConfig,
		hostRootConfig,
		dmiConfig,
		xmlEscape(hubURL),
		xmlEscape(hubURL),
		pairCodeConfig,
		tokenConfig,
	)
}

func queryStringDefault(value string, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func queryBoolDefault(value string, fallback bool) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func isInstallerValueSafe(value string) bool {
	return !strings.ContainsAny(value, "\x00\r\n")
}

func xmlEscape(value string) string {
	return strings.NewReplacer(
		"&", "&amp;",
		"<", "&lt;",
		">", "&gt;",
		`"`, "&quot;",
		"'", "&apos;",
	).Replace(value)
}
