# Phase 4 — Test Coverage Expansion [IMPLEMENTER]

## Goal

Lift integration coverage to match the API surface and add a smoke E2E for the
letter upload pipeline. Document the `aws-sdk-client-mock` pattern so future
contributors do not reinvent it.

Estimated tokens: 30k.

## Prerequisites

- Phases 1–3 merged.
- Familiarity with `tests/integration/comments.test.js` as the reference shape.

## Task 4.1 — Integration tests for letters route

**Files:**

- `tests/integration/letters.test.ts`
- Test fixtures under `tests/integration/fixtures/letters/`

**Steps:**

1. Cover happy path GET list, GET by date, POST upload-request, and the
   migrated PUT/DELETE verbs from Phase 2.
1. Mock S3 and DDB via `aws-sdk-client-mock`.
1. Use the same lambda invocation harness `comments.test.js` uses.

**Verification checklist:**

- [ ] At least one test per verb
- [ ] At least one 4xx error path per verb
- [ ] Tests run under `npm test`

**Commit:** `test(api): add integration coverage for letters route`

## Task 4.2 — Integration tests for media, reactions, drafts

One commit per route file.

**Commits:**

1. `test(api): add integration coverage for media route`
1. `test(api): add integration coverage for reactions route`
1. `test(api): add integration coverage for drafts route`

## Task 4.3 — E2E smoke for letter upload pipeline

**Files:**

- `tests/e2e/letter-upload.spec.ts`

**Steps:**

1. Use Playwright to log in with the seeded test user.
1. Upload a small fixture PDF via the gallery upload modal.
1. Poll the letters list until the new letter appears (max 60s with 2s
   intervals).
1. Assert the title and date round-trip from the Gemini parse step.

**Verification checklist:**

- [ ] Spec runs under `npm run test:e2e`
- [ ] Polling timeout configurable via env var
- [ ] Skips cleanly when `RAGSTACK_*` is unset (mock mode)

**Commit:** `test(e2e): add letter upload pipeline smoke test`

## Task 4.4 — `tests/README.md`

**Files:**

- `tests/README.md` (new)

**Steps:**

1. Document the test pyramid: unit, integration, E2E, load.
1. Document the `aws-sdk-client-mock` pattern with a minimal example.
1. Document fixture locations and naming.
1. Document how to run a single file vs the full suite.

**Verification checklist:**

- [ ] File renders in markdown
- [ ] markdownlint-clean (Phase 7 will enforce this in CI)

**Commit:** `docs(tests): document test pyramid and aws-sdk-client-mock pattern`

## Phase Verification

1. `npm test` and `npm run test:e2e` green.
1. Integration coverage now includes letters, media, reactions, drafts.
