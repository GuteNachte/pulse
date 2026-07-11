# Asset Detail Data Loading Implementation Plan

> **For agentic workers:** This focused refactor is being executed inline in the current task. Each step is verified before the next one.

**Goal:** Move asset detail data-query contracts and state merging out of the 2,000+ line page component without changing the visible asset detail behavior.

**Architecture:** `asset-detail-data.ts` owns the typed primary/secondary query orchestration and pure state merge helpers. `asset-detail-page.tsx` remains responsible for lifecycle guards, UI state, notifications, and write actions. Existing query helpers are reused so filters and field projections stay centralized.

**Tech Stack:** React + TypeScript, PocketBase collection APIs, Node `--experimental-strip-types` contract tests, Biome, Vite.

---

### Task 1: Lock the data contracts with tests

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-detail-data.test.ts`

- [x] Define tests for primary query filters and typed result shape.
- [x] Define tests for stale-asset-safe secondary and edit-catalog state merges.
- [x] Run the focused test and confirm it fails because the module is not implemented.

### Task 2: Implement the data module

**Files:**
- Create: `internal/site/src/modules/asset-center/asset-detail-data.ts`
- Modify: `internal/site/src/modules/asset-center/asset-detail-page.tsx`

- [x] Move `AssetDetailState` and the empty state into the data module.
- [x] Move primary and secondary read queries into typed functions.
- [x] Move catalog and secondary state merge rules into pure functions.
- [x] Keep `AssetDetailLoadToken` checks in the page component at the state-update boundary.

### Task 3: Integrate and verify

**Files:**
- Modify: `internal/site/package.json`
- Modify: `docs/release-notes-next.md`
- Modify: `internal/site/src/components/routes/settings/release-history.ts`

- [x] Add the focused contract test to `test:asset-center`.
- [x] Run focused asset-center tests, Web check, and production build; full Web regression and Hub gates remain in the task verification queue.
- [ ] Commit the independent refactor after all checks pass.
