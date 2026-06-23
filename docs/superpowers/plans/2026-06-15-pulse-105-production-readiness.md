# Pulse 1.0.5 Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` when available, otherwise use `superpowers:executing-plans` and execute task-by-task with verification checkpoints.

**Goal:** Bring Pulse 1.0.5 to production-ready quality as a self-hosted operations monitoring product with trustworthy data, auditable operations, mobile-ready UX, synchronized versions, and verifiable deployment.

**Architecture:** Keep the current React / Vite / Tailwind Web frontend, PocketBase-based Go Hub, Windows/Linux/NAS Agent, and Capacitor Android shell. Fix source-of-truth problems in Hub and Agent first, then make Web and Android render standardized state instead of guessing.

**Tech Stack:** Go Hub and Agent, PocketBase collections and custom APIs, React 19, Vite, Tailwind, Radix UI, Recharts, Capacitor Android, PowerShell release scripts.

---

## Global Rules

- Test data may be deleted. Prefer clean initialization over compatibility with dirty test records.
- Do not ship placeholder, guessed, or inferred monitoring facts as real data.
- Prefer source fixes in Hub / Agent / schema over UI hiding.
- Every visible Web, Hub, Agent, Android, deployment, release, or documentation change must update `docs/release-notes-next.md` and About release history.
- Web, Hub, Agent, and Android App must share the same explicit version at release time.
- Remove misleading, duplicated, low-value, slow, ugly, or old-branding surfaces while adding the missing production behavior.

## Task 1: Initialization, Login, and Security Readiness

**Files:** login components, Hub public/auth APIs, runtime info APIs, Android Hub setup, About release history, release notes.

- [x] Replace the first-user form with a first-run setup wizard that checks Hub connectivity, creates the first admin, handles MFA configuration, shows readiness checks, and confirms completion.
  - [x] Login entry now reads `/api/pulse/first-run` and `/api/pulse/public-info`, shows Hub version/build status, tracks admin creation/MFA/login stages, and points the user to the authenticated About readiness checks after setup. Public entry still does not expose admin-only security checks.
- [x] Implement full MFA login UI instead of the current unavailable-MFA fallback.
  - [x] Normal login and first-run admin auto-login both handle PocketBase MFA by requesting OTP, showing the 6-digit code form, supporting resend, and returning to login.
- [x] Standardize login error categories: Hub unreachable, invalid credentials, MFA required/invalid, permission denied, session expired, first-run incomplete.
  - [x] Login and OTP failures now map to stable Chinese categories instead of leaking technical error dumps into the entry flow.
- [x] Integrate Android Hub URL configuration with the login flow, including retry and edit actions when Hub is unreachable.
  - [x] Android still blocks login until a Hub URL is configured, login connection failures show retry/edit actions, and the setup card validates Hub health before saving.
- [x] Add Hub readiness/security checks for `AUTO_LOGIN`, `TRUSTED_AUTH_HEADER`, development mode, MFA state, default local agent token, version mismatch, and Hub host identity anomalies.
  - [x] Authenticated About readiness checks cover the production security matrix; public bootstrap endpoints keep those details hidden.
- [x] Remove old-branding text, old favicon references, half-finished MFA copy, and technical error dumps from the entry flow.

**Verification:**

- [x] Empty data directory enters setup wizard.
  - [x] Isolated Hub on `127.0.0.1:18090` with a temporary empty data directory showed the first-run setup wizard, Hub `1.0.5 / production` runtime metadata, and the admin creation form.
- [x] First admin can be created, then `/api/pulse/create-user` is rejected.
  - [x] Browser-created temporary first admin entered the app, `/api/pulse/first-run` changed to `false`, and a second `/api/pulse/create-user` request returned `403`.
- [ ] MFA enabled and disabled login paths both work.
- [ ] Android without Hub URL cannot enter login.
- [x] Session expiry returns to login without blank screen or loop.
  - [x] Browser verification injected an invalid but locally valid `pocketbase_auth` token, reloaded, confirmed the app returned to the login page, cleared auth storage, and produced no fresh console errors; the original auth state was restored afterward.
