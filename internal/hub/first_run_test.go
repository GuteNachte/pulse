//go:build testing

package hub_test

import (
	"net/http"
	"strings"
	"testing"

	pbTests "github.com/pocketbase/pocketbase/tests"
	pulseTests "gutenacht.site/pulse/internal/tests"
)

// TestCreateFirstUserEndToEnd covers the first-admin initialization chain
// (audit P1): zero-user hub exposes POST /create-user, the created account is
// an admin, the temporary superuser is replaced, and the route stops accepting
// new creations afterwards.
func TestCreateFirstUserEndToEnd(t *testing.T) {
	hub, err := pulseTests.NewTestHub(t.TempDir())
	if err != nil {
		t.Fatalf("failed to create test hub: %v", err)
	}
	defer hub.Cleanup()

	// StartHub binds the OnServe handlers (routes, middlewares). Its trailing
	// server start always fails for the PB TestApp ("not a pocketbase app");
	// existing tests rely on the binding and ignore this error.
	_ = hub.StartHub()
	if err := hub.GetSystemManager().Initialize(); err != nil {
		t.Fatalf("failed to initialize system manager: %v", err)
	}

	testAppFactory := func(t testing.TB) *pbTests.TestApp {
		return hub.TestApp
	}

	scenarios := []pulseTests.ApiScenario{
		{
			Name:            "GET /first-run - zero users reports firstRun true",
			Method:          http.MethodGet,
			URL:             "/api/pulse/first-run",
			ExpectedStatus:  200,
			ExpectedContent: []string{`"firstRun":true`},
			TestAppFactory:  testAppFactory,
		},
		{
			Name:            "POST /create-user - creates first admin",
			Method:          http.MethodPost,
			URL:             "/api/pulse/create-user",
			Body:            strings.NewReader(`{"username":"admin","email":"founder@test.local","password":"Str0ngPass!2026"}`),
			ExpectedStatus:  200,
			ExpectedContent: []string{"User created"},
			AfterTestFunc: func(t testing.TB, app *pbTests.TestApp, res *http.Response) {
				total, err := app.CountRecords("users")
				if err != nil {
					t.Fatalf("count users: %v", err)
				}
				if total != 1 {
					t.Fatalf("expected exactly 1 user after first-run creation, got %d", total)
				}
				user, err := app.FindFirstRecordByFilter("users", "email = {:email}", map[string]any{"email": "founder@test.local"})
				if err != nil {
					t.Fatalf("created user not found: %v", err)
				}
				if user.GetString("role") != "admin" {
					t.Fatalf("expected first user role admin, got %q", user.GetString("role"))
				}
				superusers, err := app.FindAllRecords("_superusers")
				if err != nil {
					t.Fatalf("find superusers: %v", err)
				}
				if len(superusers) != 1 || superusers[0].GetString("email") != "founder@test.local" {
					t.Fatalf("expected temp superuser replaced by founder@test.local, got %d superusers", len(superusers))
				}
				audits, err := app.FindFirstRecordByFilter("operation_audit", "action = 'create_first_admin'", nil)
				if err != nil {
					t.Fatalf("first-admin audit missing: %v", err)
				}
				if audits.GetString("result") != "success" {
					t.Fatalf("expected audit result success, got %q", audits.GetString("result"))
				}
			},
			TestAppFactory: testAppFactory,
		},
		{
			Name:            "POST /create-user - refuses after initialization",
			Method:          http.MethodPost,
			URL:             "/api/pulse/create-user",
			Body:            strings.NewReader(`{"username":"second","email":"second@test.local","password":"An0therPass!2026"}`),
			ExpectedStatus:  403,
			ExpectedContent: []string{"Forbidden"},
			TestAppFactory:  testAppFactory,
		},
	}

	for _, scenario := range scenarios {
		scenario.Test(t)
	}
}
