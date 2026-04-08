# Phase 3 — Performance, Error Handling, Type Rigor [IMPLEMENTER]

## Goal

Fix the operational hot paths and eliminate string-sniffing error control flow
and unsafe type casts. This phase addresses every HIGH operational finding from
the health audit and the Performance and Type Rigor remediation targets from
the eval.

Estimated tokens: 45k.

## Prerequisites

- Phase 2 merged.

## Task 3.1 — Parallelize letter-processor S3 downloads

**Goal:** Replace the sequential `for` loop over S3 GetObject with bounded
parallelism (concurrency 5).

**Files:**

- `backend/lambdas/letter-processor/src/index.ts`
- `backend/lambdas/letter-processor/src/lib/concurrency.ts` (new)
- `tests/unit/letter-processor.test.ts`

**Steps:**

1. Add `mapWithConcurrency<T, R>(items, limit, fn)` helper in `lib/concurrency.ts`.
1. Replace the `for…of` block at lines 114-157 with a `mapWithConcurrency` call
   at concurrency 5. Preserve the existing per-file 10 MB and total 50 MB caps
   by accumulating size after each successful download and aborting once the
   cap would be exceeded.
1. Replace `console.error` and `(error as Error).message` with the structured
   `log` helper used in the API lambda and `toError()` from `lib/errors.ts`.
   If the letter-processor lacks a logger, port the API lambda one into
   `backend/lambdas/letter-processor/src/lib/logger.ts`.
1. Add unit tests for: success, partial failure abort, cap-exceeded abort,
   transient retry path.

**Verification checklist:**

- [x] No sequential `for…of` over S3 GetObject
- [x] Structured logging in place
- [x] Caps still enforced
- [x] Tests cover success, abort, retry

**Commit:** `perf(letter-processor): parallelize S3 downloads with concurrency cap`

## Task 3.2 — Batch and shorten presigned URLs in messages

**Goal:** Reduce N+1 presign cost in `getMessages` and avoid the 1-hour TTL
leak on every page fetch.

**Files:**

- `backend/lambdas/api/src/routes/messages.ts`
- `backend/lambdas/api/src/lib/s3-presign.ts` (new)
- `backend/lambdas/api/src/repositories/messaging-repository.ts`
- `tests/unit/messages-handler.test.ts`

**Steps:**

1. Extract presign logic from `messages.ts` into `lib/s3-presign.ts` exporting
   `presignAttachment`, `presignProfilePhoto`, with explicit TTLs of 15 minutes
   for attachments and 5 minutes for profile photos.
1. In `getMessages`, collect all attachment keys from the page first, then
   issue `Promise.all` over the presign helper. Same for sender photos: build
   a `Set<senderId>`, presign once per unique sender, reuse.
1. Replace the hardcoded `Limit: 50` in `listConversationsForUser` with the
   caller-supplied page size, clamped to a sensible max (e.g. 100).
1. Update unit tests to assert: number of presign calls equals unique
   attachments plus unique senders, not total messages × attachments.

**Verification checklist:**

- [x] No inline `getSignedUrl` calls in `messages.ts`
- [x] Presign call count test in place
- [x] `listConversationsForUser` honors caller page size
- [x] TTLs reduced and centralized

**Commit:** `perf(api): batch presign and reduce TTLs in messages route`

## Task 3.3 — Chunk-delete and bound fanout in messaging-repository

**Goal:** Fix `deleteConversationData` accumulating all message keys in memory
and `updateConversationMembers` unbounded `Promise.all` fanout.

**Files:**

- `backend/lambdas/api/src/repositories/messaging-repository.ts`
- `tests/unit/messaging-repository.test.ts`

**Steps:**

1. Refactor `deleteConversationData` to page through messages and issue
   `BatchWriteItem` deletes per page (max 25 per batch), without holding the
   full key set in memory.
1. Refactor `updateConversationMembers` to use `mapWithConcurrency` (port the
   helper from letter-processor or duplicate inline) at concurrency 10.
1. Add unit tests covering pagination delete and bounded fanout.

**Verification checklist:**

- [x] `deleteConversationData` does not accumulate all keys
- [x] `updateConversationMembers` fanout capped
- [x] New tests pass

**Commit:** `perf(api): chunk-delete conversations and cap member-update fanout`

