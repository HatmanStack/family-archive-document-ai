# Phase 1 -- [HYGIENIST] Cleanup and Deduplication

## Phase Goal

Remove duplicated code, consolidate scattered utilities, and simplify patterns that have
diverged over time. This is purely subtractive work -- no new features, no structural changes.

**Success criteria:**

- JWT decode exists in exactly 1 location on the frontend
- Rate-limit boilerplate in messages route is consolidated
- `console.warn` in `user.ts` uses structured logger
- SES env var validation is complete in contact route
- Profile photo filename is sanitized

**Estimated tokens:** ~20,000

## Prerequisites

- Phase 0 read and understood (especially ADR-4 on deduplication strategy)
- All dependencies installed (`npm install` at root)
- Tests pass before starting: `npm test`

## Tasks

### Task 1: Deduplicate JWT decode on frontend

**Goal:** Extract the 3 identical `decodeJWT` implementations into a single shared utility.
This closes health-audit finding #5 and addresses eval Code Quality concerns.

**Files to modify:**

- `frontend/lib/auth/jwt-decode.ts` -- Create new file with the single implementation
- `frontend/lib/auth/auth-service.ts` -- Remove local `decodeJWT`, import from `jwt-decode.ts`
- `frontend/lib/auth/client.ts` -- Remove local `decodeJWTPayload`, import from `jwt-decode.ts`
- `frontend/lib/auth/google-oauth.ts` -- Remove local `decodeJWT`, import from `jwt-decode.ts`

**Prerequisites:** None

**Implementation Steps:**

1. Read all three current implementations to confirm they are identical in logic (they differ
   only in function name and error logging). The logic is: split on `.`, take index 1,
   replace `-` with `+` and `_` with `/`, `atob`, `decodeURIComponent` with char-code mapping,
   `JSON.parse`.
1. Create `frontend/lib/auth/jwt-decode.ts` exporting a typed function:

   ```typescript
   export function decodeJWTPayload(token: string): Record<string, unknown> | null
   ```

1. In `auth-service.ts`: remove the local `decodeJWT` function (lines 8-24). Import
   `decodeJWTPayload` from `./jwt-decode`. Update the call site in `mapJwtPayloadToUser`
   and any other callers.
1. In `client.ts`: remove the local `decodeJWTPayload` function (lines 63-79). Import from
   `./jwt-decode`. The exported name stays the same so callers of `client.ts` are unaffected.
   Re-export `decodeJWTPayload` from `client.ts` if any external code imports it from there.
1. In `google-oauth.ts`: remove the private `decodeJWT` method (lines 83-98). Import from
   `./jwt-decode`. Update the class method that calls it.

**Verification Checklist:**

- [x] `decodeJWT` / `decodeJWTPayload` function exists in exactly 1 file (`jwt-decode.ts`)
- [x] All 3 original files import from `jwt-decode.ts`
- [x] `npm run lint` passes from `frontend/`
- [x] `npm test` passes (no regressions)
- [x] The function returns `Record<string, unknown> | null` (not `any`)

**Testing Instructions:**

- No new tests needed -- this is a refactor. Existing tests and lint must pass.
- Manually verify the import chain: `grep -r "decodeJWT" frontend/lib/auth/` should show
  only imports, not function declarations, except in `jwt-decode.ts`.

**Commit Message Template:**

```text
refactor(auth): deduplicate JWT decode into single shared utility

- Extract decodeJWTPayload to frontend/lib/auth/jwt-decode.ts
- Remove duplicate implementations from auth-service, client, google-oauth
- Return typed Record<string, unknown> instead of any
```

### Task 2: Replace console.warn with structured logger in user.ts

**Goal:** The single `console.warn` in `backend/lambdas/api/src/lib/user.ts:41` bypasses
structured logging. This closes health-audit finding #26 (quick win #3).

**Files to modify:**

- `backend/lambdas/api/src/lib/user.ts` -- Replace `console.warn` with `log.warn`

**Prerequisites:** None

**Implementation Steps:**

1. Add import for `log` from `./logger` at the top of the file (if not already imported).
1. Replace `console.warn('GSI1 backfill failed:', toError(err).message)` on line 41 with
   `log.warn('gsi1_backfill_failed', { error: toError(err).message })`.

**Verification Checklist:**

- [x] No `console.warn` calls remain in `user.ts`
- [x] `log` is imported from `./logger`
- [x] `npm test` passes

**Testing Instructions:**

- No new tests needed -- this is a logging change. Existing tests must pass.

**Commit Message Template:**

```text
fix(logger): replace console.warn with structured log in user.ts

- Use log.warn for GSI1 backfill failure instead of console.warn
```

### Task 3: Add SES_FROM_EMAIL validation in contact route

**Goal:** The contact route checks `ADMIN_EMAIL` but not `SES_FROM_EMAIL` before sending.
An empty `SES_FROM_EMAIL` causes a confusing AWS SDK error. This closes health-audit
finding #12 (quick win #4).

