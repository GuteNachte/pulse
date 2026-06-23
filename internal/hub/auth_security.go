package hub

import (
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

const (
	loginFailureLimit       = 5
	loginFailureWindow      = 10 * time.Minute
	loginFailureLockout     = 10 * time.Minute
	loginFailureMaxKeyBytes = 192
)

type loginFailureEntry struct {
	Count       int
	WindowEnds  time.Time
	LockedUntil time.Time
}

type loginFailureLimiter struct {
	mu       sync.Mutex
	attempts map[string]loginFailureEntry
	now      func() time.Time
}

func newLoginFailureLimiter() *loginFailureLimiter {
	return &loginFailureLimiter{
		attempts: map[string]loginFailureEntry{},
		now:      time.Now,
	}
}

func (h *Hub) bindAuthSecurityHooks() {
	if h.loginLimiter == nil {
		h.loginLimiter = newLoginFailureLimiter()
	}
	h.App.OnRecordAuthWithPasswordRequest().BindFunc(func(e *core.RecordAuthWithPasswordRequestEvent) error {
		if e.Collection == nil || e.Collection.Name != "users" {
			return e.Next()
		}
		key := loginFailureKey(e.Identity, getRealIP(e.Request))
		if retryAfter, limited := h.loginLimiter.retryAfter(key); limited {
			e.Response.Header().Set("Retry-After", retryAfterHeaderValue(retryAfter))
			return e.TooManyRequestsError("登录失败次数过多，请稍后再试。", nil)
		}
		if err := e.Next(); err != nil {
			h.loginLimiter.recordFailure(key)
			return err
		}
		h.loginLimiter.clear(key)
		return nil
	})
}

func loginFailureKey(identity string, ip string) string {
	identity = strings.ToLower(strings.TrimSpace(identity))
	ip = strings.TrimSpace(ip)
	key := identity + "|" + ip
	if len(key) <= loginFailureMaxKeyBytes {
		return key
	}
	return key[:loginFailureMaxKeyBytes]
}

func (l *loginFailureLimiter) retryAfter(key string) (time.Duration, bool) {
	if l == nil || strings.TrimSpace(key) == "|" {
		return 0, false
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now().UTC()
	entry, ok := l.attempts[key]
	if !ok {
		return 0, false
	}
	if !entry.LockedUntil.IsZero() && entry.LockedUntil.After(now) {
		return entry.LockedUntil.Sub(now), true
	}
	if !entry.WindowEnds.IsZero() && entry.WindowEnds.Before(now) {
		delete(l.attempts, key)
	}
	return 0, false
}

func retryAfterHeaderValue(duration time.Duration) string {
	seconds := int(duration.Seconds())
	if seconds < 1 {
		seconds = 1
	}
	return strconv.Itoa(seconds)
}

func (l *loginFailureLimiter) recordFailure(key string) {
	if l == nil || strings.TrimSpace(key) == "|" {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now().UTC()
	entry := l.attempts[key]
	if entry.WindowEnds.IsZero() || entry.WindowEnds.Before(now) {
		entry = loginFailureEntry{WindowEnds: now.Add(loginFailureWindow)}
	}
	entry.Count++
	if entry.Count >= loginFailureLimit {
		entry.LockedUntil = now.Add(loginFailureLockout)
		entry.WindowEnds = entry.LockedUntil
	}
	l.attempts[key] = entry
}

func (l *loginFailureLimiter) clear(key string) {
	if l == nil {
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}
