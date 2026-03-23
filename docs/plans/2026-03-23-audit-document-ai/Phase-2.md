# Phase 2 -- [IMPLEMENTER] Security and Defensive Coding Fixes

## Phase Goal

Address security vulnerabilities and defensive coding gaps identified across all three audits.
This phase focuses on data access boundary violations, error handling consistency, and CORS
correctness.

**Success criteria:**

- `BaseRepository.query()` validates pagination keys via `validatePaginationKey()`
- All `letters.ts` catch blocks return `errorResponse()` instead of `throw`
- CORS responses include `Vary: Origin` header
- Comment content length validation uses the constant from `constants.ts`

**Estimated tokens:** ~30,000

## Prerequisites

- Phase 1 complete (cleanup done first)
- Phase 0 read (especially ADR-1 on error handling, ADR-3 on pagination validation)
- Tests pass: `npm test`

## Tasks

### Task 1: Add pagination key validation to BaseRepository.query()

**Goal:** Close the security gap where `BaseRepository.query()` parses pagination keys
with raw `JSON.parse(Buffer.from(...))` bypassing `validatePaginationKey()`. This is
health-audit finding #4 (CRITICAL) and eval Defensiveness concern.

**Files to modify:**

- `backend/lambdas/api/src/repositories/base-repository.ts` -- Add validation

**Prerequisites:** None

**Implementation Steps:**

1. Read `backend/lambdas/api/src/lib/validation.ts` to understand `validatePaginationKey()`
   signature. It takes `(encodedKey: string, expectedPKPrefix?: string)` and returns
   `{ valid: boolean, key?: Record<string, unknown>, error?: string }`.
1. Import `validatePaginationKey` from `../lib/validation` in `base-repository.ts`.
1. In the `query()` method, replace the raw parsing block at lines 194-198:

   **Before:**

   ```typescript
   if (lastEvaluatedKey) {
     queryParams.ExclusiveStartKey = JSON.parse(
       Buffer.from(lastEvaluatedKey, 'base64').toString()
     )
   }
   ```

   **After:**

   ```typescript
   if (lastEvaluatedKey) {
     const paginationResult = validatePaginationKey(lastEvaluatedKey)
     if (!paginationResult.valid) {
       throw new ValidationError(paginationResult.error || 'Invalid pagination key')
     }
     if (paginationResult.key) {
       queryParams.ExclusiveStartKey = paginationResult.key
     }
   }
   ```

1. Import `ValidationError` from `../lib/errors`.
1. Check how `BaseRepository.query()` is called -- callers include `commentRepository.listByItemId()`
   and `commentRepository.listByUserId()`. Verify these callers handle thrown errors properly
   (they should, since the route handlers have try/catch).

**Verification Checklist:**

- [x] `validatePaginationKey()` is called in `base-repository.ts` for all pagination key parsing
- [x] Raw `JSON.parse(Buffer.from(...))` is no longer used for pagination keys
- [x] `ValidationError` is thrown on invalid keys (not a silent fallthrough)
- [x] `npm test` passes (especially `comments-handler.test.ts` which uses pagination)

**Testing Instructions:**

- Existing tests in `comments-handler.test.ts` should still pass since they test through the
  route handler which already validates pagination keys.
- Add a test case to `comments-handler.test.ts` that passes a malformed pagination key and
  expects a 400 response. Pattern:

  ```typescript
  it('should reject malformed pagination keys from repository layer', async () => {
    const event = createMockEvent({
      queryStringParameters: { cursor: 'not-valid-base64!!!' },
    })
    const result = await handle(event, createMockContext())
    expect(result.statusCode).toBe(400)
  })
  ```

**Commit Message Template:**

```text
fix(repository): validate pagination keys in BaseRepository.query()

- Replace raw JSON.parse(Buffer.from(...)) with validatePaginationKey()
- Throw ValidationError on invalid pagination cursors
- Closes data access boundary violation in repository layer
```

### Task 2: Standardize error handling in letters route

**Goal:** Convert all 6 `throw error` re-throws in `letters.ts` to `return errorResponse(500, ...)`
per ADR-1. This closes health-audit finding #16 and eval Defensiveness/Architecture concerns.

**Files to modify:**

- `backend/lambdas/api/src/routes/letters.ts` -- Convert throws to returns

**Prerequisites:** ADR-1 from Phase 0

**Implementation Steps:**

1. Read `letters.ts` fully to identify all catch blocks that use `throw error`.
1. For each catch block, replace the pattern:

   **Before:**

   ```typescript
   } catch (error) {
     log.error('some_error', { error: toError(error).message })
     throw error
   }
   ```

   **After:**

   ```typescript
   } catch (err) {
     log.error('some_error', { error: toError(err).message })
     return errorResponse(500, 'Descriptive error message', requestOrigin)
   }
   ```

1. Use descriptive error messages for each handler (e.g., "Failed to list letters",
   "Failed to get letter", "Failed to get PDF URL"). Follow the pattern used in other
   routes like `comments.ts` and `messages.ts`.
1. Verify each handler function receives `requestOrigin` as a parameter. If any handler
   does not have it, thread it through from the `handle()` function.

