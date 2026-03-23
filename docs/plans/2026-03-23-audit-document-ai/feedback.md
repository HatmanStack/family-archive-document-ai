# Feedback Tracker

## Active Feedback

*No active feedback items.*

## Verification Pass (2026-03-23)

Full test suite: **224 passed, 2 skipped, 0 failed** (19 test files).

### Eval Remediation Targets

#### Performance (7/10 target 9/10)

1. **Cap `limit` in `letters.ts:70` with `Math.min(limit, 100)`** -- VERIFIED.
   `letters.ts:70-73` now uses `Math.min(parseInt(...), MAX_PAGE_SIZE)` where
   `MAX_PAGE_SIZE = 100` from `constants.ts:33`.

1. **Cap `limit` in `messages.ts:185` with `Math.min(limit, 100)`** -- VERIFIED.
   `messages.ts:186-189` now uses `Math.min(parseInt(...), MAX_PAGE_SIZE)`.

1. **Cap `handleListDrafts` in `drafts.ts:206-231` with pagination limit** -- VERIFIED.
   `drafts.ts:211-213` now uses `Math.min(parseInt(...), MAX_PAGE_SIZE)` and the
   unbounded `do...while` loop has been replaced with a single paginated query
   using the `Limit` parameter.

1. **Batch/defer presigned URL generation in `messages.ts:225-254`** -- VERIFIED.
   `messages.ts:229-260` now processes presigned URLs in batches of
   `SIGN_BATCH_SIZE = 10` using a chunked `for` loop instead of unbounded
   `Promise.all`.

#### Type Rigor (7/10 target 9/10)

1. **Replace `T = any` in `api-client.ts`** -- VERIFIED.
   `api-client.ts` now uses `T = unknown` defaults on all methods (line 28, 113,
   117, 121, 125, 129). The `body` parameter is typed as `Record<string, unknown>`
   (line 8). `AbortController` timeout also added (lines 64-72).

1. **Migrate `activity-aggregator/index.js` to TypeScript** -- UNVERIFIED.
   File remains as `backend/lambdas/activity-aggregator/index.js` (JavaScript).

1. **Migrate `notification-processor/index.js` to TypeScript** -- UNVERIFIED.
   File remains as `backend/lambdas/notification-processor/index.js` (JavaScript).

1. **Remove `as unknown as` cast in `comment-repository.ts:84`** -- UNVERIFIED.
   `comment-repository.ts:84` still has `as unknown as Record<string, unknown>`.

1. **Remove `as unknown as` cast in `drafts.ts:286`** -- UNVERIFIED.
   `drafts.ts:302` still has `as unknown as PublishData`.

#### Test Value (7/10 target 9/10)

1. **Add unit tests for letters route** -- VERIFIED.
   `tests/unit/letters-handler.test.ts` exists.

1. **Add unit tests for media route** -- VERIFIED.
   `tests/unit/media-handler.test.ts` exists.

1. **Add unit tests for reactions route** -- VERIFIED.
   `tests/unit/reactions-handler.test.ts` exists.

1. **Add unit tests for contact route** -- VERIFIED.
   `tests/unit/contact-handler.test.ts` exists.

#### Creativity (7/10 target 9/10)

1. **Middleware pattern / type-safe router** -- UNVERIFIED (scope: HIGH complexity).
   `index.ts` still uses string-matching route dispatch. This was expected
   given HIGH complexity rating.

#### Defensiveness (8/10 target 9/10)

1. **Add `Vary: Origin` header in `responses.ts`** -- VERIFIED.
   `responses.ts` now includes `'Vary': 'Origin'` in all CORS header paths
   (lines 49, 56, 69, 80).

1. **Standardize error handling in `letters.ts` (throw to return errorResponse)** -- VERIFIED.
   All six `throw error` re-throws have been replaced with
   `return errorResponse(500, ...)` pattern. Grep for `throw error` in
   `letters.ts` returns zero matches.

1. **Add PK-prefix validation in `base-repository.ts:194-198`** -- VERIFIED.
   `base-repository.ts:196-204` now calls `validatePaginationKey()` and
   throws `ValidationError` on invalid keys, instead of raw
   `JSON.parse(Buffer.from(...))`.

