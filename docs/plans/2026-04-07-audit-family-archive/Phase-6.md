# Phase 6 — Guardrails, Lint, CI, Hooks, Type Strictness [FORTIFIER]

## Goal

Add additive guardrails so the cleanup and refactors from earlier phases stay
clean. No behavior changes; every check below either passes today (after
Phases 1–5) or fails on a real regression.

Estimated tokens: 25k.

## Prerequisites

- Phases 1–5 merged.

## Task 6.1 — TypeScript strictness ratchet

**Files:**

- `backend/lambdas/api/tsconfig.json`
- `backend/lambdas/letter-processor/tsconfig.json`
- `frontend/tsconfig.json`

**Steps:**

1. Enable `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
   `noImplicitOverride`, `noFallthroughCasesInSwitch` (where not already on).
1. Run `npm run lint`. Fix every new error in the same commit, do not suppress
   with `@ts-ignore`.

**Verification checklist:**

- [x] All four flags on
- [x] No new `@ts-ignore`
- [x] Lint and tests green

**Commit:** `chore(ts): enable strict tsconfig flags across workspaces`

## Task 6.2 — ESLint rules to lock in invariants

**Files:**

- `eslint.config.js` (or `.eslintrc.*`)

**Steps:**

1. Add `no-restricted-syntax` rules forbidding `event.resource` switches
   inside `backend/lambdas/api/src/routes/**`.
1. Add a custom or off-the-shelf rule banning `as Error` and the non-null `!`
   assertion operator on `userId`.
1. Add `no-restricted-imports` to forbid importing `getSignedUrl` outside
   `lib/s3-presign.ts`.
1. Run `npm run lint`. It must pass with `--max-warnings 0`.

**Verification checklist:**

- [x] Rules present and active
- [x] `npm run lint` green
- [x] A deliberate violation in a scratch file fails lint (manual smoke)

**Commit:** `chore(lint): add guardrail rules for router, presign, and typed errors`

## Task 6.3 — Knip in CI

**Files:**

- `.github/workflows/ci.yml`
- `package.json` (root) — add `"knip": "knip --no-progress"` script

**Steps:**

1. Add a `knip` job to the CI workflow that runs `npx knip --no-progress` and
   fails on any unused export, type, or dependency.
1. If knip flags an unavoidable export (e.g. SvelteKit page exports), add it
   to a `knip.json` ignore list with a comment explaining why.

**Verification checklist:**

- [x] CI job present and required
- [x] `knip.json` ignore list documented
- [x] CI green on the PR

**Commit:** `ci: add knip job to enforce zero unused exports`

## Task 6.4 — npm audit in CI

**Files:**

- `.github/workflows/ci.yml`

**Steps:**

1. Add a job that runs `npm audit --audit-level=high` at root and inside
   `frontend/`. Fail on any high or critical.
1. Document the dependabot escape hatch in CI comments.

**Verification checklist:**

- [x] Job present and required
- [x] CI green

**Commit:** `ci: fail builds on high or critical npm audit findings`

## Task 6.5 — Pre-commit hook for lint and typecheck

**Files:**

- `.husky/pre-commit`
- `package.json` (root)

**Steps:**

1. The repo already uses Husky for commitlint. Add a `pre-commit` hook that
   runs `npm run lint` on staged files via `lint-staged`.
1. Add `lint-staged` config covering `.ts`, `.tsx`, `.svelte`, `.js`.
1. Document the bypass (`--no-verify`) is forbidden in `CLAUDE.md`.

**Verification checklist:**

- [x] Hook installed
- [x] `lint-staged` config present
- [x] Hook fires on a sample commit

**Commit:** `chore(hooks): add pre-commit lint-staged hook`

## Phase Verification

1. CI passes with the new jobs required.
1. A deliberate violation in a scratch branch fails the right job.
