# Phase 2 — [IMPLEMENTER] Critical Code Fixes

## Phase Goal

Fix the three CRITICAL operational issues and the HIGH-priority error handling gaps identified across all three audits. These are security and correctness bugs that affect production behavior today.

**Success criteria:**
- All route handlers pass `requestOrigin` to every `successResponse()` and `errorResponse()` call
- All pagination cursor decoding uses the existing `validatePaginationKey()` utility
- All `JSON.parse(event.body)` calls are wrapped in try/catch returning 400
- Duplicate `escapeHtml()` function is extracted to shared utility
- `(err as Error).message` casts are replaced with `toError(err).message`
- `npm test` passes (including new tests written in this phase)
- `npm run lint` passes with zero warnings

**Estimated tokens:** ~25,000

## Prerequisites

- Phase 0 read and understood
- Phase 1 complete (legacy JS files removed)
- `npm install` has been run from the repo root

---

## Tasks

### Task 1: Fix CORS — Pass requestOrigin in Messages Route

**Goal:** The messages route handler destructures `requesterId` from context but never destructures or uses `requestOrigin`. Every call to `successResponse()` and `errorResponse()` in this 647-line file is missing the CORS origin parameter.

**Audit references:** Health audit #1, #18 (Quick Win #1), Eval Defensiveness concern.

**Files to Modify:**
- `backend/lambdas/api/src/routes/messages.ts` — Destructure and thread `requestOrigin`

**Prerequisites:** None.

**Implementation Steps:**
1. In the `handle()` function (line 31-35), add `requestOrigin` to the destructuring: `const { requesterId, requestOrigin } = context`
2. Pass `requestOrigin` as the last argument to every `errorResponse()` call in `handle()` (the 401 on line 38, and any other direct error returns).
3. Pass `requestOrigin` through to every helper function that calls `successResponse()` or `errorResponse()`. This means adding a `requestOrigin?: string` parameter to each internal function:
   - `listConversations(requesterId)` → `listConversations(requesterId, requestOrigin)`
   - `getMessages(event, requesterId)` → `getMessages(event, requesterId, requestOrigin)`
   - `createConversation(event, requesterId)` → `createConversation(event, requesterId, requestOrigin)`
   - `sendMessage(event, requesterId)` → `sendMessage(event, requesterId, requestOrigin)`
   - `getUploadUrl(event, requesterId)` → `getUploadUrl(event, requesterId, requestOrigin)`
   - `deleteConversation(event, requesterId)` → `deleteConversation(event, requesterId, requestOrigin)`
   - And any other internal functions that return responses.
4. In each internal function, add `requestOrigin` as the last parameter to every `successResponse()` and `errorResponse()` call.
5. For `successResponse()` calls that use a custom status code (e.g., `successResponse(data, 201)`), ensure the signature is `successResponse(data, 201, requestOrigin)`.

**Reference:** Look at `backend/lambdas/api/src/routes/letters.ts` for the correct pattern — it destructures `requestOrigin` at line 34 and passes it through every helper function.

**Verification Checklist:**
- [ ] `requestOrigin` is destructured from context in `handle()`
- [ ] Every `successResponse()` call in the file has `requestOrigin` as its last argument
- [ ] Every `errorResponse()` call in the file has `requestOrigin` as its last argument
- [ ] `npm run lint` passes

**Testing Instructions:**
- No new unit test file yet (route handler tests are added in Phase 3). This is a mechanical fix.
- Search the file to confirm: every `successResponse(` and `errorResponse(` call ends with `, requestOrigin)`.

**Commit Message Template:**
```
fix(messages): pass requestOrigin to all CORS response helpers

- Destructure requestOrigin from RequestContext
- Thread through all internal handler functions
- Prevents incorrect Access-Control-Allow-Origin in production
```

---

### Task 2: Fix CORS — Pass requestOrigin in Comments Route

**Goal:** Same issue as Task 1 but for `comments.ts`. The handler destructures `requesterId`, `requesterEmail`, and `isAdmin` but not `requestOrigin`.

**Audit references:** Health audit #1 (Quick Win #1).

**Files to Modify:**
- `backend/lambdas/api/src/routes/comments.ts` — Destructure and thread `requestOrigin`