## Task 3.4 — Collapse rate-limit retry ladder

**Goal:** Replace the 3-stage retry ladder with a single attempt that fails
open on contention.

**Files:**

- `backend/lambdas/api/src/lib/rate-limit.ts`
- `tests/unit/rate-limit.test.ts`

**Steps:**

1. Reduce the ladder at `rate-limit.ts:124-175` to one atomic ADD attempt. On
   `ConditionalCheckFailedException` retry once, then fail open with a logged
   warning.
1. Update tests to remove the now-impossible 3-stage cases and add a
   fail-open-on-contention case.

**Verification checklist:**

- [x] At most one retry
- [x] Fail-open path logged at warn
- [x] Tests updated

**Commit:** `refactor(api): simplify rate-limit retry to single attempt fail-open`

## Task 3.5 — Replace string-sniffing error handling with typed errors

**Goal:** Eliminate `error.message.includes(...)` control flow.

**Files:**

- `backend/lambdas/api/src/routes/messages.ts`
- Any other route files surfaced by grep
- `backend/lambdas/api/src/lib/errors.ts`

**Steps:**

1. `grep -rn "message.includes" backend/lambdas/api/src/`. For each hit,
   replace with `instanceof ValidationError` (or a more specific subclass).
1. If a needed subclass does not exist (e.g. `PaginationError`), add it to
   `errors.ts`.
1. Replace `(error as Error).message` casts with `toError(err).message`.
1. Update tests to throw the typed error and assert the typed branch.

**Verification checklist:**

- [x] Zero `message.includes` matches under `backend/lambdas/`
- [x] Zero `as Error` casts under `backend/lambdas/`
- [x] Tests cover each typed branch

**Commit:** `refactor(api): replace string-sniffing errors with typed errors`

## Task 3.6 — Type the messages query result

**Goal:** Eliminate `Record<string, unknown>[]` return from
`messaging-repository.ts:149` and the cascading field-by-field casts in
`routes/messages.ts`.

**Files:**

- `backend/lambdas/api/src/repositories/messaging-repository.ts`
- `backend/lambdas/api/src/routes/messages.ts`
- `backend/lambdas/api/src/types/index.ts` (or a new
  `repositories/messaging-types.ts`)

**Steps:**

1. Define a `MessageRecord` interface in a single canonical location. Replace
   the inline duplicate noted in feedback.md from Phase 1.
1. Type the query helper to return `MessageRecord[]`.
1. Remove field-by-field casts in the route handler.

**Verification checklist:**

- [x] One canonical `MessageRecord` definition
- [x] No `Record<string, unknown>` in messaging code paths
- [x] Type check passes

**Commit:** `refactor(api): type messages repository return shape`

## Task 3.7 — Wire constants from constants.ts

**Goal:** Replace the hardcoded `expiresIn` and photo-validation literals with
the canonical constants. (Phase 1 deleted unused constants; this task wires
the remaining ones at call sites.)

**Files:**

- `backend/lambdas/api/src/lib/constants.ts`
- `backend/lambdas/api/src/routes/messages.ts`
- `backend/lambdas/api/src/routes/profile.ts`
- `backend/lambdas/api/src/routes/drafts.ts`
- `backend/lambdas/api/src/lib/s3-presign.ts`

**Steps:**

1. Re-add only the constants needed by Phase 3.2 and the validators
   (`PRESIGNED_ATTACHMENT_URL_EXPIRY_SECONDS = 900`,
   `PRESIGNED_PROFILE_PHOTO_URL_EXPIRY_SECONDS = 300`,
   `MAX_PROFILE_PHOTO_SIZE_BYTES`, etc.).
1. Replace literal values at the call sites with imports.
1. Update tests if any assert on the literal value.

**Verification checklist:**

- [x] No literal `expiresIn: 900`/`expiresIn: 3600` in route files
- [x] Constants exported and imported from one place
- [x] Tests green

**Commit:** `refactor(api): centralize presign TTLs and photo limits in constants`

## Phase Verification

1. `grep -rn "message.includes\|as Error\|userId!\|expiresIn: 3600\|expiresIn: 900" backend/lambdas/api/src/`
   returns nothing meaningful.
1. `npm test` green, `npm run lint` green.
1. Manual review: messaging route file shrinks; presign helper covers all S3
   URL signing.