- [x] Readiness check detects dangerous development configuration.
  - [x] `TestInfoReadinessChecksDangerousConfig` covers dangerous runtime configuration, and the About page shows development/MFA/default local Agent token warnings in the current dev environment.

## Task 2: Machine Add Flow and Agent Pairing

**Files:** add-system UI, install command generation, Hub pairing APIs, Agent pairing, migrations, operation/audit records, release notes.

- [x] Replace the current add-system dialog with a five-step install wizard: install type, target info, install session, command copy, identity confirmation.
- [x] Track one current install session instead of listing all pairing codes for status detection.
- [x] Store and display `target_ip`, `connect_ip`, `reported_ips`, `hostname`, `fingerprint_summary`, and `agent_profile`.
- [x] Require Agent pairing, Agent online status, and user identity confirmation before a system appears in the clients list.
- [x] Support the current real install variants: Windows PowerShell, Linux / NAS / FlyNAS Docker Compose, and Linux / NAS / FlyNAS `docker run`; do not expose Linux systemd until a complete package, publish, update, capability, and verification chain exists.
- [x] Keep universal/permanent token management in advanced settings, not in the default add-machine path.
- [x] Remove pre-created machine records, failed half-records, NAS auto-primary-use changes, and technical copy fallback text.

**Verification:**

- [x] No machine appears before install and identity confirmation.
- [x] Wrong IP, expired code, reused code, and fingerprint conflict fail clearly.
- [x] Confirm screen shows hostname, display name, target/connect/reported IPs, fingerprint summary, and Agent profile.
- [x] NAS only adds NAS tag; alert enrollment defaults off.
- [x] Install commands copy fully and display fully.

## Task 3: Machine Identity and Hub Host Protection

**Files:** system migrations/types, Hub agent connect, system manager, delete APIs, shared frontend identity/tag utilities, system detail header.

- [x] Separate user-facing `display_name` from Agent-reported `hostname`.
- [x] Treat `is_local` as the internal Hub-host marker; UI must call it `Hub`, never `本机`.
- [x] Generate Hub tag only in Hub from loopback local-token and fingerprint rules.
- [x] Reject Hub host deletion in the backend and hide delete action in UI.
- [x] Allow Hub host home-page hiding and monitor pause only with strong confirmation.
- [x] Repair duplicate/stale Hub host markers on Hub startup and log diagnostics.
- [x] Add an identity details panel with display name, hostname, target IP, connect IP, reported IPs, fingerprint summary, Agent profile, first seen, and last seen.

**Verification:**

- [x] Clean initialization creates exactly one Hub-tagged host.
- [x] Hub host shows real machine name, not `本机`.
- [x] Ordinary machines cannot gain Hub tag through UI or API.
- [x] API deletion of Hub host fails.
- [x] Fingerprint conflict never silently overwrites identity.

## Task 4: Home and Clients List

**Files:** home route, clients route, shared system summary utilities, mobile clients/dashboard, filters, release notes.

- [x] Redefine home as operations overview: health totals, active alerts, offline systems, abnormal websites, abnormal containers, and attention list.
- [x] Redefine clients page as machine asset inventory with search, filters, sorting, and add-machine wizard entry.
- [x] Standardize status labels: online, offline, paused, pending, not collected.
- [x] Standardize IP display with clear source precedence.
- [x] Remove low-value tag clutter and move offline-alert enrollment state to detail/settings.
- [x] Add pagination or virtualization strategy for large machine lists.

**Verification:**

- [x] Home is not a duplicate full clients list.
- [x] Clients can search/filter/sort by useful dimensions.
- [x] Missing metrics show not collected, never fake zero/normal.
- [ ] 100 systems remain responsive.
- [x] Mobile shows multiple machines per viewport without horizontal scroll.

## Task 5: System Detail, Metrics, and Hardware Truth

**Files:** system detail route/components, status summary utils, capability utils, Agent detail payloads, Hub details storage, network/smart/gpu/cpu/memory/disk sheets.