**Prerequisites:** None (can be done in parallel with Task 1).

**Implementation Steps:**
1. In `handle()` (line 30), add `requestOrigin` to the destructuring: `const { requesterId, requesterEmail, isAdmin, requestOrigin } = context`
2. Pass `requestOrigin` to every `successResponse()`, `errorResponse()`, and `rateLimitResponse()` call in the file.
3. Thread `requestOrigin` through all internal functions that produce responses.

**Reference:** Same pattern as `letters.ts`.

**Verification Checklist:**
- [ ] `requestOrigin` is destructured from context
- [ ] Every response helper call includes `requestOrigin`
- [ ] `npm run lint` passes

**Testing Instructions:**
- Mechanical fix. Verify by text search.

**Commit Message Template:**
```
fix(comments): pass requestOrigin to all CORS response helpers

- Destructure requestOrigin from RequestContext
- Thread through all response calls
```

---

### Task 3: Fix CORS — Pass requestOrigin in Reactions Route

**Goal:** Same CORS issue for `reactions.ts`.

**Audit references:** Health audit #1 (Quick Win #1).

**Files to Modify:**
- `backend/lambdas/api/src/routes/reactions.ts` — Destructure and thread `requestOrigin`

**Prerequisites:** None.

**Implementation Steps:**
1. In `handle()` (line 19), add `requestOrigin` to the destructuring: `const { requesterId, requestOrigin } = context`
2. Pass `requestOrigin` to every `successResponse()` and `errorResponse()` call in the file.
3. Thread through internal functions.

**Verification Checklist:**
- [ ] `requestOrigin` is destructured from context
- [ ] Every response helper call includes `requestOrigin`
- [ ] `npm run lint` passes

**Commit Message Template:**
```
fix(reactions): pass requestOrigin to all CORS response helpers
```

---

### Task 4: Fix CORS — Pass requestOrigin in Drafts Route

**Goal:** Same CORS issue for `drafts.ts`.

**Audit references:** Health audit #1 (Quick Win #1).

**Files to Modify:**
- `backend/lambdas/api/src/routes/drafts.ts` — Destructure and thread `requestOrigin`

**Prerequisites:** None.

**Implementation Steps:**
1. In `handle()` (line 26), add `requestOrigin` to the destructuring: `const { requesterId, isAdmin, isApprovedUser, requestOrigin } = context`
2. Pass `requestOrigin` to every `successResponse()` and `errorResponse()` call in the file.
3. Thread through internal functions (`handleUploadRequest`, `handleProcess`, `handleListDrafts`, `handleGetDraft`, etc.).

**Verification Checklist:**
- [ ] `requestOrigin` is destructured from context
- [ ] Every response helper call includes `requestOrigin`
- [ ] `npm run lint` passes

**Commit Message Template:**
```
fix(drafts): pass requestOrigin to all CORS response helpers
```

---

### Task 5: Secure Pagination Cursors with validatePaginationKey()

**Goal:** Replace raw `JSON.parse(Buffer.from(cursor, 'base64').toString())` with the existing `validatePaginationKey()` utility in all routes that accept pagination cursors. The utility provides base64 decoding, JSON parsing, structure validation, and PK prefix checking — preventing cursor manipulation attacks.

**Audit references:** Health audit #2 (CRITICAL), Quick Win #3, Eval Code Quality remediation, Eval Defensiveness concern.

**Files to Modify:**
- `backend/lambdas/api/src/routes/letters.ts` — Line 87 in `listLetters()`
- `backend/lambdas/api/src/routes/messages.ts` — Line 148 in `getMessages()`

**Prerequisites:** Tasks 1-4 complete (requestOrigin is available for error responses).

**Implementation Steps:**

For `letters.ts` (line 86-88 in `listLetters()`):
1. Add import: `import { validatePaginationKey } from '../lib/validation'`
2. Replace:
   ```typescript
   if (cursor) {
     params.ExclusiveStartKey = JSON.parse(Buffer.from(cursor, 'base64').toString())
   }
   ```
   With:
   ```typescript
   if (cursor) {
     const paginationResult = validatePaginationKey(cursor)
     if (!paginationResult.valid) {
       return errorResponse(400, paginationResult.error || 'Invalid pagination key', requestOrigin)
     }
     if (paginationResult.key) {
       params.ExclusiveStartKey = paginationResult.key
     }
   }
   ```