**Verification Checklist:**

- [x] Zero `throw error` statements in catch blocks of `letters.ts`
- [x] All catch blocks return `errorResponse(500, ...)` with descriptive messages
- [x] All handlers pass `requestOrigin` to `errorResponse`
- [x] `npm test` passes
- [x] `npm run lint` passes from frontend (letters route is backend but verify no regressions)

**Testing Instructions:**

- No existing tests for letters route. This will be covered in Phase 4.
- The change is safe because the global catch in `index.ts` was already producing 500 responses
  for these throws -- the behavior is the same, just more explicit.

**Commit Message Template:**

```text
fix(letters): standardize error handling to return errorResponse

- Convert 6 throw-error catch blocks to return errorResponse(500, ...)
- Each handler now returns descriptive error message
- Consistent with error handling pattern in comments and messages routes
```

### Task 3: Add Vary: Origin header to CORS responses

**Goal:** The CORS implementation returns different `Access-Control-Allow-Origin` values based
on the request's `Origin` header but never sets `Vary: Origin`. This means CDN or browser
caching could serve wrong CORS headers. Eval Defensiveness finding #4.

**Files to modify:**

- `backend/lambdas/api/src/lib/responses.ts` -- Add `Vary: Origin` to all CORS responses

**Prerequisites:** None

**Implementation Steps:**

1. In `getCorsHeaders()`, add `'Vary': 'Origin'` to every returned headers object that includes
   an `Access-Control-Allow-Origin` header. This means all return paths except the two
   fail-closed paths (no origins configured, and origin not in allowed list).
1. The wildcard `'*'` case without a request origin (line 52-55) should also get `Vary: Origin`
   to be safe, though it matters less since the value is static.
1. The function returns 5 different headers objects. Add `'Vary': 'Origin'` to the 3 that
   set `Access-Control-Allow-Origin` to a specific origin (not the fail-closed paths).

**Verification Checklist:**

- [x] `Vary: Origin` is present in all CORS responses that include `Access-Control-Allow-Origin`
- [x] Fail-closed responses (no CORS headers) do NOT include `Vary: Origin`
- [x] `npm test` passes

**Testing Instructions:**

- Existing tests that check response headers should still pass.
- If any test asserts on exact header objects, update them to include `Vary: Origin`.

**Commit Message Template:**

```text
fix(cors): add Vary: Origin header to prevent caching issues

- CORS responses now include Vary: Origin for correct CDN/browser caching
- Only added to responses that set Access-Control-Allow-Origin
```

### Task 4: Fix comment content length validation constant

**Goal:** The comment route hardcodes `10000` for max content length while `MAX_COMMENT_LENGTH`
in `constants.ts` is `5000`. The doc says `10000`. Fix the inconsistency. This addresses
doc-audit drift finding #3.

**Files to modify:**

- `backend/lambdas/api/src/routes/comments.ts` -- Use the constant from `constants.ts`
- `backend/lambdas/api/src/lib/constants.ts` -- Update `MAX_COMMENT_LENGTH` if needed

**Prerequisites:** None

**Implementation Steps:**

1. Read `backend/lambdas/api/src/lib/constants.ts` to find the current `MAX_COMMENT_LENGTH` value.
1. Read `backend/lambdas/api/src/routes/comments.ts` to find where content length is validated.
1. Decide on the correct value. The route currently allows 10000 chars. Since this is a family
   archive and long comments may include quotes or stories, keep the limit at 10000.
1. Update `MAX_COMMENT_LENGTH` in `constants.ts` to `10000` (to match actual behavior).
1. Update `comments.ts` to import and use `MAX_COMMENT_LENGTH` from `constants.ts` instead of
   the hardcoded value.

**Verification Checklist:**

- [x] `MAX_COMMENT_LENGTH` in `constants.ts` matches the value used in `comments.ts`
- [x] `comments.ts` imports the constant rather than using a hardcoded number
- [x] `npm test` passes (especially `comments-handler.test.ts`)

**Testing Instructions:**

- Existing `comments-handler.test.ts` tests should pass.
- If any test asserts on the exact error message mentioning "5000" or "10000", update to match.

**Commit Message Template:**

```text
fix(comments): align MAX_COMMENT_LENGTH constant with actual validation

- Update MAX_COMMENT_LENGTH in constants.ts to 10000 (matching runtime)
- Import constant in comments route instead of hardcoding
```

## Phase Verification

After completing all tasks:

1. Run full test suite: `npm test` -- all tests must pass
1. Run lint: `cd frontend && npm run lint`
1. Verify no raw pagination parsing in repository:
   `grep -n "JSON.parse(Buffer.from" backend/lambdas/api/src/repositories/` should return 0 results
1. Verify no throw-error in letters:
   `grep -n "throw error" backend/lambdas/api/src/routes/letters.ts` should return 0 results
1. Verify Vary header: read `responses.ts` and confirm `Vary: Origin` is set

**Known limitations:** The CORS `AllowOrigin: "'*'"` in the API Gateway SAM template
(health-audit finding #29) is NOT changed here because it is an infrastructure config, not
code. Document it for future template update.