- [x] Make first screen show identity and core health before modules.
- [x] Add collapsible identity details.
- [x] Open metric detail sheets for CPU, memory, disk, network, GPU, container runtime.
- [x] Show hardware labels only from real collection: CPU vendor/model, memory generation, disk type, link speed, IP method, GPU type, SMART devices.
- [x] Distinguish collected, none, unsupported, unknown, and non-live data; reserve failed/stale for explicit source evidence.
- [x] Remove `WebSocket` user-facing label, standalone description row, fake SMART availability, low-value capability tags, and blank-screen jumps.

**Verification:**

- [x] Virtual machines do not show SMART available unless real SMART devices exist.
- [x] Missing hardware data is unknown/not shown, not guessed.
- [x] Network detail shows IPv4, IPv6, gateway, DNS, link speed, and DHCP/static when collected.
- [x] Unavailable modules show a message and do not navigate to blank pages.
- [x] Desktop cards align; mobile detail has no horizontal overflow.

## Task 6: Agent Capability Boundaries

**Files:** Agent capabilities, Hub capability sanitizer, system info entities, frontend capability state types, tests.

- [x] Define profile matrix for Windows host, Linux / NAS Docker container Agent, and Hub local Agent; document Linux systemd as intentionally unsupported until a complete host-Agent package, publish, update, capability, and verification chain is added.
- [x] Separate capability declaration from collection result.
- [x] Standardize capability states: confirmed, unavailable, unsupported, unknown, failed, stale.
  - [x] Hub now derives `stale` from real capability `checked_at` timestamps before saving system info: normal heartbeat-backed states expire after 5 minutes without refresh, while S.M.A.R.T. uses the Agent-provided SMART interval plus grace time.
- [x] Record collection timestamp and failure reason.
- [x] Add Agent diagnostics surface for permission, Docker socket, SMART, WMI, GPU, and network-detail issues.
- [x] Remove frontend capability guessing and deprecated field influence.

**Verification:**

- [x] Supported-but-not-collected is not shown as available.
- [x] Different profiles expose different operations and collection states.
- [x] Old Agent missing fields produces unknown or upgrade prompt.
- [x] Failed collection backs off and exposes reason.

## Task 7: Containers and Operation Protection

**Files:** container collection/normalization, containers route, mobile containers, operation handlers, protection rules, tests.

- [x] Group Compose only from trustworthy Docker Compose labels.
- [x] Mark and protect Pulse Hub/Agent containers in backend.
- [x] Use operation confirmation, progress, and audit links for container and Compose actions.
- [x] Simplify Compose headers and empty independent-container state.
- [x] Add mobile container list and bottom action sheet.
- [x] Remove direct dangerous button clutter, repeated counts, and mobile wide tables.

Note: Task 7 now covers container and Compose operations. The cross-product one-confirmation model for services, Agent updates, backups, notification tests, and other dangerous actions remains tracked under Task 10.

**Verification:**

- [x] `pulse-agent` is not grouped into unrelated business Compose stacks.
- [x] Protected containers reject start/stop/restart/update in backend.
- [x] Empty independent containers show only `无`.
- [x] Operation progress and audit link are visible.

## Task 8: Website Monitoring

**Files:** website monitoring Hub logic, website routes/hooks/components, system detail website card, mobile websites.

- [x] Add source-level failure categories for DNS, TCP, TLS/certificate, HTTP status, timeout, redirect, network, and unknown.
- [x] Add real content-check rules before marking the reserved content failure category as produced.
- [x] Display per-target status for internal IPv4, external IPv4, IPv6, and custom targets.
- [x] Move history and trends into details sheet with on-demand loading.
- [x] Add immediate-check progress and result.
- [x] Add stale result and IPv6 environment hints.
- [x] Remove default-expanded histories, large color blocks, unexplained abnormal status, and mobile tables from the main website list.

**Verification:**

- [x] Unknown/unchecked targets do not show normal.
- [x] Failure cause is visible.
- [x] Multi-target status aligns visually.
- [x] Immediate check refreshes only the target website.

## Task 9: Alerts and Notifications

**Files:** alert models, notification settings, alert routes, mobile alerts, Android notification bridge.

