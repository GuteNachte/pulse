package hub

import (
	"fmt"
	"net/http"
	"os"
	"sort"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"gutenacht.site/pulse"
	"gutenacht.site/pulse/internal/entities/system"
	"gutenacht.site/pulse/internal/hub/utils"
)

func getHubURLFromRequest(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return proto + "://" + host
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// getInfo returns data needed by authenticated users, such as the current hub version.
func (h *Hub) getInfo(e *core.RequestEvent) error {
	type infoResponse struct {
		Version             string                `json:"v"`
		CheckUpdate         bool                  `json:"cu"`
		AgentHubURL         string                `json:"agent_hub_url"`
		Environment         string                `json:"environment"`
		BuildCommit         string                `json:"build_commit,omitempty"`
		BuildTime           string                `json:"build_time,omitempty"`
		AgentTargetVersion  string                `json:"agent_target_version,omitempty"`
		AgentActualVersions []agentVersionSummary `json:"agent_actual_versions,omitempty"`
		AgentTotalSystems   int                   `json:"agent_total_systems,omitempty"`
		AgentOnlineSystems  int                   `json:"agent_online_systems,omitempty"`
		// 2026-10-30 公开部署：镜像仓库由各部署实例自配，通过环境变量下发给前端安装命令。
		AgentImage string           `json:"agent_image,omitempty"`
		Readiness  []readinessCheck `json:"readiness,omitempty"`
	}
	info := infoResponse{
		Version:     pulse.Version,
		AgentHubURL: getAgentHubURL(firstNonEmptyString(h.appURL, h.Settings().Meta.AppURL, getHubURLFromRequest(e.Request))),
		Environment: hubRuntimeEnvironment(),
		BuildCommit: strings.TrimSpace(pulse.BuildCommit),
		BuildTime:   strings.TrimSpace(pulse.BuildTime),
		AgentImage:  strings.TrimSpace(os.Getenv("PULSE_AGENT_IMAGE")),
	}
	if e.Auth != nil {
		agentInfo := h.buildAgentVersionInfo(e.Auth)
		info.AgentTargetVersion = agentInfo.TargetVersion
		info.AgentActualVersions = agentInfo.ActualVersions
		info.AgentTotalSystems = agentInfo.TotalSystems
		info.AgentOnlineSystems = agentInfo.OnlineSystems
	}
	if e.Auth != nil && (e.Auth.IsSuperuser() || e.Auth.GetString("role") == "admin") {
		info.Readiness = h.buildReadinessChecks()
	}
	return e.JSON(http.StatusOK, info)
}

type agentVersionInfo struct {
	TargetVersion  string
	ActualVersions []agentVersionSummary
	TotalSystems   int
	OnlineSystems  int
}

type agentVersionSummary struct {
	Version string `json:"version"`
	Count   int    `json:"count"`
	Online  int    `json:"online"`
}

func hubRuntimeEnvironment() string {
	if isDevelopmentBuild() {
		return "development"
	}
	return "production"
}

func (h *Hub) buildAgentVersionInfo(auth *core.Record) agentVersionInfo {
	actual, total, online := h.summarizeActualAgentVersions(auth)
	return agentVersionInfo{
		TargetVersion:  h.latestEnabledAgentVersion(),
		ActualVersions: actual,
		TotalSystems:   total,
		OnlineSystems:  online,
	}
}

func (h *Hub) latestEnabledAgentVersion() string {
	records, err := h.FindRecordsByFilter("agent_releases", "enabled = true", "", -1, 0)
	if err != nil || len(records) == 0 {
		return pulse.Version
	}
	latest := ""
	for _, record := range records {
		version := strings.TrimSpace(record.GetString("version"))
		if version == "" {
			continue
		}
		if latest == "" || compareAgentReleaseVersions(version, latest) > 0 {
			latest = version
		}
	}
	if latest == "" {
		return pulse.Version
	}
	if compareAgentReleaseVersions(latest, pulse.Version) < 0 {
		return pulse.Version
	}
	return latest
}

func (h *Hub) summarizeActualAgentVersions(auth *core.Record) ([]agentVersionSummary, int, int) {
	filter := "(pairing_confirmed = true || is_local = true)"
	params := dbx.Params{}
	if auth != nil && !auth.IsSuperuser() && auth.GetString("role") != "admin" {
		filter += " && users ~ {:userId}"
		params["userId"] = auth.Id
	}
	records, err := h.FindRecordsByFilter("systems", filter, "", -1, 0, params)
	if err != nil || len(records) == 0 {
		return nil, 0, 0
	}

	byVersion := make(map[string]*agentVersionSummary)
	online := 0
	for _, record := range records {
		version := systemAgentVersion(record)
		if version == "" {
			version = "未上报"
		}
		summary := byVersion[version]
		if summary == nil {
			summary = &agentVersionSummary{Version: version}
			byVersion[version] = summary
		}
		summary.Count++
		if record.GetString("status") == "up" {
			summary.Online++
			online++
		}
	}

	items := make([]agentVersionSummary, 0, len(byVersion))
	for _, summary := range byVersion {
		items = append(items, *summary)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Version == "未上报" {
			return false
		}
		if items[j].Version == "未上报" {
			return true
		}
		return compareAgentReleaseVersions(items[i].Version, items[j].Version) > 0
	})
	return items, len(records), online
}

