// Package users handles user-related custom functionality.
package users

import (
	"log"
	"net"
	"net/http"
	"net/mail"
	"strings"

	"gutenacht.site/pulse/internal/migrations"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type UserManager struct {
	app core.App
}

func NewUserManager(app core.App) *UserManager {
	manager := &UserManager{
		app: app,
	}
	manager.bindHooks()
	return manager
}

func (um *UserManager) bindHooks() {
	um.app.OnRecordCreate("users").BindFunc(um.InitializeUserRole)
	um.app.OnRecordCreate("user_settings").BindFunc(um.InitializeUserSettings)
}

// Initialize user role if not set
func (um *UserManager) InitializeUserRole(e *core.RecordEvent) error {
	if e.Record.GetString("role") == "" {
		e.Record.Set("role", "user")
	}
	return e.Next()
}

// Initialize user settings with defaults if not set
func (um *UserManager) InitializeUserSettings(e *core.RecordEvent) error {
	record := e.Record
	// intialize settings with defaults (zero values can be ignored)
	settings := struct {
		ChartTime string   `json:"chartTime"`
		Emails    []string `json:"emails"`
	}{
		ChartTime: "1h",
	}
	record.UnmarshalJSONField("settings", &settings)
	var user struct {
		Email string `db:"email"`
	}
	err := e.App.DB().NewQuery("SELECT email FROM users WHERE id = {:id}").Bind(dbx.Params{
		"id": record.GetString("user"),
	}).One(&user)
	if err != nil {
		log.Println("failed to get user email", "err", err)
		return err
	}
	settings.Emails = []string{user.Email}
	record.Set("settings", settings)
	return e.Next()
}

// Custom API endpoint to create the first user.
// Mimics previous default behavior in PocketBase < 0.23.0 allowing user to be created through the Pulse UI.
func (um *UserManager) CreateFirstUser(e *core.RequestEvent) error {
	// check that there are no users
	totalUsers, err := um.app.CountRecords("users")
	if err != nil || totalUsers > 0 {
		return e.JSON(http.StatusForbidden, map[string]string{"err": "Forbidden"})
	}
	// check that there is only one superuser and the email matches the email of the superuser we set up in initial-settings.go
	adminUsers, err := um.app.FindAllRecords(core.CollectionNameSuperusers)
	if err != nil || len(adminUsers) != 1 || adminUsers[0].GetString("email") != migrations.TempAdminEmail {
		return e.JSON(http.StatusForbidden, map[string]string{"err": "Forbidden"})
	}
	// create first user using supplied username, email and password in request body
	data := struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}{}
	if err := e.BindBody(&data); err != nil {
		return e.JSON(http.StatusBadRequest, map[string]string{"err": err.Error()})
	}
	username := strings.ToLower(strings.TrimSpace(data.Username))
	email := strings.ToLower(strings.TrimSpace(data.Email))
	if username == "" || email == "" || data.Password == "" || !isValidEmail(email) {
		return e.JSON(http.StatusBadRequest, map[string]string{"err": "Bad request"})
	}

	collection, _ := um.app.FindCollectionByNameOrId("users")
	user := core.NewRecord(collection)
	user.Set("username", username)
	user.SetEmail(email)
	user.SetPassword(data.Password)
	user.Set("role", "admin")
	user.Set("verified", true)
	if err := um.app.Save(user); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"err": err.Error()})
	}
	// create superuser using the email of the first user
	collection, _ = um.app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	adminUser := core.NewRecord(collection)
	adminUser.SetEmail(email)
	adminUser.SetPassword(data.Password)
	if err := um.app.Save(adminUser); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"err": err.Error()})
	}
	// delete the intial superuser
	if err := um.app.Delete(adminUsers[0]); err != nil {
		return e.JSON(http.StatusInternalServerError, map[string]string{"err": err.Error()})
	}
	writeFirstUserAudit(um.app, user.Id, email, firstUserAuditIP(e.Request))
	return e.JSON(http.StatusOK, map[string]string{"msg": "User created"})
}

func writeFirstUserAudit(app core.App, userID string, email string, ip string) {
	collection, err := app.FindCachedCollectionByNameOrId("operation_audit")
	if err != nil {
		return
	}
	record := core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("action", "create_first_admin")
	record.Set("target", strings.TrimSpace(email))
	record.Set("result", "success")
	record.Set("detail", "首个管理员已创建")
	record.Set("ip", strings.TrimSpace(ip))
	_ = app.SaveNoValidate(record)
}

func firstUserAuditIP(r *http.Request) string {
	if r == nil {
		return ""
	}
	for _, header := range []string{"X-Real-IP", "X-Forwarded-For"} {
		value := strings.TrimSpace(r.Header.Get(header))
		if value == "" {
			continue
		}
		if header == "X-Forwarded-For" {
			value = strings.TrimSpace(strings.Split(value, ",")[0])
		}
		if value != "" {
			return value
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func isValidEmail(email string) bool {
	if email == "" {
		return false
	}
	parsed, err := mail.ParseAddress(email)
	return err == nil && strings.EqualFold(parsed.Address, email)
}
