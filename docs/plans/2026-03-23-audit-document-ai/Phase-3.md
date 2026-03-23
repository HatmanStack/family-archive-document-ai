# Phase 3 -- [IMPLEMENTER] Performance and Pagination Guards

## Phase Goal

Cap unbounded queries, add pagination limits, and add concurrency controls to prevent Lambda
timeouts. This phase addresses the operational debt findings that risk production outages.

**Success criteria:**

- All `limit` parameters parsed from query strings are capped at `MAX_PAGE_SIZE`
- `handleListDrafts` uses pagination instead of unbounded query
- `deleteConversation` chunks S3 deletes with concurrency limits
- Presigned URL generation in `getMessages` has concurrency control
- `listUsers` in profile route has a limit guard

**Estimated tokens:** ~20,000

## Prerequisites

- Phase 2 complete (security fixes done first)
- Phase 0 read (especially ADR-2 on pagination limits)
- Tests pass: `npm test`

## Tasks

### Task 1: Cap limit parameters in letters and messages routes

**Goal:** Add `Math.min(limit, MAX_PAGE_SIZE)` to all uncapped limit parsing. This closes
health-audit finding #2 (CRITICAL) partial, eval Performance targets.

**Files to modify:**

- `backend/lambdas/api/src/routes/letters.ts` -- Cap limit at line 70
- `backend/lambdas/api/src/routes/messages.ts` -- Cap limit at line 185
- `backend/lambdas/api/src/lib/constants.ts` -- Add `MAX_PAGE_SIZE` if not present

**Prerequisites:** None

**Implementation Steps:**

1. Read `backend/lambdas/api/src/lib/constants.ts` to check if `MAX_PAGE_SIZE` exists.
1. If not, add `export const MAX_PAGE_SIZE = 100` to constants.
1. In `letters.ts` line 70, change:

   ```typescript
   const limit = parseInt(event.queryStringParameters?.limit || '50', 10)
   ```

   to:

   ```typescript
   const limit = Math.min(
     parseInt(event.queryStringParameters?.limit || '50', 10),
     MAX_PAGE_SIZE
   )
   ```

1. In `messages.ts` line 185, apply the same pattern.
1. Import `MAX_PAGE_SIZE` from `../lib/constants` in both files.
1. Verify `comments.ts` already caps with `Math.min(limit, 100)` -- if so, update it to use
   `MAX_PAGE_SIZE` constant for consistency.

**Verification Checklist:**

- [x] `MAX_PAGE_SIZE` exported from `constants.ts`
- [x] `letters.ts` uses `Math.min(limit, MAX_PAGE_SIZE)`
- [x] `messages.ts` uses `Math.min(limit, MAX_PAGE_SIZE)`
- [x] `npm test` passes

**Testing Instructions:**

- Existing message handler tests should pass.
- Add a test in `messages-handler.test.ts` that passes `limit=999` and verifies the DynamoDB
  query uses `Limit: 100` (or `MAX_PAGE_SIZE`).

**Commit Message Template:**

```text
perf(api): cap pagination limits in letters and messages routes

- Add MAX_PAGE_SIZE constant (100) to constants.ts
- Apply Math.min(limit, MAX_PAGE_SIZE) to letters and messages routes
- Prevents unbounded DynamoDB queries from user-supplied limit values
```

### Task 2: Add pagination to handleListDrafts

**Goal:** Replace the unbounded `do...while` loop in `handleListDrafts` with a paginated query
that returns a single page and a cursor. This closes health-audit finding #10.

**Files to modify:**

- `backend/lambdas/api/src/routes/drafts.ts` -- Replace unbounded loop with paginated query

**Prerequisites:** Task 1 (MAX_PAGE_SIZE constant exists)

**Implementation Steps:**