1. **Replace module-level correlation ID in `logger.ts`** -- PARTIALLY VERIFIED.
   `logger.ts:16-20` still uses module-level `let currentCorrelationId`, but
   a comment (lines 16-19) documents the ADR decision: Lambda processes one
   request at a time so this is safe. The comment references `ADR-5` and notes
   when migration to AsyncLocalStorage would be needed. This is an acceptable
   documented tradeoff rather than a fix.

#### Architecture (8/10 target 9/10)

1. **Extract messages route into repository pattern** -- UNVERIFIED.
   No `MessageRepository` or `ConversationRepository` files exist in
   `backend/lambdas/api/src/repositories/`. `messages.ts` still inlines
   all DynamoDB operations.

1. **Standardize error handling across all routes** -- VERIFIED.
   `letters.ts` now uses `return errorResponse(500, ...)` consistently,
   matching `comments.ts`, `messages.ts`, and other routes.

#### Code Quality (8/10 target 9/10)

1. **Extract shared `apiCall<T>()` helper for frontend services** -- UNVERIFIED.
   No `apiCall` utility found in `frontend/lib/services/`. Frontend services
   still use individual fetch patterns.

1. **Add explicit `undefined` check for contentType in `profile.ts:324`** -- VERIFIED.
   `profile.ts:326` now checks `!contentType || !allowedTypes.includes(contentType)`,
   explicitly guarding against undefined.

#### Problem-Solution Fit (8/10 target 9/10)

1. **Migrate remaining JS Lambdas to TypeScript** -- UNVERIFIED.
   Same as Type Rigor items above. Both `activity-aggregator/index.js` and
   `notification-processor/index.js` remain JavaScript.

#### Pragmatism (8/10 target 9/10)

1. **Deduplicate `escapeHtml`** -- UNVERIFIED.
   `notification-processor/index.js:215` still has its own `escapeHtml`
   copy. A comment (lines 212-214) acknowledges the canonical source is
   in `validation.ts` but deduplication is blocked on the TS migration.

1. **Consolidate dual HTTP client on frontend** -- UNVERIFIED.
   Both `api-client.ts` (class-based) and `client.ts` (`authenticatedFetch`)
   still exist as parallel auth/fetch patterns.

### Health Audit Critical Findings

1. **CRITICAL #1: `deleteConversation` unbounded scan/delete** -- PARTIALLY VERIFIED.
   `messages.ts:571-587` now batches S3 deletes in groups of 25
   (`S3_DELETE_BATCH_SIZE = 25`). However, the DynamoDB message query at
   lines 540-569 is still unbounded (no limit, full scan of all messages).
   The core risk of Lambda timeout for large conversations remains.

1. **CRITICAL #2: N+1 presigned URL generation** -- VERIFIED.
   See Performance item above. Now batched with `SIGN_BATCH_SIZE = 10`.

1. **CRITICAL #3: Global mutable correlation ID** -- PARTIALLY VERIFIED.
   Documented with ADR reference. See Defensiveness item above.

1. **CRITICAL #4: Base repository pagination key bypass** -- VERIFIED.
   `base-repository.ts:196-204` now uses `validatePaginationKey()`.

### Health Audit High Findings

1. **HIGH #5: Triple-duplicated JWT decode** -- VERIFIED.
   All three auth files (`auth-service.ts`, `client.ts`, `google-oauth.ts`)
   now import `decodeJWTPayload` from a shared `jwt-decode.ts` module.
   No inline JWT decode implementations remain.

1. **HIGH #6: Frontend services missing timeout/AbortController** -- PARTIALLY VERIFIED.
   `api-client.ts` now has an `AbortController` with `DEFAULT_TIMEOUT = 30000`
   (lines 4, 64-72). However, the individual service files in
   `frontend/lib/services/` that use direct `fetch()` calls rather than the
   `apiClient` still lack timeouts.

1. **HIGH #7: `createMessageInternal` N+1 profile fetch** -- UNVERIFIED.
   `messages.ts:664` still performs a `GetCommand` for sender profile on
   every message send.

1. **HIGH #8: `ensureProfile` on every request** -- UNVERIFIED.
   `index.ts:59-69` still calls `ensureProfile()` on every authenticated
   API request.

