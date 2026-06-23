package hub

import (
	"encoding/json"
	"net"
	"net/url"
	"strings"

	"gutenacht.site/pulse"
	"gutenacht.site/pulse/internal/hub/utils"
)

// PublicAppInfo defines the structure of the public app information that will be injected into the HTML
type PublicAppInfo struct {
	BASE_PATH           string
	HUB_VERSION         string
	HUB_URL             string
	AGENT_HUB_URL       string
	BUILD_COMMIT        string `json:",omitempty"`
	BUILD_TIME          string `json:",omitempty"`
	OAUTH_DISABLE_POPUP bool   `json:"OAUTH_DISABLE_POPUP,omitempty"`
}

// modifyIndexHTML injects the public app information into the index.html content
func modifyIndexHTML(hub *Hub, html []byte) string {
	info := getPublicAppInfo(hub)
	content, err := json.Marshal(info)
	if err != nil {
		return string(html)
	}
	htmlContent := strings.ReplaceAll(string(html), "./", info.BASE_PATH)
	return strings.Replace(htmlContent, "\"{info}\"", string(content), 1)
}

func getPublicAppInfo(hub *Hub) PublicAppInfo {
	hubURL := firstNonEmptyString(hub.appURL, hub.Settings().Meta.AppURL, "http://localhost:8090")
	parsedURL, _ := url.Parse(hubURL)
	info := PublicAppInfo{
		BASE_PATH:     strings.TrimSuffix(parsedURL.Path, "/") + "/",
		HUB_VERSION:   pulse.Version,
		HUB_URL:       hubURL,
		AGENT_HUB_URL: getAgentHubURL(hubURL),
		BUILD_COMMIT:  strings.TrimSpace(pulse.BuildCommit),
		BUILD_TIME:    strings.TrimSpace(pulse.BuildTime),
	}
	if val, _ := utils.GetEnv("OAUTH_DISABLE_POPUP"); val == "true" {
		info.OAUTH_DISABLE_POPUP = true
	}
	return info
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func getAgentHubURL(appURL string) string {
	if agentHubURL, isSet := utils.GetEnv("AGENT_HUB_URL"); isSet && strings.TrimSpace(agentHubURL) != "" {
		return strings.TrimRight(strings.TrimSpace(agentHubURL), "/")
	}

	parsedURL, err := url.Parse(appURL)
	if err != nil || parsedURL.Hostname() == "" {
		return strings.TrimRight(appURL, "/")
	}
	if !isLocalHostname(parsedURL.Hostname()) {
		return strings.TrimRight(appURL, "/")
	}
	if localIP := defaultOutboundIPv4(); localIP != "" {
		port := parsedURL.Port()
		if port != "" {
			parsedURL.Host = net.JoinHostPort(localIP, port)
		} else {
			parsedURL.Host = localIP
		}
		return strings.TrimRight(parsedURL.String(), "/")
	}
	return strings.TrimRight(appURL, "/")
}

func isLocalHostname(hostname string) bool {
	host := strings.ToLower(strings.Trim(hostname, "[]"))
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func defaultOutboundIPv4() string {
	conn, err := net.Dial("udp4", "8.8.8.8:80")
	if err == nil {
		defer conn.Close()
		if udpAddr, ok := conn.LocalAddr().(*net.UDPAddr); ok && udpAddr.IP != nil && !udpAddr.IP.IsLoopback() {
			return udpAddr.IP.String()
		}
	}

	interfaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range interfaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		name := strings.ToLower(iface.Name)
		if strings.Contains(name, "docker") || strings.Contains(name, "veth") || strings.Contains(name, "wsl") {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			ip, _, err := net.ParseCIDR(addr.String())
			if err != nil {
				continue
			}
			if ip4 := ip.To4(); ip4 != nil && !ip4.IsLoopback() && !ip4.IsLinkLocalUnicast() {
				return ip4.String()
			}
		}
	}
	return ""
}