For `messages.ts` (line 147-149 in `getMessages()`):
1. Add import: `import { validatePaginationKey } from '../lib/validation'`
2. Apply the same pattern as above, using the `PREFIX.CONV` as the expected PK prefix:
   ```typescript
   if (lastEvaluatedKey) {
     const paginationResult = validatePaginationKey(lastEvaluatedKey, PREFIX.CONV)
     if (!paginationResult.valid) {
       return errorResponse(400, paginationResult.error || 'Invalid pagination key', requestOrigin)
     }
     if (paginationResult.key) {
       queryParams.ExclusiveStartKey = paginationResult.key
     }
   }
   ```

**Verification Checklist:**
- [ ] No raw `JSON.parse(Buffer.from(..., 'base64')...)` remains in `letters.ts` for pagination
- [ ] No raw `JSON.parse(Buffer.from(..., 'base64')...)` remains in `messages.ts` for pagination
- [ ] Both routes import and use `validatePaginationKey`
- [ ] Invalid cursors return 400 (not 500)
- [ ] `npm run lint` passes

**Testing Instructions:**
- Write a new test file `tests/unit/pagination-validation.test.ts` that tests:
  - Valid base64-encoded cursor is accepted
  - Malformed base64 returns 400
  - Non-JSON content returns 400
  - Cursor with wrong PK prefix returns 400 (for messages)
  - Empty/null cursor is accepted (no pagination)
- These tests can directly test `validatePaginationKey()` from `backend/lambdas/api/src/lib/validation.ts`.

**Commit Message Template:**
```
fix(api): use validatePaginationKey for all pagination cursors

- Replace raw JSON.parse(Buffer.from(...)) in letters and messages routes
- Prevents cursor manipulation attacks on DynamoDB
- Returns 400 for malformed cursors instead of 500
```

---

### Task 6: Guard All JSON.parse(event.body) Calls

**Goal:** Wrap all unguarded `JSON.parse(event.body || '{}')` calls in try/catch blocks that return 400 Bad Request for malformed JSON. Six locations across three route handlers currently throw unhandled exceptions on malformed input.

**Audit references:** Health audit #3 (CRITICAL), Eval Defensiveness concern, Eval Critical Failure Point.

**Files to Modify:**
- `backend/lambdas/api/src/routes/messages.ts` — Lines 200, 273, 317
- `backend/lambdas/api/src/routes/profile.ts` — Lines 140, 311
- `backend/lambdas/api/src/routes/drafts.ts` — Line 101

**Prerequisites:** Tasks 1-4 complete (requestOrigin is available).

**Implementation Steps:**

Create a shared helper to avoid repeating the try/catch pattern. Add to `backend/lambdas/api/src/lib/validation.ts`:

```typescript
/**
 * Safely parse JSON request body.
 * Returns parsed object or null if body is malformed.
 */
export function parseRequestBody(body: string | null): Record<string, unknown> | null {
  try {
    return JSON.parse(body || '{}')
  } catch {
    return null
  }
}
```

Then in each affected location, replace:
```typescript
const body = JSON.parse(event.body || '{}')
```
With:
```typescript
const body = parseRequestBody(event.body)
if (!body) {
  return errorResponse(400, 'Invalid JSON in request body', requestOrigin)
}
```

Apply this pattern to all 6 locations:

1. `messages.ts:200` — `createConversation()`
2. `messages.ts:273` — `sendMessage()`
3. `messages.ts:317` — `getUploadUrl()`
4. `profile.ts:140` — `updateProfile()`
5. `profile.ts:311` — `uploadPhotoUrl()`
6. `drafts.ts:101` — `handleUploadRequest()`

**Verification Checklist:**
- [ ] `parseRequestBody` exists in `validation.ts`
- [ ] All 6 locations use `parseRequestBody` instead of raw `JSON.parse`
- [ ] Each location returns `errorResponse(400, ...)` with `requestOrigin` on parse failure
- [ ] No unguarded `JSON.parse(event.body` remains in any route handler
- [ ] `npm run lint` passes

