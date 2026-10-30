package hub

import "testing"

// 状态机纯函数在 hub 包内直测（非导出函数）。

func TestNextAssetPresenceState(t *testing.T) {
	cases := []struct {
		name       string
		current    string
		failStreak int
		success    bool
		wantStatus string
		wantStreak int
	}{
		{"成功立即在线", "offline", 5, true, "online", 0},
		{"首次失败保持未知", "", 0, false, "unknown", 1},
		{"在线单次丢包不抖动", "online", 0, false, "online", 1},
		{"连续两次失败转离线", "online", 1, false, "offline", 2},
		{"离线继续累计", "offline", 3, false, "offline", 4},
		{"离线一次成功恢复", "offline", 2, true, "online", 0},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotStatus, gotStreak := NextAssetPresenceState(tc.current, tc.failStreak, tc.success)
			if gotStatus != tc.wantStatus || gotStreak != tc.wantStreak {
				t.Fatalf("NextAssetPresenceState(%q, %d, %v) = (%q, %d), want (%q, %d)",
					tc.current, tc.failStreak, tc.success, gotStatus, gotStreak, tc.wantStatus, tc.wantStreak)
			}
		})
	}
}
