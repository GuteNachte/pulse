package hub

import (
	"context"
	"fmt"
	"net/http"
	"net/mail"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

type appUserRecord struct {
	Id       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Created  string `json:"created"`
	Updated  string `json:"updated"`
}

type appBackupRecord struct {
	Key      string `json:"key"`
	Size     int64  `json:"size"`
	Modified string `json:"modified"`
}

type createAppUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

type updateAppUserRequest struct {
	Username *string `json:"username"`
	Email    *string `json:"email"`
	Role     *string `json:"role"`
}

type resetAppUserPasswordRequest struct {
	Password string `json:"password"`
}

type createBackupRequest struct {
	Name string `json:"name"`
}

var backupNamePattern = regexp.MustCompile(`^[a-z0-9_-]+\.zip$`)
var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_.-]{3,32}$`)
var validAppUserRoles = map[string]bool{
	"admin":    true,
	"user":     true,
	"readonly": true,
}

func (h *Hub) listAppUsers(e *core.RequestEvent) error {
	records, err := e.App.FindAllRecords("users")
	if err != nil {
		return e.InternalServerError("Failed to load users", err)
	}

	users := make([]appUserRecord, 0, len(records))
	for _, record := range records {
		users = append(users, appUserRecord{
			Id:       record.Id,
			Username: record.GetString("username"),
			Email:    record.GetString("email"),
			Role:     record.GetString("role"),
			Created:  record.GetDateTime("created").String(),
			Updated:  record.GetDateTime("updated").String(),
		})
	}
	sort.Slice(users, func(i, j int) bool {
		return strings.ToLower(users[i].Username) < strings.ToLower(users[j].Username)
	})

	return e.JSON(http.StatusOK, map[string]any{"items": users})
}

func (h *Hub) createAppUser(e *core.RequestEvent) error {
	var req createAppUserRequest
	if err := e.BindBody(&req); err != nil {
		h.createOperationAudit(e, "", "create_user", "", "", "failed", "Invalid user request", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid user request", err)
	}
	username := normalizeUsername(req.Username)
	email := normalizeEmail(req.Email)
	role := normalizeAppUserRole(req.Role)
	target := firstNonEmpty(email, username)
	if username == "" || email == "" || strings.TrimSpace(req.Password) == "" {
		h.createOperationAudit(e, "", "create_user", target, "", "failed", "Username, email and password are required", operationFailureInvalidRequest)
		return e.BadRequestError("Username, email and password are required", nil)
	}
	if !usernamePattern.MatchString(username) {
		h.createOperationAudit(e, "", "create_user", target, "", "failed", "Username is invalid", operationFailureInvalidRequest)
		return e.BadRequestError("Username must be 3-32 characters and use letters, numbers, _.-", nil)
	}
	if !isValidEmail(email) {
		h.createOperationAudit(e, "", "create_user", target, "", "failed", "Invalid email address", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid email address", nil)
	}
	if len(req.Password) < 8 {
		h.createOperationAudit(e, "", "create_user", target, "", "failed", "Password is too short", operationFailureInvalidRequest)
		return e.BadRequestError("Password must be at least 8 characters", nil)
	}
	if !validAppUserRoles[role] {
		h.createOperationAudit(e, "", "create_user", target, "", "failed", "Invalid role", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid role", nil)
	}

	collection, err := h.FindCachedCollectionByNameOrId("users")
	if err != nil {
		return e.InternalServerError("Failed to load users collection", err)
	}
	record := core.NewRecord(collection)
	record.Set("username", username)
	record.SetEmail(email)
	record.SetPassword(req.Password)
	record.Set("role", role)
	record.Set("verified", true)
	if err := h.Save(record); err != nil {
		h.createOperationAudit(e, "", "create_user", target, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to create user", err)
	}
	h.createOperationAudit(e, "", "create_user", target, "", "success", "用户已创建")
	return e.JSON(http.StatusOK, map[string]any{"item": appUserFromRecord(record)})
}

func (h *Hub) updateAppUser(e *core.RequestEvent) error {
	record, err := h.FindRecordById("users", strings.TrimSpace(e.Request.PathValue("id")))
	if err != nil {
		return e.NotFoundError("User not found", err)
	}
	target := firstNonEmpty(record.GetString("email"), record.GetString("username"), record.Id)
	var req updateAppUserRequest
	if err := e.BindBody(&req); err != nil {
		h.createOperationAudit(e, "", "update_user", target, "", "failed", "Invalid user request", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid user request", err)
	}

	if req.Username != nil {
		username := normalizeUsername(*req.Username)
		if !usernamePattern.MatchString(username) {
			h.createOperationAudit(e, "", "update_user", target, "", "failed", "Username is invalid", operationFailureInvalidRequest)
			return e.BadRequestError("Username must be 3-32 characters and use letters, numbers, _.-", nil)
		}
		record.Set("username", username)
	}
	if req.Email != nil {
		email := normalizeEmail(*req.Email)
		if !isValidEmail(email) {
			h.createOperationAudit(e, "", "update_user", target, "", "failed", "Invalid email address", operationFailureInvalidRequest)
			return e.BadRequestError("Invalid email address", nil)
		}
		record.SetEmail(email)
	}
	if req.Role != nil {
		role := normalizeAppUserRole(*req.Role)
		if !validAppUserRoles[role] {
			h.createOperationAudit(e, "", "update_user", target, "", "failed", "Invalid role", operationFailureInvalidRequest)
			return e.BadRequestError("Invalid role", nil)
		}
		if record.GetString("role") == "admin" && role != "admin" {
			if err := h.ensureAnotherAdmin(record.Id); err != nil {
				h.createOperationAudit(e, "", "update_user", target, "", "failed", err.Error(), operationFailureDenied)
				return e.BadRequestError(err.Error(), err)
			}
		}
		record.Set("role", role)
	}
	record.Set("verified", true)

	if err := h.Save(record); err != nil {
		h.createOperationAudit(e, "", "update_user", target, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to update user", err)
	}
	h.createOperationAudit(e, "", "update_user", firstNonEmpty(record.GetString("email"), record.GetString("username"), record.Id), "", "success", "用户已更新")
	return e.JSON(http.StatusOK, map[string]any{"item": appUserFromRecord(record)})
}

func (h *Hub) resetAppUserPassword(e *core.RequestEvent) error {
	record, err := h.FindRecordById("users", strings.TrimSpace(e.Request.PathValue("id")))
	if err != nil {
		return e.NotFoundError("User not found", err)
	}
	target := firstNonEmpty(record.GetString("email"), record.GetString("username"), record.Id)
	var req resetAppUserPasswordRequest
	if err := e.BindBody(&req); err != nil {
		h.createOperationAudit(e, "", "reset_user_password", target, "", "failed", "Invalid password request", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid password request", err)
	}
	if len(req.Password) < 8 {
		h.createOperationAudit(e, "", "reset_user_password", target, "", "failed", "Password is too short", operationFailureInvalidRequest)
		return e.BadRequestError("Password must be at least 8 characters", nil)
	}
	record.SetPassword(req.Password)
	if err := h.Save(record); err != nil {
		h.createOperationAudit(e, "", "reset_user_password", target, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to reset password", err)
	}
	h.createOperationAudit(e, "", "reset_user_password", target, "", "success", "用户密码已重置")
	return e.JSON(http.StatusOK, map[string]any{"item": appUserFromRecord(record)})
}

func (h *Hub) deleteAppUser(e *core.RequestEvent) error {
	record, err := h.FindRecordById("users", strings.TrimSpace(e.Request.PathValue("id")))
	if err != nil {
		return e.NotFoundError("User not found", err)
	}
	target := firstNonEmpty(record.GetString("email"), record.GetString("username"), record.Id)
	if record.Id == e.Auth.Id {
		h.createOperationAudit(e, "", "delete_user", target, "", "failed", "Cannot delete the current user", operationFailureDenied)
		return e.BadRequestError("Cannot delete the current user", nil)
	}
	if record.GetString("role") == "admin" {
		if err := h.ensureAnotherAdmin(record.Id); err != nil {
			h.createOperationAudit(e, "", "delete_user", target, "", "failed", err.Error(), operationFailureDenied)
			return e.BadRequestError(err.Error(), err)
		}
	}
	if err := h.Delete(record); err != nil {
		h.createOperationAudit(e, "", "delete_user", target, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to delete user", err)
	}
	h.createOperationAudit(e, "", "delete_user", target, "", "success", "用户已删除")
	return e.JSON(http.StatusOK, map[string]string{"id": record.Id, "status": "deleted"})
}

func appUserFromRecord(record *core.Record) appUserRecord {
	return appUserRecord{
		Id:       record.Id,
		Username: firstNonEmpty(record.GetString("username"), strings.Split(record.GetString("email"), "@")[0]),
		Email:    record.GetString("email"),
		Role:     normalizeAppUserRole(record.GetString("role")),
		Created:  record.GetDateTime("created").String(),
		Updated:  record.GetDateTime("updated").String(),
	}
}

func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func isValidEmail(email string) bool {
	if email == "" {
		return false
	}
	parsed, err := mail.ParseAddress(email)
	return err == nil && strings.EqualFold(parsed.Address, email)
}

func normalizeAppUserRole(role string) string {
	role = strings.TrimSpace(strings.ToLower(role))
	if role == "" {
		return "user"
	}
	return role
}

func (h *Hub) ensureAnotherAdmin(excludedUserID string) error {
	records, err := h.FindRecordsByFilter(
		"users",
		"role = 'admin' && id != {:id}",
		"",
		1,
		0,
		map[string]any{"id": excludedUserID},
	)
	if err != nil || len(records) == 0 {
		return fmt.Errorf("At least one admin user must remain")
	}
	return nil
}

func (h *Hub) listBackups(e *core.RequestEvent) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fsys, err := e.App.NewBackupsFilesystem()
	if err != nil {
		return e.InternalServerError("Failed to load backups filesystem", err)
	}
	defer fsys.Close()
	fsys.SetContext(ctx)

	files, err := fsys.List("")
	if err != nil {
		return e.InternalServerError("Failed to list backups", err)
	}

	backups := make([]appBackupRecord, 0, len(files))
	for _, file := range files {
		modified, _ := types.ParseDateTime(file.ModTime)
		backups = append(backups, appBackupRecord{
			Key:      file.Key,
			Size:     file.Size,
			Modified: modified.String(),
		})
	}
	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Modified > backups[j].Modified
	})

	return e.JSON(http.StatusOK, map[string]any{"items": backups})
}

func (h *Hub) createBackup(e *core.RequestEvent) error {
	var req createBackupRequest
	if err := e.BindBody(&req); err != nil {
		h.createOperationAudit(e, "", "create_backup", "", "", "failed", "Invalid backup request", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid backup request", err)
	}
	name := normalizeBackupName(req.Name)
	if !backupNamePattern.MatchString(name) {
		h.createOperationAudit(e, "", "create_backup", name, "", "failed", "Backup name is invalid", operationFailureInvalidRequest)
		return e.BadRequestError("Backup name must use lowercase letters, numbers, _ or - and end with .zip", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	if err := e.App.CreateBackup(ctx, name); err != nil {
		h.createOperationAudit(e, "", "create_backup", name, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to create backup", err)
	}

	h.createOperationAudit(e, "", "create_backup", name, "", "success", "备份已创建")
	return e.JSON(http.StatusOK, map[string]string{"key": name})
}

func (h *Hub) downloadBackup(e *core.RequestEvent) error {
	key := strings.TrimSpace(e.Request.PathValue("key"))
	if key == "" || filepath.Base(key) != key || !backupNamePattern.MatchString(key) {
		h.createOperationAudit(e, "", "download_backup", key, "", "failed", "Invalid backup name", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid backup name", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	fsys, err := e.App.NewBackupsFilesystem()
	if err != nil {
		h.createOperationAudit(e, "", "download_backup", key, "", "failed", err.Error(), operationFailureFailed)
		return e.InternalServerError("Failed to load backups filesystem", err)
	}
	defer fsys.Close()
	fsys.SetContext(ctx)

	if err := fsys.Serve(e.Response, e.Request, key, filepath.Base(key)); err != nil {
		h.createOperationAudit(e, "", "download_backup", key, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to download backup", err)
	}
	h.createOperationAudit(e, "", "download_backup", key, "", "success", "备份已下载")
	return nil
}

func (h *Hub) deleteBackup(e *core.RequestEvent) error {
	key := strings.TrimSpace(e.Request.PathValue("key"))
	if key == "" || filepath.Base(key) != key || !backupNamePattern.MatchString(key) {
		return e.BadRequestError("Invalid backup name", nil)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fsys, err := e.App.NewBackupsFilesystem()
	if err != nil {
		return e.InternalServerError("Failed to load backups filesystem", err)
	}
	defer fsys.Close()
	fsys.SetContext(ctx)

	if err := fsys.Delete(key); err != nil {
		h.createOperationAudit(e, "", "delete_backup", key, "", "failed", err.Error(), operationFailureFailed)
		return e.BadRequestError("Failed to delete backup", err)
	}

	h.createOperationAudit(e, "", "delete_backup", key, "", "success", "备份已删除")
	return e.JSON(http.StatusOK, map[string]string{"key": key, "status": "deleted"})
}

func (h *Hub) restoreBackup(e *core.RequestEvent) error {
	key := strings.TrimSpace(e.Request.PathValue("key"))
	if key == "" || filepath.Base(key) != key || !backupNamePattern.MatchString(key) {
		h.createOperationAudit(e, "", "restore_backup", key, "", "failed", "Invalid backup name", operationFailureInvalidRequest)
		return e.BadRequestError("Invalid backup name", nil)
	}

	app := e.App
	h.createOperationAudit(e, "", "restore_backup", key, "", "success", "备份恢复已开始")
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		if err := app.RestoreBackup(ctx, key); err != nil {
			app.Logger().Error("Failed to restore backup", "key", key, "err", err)
		}
	}()

	return e.JSON(http.StatusAccepted, map[string]string{"key": key, "status": "restore_started"})
}

func normalizeBackupName(raw string) string {
	name := strings.ToLower(strings.TrimSpace(raw))
	name = strings.TrimSuffix(name, ".zip")
	if name == "" {
		name = fmt.Sprintf("beszel_backup_%s", time.Now().Format("20060102_150405"))
	}
	return name + ".zip"
}