**Testing Instructions:**
- Add tests to `tests/unit/pagination-validation.test.ts` (or a new `tests/unit/validation.test.ts`):
  - `parseRequestBody` returns parsed object for valid JSON
  - `parseRequestBody` returns null for malformed JSON
  - `parseRequestBody` returns `{}` for null/empty body

**Commit Message Template:**
```
fix(api): guard all JSON.parse(event.body) calls with try/catch

- Add parseRequestBody() helper to validation.ts
- Apply to 6 unguarded locations in messages, profile, drafts routes
- Malformed JSON now returns 400 instead of 500
```

---

### Task 7: Extract Shared escapeHtml() Utility

**Goal:** The `escapeHtml()` function is duplicated verbatim in `contact.ts` and `notification-processor/index.js`. Extract it to a shared location so both consumers use the same implementation.

**Audit references:** Health audit #9.

**Files to Modify:**
- `backend/lambdas/api/src/lib/validation.ts` — Add `escapeHtml()` export
- `backend/lambdas/api/src/routes/contact.ts` — Import from shared location, remove local copy
- `backend/lambdas/notification-processor/index.js` — Import from shared location, remove local copy

**Prerequisites:** None.

**Implementation Steps:**
1. Add the `escapeHtml` function to `backend/lambdas/api/src/lib/validation.ts`:
   ```typescript
   export function escapeHtml(text: string): string {
     if (!text) return ''
     return text
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;')
       .replace(/'/g, '&#039;')
   }
   ```
2. In `contact.ts`, remove the local `escapeHtml` function (lines 14-22) and add `escapeHtml` to the existing import from `'../lib/validation'`.
3. For `notification-processor/index.js`: This is a plain JavaScript Lambda with its own `package.json`. It cannot directly import from the API Lambda's TypeScript source. Instead, duplicate the extraction — add the function to a local `lib/` file in the notification-processor, or leave the duplication with a `// TODO: shared lib` comment for now. The key constraint is that `notification-processor` is a separate Lambda deployment unit.

**Alternative for notification-processor:** Since notification-processor is JavaScript and a separate deploy unit, the cleanest short-term fix is to add a comment noting the shared implementation exists in the API Lambda's `validation.ts`. True deduplication requires either a shared npm workspace package or migrating notification-processor to TypeScript (deferred to a future scope).

**Verification Checklist:**
- [ ] `escapeHtml` is exported from `backend/lambdas/api/src/lib/validation.ts`
- [ ] `contact.ts` imports from shared location (no local copy)
- [ ] `notification-processor/index.js` has a comment referencing the canonical implementation
- [ ] `npm run lint` passes
- [ ] `npm test` passes

**Testing Instructions:**
- Add to `tests/unit/validation.test.ts`:
  - `escapeHtml` escapes `<`, `>`, `&`, `"`, `'`
  - `escapeHtml` returns empty string for falsy input
  - `escapeHtml` handles string with all special characters

**Commit Message Template:**
```
refactor(api): extract escapeHtml to shared validation utility

- Move from contact.ts to lib/validation.ts
- contact.ts now imports shared implementation
- Add canonical reference comment in notification-processor
```

---

### Task 8: Replace (err as Error).message with toError(err).message

**Goal:** Several error handlers use the unsafe `(err as Error).message` cast instead of the existing `toError()` utility which safely handles any thrown value type.

**Audit references:** Eval Code Quality remediation.

**Files to Modify:**
- `backend/lambdas/api/src/routes/drafts.ts` — Lines 159, 175 (and any others)
- `backend/lambdas/api/src/routes/messages.ts` — Any remaining `(err as Error).message` or `(e as Error).message` casts
- Any other route handler files with `as Error` casts in catch blocks

**Prerequisites:** None.

**Implementation Steps:**
1. Search all files in `backend/lambdas/api/src/` for the pattern `(err as Error)` or `(e as Error)` or `as Error)`.
2. For each occurrence:
   - Ensure `toError` is imported from `'../lib/errors'`
   - Replace `(err as Error).message` with `toError(err).message`
   - Or restructure the catch block to use `const error = toError(err)` followed by `error.message`
3. Do NOT change catch blocks that already use `toError()` (e.g., messages.ts lines 192-195 already do this correctly).

