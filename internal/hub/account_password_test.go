//go:build testing

package hub_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	pulseTests "gutenacht.site/pulse/internal/tests"
)

// TestChangeAccountPassword covers self-service password change for all
// logged-in users, including the admin one-password sync with the same-email
// superuser record (product decision 2026-10-03: one password for both doors).
func TestChangeAccountPassword(t *testing.T) {
	hub, _ := pulseTests.GetHubWithUser(t)
	defer hub.Cleanup()

	// mirror the real one-admin instance: a superuser with the same email as
	// the admin user, sharing the same password (one-password semantics)
	superusers, err := hub.FindAllRecords("_superusers")
	if err != nil || len(superusers) == 0 {
		t.Fatalf("no superuser in test app: %v", err)
	}
	for _, superuser := range superusers {
		superuser.SetEmail("admin@local.test")
		superuser.SetPassword("KnownOld!2026")
		if err := hub.SaveNoValidate(superuser); err != nil {
			t.Fatalf("seed superuser password: %v", err)
		}
	}

	adminUser, err := pulseTests.CreateUserWithRole(hub, "admin@local.test", "AdminOld!2026", "admin")
	if err != nil {
		t.Fatalf("create admin user: %v", err)
	}
	adminToken, err := adminUser.NewAuthToken()
	if err != nil {
		t.Fatalf("admin user token: %v", err)
	}

	readonlyUser, err := pulseTests.CreateUserWithRole(hub, "readonly@local.test", "Readonly!2026", "readonly")
	if err != nil {
		t.Fatalf("create readonly user: %v", err)
	}
	readonlyToken, err := readonlyUser.NewAuthToken()
	if err != nil {
		t.Fatalf("readonly user token: %v", err)
	}

	doChange := func(token string, current string, next string) int {
		body := fmt.Sprintf(`{"currentPassword":%q,"newPassword":%q}`, current, next)
		res := pulseTests.PerformTestAPIRequest(t, hub.TestApp, http.MethodPost, "/api/pulse/account/password",
			strings.NewReader(body),
			map[string]string{"Authorization": token, "Content-Type": "application/json"})
		return res.Status
	}

	// wrong current password is rejected
	if code := doChange(adminToken, "WrongOld!2026", "BrandNew!2026"); code != http.StatusBadRequest {
		t.Fatalf("wrong current password should fail with 400, got %d", code)
	}

	// admin rotation updates login password AND the same-email superuser record
	if code := doChange(adminToken, "AdminOld!2026", "AdminNew!2026"); code != http.StatusOK {
		t.Fatalf("admin rotation should succeed with 200, got %d", code)
	}
	adminAfter, err := hub.FindFirstRecordByFilter("users", "email = {:email}", map[string]any{"email": "admin@local.test"})
	if err != nil {
		t.Fatalf("find admin user after rotation: %v", err)
	}
	if !adminAfter.ValidatePassword("AdminNew!2026") {
		t.Fatalf("admin login password was not updated")
	}
	superusersAfter, err := hub.FindAllRecords("_superusers")
	if err != nil || len(superusersAfter) == 0 {
		t.Fatalf("find superuser after rotation: %v", err)
	}
	if !superusersAfter[0].ValidatePassword("AdminNew!2026") {
		t.Fatalf("superuser password was not synced with the admin login password")
	}

	// audit trail written
	if _, err := hub.FindFirstRecordByFilter("operation_audit", "action = 'change_account_password' && result = 'success'", nil); err != nil {
		t.Fatalf("password change audit missing: %v", err)
	}

	// readonly users can still change their own password
	if code := doChange(readonlyToken, "Readonly!2026", "Readonly!2027"); code != http.StatusOK {
		t.Fatalf("readonly self-service change should succeed with 200, got %d", code)
	}
	readonlyAfter, err := hub.FindFirstRecordByFilter("users", "email = {:email}", map[string]any{"email": "readonly@local.test"})
	if err != nil {
		t.Fatalf("find readonly user: %v", err)
	}
	if !readonlyAfter.ValidatePassword("Readonly!2027") {
		t.Fatalf("readonly user password was not updated")
	}
}
