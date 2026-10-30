package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCheckHubConnection(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		body       string
		want       string
	}{
		{name: "connected", statusCode: http.StatusOK, body: `{"status":"up"}`, want: "连接成功"},
		{name: "agent offline", statusCode: http.StatusOK, body: `{"status":"down"}`, want: "连接失败"},
		{name: "hub rejected", statusCode: http.StatusUnauthorized, body: `{"message":"unauthorized"}`, want: "连接失败"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/pulse/agent-status" {
					t.Fatalf("unexpected path: %s", r.URL.Path)
				}
				if r.Header.Get("X-Token") != "test-token" {
					t.Fatalf("missing agent token")
				}
				w.WriteHeader(tc.statusCode)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer server.Close()

			got := checkHubConnection(pairingCredentials{HubURL: server.URL, Token: "test-token"})
			if got != tc.want {
				t.Fatalf("checkHubConnection() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestConnectUsesSixDigitCodeAndStoresOnlyReturnedCredentials(t *testing.T) {
	dataDir := t.TempDir()
	t.Setenv("DATA_DIR", dataDir)
	var receivedCode string
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/pulse/agent-status" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"up"}`))
			return
		}
		if r.URL.Path != "/api/pulse/agent-pair" {
			http.NotFound(w, r)
			return
		}
		var body struct {
			Code string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		receivedCode = body.Code
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"hub_url":"` + server.URL + `","agent_id":"agent-1","agent_secret":"secret-1","token":"token-1"}`))
	}))
	defer server.Close()

	result := NewApp().Connect(server.URL, "123-456")
	if !result.Success {
		t.Fatalf("Connect() failed: %s", result.Message)
	}
	if receivedCode != "123456" {
		t.Fatalf("received code = %q", receivedCode)
	}
	pairing, err := os.ReadFile(filepath.Join(dataDir, "pairing.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(pairing), "123456") {
		t.Fatal("pairing code must not be stored")
	}
}

func TestConnectRejectsInvalidCodeWithoutSavingCredentials(t *testing.T) {
	for _, code := range []string{"12345", "1234567", "ABCDEF", "12A456", "12_456"} {
		t.Run(code, func(t *testing.T) {
			dataDir := t.TempDir()
			t.Setenv("DATA_DIR", dataDir)
			result := NewApp().Connect("http://127.0.0.1:8090", code)
			if result.Success || result.Message != "机器连接码错误，请填写网页显示的 6 位配对码。" {
				t.Fatalf("unexpected result: %#v", result)
			}
			if _, err := os.Stat(filepath.Join(dataDir, "pairing.json")); !os.IsNotExist(err) {
				t.Fatal("invalid code must not create pairing credentials")
			}
		})
	}
}
