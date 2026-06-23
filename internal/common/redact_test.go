package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRedactSensitiveText(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "token assignment",
			in:   "TOKEN=secret-token-value",
			want: "TOKEN=***",
		},
		{
			name: "password json-ish value",
			in:   `adminPassword:"secret-password"`,
			want: `adminPassword:***`,
		},
		{
			name: "authorization bearer",
			in:   "Authorization: Bearer abc.def.ghi",
			want: "Authorization: Bearer ***",
		},
		{
			name: "url userinfo",
			in:   "failed to send discord://secret-token@webhook-id",
			want: "failed to send discord://***@webhook-id",
		},
		{
			name: "plain text remains",
			in:   "Agent 已配对",
			want: "Agent 已配对",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, RedactSensitiveText(tc.in))
		})
	}
}
