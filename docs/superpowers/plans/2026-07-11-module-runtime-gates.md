# Module Runtime Gates Implementation Plan

> **For agentic workers:** This focused runtime-gate fix is being executed inline in the current task.

**Goal:** Ensure module-disabled responses stop request processing and prevent unauthenticated Agent pairing from bypassing the `agent-management` module switch.

**Architecture:** Keep module policy resolution in `internal/hub/module_gate.go`. Gate handlers receive an explicit `allowed` result so a response already written by the gate cannot continue to `Next()`. Pairing checks the module after resolving the pairing-code owner, before creating a system or token.

**Tech Stack:** Go, PocketBase request hooks, Hub API integration tests with isolated test data.

---

### Task 1: Reproduce the bypass

**Files:**
- Modify: `internal/hub/module_gate_test.go`

- [x] Add a valid pairing-code scenario with `agent-management` disabled.
- [x] Run the focused test and observe the old 200 pairing response.

### Task 2: Close the request and pairing gates

**Files:**
- Modify: `internal/hub/module_gate.go`
- Modify: `internal/hub/api.go`

- [x] Return an explicit allowed flag from module gate resolution.
- [x] Stop collection and custom route hooks after writing a disabled response.
- [x] Check the pairing-code owner's module state before system creation.

### Task 3: Verify and document

**Files:**
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] Add the change to the 1.0.6 development record.
- [x] Run focused and full Hub tests, `go vet`, Web tests/check/build, and `git diff --check`.
- [x] Commit the independent change.