1. **HIGH #9: Duplicated `escapeHtml`** -- UNVERIFIED.
   Same as Pragmatism item. Still duplicated.

1. **HIGH #10: `handleListDrafts` unbounded query** -- VERIFIED.
   Now uses `Limit` parameter and single-page pagination.

1. **HIGH #11: Profile photo S3 key unsanitized extension** -- VERIFIED.
   `profile.ts:331-332` now uses `path.basename(filename)` and a regex
   `safeName.match(/\.([a-zA-Z0-9]+)$/)?.[1]` for safe extension extraction.

1. **HIGH #12: `contact.ts` missing `SES_FROM_EMAIL` check** -- VERIFIED.
   `contact.ts:69` now checks both `!ADMIN_EMAIL || !SES_FROM_EMAIL` with
   a descriptive error log at line 70-71.

### Doc Audit Findings

#### DRIFT

1. **Svelte 4 to Svelte 5 references** -- VERIFIED.
   `README.md`, `CLAUDE.md`, `docs/FRONTEND.md`, `docs/ARCHITECTURE.md`
   all updated to say Svelte 5. Zero "Svelte 4" hits outside plan docs.

1. **DEPLOYMENT.md S3 bucket description** -- VERIFIED.
   `docs/DEPLOYMENT.md:130-132` now correctly describes single
   `ArchiveBucketResource` created automatically.

1. **API_REFERENCE.md comment length** -- VERIFIED.
   `docs/API_REFERENCE.md:54` says `1-10000 chars`. `MAX_COMMENT_LENGTH` in
   `constants.ts:42` is now `10000`, which matches both the doc and the route
   code. The original internal inconsistency has been resolved.

1. **AUTHENTICATION.md `picture` attribute mapping** -- VERIFIED.
   `docs/AUTHENTICATION.md:94` now correctly states mapping is
   `email, name` only.

1. **AUTHENTICATION.md line reference to template.yaml** -- VERIFIED.
   `docs/AUTHENTICATION.md:120` now references `template.yaml:361-363`
   (correct lines for attribute mapping).

1. **DEVELOPMENT.md / CLAUDE.md CI triggers** -- VERIFIED.
   `docs/DEVELOPMENT.md:305` now says "push/PR to main" only, matching
   `ci.yml`.

1. **TROUBLESHOOTING.md tailwind.config.js reference** -- VERIFIED.
   `docs/TROUBLESHOOTING.md:238` now says `tailwind.config.ts`.

1. **FRONTEND.md auth directory listing** -- VERIFIED.
   `docs/FRONTEND.md:50-60` now lists all 9 auth files including
   `jwt-decode.ts`, `middleware.ts`, etc.

1. **AUTHENTICATION.md wrong class name** -- VERIFIED.
   `docs/AUTHENTICATION.md:150` now correctly references `cognitoAuth`
   from `lib/auth/cognito-client.ts`.

1. **FRONTEND.md project structure omissions** -- VERIFIED.
   `docs/FRONTEND.md:15-93` now includes `lib/utils/`, `lib/config/`,
   and expanded route listing.

1. **ARCHITECTURE.md Gemini model name** -- Not actionable (model name
   matched, just needs periodic verification).

1. **DEPLOYMENT.md USER_PROFILES_TABLE "(legacy)" label** -- VERIFIED.
   `docs/DEPLOYMENT.md:109` no longer labels it as "(legacy)".

1. **Types/Reaction emoji vs reactionType mismatch** -- UNVERIFIED.
   `types/index.ts:94` still uses `emoji: string` while route code at
   `reactions.ts:69` uses `reactionType` and `DATA_MODEL.md:139` also
   uses `reactionType`. The type definition is still out of sync.

#### STALE

1. **README.md auth route "signup"** -- VERIFIED.
   `README.md:121` now says "Login, callback, forgot/reset-password,
   logout, pending-approval" with no mention of signup.

1. **SES_SETUP.md ContactFunction reference** -- VERIFIED.
   `docs/SES_SETUP.md:54` now says `ApiFunction` and notes contact
   handling is part of the consolidated API Lambda.