- [x] Standardize alert severity, source, and current/recovered display states.
- [x] Add acknowledged and silenced states.
- [x] Split current unresolved issues from historical alerts.
- [x] Add alert rule overview and alert detail sheet.
- [x] Add dedupe, grouping, and cooldown behavior.
- [x] Add acknowledge and silence behavior for unresolved alerts.
- [x] Add notification channel test result detail.
- [x] Add persistent notification channel health diagnostics.
- [x] Show Android notification permission and clearly state no guaranteed notification after the app is killed.
- [x] Replace inaccurate offline wording with `加入告警`.

**Verification:**

- [x] New systems do not alert on offline by default.
- [x] Current unresolved alerts are first-class.
- [x] Alert rule overview is visible on desktop and mobile.
- [x] Acknowledged and silenced unresolved alerts show status and can be changed from desktop and mobile.
- [x] Silenced unresolved alert IDs do not send repeat notifications during the silence window.
- [x] Notification test shows specific failure reason.
- [x] Duplicate storms are controlled.

## Task 10: Operations and Audit

**Files:** operation collections, operation APIs, operation UI components, action sheets, logs/audit links.

- [x] Standardize operation status and stage model.
- [x] Use one confirmation component for dangerous operations across containers, services, Agent updates, website checks, notification tests, backup/restore.
- [x] Show stage-based progress when true percentage is unavailable.
- [x] Link operation records with logs and alerts.
  - [x] Operation audit records are linked to their `operation_actions` record when an operation action is created; preflight failures remain audit-only instead of claiming a nonexistent operation.
  - [x] `/api/pulse/operations/audit?operation=...` can query audits for one operation and rechecks system ownership before returning records.
  - [x] System detail operation history also renders audit-only Hub actions when no `operation_actions` record exists.
  - [x] System detail operation history and Settings > Operation Audit details link to operation audit, Hub system log search, and alert history search; logs, alert history, and audit pages accept URL filter parameters.
- [x] Standardize failure reasons and offline behavior.
- [x] Remove toast-only completion paths.
  - [x] Operation API paths for containers, Compose, Windows service control, and Agent updates show a record link on success and failure.
  - [x] Website checks, notification tests, alert actions, backups, user/admin changes, Agent pairing, universal token changes, Agent release sync, SMART refresh, and primary collection write APIs now write `operation_audit`.
  - [x] Audit-only records for system-scoped actions are visible in the system operation history instead of remaining backend-only.
  - [x] Global settings actions have a dedicated Settings > Operation Audit entry with search, filters, details, and copy support.
  - [x] Backup download uses its own `download_backup` audit action, and failed filesystem/download paths are written as failed audit records instead of success records.

**Verification:**

- [x] Operation action records include status, stage, started/completed time, duration, timeout, and result/error.
- [x] Operation audit records keep a verifiable relation to the operation action when one exists.
- [x] All state-changing actions create auditable operation records.
- [x] Offline system operations fail clearly.
- [x] Protected-rule failures are visible.
- [x] Mobile operations use bottom confirmation sheet.

## Task 11: Settings, Logs, Users, Tokens, Backups, Agent Management

**Files:** settings layout, logs, users, tokens, backups, Agent settings, About page, mobile settings.

- [x] Regroup settings by task: general, notifications/alerts, Agent/access, users/permissions, backup/restore, logs, advanced, About.
- [x] Add settings search if practical.
- [x] Make logs summary-first with details dialog/sheet, filters, and copy button.
- [x] Keep operation records separate from technical logs.
- [x] Add backup/restore progress, strong confirmation, and audit.
- [x] Add user role explanations.
- [x] Show Agent target/actual versions and update progress.
- [x] Move universal token to advanced and keep install wizard separate.
- [x] Mark dangerous advanced settings.
- [x] Remove stale brand/icon/history residue.

**Verification:**

- [x] Logs are readable and expandable.
- [x] Tokens are not exposed in default add flow.
- [x] Backups and restores have confirmation/progress.
- [x] About has no old project identity.

## Task 12: Mobile, Android, and Tablet

