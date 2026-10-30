package hub

import (
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

// 账户密码修改（所有登录用户自助）：
//   - 普通用户：只更新自己的登录密码（需验证当前密码）。
//   - 管理员：登录密码与同邮箱 superuser 后台密码保持一套，事务内同步更新，
//     两处永远一致（产品决策 2026-10-03：不维护两套密码）。
type accountPasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (h *Hub) changeAccountPassword(e *core.RequestEvent) error {
	if h.loginLimiter == nil {
		h.loginLimiter = newLoginFailureLimiter()
	}
	key := "pw|" + e.Auth.Id + "|" + getRealIP(e.Request)
	if retryAfter, limited := h.loginLimiter.retryAfter(key); limited {
		e.Response.Header().Set("Retry-After", retryAfterHeaderValue(retryAfter))
		return e.TooManyRequestsError("尝试次数过多，请稍后再试。", nil)
	}

	var req accountPasswordRequest
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("请求格式无效", err)
	}
	if strings.TrimSpace(req.CurrentPassword) == "" || strings.TrimSpace(req.NewPassword) == "" {
		return e.BadRequestError("当前密码与新密码都不能为空。", nil)
	}

	// verify current password against the logged-in account
	if !e.Auth.ValidatePassword(req.CurrentPassword) {
		h.loginLimiter.recordFailure(key)
		h.createOperationAuditForUser(e, e.Auth.Id, "", "change_account_password", e.Auth.GetString("email"), "", "failed", "当前密码不正确", operationFailureDenied)
		return e.BadRequestError("当前密码不正确。", nil)
	}

	isAdmin := e.Auth.GetString("role") == "admin"
	err := h.RunInTransaction(func(txApp core.App) error {
		e.Auth.SetPassword(req.NewPassword)
		if err := txApp.Save(e.Auth); err != nil {
			return err
		}
		if !isAdmin {
			return nil
		}
		// keep the same-email superuser record in sync (one password for both doors)
		superusers, err := txApp.FindAllRecords(core.CollectionNameSuperusers)
		if err != nil {
			return err
		}
		for _, superuser := range superusers {
			if strings.EqualFold(superuser.GetString("email"), e.Auth.GetString("email")) {
				superuser.SetPassword(req.NewPassword)
				if err := txApp.Save(superuser); err != nil {
					return err
				}
				break
			}
		}
		return nil
	})
	if err != nil {
		h.createOperationAuditForUser(e, e.Auth.Id, "", "change_account_password", e.Auth.GetString("email"), "", "failed", "新密码不符合要求", operationFailureInvalidRequest)
		return e.BadRequestError("密码修改失败：新密码不符合要求（至少 8 位）。", err)
	}

	h.loginLimiter.clear(key)
	detail := "登录密码已修改"
	if isAdmin {
		detail = "登录密码已修改（后台密码同步更新）"
	}
	h.createOperationAuditForUser(e, e.Auth.Id, "", "change_account_password", e.Auth.GetString("email"), "", "success", detail)
	return e.JSON(http.StatusOK, map[string]string{"msg": "密码已更新"})
}
