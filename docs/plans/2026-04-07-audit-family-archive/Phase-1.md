# Phase 1 — Subtractive Cleanup, Dead Code, Vite CVE [HYGIENIST]

## Goal

Delete dead code, unused exports, unused types, and resolve the high-severity
vite CVE before any structural refactor begins. Subtraction first so later
phases never migrate dead weight.

Success criteria:

- `npx knip` reports zero unused exports for the items listed below.
- `npm audit` reports zero high vulnerabilities.
- `npm test` and `npm run lint` pass.

Estimated tokens: 25k.

## Prerequisites

- Phase 0 read in full.
- Clean working tree on a fresh feature branch in a worktree.
- `npm ci` complete at root and `frontend/`.

## Task 1.1 — Patch vite CVE

**Goal:** Resolve `GHSA-p9ff-h696-f583`, `GHSA-4w7w-66w2-5vf9`,
`GHSA-v2wj-q39q-566r` regressions.

**Files:**

- `package.json`, `package-lock.json`
- `frontend/package.json`, `frontend/package-lock.json` if applicable

**Steps:**

1. Run `npm audit` at repo root and inside `frontend/` to capture the current
   advisories.
1. Run `npm audit fix` where safe. If a forced upgrade is required, use
   `npm install vite@latest --save-dev` in the workspace that owns vite.
1. Re-run `npm audit` to confirm zero high.
1. Run `npm run lint` and `npm test`, confirm green.

**Verification checklist:**

- [x] `npm audit` zero high at root
- [x] `npm audit` zero high inside `frontend/`
- [x] `npm test` green
- [x] `npm run lint` green

**Commit:** `fix(deps): patch vite GHSA-p9ff/4w7w/v2wj advisories`

## Task 1.2 — Delete unused backend constants

**Goal:** Remove the 8 unused exports flagged by knip in
`backend/lambdas/api/src/lib/constants.ts`.

**Files:**

- `backend/lambdas/api/src/lib/constants.ts`

**Steps:**

1. Run `npx knip` and confirm the 8 exports listed in `health-audit.md`
   medium #5 are still unused.
1. Delete each unused export. Do not wire them into call sites in this task,
   that decision is deferred to Phase 3.
1. Re-run `npx knip` and confirm those entries are gone.
1. Run `npm test` and `npm run lint`.

**Verification checklist:**

- [x] 8 named exports gone
- [x] knip clean for `constants.ts`
- [x] Tests green

**Commit:** `chore(api): delete unused constants from constants.ts`

## Task 1.3 — Delete unused validation and user helpers

**Goal:** Remove 27 unused exports flagged by knip including
`validateCommentId`, `sanitizeContent`, `validateEmail`, `getProfile`, and the
abandoned `CommentRepository` class.

**Files:**

- `backend/lambdas/api/src/lib/validation.ts`
- `backend/lambdas/api/src/lib/user.ts`
- `backend/lambdas/api/src/repositories/comment-repository.ts`

**Steps:**

1. Generate the full knip report. Cross-reference each unused export against
   `Grep` of the repo to confirm zero references.
1. Delete each confirmed-dead export. Delete the entire
   `comment-repository.ts` file if it has no remaining exports in use.
1. If deleting the file, also remove its barrel re-exports if any.
1. Run `npx knip`, `npm test`, `npm run lint`.

**Verification checklist:**

- [x] knip reports zero unused exports in `validation.ts`, `user.ts`
- [x] `comment-repository.ts` deleted or knip-clean
- [x] No grep hits for any deleted symbol
- [x] Tests green

**Commit:** `chore(api): remove unused validation, user, and comment-repository code`

## Task 1.4 — Delete unused backend types

**Goal:** Remove 24 unused exported types/interfaces from
`backend/lambdas/api/src/types/index.ts`.

**Files:**

- `backend/lambdas/api/src/types/index.ts`

**Steps:**

1. For each type listed in health-audit.md hygiene #7, grep the repo to confirm
   zero usage.
1. Delete the type. Where a type is duplicated inline elsewhere (e.g.
   `MessageRecord` in `messaging-repository.ts:53`), record the duplication in
   `feedback.md` Active Feedback for Phase 3 to consolidate, but do not move it
   in this phase.
1. Run `npx knip`, `npm test`, `npm run lint`.

**Verification checklist:**

- [x] 24 type/interface exports gone
- [x] knip clean for `types/index.ts`
- [x] feedback.md notes inline-type duplications for Phase 3
- [x] Tests green

**Commit:** `chore(api): delete unused exported types`

## Task 1.5 — Delete unused frontend exports

**Goal:** Remove unused exports in `frontend/lib/config/general.ts` and
`frontend/lib/auth/middleware.ts`.

**Files:**

- `frontend/lib/config/general.ts`
- `frontend/lib/auth/middleware.ts`

**Steps:**

1. Confirm via grep that `head`, `header`, `footer`, `date`, `feed`,
   `requireApprovedUser`, `getAuthenticatedUser`, `getOptionalUser`,
   `isAuthenticated` have zero references.
1. Delete each. If `middleware.ts` becomes empty, delete the file.
1. Run `npm run lint` and `npm test` from repo root.

**Verification checklist:**

- [x] All 9 exports gone
- [x] Empty files deleted
- [x] Lint and tests green

**Commit:** `chore(frontend): remove unused config and auth-middleware exports`

## Task 1.6 — Clean up unused test imports and lambda package metadata

**Goal:** Remove unused imports in test files and align
`notification-processor` / `activity-aggregator` `package.json` `main` entries
with their actual `.ts` source.

**Files:**

- Test files flagged by knip under `tests/`
- `backend/lambdas/notification-processor/package.json`
- `backend/lambdas/activity-aggregator/package.json`

**Steps:**

1. Run `npx knip` and capture every unused-test-import finding.
1. Delete each unused import statement.
1. In the two lambda `package.json` files, set `main` to the actual built
   entry (typically `dist/index.js`) or remove the field if SAM does not use
   it. Verify `template.yaml` `Handler` paths to choose correctly.
1. Run `npm test` and `npm run lint`.

**Verification checklist:**

- [x] knip reports no unused test imports
- [x] Both lambda `package.json` entries resolve
- [x] Tests green

**Commit:** `chore: clean unused test imports and lambda package metadata`

## Phase Verification

1. `npx knip` summary shows the items above resolved.
1. `npm audit` zero high at root and `frontend/`.
1. `npm test` and `npm run lint` green.
1. `git log --oneline` shows 6 atomic commits matching the templates above.