**Files:** mobile components, routes, mobile runtime/cache/notifications, Capacitor config, Android assets.

- [ ] Build mobile as app experience: bottom nav for Home, Machines, Alerts, Websites, Containers.
- [ ] Move settings/about/Agent/token/logs/users into More/settings entry.
- [ ] Use lists, drill-down, sheets, and bottom confirmations instead of desktop tables.
- [ ] Add tablet portrait layout separate from phone and desktop.
- [x] Implement offline read-only snapshots and disable operations offline.
  - [x] Shared offline read-only state now drives both PocketBase write blocking and the unified dangerous-operation confirmation component.
- [x] Add Android Hub diagnostics, secure storage checks, notification permission UI.
  - [x] Android startup no longer logs empty SecureStorage key errors, SystemBars safe-area injection errors, or Capacitor bridge results containing auth tokens.
- [ ] Remove horizontal scroll, nested cards, exposed dangerous tiny buttons, and overpromised notification copy.
  - [x] Website monitoring tablet/mobile layout no longer mounts the hidden desktop detail chart, removing the Recharts zero-size warning; the mobile detail sheet also has a Dialog description.
  - [x] Capacitor Android build uses root asset paths while normal Web build keeps relative asset paths, so deep links like `/system/...` and `/settings/about` no longer blank from `/system/assets/...` 404s.
  - [x] Android WebView no longer loads HTTP website favicons from the HTTPS app shell, avoiding mixed content warnings.

**Verification:**

- [x] 375x812, 390x844, 430x932, and 768x1024 pass visual checks.
- [x] MuMu can configure Hub, login, browse core pages, and open operation confirmation.
  - [x] Reinstalled debug APK on MuMu, browsed Home, Machines, System Detail, Alerts, Websites, Containers, and About with no horizontal overflow.
  - [x] Website detail sheet and immediate-check confirmation sheet open in Android WebView.
  - [x] Android WebView CDP/logcat verification shows no deep-link static 404s, no mixed content warning for website icons, and no auth token in logcat.
- [x] Offline mode is read-only with data timestamp.

## Task 13: Version, About, Release Notes

**Files:** version constants, release scripts, About, release-history, release notes, icons/assets.

- [x] Enforce one explicit version for Web, Hub, Agent, Android, Docker, Compose, docs, and scripts.
  - [x] Version sources now align on `1.0.5`, including Web package / lockfile, Go `pulse.Version`, Makefile, Dockerfiles, publish/run scripts, Compose templates, Agent install docs, FlyNAS/local runbooks, Android `versionName`, and Android `versionCode=10005`.
- [x] Show per-end version, build time, commit, environment, Agent target/actual versions in About.
  - [x] `/api/pulse/info` exposes environment, build commit/time, Agent target version, and authenticated Agent actual-version summary; `/api/pulse/public-info` does not expose Agent inventory.
  - [x] About displays Web, Hub, Agent target/actual, Android App, runtime environment, build commit/time, and Hub URL.
- [x] Keep About release history classified by Web/Hub, Android, Agent, deployment, version rules.
  - [x] About release history and `docs/release-notes-next.md` both include the Android/MuMu fixes and the 1.0.5 version-source alignment record.
- [x] Replace favicon, PWA, Android icons and scan/remove old upstream branding.
  - [x] Android launcher icon verified as Pulse green pulse icon; Android assets synced to `1.0.5`.
  - [x] Runtime/product scan only finds old project text in planning/checklist references and `LICENSE` original copyright, not in UI/runtime identity.
- [x] Block release on version mismatch or `latest` usage.
  - [x] `check-version-consistency.ps1 -Version 1.0.5` passes and checks explicit image tags plus forbidden `latest` usage.

**Verification:**

- [x] `check-version-consistency.ps1 -Version 1.0.5` passes.
- [x] About and release notes match.
- [x] No old B favicon or old project identity remains.

## Task 14: Deployment, Harbor, FlyNAS, Rollback

**Files:** release scripts, FlyNAS docs, compose templates, deployment verifier docs/scripts.