**Files to modify:**

- `backend/lambdas/api/src/routes/contact.ts` -- Add `SES_FROM_EMAIL` check

**Prerequisites:** None

**Implementation Steps:**

1. In `contact.ts`, find the `if (!ADMIN_EMAIL)` check at line 69.
1. Expand it to also check `SES_FROM_EMAIL`:

   ```typescript
   if (!ADMIN_EMAIL || !SES_FROM_EMAIL) {
     log.error('contact_not_configured', {
       reason: !ADMIN_EMAIL ? 'ADMIN_EMAIL not set' : 'SES_FROM_EMAIL not set'
     })
     return errorResponse(500, 'Contact form not configured', requestOrigin)
   }
   ```

**Verification Checklist:**

- [x] Both `ADMIN_EMAIL` and `SES_FROM_EMAIL` are validated before use
- [x] Log message indicates which variable is missing
- [x] `npm test` passes

**Testing Instructions:**

- No existing tests for contact route. This will be covered in Phase 4.

**Commit Message Template:**

```text
fix(contact): validate SES_FROM_EMAIL before sending email

- Check both ADMIN_EMAIL and SES_FROM_EMAIL are set
- Return clean 500 instead of obscure AWS SDK error
```

### Task 4: Sanitize profile photo filename extension

**Goal:** The profile photo upload uses `filename.split('.').pop()` for the file extension
without sanitization. Apply the same pattern used in messages route. This closes health-audit
finding #11.

**Files to modify:**

- `backend/lambdas/api/src/routes/profile.ts` -- Sanitize the extension extraction

**Prerequisites:** None

**Implementation Steps:**

1. In `profile.ts`, find line 329: `const ext = filename.split('.').pop() || 'jpg'`
1. Replace with safe extraction using `path.basename()` and regex, matching the pattern
   in `messages.ts:425`:

   ```typescript
   const safeName = path.basename(filename)
   const ext = (safeName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || 'jpg').toLowerCase()
   ```

1. Add `import path from 'node:path'` at the top of the file if not already present.
1. Also add the explicit `undefined` check for `contentType` before `allowedTypes.includes()`:

   ```typescript
   if (!contentType || !allowedTypes.includes(contentType)) {
   ```

**Verification Checklist:**

- [x] Extension is extracted via `path.basename()` + regex, not raw `split('.').pop()`
- [x] `contentType` is explicitly checked for falsy before `includes()`
- [x] `path` module is imported
- [x] `npm test` passes

**Testing Instructions:**

- No existing tests for profile route upload. This will be covered in Phase 4.

**Commit Message Template:**

```text
fix(profile): sanitize photo upload filename and validate contentType

- Use path.basename + regex for safe extension extraction
- Add explicit undefined check for contentType parameter
```

### Task 5: Add correlation ID safety comment to logger

**Goal:** Per ADR-5, document the Lambda single-invocation assumption on the module-level
`currentCorrelationId`. This closes health-audit finding #3 with a documented decision
rather than a code change.

**Files to modify:**

- `backend/lambdas/api/src/lib/logger.ts` -- Add comment

**Prerequisites:** None

**Implementation Steps:**

1. Replace the comment on line 16-17 with an expanded version:

   ```typescript
   // Module-level state is safe in AWS Lambda: each execution environment processes
   // one request at a time (even with Provisioned Concurrency). If this code is ever
   // deployed as a long-running server (ECS/Fargate), migrate to AsyncLocalStorage.
   // See: ADR-5 in docs/plans/2026-03-23-audit-document-ai/Phase-0.md
   let currentCorrelationId: string | undefined
   ```

**Verification Checklist:**

- [x] Comment explains the safety assumption and migration trigger
- [x] No functional changes to logger behavior
- [x] `npm test` passes

**Testing Instructions:**

- No tests needed -- comment-only change.

**Commit Message Template:**

```text
docs(logger): document Lambda concurrency safety assumption for correlation ID

- Add ADR-5 reference explaining module-level state is safe in Lambda
- Document migration trigger (move to AsyncLocalStorage if deployed as server)
```

## Phase Verification

After completing all tasks:

1. Run full test suite: `npm test` -- all tests must pass
1. Run lint: `cd frontend && npm run lint` -- no errors
1. Verify deduplication: `grep -rn "function decodeJWT" frontend/lib/auth/` should show
   exactly 1 result (in `jwt-decode.ts`)
1. Verify no `console.warn` in API Lambda lib: `grep -rn "console.warn" backend/lambdas/api/src/lib/`
   should return 0 results
1. Verify contact route validates both env vars: read `contact.ts` and confirm both checks exist

**Known limitations:** The `escapeHtml` duplication between API validation and
notification-processor is NOT addressed here because it requires the TS migration (Phase 5
scope or future work). The TODO comment in notification-processor already documents this.