1. Read `drafts.ts` lines 205-231 (the `handleListDrafts` function).
1. Replace the `do...while` unbounded query with a single-page query:

   ```typescript
   async function handleListDrafts(
     event: APIGatewayProxyEvent,
     requestOrigin?: string
   ): Promise<APIGatewayProxyResult> {
     try {
       const limit = Math.min(
         parseInt(event.queryStringParameters?.limit || '50', 10),
         MAX_PAGE_SIZE
       )
       const cursor = event.queryStringParameters?.cursor

       const params: QueryCommandInput = {
         TableName: TABLE_NAME,
         IndexName: 'GSI1',
         KeyConditionExpression: 'GSI1PK = :pk',
         ExpressionAttributeValues: { ':pk': 'DRAFTS' },
         Limit: limit,
       }

       if (cursor) {
         const paginationResult = validatePaginationKey(cursor)
         if (!paginationResult.valid) {
           return errorResponse(400, paginationResult.error || 'Invalid pagination key', requestOrigin)
         }
         if (paginationResult.key) {
           params.ExclusiveStartKey = paginationResult.key
         }
       }

       const result = await docClient.send(new QueryCommand(params))

       return successResponse({
         drafts: result.Items || [],
         nextCursor: result.LastEvaluatedKey
           ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
           : null,
       }, 200, requestOrigin)
     } catch (err) {
       log.error('list_drafts_error', { error: toError(err).message })
       return errorResponse(500, 'Failed to list drafts', requestOrigin)
     }
   }
   ```

1. Update the function signature to accept `event` so it can read query parameters.
1. Update the caller in the `handle()` function to pass `event`.
1. Import `MAX_PAGE_SIZE` from `../lib/constants` and `validatePaginationKey` from
   `../lib/validation` if not already imported.

**Verification Checklist:**

- [x] `handleListDrafts` no longer has a `do...while` loop
- [x] Single DynamoDB query with `Limit` parameter
- [x] Pagination cursor support (both reading and returning)
- [x] `npm test` passes (especially `drafts-handler.test.ts`)

**Testing Instructions:**

- Existing `drafts-handler.test.ts` tests should still pass.
- If any test expects all drafts to be returned in one call, update it to account for pagination.

**Commit Message Template:**

```text
perf(drafts): replace unbounded draft listing with paginated query

- Remove do...while loop that fetched all drafts into memory
- Add limit and cursor support matching other list endpoints
- Prevents Lambda timeout and memory exhaustion for large draft sets
```

### Task 3: Add concurrency control to deleteConversation S3 deletes

**Goal:** The `deleteConversation` function issues unbounded `Promise.all` for S3 deletes.
Add chunking with a concurrency limit. This closes health-audit finding #1 (CRITICAL).

**Files to modify:**

- `backend/lambdas/api/src/routes/messages.ts` -- Add chunked S3 deletion

**Prerequisites:** None

**Implementation Steps:**

1. Read `messages.ts` lines 527-578 (the `deleteConversation` function).
1. The current code does `Promise.all(s3KeysToDelete.map(...))` with no limit.
1. Add a simple chunking helper or use a concurrency-limited approach. A straightforward
   pattern without adding dependencies:

   ```typescript
   // Delete S3 attachments in batches to prevent connection exhaustion
   const BATCH_SIZE = 25
   for (let i = 0; i < s3KeysToDelete.length; i += BATCH_SIZE) {
     const batch = s3KeysToDelete.slice(i, i + BATCH_SIZE)
     await Promise.all(
       batch.map(async (s3Key) => {
         try {
           await s3Client.send(new DeleteObjectCommand({
             Bucket: ARCHIVE_BUCKET,
             Key: s3Key,
           }))
         } catch (e) {
           log.warn('attachment_delete_failed', { s3Key, error: toError(e).message })
         }
       })
     )
   }
   ```

1. Replace the existing `Promise.all` block (lines 562-574) with the batched version.

**Verification Checklist:**

- [x] S3 deletes are batched (not unbounded `Promise.all`)
- [x] Batch size is a named constant (e.g., 25)
- [x] Individual delete failures are still logged but do not fail the operation
- [x] `npm test` passes (especially `messages-handler.test.ts`)

**Testing Instructions:**

- Existing message handler tests should pass.
- The delete conversation test (if it exists) should verify the batch behavior.

**Commit Message Template:**

```text
perf(messages): batch S3 deletes in deleteConversation

- Chunk S3 attachment deletes into batches of 25
- Prevents connection exhaustion and timeout for large conversations
```

### Task 4: Add concurrency control to presigned URL generation in getMessages