- [x] Keep `publish-release-v1.ps1` as full release entry.
  - [x] `publish-release-v1.ps1` remains the only documented formal release entry and refuses skip flags unless `-DryRun` is explicit.
- [x] Add or document pre-release backup, Harbor tag verification, FlyNAS actual version verification, Hub health, local Agent online, Agent manifest, Android APK version.
  - [x] `verify-release-v1.ps1` checks version consistency, Windows Agent artifact, Agent manifest hash, Android APK metadata, Harbor image tags, and optional Hub runtime version.
  - [x] `release-deployment-runbook.md` documents FlyNAS backup, Harbor checks, FlyNAS runtime version checks, Hub health, Hub local Agent UI verification, and Android APK version expectations.
- [x] Add rollback command path and verification steps.
  - [x] `release-deployment-runbook.md` documents rollback from `1.0.5` to `1.0.4`, including Compose tag changes, pull/recreate, health check, public-info version, and image-tag verification.
- [x] Remove implicit latest and single-end release paths.
  - [x] Version consistency checks explicit Hub / Agent image tags and forbidden `latest`; release docs point to full release and verification scripts.

**Verification:**

- [x] Local release preflight passes before registry verification.
  - [x] `npm.cmd --prefix internal/site run check -- --max-diagnostics=200`, `npm.cmd --prefix internal/site run build`, `npm.cmd --prefix internal/site run android:sync`, Android `assembleDebug`, `go test -tags=testing -count=1 -timeout=240s ./...`, `check-version-consistency.ps1 -Version 1.0.5`, and `verify-release-v1.ps1 -Version 1.0.5 -SkipRegistry` passed on 2026-06-16.
- [ ] Harbor contains target Hub and Agent images.
- [ ] FlyNAS actually runs target version after pull/recreate.
- [ ] Rollback to previous tag is executable and health checks pass.

## Task 15: Performance, Retention, Realtime

**Files:** Hub cleanup/records, frontend queries/hooks, charts, lists, mobile cache.

- [x] Define retention for metrics, logs, website history, alerts, operations, diagnostics.
  - [x] Existing metric retention, alert history count retention, monitored service/software cleanup, container cleanup, and notification failure retention are confirmed in the hourly record cleanup job.
  - [x] Website check history, operation actions, and operation audit now have explicit retention limits: website checks keep the latest 500 per monitor and at most 30 days; operation actions keep the latest 300 per system and at most 90 days; operation audit keeps the latest 1000 per user and at most 180 days.
  - [x] Hub technical logs keep the latest 5000 rows and at most 30 days from PocketBase `_logs`; Agent diagnostics are latest-state fields on `systems.info.capabilities` and do not create a growing history table.
- [x] Add cleanup job and logs.
  - [x] Website check, operation action, operation audit, and Hub system log cleanup run from the existing hourly `DeleteOldRecords` cron job and have regression tests.
  - [x] Cleanup success summaries log total deleted rows and per-table deleted counts when old records are actually removed; no-op cleanup runs remain quiet.
- [x] Use summary data for home and clients.
  - [x] `/api/pulse/systems/summary` returns lightweight records for home, clients, and mobile machine lists.
  - [x] System detail still fetches full `systems.info`, including Agent collection results and diagnostics, on demand.
  - [x] `/api/pulse/dashboard/summary` returns aggregated home counters so the dashboard does not load full container and website monitor lists.
  - [x] Website monitor machine filters reuse the global lightweight system summary instead of fetching full `systems` records again.
- [ ] Paginate/virtualize large logs, alerts, operations, containers, websites.
  - [x] Settings operation audit uses backend pagination, action/result filters, and search instead of loading all audit records into the browser.
  - [x] Settings system logs use Hub backend pagination, level filtering, and search; desktop and mobile views load one server-side page at a time instead of fetching a fixed 200 rows for browser-side pagination.
  - [x] Settings alert history uses Hub backend pagination, state/source filters, and search; the desktop table loads one server-side page at a time while preserving current-page delete/export actions.
  - [x] Website monitor list uses `/api/pulse/website-monitors` backend pagination, search, status filtering, and system filtering; desktop and mobile list views render only the current page.
  - [x] Container monitor list uses `/api/pulse/containers` backend system summaries and loads only the selected system's container details; realtime refreshes are debounced to the current system instead of reloading all containers.