1. **DEPLOYMENT.md `check:lint` / `check:types`** -- VERIFIED.
   `docs/DEPLOYMENT.md:229-230` now shows correct commands
   `npm run check:lint` and `npm run check:types`.

1. **DEVELOPMENT.md `events/test-event.json`** -- VERIFIED.
   Reference to non-existent `events/` directory has been removed.

#### BROKEN REFERENCES

1. **AUTHENTICATION.md:120 template.yaml line reference** -- VERIFIED.
   Now correctly points to lines 361-363.

#### STALE CODE EXAMPLES

1. **FRONTEND.md profile service imports** -- UNVERIFIED.
   `docs/FRONTEND.md:107` still shows partial import without
   `getCommentHistory` and `uploadProfilePhoto`. However, the import
   example is technically valid (just incomplete).

1. **AUTHENTICATION.md / FRONTEND.md auth store examples** -- VERIFIED.
   `docs/FRONTEND.md:207-218` now shows correct API with
   `authStore.setAuthenticated(user, tokens)`, `authStore.clearAuth()`,
   and the correct state shape `{ isAuthenticated, user, tokens, loading }`.

#### CONFIG DRIFT

1. **`DYNAMODB_TABLE` fallback not documented** -- UNVERIFIED.
   `database.ts:18` still has `process.env.DYNAMODB_TABLE` fallback.
   Not documented in `.env.example` or docs.

1. **Region inconsistency** -- VERIFIED per prior feedback resolution.

#### STRUCTURE ISSUES

1. **FRONTEND.md stores section only documents auth-store** -- VERIFIED.
   `docs/FRONTEND.md:82-86` now lists all four stores: messages, posts,
   profiles, title.

1. **CLAUDE.md repositories description** -- UNVERIFIED.
   `CLAUDE.md` still says `repositories/ # DynamoDB data access` which
   implies a complete repository layer. Only `base-repository.ts`,
   `comment-repository.ts`, and `index.ts` exist.

1. **DEVELOPMENT.md nvm version** -- VERIFIED.
   `docs/DEVELOPMENT.md:18` now uses `nvm/master/install.sh` instead
   of a pinned old version.

## Summary

| Category | Verified | Partially Verified | Unverified |
|----------|----------|--------------------|------------|
| Eval Remediation | 11 | 1 | 8 |
| Health Critical | 2 | 2 | 0 |
| Health High | 4 | 1 | 3 |
| Doc Drift | 10 | 0 | 2 |
| Doc Stale | 4 | 0 | 0 |
| Doc Broken Refs | 1 | 0 | 0 |
| Doc Stale Examples | 1 | 0 | 1 |
| Doc Config Drift | 1 | 0 | 1 |
| Doc Structure | 2 | 0 | 1 |
| **Total** | **36** | **4** | **16** |

### Key Unverified Items

1. JS Lambda migration (activity-aggregator, notification-processor)
1. MessageRepository / ConversationRepository extraction
1. Frontend `apiCall<T>()` shared helper
1. `escapeHtml` deduplication (blocked on TS migration)
1. Dual frontend HTTP client consolidation
1. `as unknown as` casts in comment-repository and drafts
1. Reaction type `emoji` vs `reactionType` mismatch
1. `createMessageInternal` N+1 profile fetch
1. `ensureProfile` called on every request
1. `deleteConversation` unbounded DynamoDB scan
1. Creativity / middleware pattern (HIGH complexity)

## Resolved Feedback

### Phase 6 Review (CODE_REVIEW)

1. **CLAUDE.md line 37 -- stale auth route description.**
   **Resolution:** Updated auth route comment from "Login, signup, callback,
   password reset" to "Login, callback, forgot/reset-password, logout,
   pending-approval". Now matches the actual route directories on disk.

1. **FRONTEND.md lines 419-432 -- region inconsistency introduced.**
   **Resolution:** Updated all `us-east-1` references in the FRONTEND.md
   environment variables example block to `us-west-2`, matching `.env.example`,
   `docs/DEVELOPMENT.md`, and `docs/AUTHENTICATION.md`. Region references are
   now consistent across all documentation.

## Verification Result

**UNVERIFIED** — 36 verified, 4 partially verified, 16 unverified. Tests: 224 pass, 2 skipped, 0 failures.