**Goal:** `getMessages` generates presigned URLs for every attachment on every message via
unbounded `Promise.all`. Add concurrency control. This closes health-audit finding #2 (CRITICAL).

**Files to modify:**

- `backend/lambdas/api/src/routes/messages.ts` -- Add batching to URL generation

**Prerequisites:** None

**Implementation Steps:**

1. Read `messages.ts` lines 225-254 (the presigned URL generation in `getMessages`).
1. The current pattern is nested `Promise.all` -- outer for messages, inner for attachments
   per message, plus `signPhotoUrl` per message.
1. Refactor to process messages sequentially or in small batches. Since this is in a hot
   path (every message list), a good approach is to batch the signing operations:

   ```typescript
   // Process messages in batches to limit concurrent signing operations
   const SIGN_BATCH_SIZE = 10
   const messages = (result.Items || []).filter(item => item.entityType === 'MESSAGE')
   const processedMessages = []

   for (let i = 0; i < messages.length; i += SIGN_BATCH_SIZE) {
     const batch = messages.slice(i, i + SIGN_BATCH_SIZE)
     const batchResults = await Promise.all(
       batch.map(async (item) => {
         // ... existing per-message processing logic
       })
     )
     processedMessages.push(...batchResults)
   }
   ```

1. Keep the existing per-message logic (attachment URL signing + photo URL signing) inside
   each batch.

**Verification Checklist:**

- [ ] Presigned URL generation is batched (not all-at-once)
- [ ] Batch size is a named constant
- [ ] Response format is unchanged
- [ ] `npm test` passes

**Testing Instructions:**

- Existing `messages-handler.test.ts` tests should pass.
- The message listing tests verify the response shape -- ensure the batching does not change it.

**Commit Message Template:**

```text
perf(messages): batch presigned URL generation in getMessages

- Process message signing in batches of 10 to limit concurrency
- Prevents connection exhaustion during cold starts
```

### Task 5: Add limit to listUsers in profile route

**Goal:** `listUsers` issues a GSI1 query with no `Limit` parameter. Add a reasonable limit
to prevent unbounded responses. This addresses health-audit finding #24.

**Files to modify:**

- `backend/lambdas/api/src/routes/profile.ts` -- Add Limit to listUsers query

**Prerequisites:** Task 1 (MAX_PAGE_SIZE constant exists)

**Implementation Steps:**

1. Read `profile.ts` to find the `listUsers` function (around line 348).
1. Add `Limit: MAX_PAGE_SIZE` to the DynamoDB QueryCommand parameters.
1. Optionally add pagination cursor support (returning `LastEvaluatedKey` as a cursor).
   For a family archive, this is low priority -- the limit is mainly a safety guard.
1. Import `MAX_PAGE_SIZE` from `../lib/constants`.

**Verification Checklist:**

- [ ] `listUsers` query includes a `Limit` parameter
- [ ] `MAX_PAGE_SIZE` is imported and used
- [ ] `npm test` passes

**Testing Instructions:**

- Existing `profile-handler.test.ts` tests should pass.

**Commit Message Template:**

```text
perf(profile): add limit guard to listUsers query

- Add Limit: MAX_PAGE_SIZE to user listing DynamoDB query
- Prevents unbounded response for large user bases
```

## Phase Verification

After completing all tasks:

1. Run full test suite: `npm test` -- all tests must pass
1. Verify no uncapped limits: search for `parseInt(event.queryStringParameters?.limit` in
   backend routes and confirm all are wrapped in `Math.min()`
1. Verify no unbounded `do...while` in drafts: read `drafts.ts` and confirm single-page query
1. Verify S3 delete batching: read `messages.ts deleteConversation` and confirm chunked loop
1. Verify presigned URL batching: read `messages.ts getMessages` and confirm batched processing

**Known limitations:**

- The `ensureProfile` call on every request (health-audit finding #8) is NOT addressed.
  Caching would add complexity; the 5-15ms overhead is acceptable for a family archive
  with low request volume.
- The N+1 sender profile fetch in `createMessageInternal` (health-audit finding #7) is not
  addressed. It would require data model changes (denormalizing sender info into conversation
  member records). Out of scope for remediation.