- [x] Limit chart points and downsample.
  - [x] System detail chart state uses per-time-range data limits for realtime and historical system/container stats instead of fixed `60` / `100` caps.
  - [x] Area and line chart renderers downsample before Recharts rendering while preserving first/last points and null gap markers.
- [x] Throttle realtime updates.
  - [x] Systems realtime subscribes to lightweight fields and refreshes summaries with debounce plus a minimum interval.
  - [x] Website monitor realtime events now debounce and refresh only the current paged list instead of reloading every monitor record immediately.
  - [x] Container list refresh now follows selected-system debounce instead of refetching all systems' containers on every system update.
  - [x] Alerts center realtime updates now debounce into quiet background refreshes instead of showing full-page loading on every event.
  - [x] Mobile alerts batch short bursts of realtime events before updating the local list.
  - [x] System logs have no realtime subscription and already load one server-side page on demand.
- [x] Limit mobile offline cache size.
  - [x] Mobile offline snapshots keep only recent machine summaries, enforce a serialized size cap, compact oversized snapshots, and expire stale snapshots after 7 days.
- [x] Add Agent collection backoff.
  - [x] Agent SMART device collection now backs off per device after repeated failures and clears the backoff after a successful collection; other collectors can add the same model later if they become noisy.

**Verification:**

- [ ] 100 systems, 1000 logs, and large container/site lists remain responsive.
  - [x] Operation audit settings page loads one server-side page at a time.
  - [x] System logs settings page loads one server-side page at a time and has API regression coverage for paging, level filtering, and search.
  - [x] Alert history settings page loads one server-side page at a time and has API regression coverage for paging, user isolation, state filtering, source filtering, and search.
  - [x] Website monitor list loads one server-side page at a time and has API regression coverage for paging, search, status filtering, system filtering, stale filtering, and user isolation.
  - [x] Container monitor list loads machine summaries plus the selected machine's details and has API regression coverage for auth, user isolation, empty systems, and per-system loading.
- [ ] Database growth is bounded by retention.
- [ ] Realtime updates do not repaint whole pages.
  - [x] Systems realtime has been throttled; true large-scale stress still needs acceptance verification.
  - [x] Home dashboard counters no longer require full container and website monitor lists.
  - [x] Website monitor filters no longer require a second full systems fetch.
  - [x] Website monitor realtime has been throttled to refresh the current server page only.
  - [x] Container monitor realtime has been throttled to refresh the selected machine only.
  - [x] Alerts center realtime no longer forces a full loading state on every event; mobile alerts batch event bursts locally.

## Task 16: Security, Permissions, Secrets

**Files:** auth middleware, API guards, token UI, logs, Android storage, tests.

- [x] Define permission matrix and cover all write APIs.
  - [x] Hub custom POST/PATCH/DELETE routes are now either guarded by `excludeReadOnlyRole` or `requireAdminRole`; `/test-notification` and `/user-alerts` were the missing readonly gaps and are now blocked.
  - [x] PocketBase collection write rules for `alerts`, `alerts_history`, `notification_failures`, `notification_channel_health`, `alert_notification_states`, and `user_settings` now block readonly direct writes.
- [x] Add production security self-check.
  - [x] `/api/pulse/info` includes admin-only readiness checks for dangerous runtime configuration, including `AUTO_LOGIN`, `TRUSTED_AUTH_HEADER`, development build, MFA/password-auth policy, default local Agent token, Hub host identity, and version consistency unknown state.
  - [x] `/api/pulse/public-info` intentionally does not expose readiness checks.
  - [x] About renders readiness checks for privileged users, so production risks are visible before release without leaking them on the public runtime info endpoint.
- [x] Separate token types and expose least information.
  - [x] 普通添加机器继续走一次性配对码；长期 universal token 保留在高级入口，不进入默认接入流程。
  - [x] Agent Token 管理页默认只读取后端摘要列表；完整 Token 只在复制 YAML / 环境变量这类显式动作里按需读取。
  - [x] `fingerprints.token` 和 `universal_tokens.token` 字段从普通 collection API 响应中隐藏。
