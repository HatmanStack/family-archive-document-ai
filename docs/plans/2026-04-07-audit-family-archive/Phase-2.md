# Phase 2 — Router Migration and Auth Middleware Consolidation [IMPLEMENTER]

## Goal

Eliminate the dual-router tech debt. Convert every legacy `handle()` dispatcher
to per-verb handler exports registered on the declarative `Router`. Move
`requireAuth()` to a default middleware so route handlers stop using `userId!`
non-null assertions.

Success criteria:

- Zero `event.resource` or `event.httpMethod` switches inside any file under
  `backend/lambdas/api/src/routes/`.
- `requireAuth()` is the default for all routes; the public allow list is
  explicit and short.
- All existing tests still pass; new unit tests cover each migrated route file.

Estimated tokens: 40k.

## Prerequisites

- Phase 1 merged.
- Familiarity with `backend/lambdas/api/src/lib/router.ts` and
  `backend/lambdas/api/src/routes/messages.ts` (the reference shape).

## Task 2.1 — Migrate `routes/comments.ts` to per-verb exports

**Goal:** Replace the inner `handle()` switch with named per-verb functions
registered in `index.ts`.

**Files:**

- `backend/lambdas/api/src/routes/comments.ts`
- `backend/lambdas/api/src/index.ts`
- `tests/unit/comments-handler.test.ts` (or create)

**Steps:**

1. Read `routes/messages.ts` end to end to confirm the shape: each verb is its
   own exported async function `(event, context) => Promise<APIGatewayProxyResult>`.
1. For each method+resource branch in current `comments.handle`, extract a
   named export. Use the same path parameter parsing the router already
   provides via `event.pathParameters` populated by `Router`.
1. Register each new handler in `index.ts` using the existing `router.get()`,
   `router.post()`, etc. Match the existing `event.resource` strings.
1. Delete `handle` from `comments.ts`.
1. Add or update unit tests covering each handler with `aws-sdk-client-mock`.

**Verification checklist:**

- [ ] No `handle` export in `comments.ts`
- [ ] No `event.resource` switch in `comments.ts`
- [ ] All comment endpoints registered in `index.ts`
- [ ] New unit tests cover happy + 1 error path per verb

**Commit:** `refactor(api): migrate comments routes to declarative router`

## Task 2.2 — Migrate `routes/profile.ts`

Same pattern as Task 2.1 for `profile.ts`. Pay attention to the duplicated
`replace(/^\/v1/, '')` logic flagged in health-audit.md low #6: extract it into
`lib/path-utils.ts` exported function `stripVersionPrefix()`.

**Files:**

- `backend/lambdas/api/src/routes/profile.ts`
- `backend/lambdas/api/src/lib/path-utils.ts` (new)
- `backend/lambdas/api/src/index.ts`
- `tests/unit/profile-handler.test.ts`

**Verification checklist:**

- [ ] `handle` removed
- [ ] `stripVersionPrefix` used in both `index.ts` and former `profile.ts` code path
- [ ] Tests green and new tests added per verb

**Commit:** `refactor(api): migrate profile routes and extract stripVersionPrefix`

## Task 2.3 — Migrate `routes/letters.ts`

Same pattern. Watch for the upload-request endpoint which currently lives
under a `/letters/*` prefix.

**Files:**

- `backend/lambdas/api/src/routes/letters.ts`
- `backend/lambdas/api/src/index.ts`
- `tests/unit/letters-handler.test.ts`

**Commit:** `refactor(api): migrate letters routes to declarative router`

## Task 2.4 — Migrate `routes/drafts.ts`, `routes/media.ts`, `routes/reactions.ts`

Same pattern, one commit per file.

**Files:** the three route files plus `index.ts` and matching unit tests.

**Commits:**

1. `refactor(api): migrate drafts routes to declarative router`
1. `refactor(api): migrate media routes to declarative router`
1. `refactor(api): migrate reactions routes to declarative router`

## Task 2.5 — Default `requireAuth()` middleware

**Goal:** Add `requireAuth()` to the router as a default middleware. Public
endpoints opt out via an explicit allow list.

**Files:**

- `backend/lambdas/api/src/lib/router.ts`
- `backend/lambdas/api/src/lib/middleware.ts`
- `backend/lambdas/api/src/index.ts`
- Affected route handlers (remove redundant per-handler auth checks)

**Steps:**

1. Add a `defaultMiddleware` array option to `Router` constructor that runs
   before per-route middleware.
1. Build the public route allow list: contact form POST, anything Cognito
   callback related, the OPTIONS preflight handler.
1. Wire `requireAuth()` as the default; allow list bypasses it.
1. Remove `userId!` non-null assertions in `routes/messages.ts` and the newly
   migrated routes. Read `userId` from a typed helper that throws
   `UnauthorizedError` if absent (which the middleware already prevents).
1. Update unit tests to use mocked auth context.

**Verification checklist:**

- [ ] No `userId!` assertions remain under `routes/`
- [ ] Public allow list is short and explicit
- [ ] Existing unit tests pass; new test verifies a public route bypasses auth
      and a private route 401s without auth

**Commit:** `feat(api): default requireAuth middleware with explicit public allowlist`

## Task 2.6 — Cache `ensureProfile` for warm invocations

**Goal:** Eliminate the per-request DDB Get on `ensureProfile` flagged in both
audits.

**Files:**

- `backend/lambdas/api/src/index.ts`
- `backend/lambdas/api/src/lib/user.ts`
- `tests/unit/ensure-profile.test.ts` (new)

**Steps:**

1. Replace `gsi1VerifiedUsers: Set<string>` with a bounded LRU (max ~1000
   entries) plus optional TTL of 10 minutes. Use a tiny in-file LRU; do not
   add a dependency.
1. Short-circuit `ensureProfile` when the user id is present in the cache.
1. On DDB transient failure, log and continue (fail-open) rather than 500.
1. Unit test cache hit, cache miss, eviction, and DDB failure path.

**Verification checklist:**

- [ ] Bounded cache (size + TTL)
- [ ] Failure path no longer 500s the request
- [ ] Test for hit, miss, eviction, transient failure

**Commit:** `perf(api): cache ensureProfile for warm Lambda invocations`

## Phase Verification

1. `grep -rn "event.resource" backend/lambdas/api/src/routes/` returns nothing.
1. `grep -rn "userId!" backend/lambdas/api/src/routes/` returns nothing.
1. `npm test` green, `npm run lint` green.
1. Manual sanity: each route file has only per-verb exports plus helpers, no
   `handle` export.