**Verification Checklist:**
- [ ] No `(err as Error)` or `(e as Error)` casts remain in route handler files
- [ ] All catch blocks use `toError()` for error conversion
- [ ] `npm run lint` passes

**Testing Instructions:**
- No new tests needed. The `toError()` function already has thorough tests in `tests/unit/errors.test.js`.

**Commit Message Template:**
```
fix(api): replace unsafe error casts with toError() utility

- Replace (err as Error).message with toError(err).message
- Prevents runtime errors when non-Error objects are thrown
```

---

### Task 9: Handle BatchWriteCommand UnprocessedItems

**Goal:** Add retry logic for `UnprocessedItems` returned by `BatchWriteCommand` in the messages route. Without this, DynamoDB throttling can silently drop writes.

**Audit references:** Health audit #12, Eval Performance concern, Eval Critical Failure Point.

**Files to Modify:**
- `backend/lambdas/api/src/routes/messages.ts` — Lines 252-256 (createConversation) and lines 472-476 (deleteConversation)

**Prerequisites:** Task 1 complete (requestOrigin available).

**Implementation Steps:**
1. Create a helper function in `messages.ts` (or in `backend/lambdas/api/src/lib/database.ts` if you prefer it to be reusable):

```typescript
async function batchWriteWithRetry(
  items: Record<string, unknown>[],
  tableName: string,
  maxRetries = 3
): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    let unprocessed: Record<string, unknown>[] | undefined = items.slice(i, i + 25)
    let retries = 0

    while (unprocessed && unprocessed.length > 0 && retries < maxRetries) {
      const result = await docClient.send(new BatchWriteCommand({
        RequestItems: { [tableName]: unprocessed },
      }))

      unprocessed = result.UnprocessedItems?.[tableName] as Record<string, unknown>[] | undefined
      if (unprocessed && unprocessed.length > 0) {
        retries++
        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, retries - 1)))
      }
    }

    if (unprocessed && unprocessed.length > 0) {
      log.warn('batch_write_unprocessed_items', {
        count: unprocessed.length,
        retries: maxRetries,
      })
    }
  }
}
```

2. Replace both `BatchWriteCommand` loops in `messages.ts`:
   - Line 252-256: `for (let i = 0; ...) { await docClient.send(new BatchWriteCommand(...)) }` → `await batchWriteWithRetry(memberRecords, TABLE_NAME)`
   - Line 472-476: Same pattern → `await batchWriteWithRetry(deleteOps, TABLE_NAME)`

**Verification Checklist:**
- [ ] Both BatchWrite loops in messages.ts use retry logic
- [ ] UnprocessedItems are detected and retried with backoff
- [ ] Remaining unprocessed items after max retries are logged (not silently dropped)
- [ ] `npm run lint` passes

**Testing Instructions:**
- Write a test in `tests/unit/batch-write-retry.test.ts`:
  - Mock DynamoDB `BatchWriteCommand` to return UnprocessedItems on first call, empty on second
  - Verify retry happens
  - Mock to always return UnprocessedItems — verify it stops after maxRetries
  - Mock with no UnprocessedItems — verify single call

**Commit Message Template:**
```
fix(messages): retry BatchWriteCommand on UnprocessedItems

- Add batchWriteWithRetry helper with exponential backoff
- Apply to conversation creation and deletion batch writes
- Log warning when items remain unprocessed after max retries
```

---

## Phase Verification

1. Run `npm test` — all tests pass (including new tests from Tasks 5, 6, 7, 9)
2. Run `npm run lint` — zero warnings
3. Search all route handler files for:
   - `successResponse(` without `requestOrigin` — should find NONE
   - `errorResponse(` without `requestOrigin` — should find NONE
   - `JSON.parse(event.body` — should find NONE (all replaced with `parseRequestBody`)
   - `Buffer.from(.*base64.*toString` in pagination contexts — should find NONE (all use `validatePaginationKey`)
   - `as Error)` in catch blocks — should find NONE
4. `npm run build` passes

**Known limitations:**
- The `notification-processor/index.js` still has its own `escapeHtml` copy. True deduplication requires either a shared package or TypeScript migration of that Lambda (out of scope for this phase).
- Route handler unit tests are not comprehensive yet — that is Phase 3's scope.