func systemAgentVersion(record *core.Record) string {
	var info system.Info
	if err := record.UnmarshalJSONField("info", &info); err != nil {
		return strings.TrimSpace(record.GetString("v"))
	}
	if info.Capabilities != nil {
		if version := strings.TrimSpace(info.Capabilities.AgentVersion); version != "" {
			return version
		}
	}
	if version := strings.TrimSpace(info.AgentVersion); version != "" {
		return version
	}
	return strings.TrimSpace(record.GetString("v"))
}

type readinessCheck struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

func (h *Hub) buildReadinessChecks() []readinessCheck {
	checks := make([]readinessCheck, 0, 9)

	if value := trimmedEnv("AUTO_LOGIN"); value != "" {
		checks = append(checks, readinessCheck{
			ID:     "auto_login",
			Title:  "自动登录",
			Status: "danger",
			Detail: "AUTO_LOGIN 已启用，生产环境会绕过正常登录入口。发布前应关闭。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "auto_login",
			Title:  "自动登录",
			Status: "ok",
			Detail: "未启用 AUTO_LOGIN。",
		})
	}

	if value := trimmedEnv("TRUSTED_AUTH_HEADER"); value != "" {
		checks = append(checks, readinessCheck{
			ID:     "trusted_auth_header",
			Title:  "可信请求头登录",
			Status: "danger",
			Detail: "TRUSTED_AUTH_HEADER 已启用，必须确认反向代理会清理外部同名请求头；自用部署建议关闭。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "trusted_auth_header",
			Title:  "可信请求头登录",
			Status: "ok",
			Detail: "未启用 TRUSTED_AUTH_HEADER。",
		})
	}

	if isDevelopmentBuild() {
		checks = append(checks, readinessCheck{
			ID:     "development_build",
			Title:  "开发构建",
			Status: "warning",
			Detail: "当前 Hub 使用 development 构建标签，会代理 Vite 开发服务；正式部署必须使用生产构建。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "development_build",
			Title:  "开发构建",
			Status: "ok",
			Detail: "当前 Hub 是生产构建。",
		})
	}

	if devLocalAgentAsHubEnabled() {
		checks = append(checks, readinessCheck{
			ID:     "dev_local_agent_as_hub",
			Title:  "开发本机 Agent 标记",
			Status: "warning",
			Detail: "PULSE_DEV_LOCAL_AGENT_AS_HUB 已启用，只应在源码开发环境使用，正式部署应关闭。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "dev_local_agent_as_hub",
			Title:  "开发本机 Agent 标记",
			Status: "ok",
			Detail: "未启用开发本机 Agent 标记。",
		})
	}

	switch value := strings.ToLower(trimmedEnv("MFA_OTP")); value {
	case "true":
		checks = append(checks, readinessCheck{
			ID:     "mfa",
			Title:  "账号二次验证",
			Status: "ok",
			Detail: "MFA_OTP 已对用户和超级用户启用。",
		})
	case "superusers":
		checks = append(checks, readinessCheck{
			ID:     "mfa",
			Title:  "账号二次验证",
			Status: "warning",
			Detail: "MFA_OTP 只对超级用户启用，普通用户登录没有二次验证。",
		})
	default:
		checks = append(checks, readinessCheck{
			ID:     "mfa",
			Title:  "账号二次验证",
			Status: "warning",
			Detail: "MFA_OTP 未启用；上线前建议启用邮箱验证码二次验证。",
		})
	}

	if strings.EqualFold(trimmedEnv("DISABLE_PASSWORD_AUTH"), "true") {
		checks = append(checks, readinessCheck{
			ID:     "password_auth",
			Title:  "密码登录",
			Status: "warning",
			Detail: "DISABLE_PASSWORD_AUTH 已启用；确认已有可靠替代登录方式，否则普通账号会无法登录。",
		})
	} else {
		checks = append(checks, readinessCheck{
			ID:     "password_auth",
			Title:  "密码登录",
			Status: "ok",
			Detail: "密码登录可用。",
		})
	}

	checks = append(checks, localAgentTokenReadinessCheck())
	checks = append(checks, h.localHubIdentityReadinessCheck())
	checks = append(checks, readinessCheck{
		ID:     "version_consistency",
		Title:  "版本一致性",
		Status: "unknown",
		Detail: fmt.Sprintf("运行时已确认 Hub 版本为 %s；Web、Agent、Android、Compose 和文档一致性需在发布前通过 check-version-consistency.ps1 校验。", pulse.Version),
	})

	return checks
}

