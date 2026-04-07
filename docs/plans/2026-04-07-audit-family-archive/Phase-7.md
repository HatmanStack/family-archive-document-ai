# Phase 7 — Documentation Repair and Prevention Tooling [DOC-ENGINEER]

## Goal

Resolve every drift, gap, stale, and config-drift finding from `doc-audit.md`,
then add markdownlint and lychee to CI so doc rot becomes a build failure.

Estimated tokens: 25k.

## Prerequisites

- Phases 1–6 merged. (Code now matches what the docs should describe.)

## Task 7.1 — Repair drift in CLAUDE.md, FRONTEND.md, ARCHITECTURE.md

**Files:**

- `CLAUDE.md`
- `docs/FRONTEND.md`
- `docs/ARCHITECTURE.md`

**Steps:**

1. `CLAUDE.md`: change `profile-handler.test.js` to `profile-handler.test.ts`.
1. `docs/FRONTEND.md`: remove `lib/auth/client.ts` from the auth file map. Add
   `lib/auth/auth-utils.ts` and `lib/auth/cognito-client.ts`. Update the
   Letters Service example to drop the obsolete `authToken` positional arg.
   Update the Comment.svelte example to Svelte 5 syntax (`$props()`,
   `onclick`).
1. `docs/FRONTEND.md`: extend the project tree to mention `lib/config/` and
   `lib/utils/` and the gallery and profile subcomponent directories created
   in Phase 5.
1. `docs/ARCHITECTURE.md`: remove the obsolete `/media/*`, `/pdf/*`, `/upload/*`
   prefix-dispatch pseudocode. Replace it with a short description of the
   declarative `Router` plus a link to `lib/router.ts`. Add the
   `repositories/` directory and `letter-processor/src/lib/` to the Shared
   Libraries table.

**Verification checklist:**

- [ ] All listed strings updated
- [ ] markdownlint-clean
- [ ] No mention of removed files

**Commit:** `docs: repair drift in CLAUDE.md, FRONTEND.md, ARCHITECTURE.md`

## Task 7.2 — Document missing routes and modules

**Files:**

- `docs/API_REFERENCE.md`
- `docs/DEVELOPMENT.md`

**Steps:**

1. Add `POST /messages/attachments/upload-url` to `API_REFERENCE.md` with
   request/response shape matching the route handler.
1. Add the `repositories/` directory and `backend/lambdas/shared/` module to
   `DEVELOPMENT.md` Lambda Structure tree.
1. Add letter-processor `lib/` (`config.ts`, `retry.ts`, plus the new
   `concurrency.ts` and `logger.ts` from Phase 3) to the structure tree.

**Verification checklist:**

- [ ] New route documented
- [ ] Repositories and shared module listed
- [ ] markdownlint-clean

**Commit:** `docs: document repositories layer and missing message upload route`

## Task 7.3 — Fix DEPLOYMENT and config drift

**Files:**

- `docs/DEPLOYMENT.md`
- `docs/AUTHENTICATION.md`
- `.env.example`

**Steps:**

1. Reconcile the Cognito User Pool description in `DEPLOYMENT.md` against
   `backend/template.yaml`. Quote the template values verbatim.
1. Move `LOG_LEVEL` documentation under the API lambda section instead of
   frontend-builder/amplify-deployer.
1. Pick one default region (`us-west-2`) and update every example in
   `DEPLOYMENT.md`, `AUTHENTICATION.md`, and `.env.example` to match. Note any
   region that legitimately differs (e.g. RAGSTACK in `us-east-1`).
1. Reconcile guest user docs: pick one invocation
   (`node scripts/create-guest-user.js`) and one password format. Update both
   `.env.example` and `DEPLOYMENT.md` to match.

**Verification checklist:**

- [ ] Cognito description matches `template.yaml`
- [ ] LOG_LEVEL documented under correct lambda
- [ ] Region usage consistent
- [ ] Guest user instructions consistent

**Commit:** `docs: fix DEPLOYMENT, AUTH, and env-example drift`

## Task 7.4 — CHANGELOG entry for the audit cycle

**Files:**

- `CHANGELOG.md`

**Steps:**

1. Add a new version entry covering the cleanup, router migration,
   performance, decomposition, guardrails, and doc work from this plan.
1. Reference the plan id `2026-04-07-audit-family-archive` in the entry.

**Verification checklist:**

- [ ] Entry follows existing CHANGELOG format
- [ ] Plan id referenced

**Commit:** `docs: changelog entry for 2026-04-07 audit remediation`

## Task 7.5 — markdownlint and lychee in CI

**Files:**

- `.markdownlint.jsonc` (new)
- `.lychee.toml` (new)
- `.github/workflows/ci.yml`
- `package.json` (root) — add `"docs:lint": "markdownlint-cli2 \"**/*.md\" \"#node_modules\""`

**Steps:**

1. Add `.markdownlint.jsonc` configured for the rules listed in Phase 0.
1. Add `.lychee.toml` configured to check all `.md` files, exclude
   localhost, and accept the public CloudFormation template URL referenced
   in `README.md`.
1. Add a `docs` job to CI that runs both `markdownlint-cli2` and `lychee`.
   Fail on any error.
1. Run both locally and fix every reported issue. Issues outside the audit
   findings should be fixed in this same commit if small, or recorded in
   `feedback.md` Active Feedback if large.

**Verification checklist:**

- [ ] Both configs present
- [ ] CI job present and required
- [ ] Local run clean
- [ ] CI green

**Commit:** `ci: add markdownlint and lychee doc checks`

## Phase Verification

1. CI doc job green.
1. `grep -rn "client.ts" docs/` returns nothing meaningful.
1. `npx markdownlint-cli2 "**/*.md" "#node_modules"` clean.
1. `lychee --config .lychee.toml "**/*.md"` clean.
1. Every drift, gap, stale, and config-drift item from `doc-audit.md` is
   resolved or explicitly tracked in `feedback.md`.

PLAN_COMPLETE