- [x] Add revoke/rotate rules.
  - [x] `fingerprints` collection 直接写入已关闭；轮换和解绑统一走 Hub 专用接口。
  - [x] 轮换由 Hub 生成新 Token 并清空设备指纹，旧 Token 立即失效；解绑只清空当前设备指纹。
  - [x] 轮换和解绑都会写入 `operation_audit`，审计目标使用机器名 / 机器 ID，不保存完整 Token。
- [x] Redact tokens, passwords, Authorization headers in logs/UI.
  - [x] Agent Token 桌面表格和手机卡片默认只显示摘要。
  - [x] 操作审计、通知测试审计、通知失败记录和通知通道健康记录写入前会脱敏 token / secret / password / API key / Authorization Bearer / webhook userinfo。
- [x] Add login failure rate limiting.
  - [x] 同一登录身份和来源 IP 连续失败会触发临时锁定，真实 PocketBase 密码登录接口返回 429。
- [x] Confirm Android sensitive data uses secure storage.
  - [x] Android Hub 地址和登录相关敏感状态沿用 Capacitor 安全存储优先、Preferences fallback 诊断可见的现有实现。
- [x] Add backup sensitive-data warning.
  - [x] 备份管理桌面端、手机端和还原 / 删除强确认文案都明确提示备份包含用户、Token、通知配置、网站地址和操作审计。

**Verification:**

- [x] Readonly user cannot write anywhere.
  - [x] Covered by route scan, collection rule assertions, direct collection API rejection tests, and `go test -tags=testing -count=1 -timeout=180s ./internal/hub ./internal/alerts`.
- [x] Dangerous backend protections hold even if UI is bypassed.
  - [x] `DELETE /api/pulse/systems/{id}` and direct `DELETE /api/collections/systems/records/{id}` both reject Hub-tagged machines; `POST /api/pulse/operations` rejects protected Pulse containers and protected Windows services with `failure_code=protected`.
- [x] Secrets are redacted in logs and UI.
  - [x] `go test -tags=testing -count=1 -timeout=180s ./internal/common ./internal/hub ./internal/alerts` 覆盖脱敏、Token 轮换 / 解绑接口、直接 collection 写入拒绝和登录限速。
- [x] Dangerous env config appears in readiness checks.

## Task 17: Production Acceptance

**Files:** acceptance checklist docs, release workflow docs, optional scripts.

- [x] Write and maintain production acceptance checklist.
  - [x] `docs/production-readiness-checklist.md` keeps the release gate overview; `docs/production-acceptance-evidence.md` records concrete evidence, status, environment, result, and follow-up.
- [x] Include clean-data initialization, real Agent pairing, identity, hardware truth, containers, websites, alerts, operations, settings, mobile, security, performance, deployment, rollback.
  - [x] Checklist sections 1-17 cover initialization, Agent pairing, Hub identity, hardware truth, containers, websites, alerts, operations, settings, mobile, versioning, deployment, performance, security, fixed commands, and rollback.
- [x] Require recorded pass/fail evidence before release.
  - [x] Acceptance evidence rules now define allowed evidence types and release blockers; items without reproducible evidence must stay pending or blocked.

**Verification Commands:**

- [x] `npm.cmd --prefix internal/site run check`
- [x] `npm.cmd --prefix internal/site run build`
- [x] `npm.cmd --prefix internal/site run android:sync`
- [x] `go test -tags=testing -count=1 -timeout=240s ./...`
- [x] `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\check-version-consistency.ps1 -Version 1.0.5`
- [ ] `powershell -NoProfile -ExecutionPolicy Bypass -File supplemental\scripts\verify-release-v1.ps1 -Version 1.0.5`
  - [x] Local artifact verification passed with `-SkipRegistry`; full registry verification remains pending until the actual Harbor push.
- [ ] Browser checks for desktop and mobile viewports.
- [ ] MuMu Android checks.
- [ ] FlyNAS deploy and rollback checks.