func trimmedEnv(name string) string {
	value, _ := utils.GetEnv(name)
	return strings.TrimSpace(value)
}

func localAgentTokenReadinessCheck() readinessCheck {
	if strings.TrimSpace(localAgentToken()) == defaultLocalAgentToken {
		return readinessCheck{
			ID:     "local_agent_token",
			Title:  "Hub 同机 Agent Token",
			Status: "warning",
			Detail: "正在使用默认本机 Agent Token；生产环境建议设置 PULSE_LOCAL_AGENT_TOKEN，避免沿用公开默认值。",
		}
	}
	return readinessCheck{
		ID:     "local_agent_token",
		Title:  "Hub 同机 Agent Token",
		Status: "ok",
		Detail: "已配置非默认本机 Agent Token。",
	}
}

func (h *Hub) localHubIdentityReadinessCheck() readinessCheck {
	records, err := h.FindRecordsByFilter("systems", "is_local = true", "", 2, 0)
	if err != nil {
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "unknown",
			Detail: "无法读取 Hub 机器标记，请检查 systems 集合迁移和数据库状态。",
		}
	}
	switch len(records) {
	case 0:
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "warning",
			Detail: "当前没有 is_local=true 的 Hub 机器；标准 Hub + Agent 同机部署上线后应自动出现一台带 Hub 标签的真实机器。",
		}
	case 1:
		record := records[0]
		name := strings.TrimSpace(record.GetString("name"))
		if name == "" {
			name = record.Id
		}
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "ok",
			Detail: fmt.Sprintf("当前 Hub 机器为 %s。", name),
		}
	default:
		return readinessCheck{
			ID:     "hub_identity",
			Title:  "Hub 机器身份",
			Status: "danger",
			Detail: "检测到多台 is_local=true 的机器，存在 Hub 标签误标风险；需要修复身份标记后再发布。",
		}
	}
}
