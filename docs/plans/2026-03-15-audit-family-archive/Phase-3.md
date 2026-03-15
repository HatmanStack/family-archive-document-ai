# Phase 3 — [IMPLEMENTER] Architecture & Performance Improvements

## Phase Goal

Address architectural debt and performance issues: consolidate duplicated S3 clients, extract a MessageRepository, replace the DynamoDB Scan in drafts listing, add RAGStack fetch timeout, improve frontend error handling in media-service, and add unit tests for route handlers.

**Success criteria:**
- S3 client instantiations are consolidated (from 5 to 2: one for the archive bucket, one for RAGStack)
- RAGStack S3 client configuration is centralized (no duplication between letters.ts and media.ts)
- DynamoDB Scan in `handleListDrafts()` is replaced with a GSI query
- `ragstackQuery()` has a fetch timeout
- `getImageById()` error swallowing is improved
- Unit tests exist for at least 3 route handler files
- `npm test` passes, `npm run lint` passes

**Estimated tokens:** ~30,000

## Prerequisites

- Phase 0 read and understood
- Phase 2 complete (all CORS, pagination, JSON parsing fixes applied)
- `npm install` has been run from the repo root

---

## Tasks

### Task 1: Consolidate S3 Client Instantiations

**Goal:** The API Lambda creates 5 separate `new S3Client(...)` instances across route handlers and utils. Consolidate to 2 shared instances: one default-region client for the archive bucket, and one RAGStack-region client.

**Audit references:** Health audit #13, #14, Eval Architecture remediation.

**Files to Modify:**
- `backend/lambdas/api/src/lib/s3-utils.ts` — Export shared S3 clients
- `backend/lambdas/api/src/routes/messages.ts` — Remove local `s3Client`, import shared
- `backend/lambdas/api/src/routes/profile.ts` — Remove local `s3Client`, import shared
- `backend/lambdas/api/src/routes/drafts.ts` — Remove local `s3Client`, import shared
- `backend/lambdas/api/src/routes/letters.ts` — Remove local `s3Client` and `ragstackS3Client`, import shared
- `backend/lambdas/api/src/routes/media.ts` — Remove local `s3Client` and `ragstackS3Client`, import shared

**Prerequisites:** None.

**Implementation Steps:**
1. In `backend/lambdas/api/src/lib/s3-utils.ts`, export two S3 client instances:
   ```typescript
   // Default region client (for ARCHIVE_BUCKET)
   export const s3Client = new S3Client({
     region: process.env.AWS_REGION || 'us-west-2',
   })

   // RAGStack region client
   const RAGSTACK_REGION = process.env.RAGSTACK_REGION || 'us-east-1'
   export const ragstackS3Client = new S3Client({ region: RAGSTACK_REGION })

   // Also export the bucket name for convenience
   export const RAGSTACK_BUCKET = process.env.RAGSTACK_BUCKET || ''
   ```
2. Update the existing `signPhotoUrl` function to use the module-level `s3Client` (it already does — just verify the region matches).
3. In each route handler file:
   - Remove the local `const s3Client = new S3Client(...)` declaration
   - Remove local `RAGSTACK_BUCKET`, `RAGSTACK_REGION`, `ragstackS3Client` declarations (in letters.ts and media.ts)
   - Import from `'../lib/s3-utils'`: `import { s3Client, ragstackS3Client, RAGSTACK_BUCKET } from '../lib/s3-utils'`
   - Keep all other S3 imports (`PutObjectCommand`, `GetObjectCommand`, etc.) from `@aws-sdk/client-s3`
4. Verify no other files create `new S3Client`. The `drafts.ts` creates `const s3Client = new S3Client({})` at line 16 — include this in the consolidation.

**Verification Checklist:**
- [ ] Only `s3-utils.ts` creates `new S3Client(...)` — grep confirms no other instantiations
- [ ] `letters.ts` and `media.ts` share the same `ragstackS3Client` instance
- [ ] `RAGSTACK_BUCKET` and `RAGSTACK_REGION` are defined in one place
- [ ] `npm run lint` passes
- [ ] `npm test` passes

**Testing Instructions:**
- No new tests needed — this is a refactor with identical runtime behavior.
- Verify by grepping: `grep -rn "new S3Client" backend/lambdas/api/src/` should return only `s3-utils.ts`.

**Commit Message Template:**
```
refactor(api): consolidate S3 client instantiations to s3-utils

- Export shared s3Client and ragstackS3Client from lib/s3-utils.ts
- Remove 4 duplicate S3Client constructions from route handlers
- Centralize RAGSTACK_BUCKET and RAGSTACK_REGION configuration
```

---

### Task 2: Replace DynamoDB Scan in Draft Listing with GSI Query

**Goal:** `handleListDrafts()` in `drafts.ts` uses a `ScanCommand` with `FilterExpression` to find all drafts. This reads the entire DynamoDB table. Replace with a GSI query.

**Audit references:** Health audit #8, Eval Pragmatism concern, Eval Critical Failure Point.

**Files to Modify:**
- `backend/lambdas/api/src/routes/drafts.ts` — Replace `ScanCommand` with `QueryCommand`
- `backend/template.yaml` — Add GSI for drafts (if not already present)
- `backend/lambdas/api/src/lib/keys.ts` — Add draft GSI key builder if needed

**Prerequisites:** Task 4 from Phase 2 complete (requestOrigin available in drafts).

**Implementation Steps:**
1. First, check `backend/template.yaml` for existing GSI definitions on the DynamoDB table. Look for GlobalSecondaryIndexes.
2. Check if drafts already have GSI1PK/GSI1SK keys set when they are created. Look at how draft items are stored (search for `DRAFT#` in the codebase).
3. **If drafts already populate GSI1PK/GSI1SK:** Replace the `ScanCommand` with a `QueryCommand` on `GSI1`:
   ```typescript
   const command = new QueryCommand({
     TableName: TABLE_NAME,
     IndexName: 'GSI1',
     KeyConditionExpression: 'GSI1PK = :pk',
     ExpressionAttributeValues: { ':pk': 'DRAFTS' },
   })
   ```
4. **If drafts do NOT have GSI keys:** This requires a data migration. In that case, the approach is:
   - Add GSI1PK = `'DRAFTS'` and GSI1SK = `DRAFT#{draftId}` when creating draft items
   - Update the existing draft creation code to include these GSI keys
   - For the query, use the GSI1 index
   - Note: Existing draft items without GSI keys will not appear in GSI queries until re-written. If this is a concern, keep the Scan as a fallback for a transition period.
5. Replace the `ScanCommand` import with `QueryCommand` if not already imported.

**Verification Checklist:**
- [ ] `handleListDrafts()` uses `QueryCommand` instead of `ScanCommand`
- [ ] No `ScanCommand` import remains in `drafts.ts` (unless used elsewhere in the file)
- [ ] Draft creation includes GSI1PK/GSI1SK if they weren't already present
- [ ] `npm run lint` passes

**Testing Instructions:**
- Write a test in `tests/unit/drafts-handler.test.ts`:
  - Mock `QueryCommand` to return draft items
  - Verify `handleListDrafts` returns them correctly
  - Mock empty result — verify empty array returned

**Commit Message Template:**
```
perf(drafts): replace DynamoDB Scan with GSI query for draft listing

- Use GSI1 index with DRAFTS partition key
- Eliminates full table scan that degrades with table size
```

---

### Task 3: Add Fetch Timeout to RAGStack GraphQL Calls

**Goal:** The `ragstackQuery()` function in `media-service.ts` uses bare `fetch()` with no timeout. If RAGStack is slow, gallery page fetches hang indefinitely.

**Audit references:** Health audit #16.

**Files to Modify:**
- `frontend/lib/services/media-service.ts` — Add timeout to `ragstackQuery()`

**Prerequisites:** None.

**Implementation Steps:**
1. Add an `AbortController` with a timeout to the `fetch` call in `ragstackQuery()` (around line 65):
   ```typescript
   async function ragstackQuery(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
     if (!PUBLIC_RAGSTACK_GRAPHQL_URL || !PUBLIC_RAGSTACK_API_KEY) {
       throw new Error('RAGStack not configured')
     }

     const controller = new AbortController()
     const timeoutId = setTimeout(() => controller.abort(), 15000) // 15 second timeout

     try {
       const response = await fetch(PUBLIC_RAGSTACK_GRAPHQL_URL, {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'x-api-key': PUBLIC_RAGSTACK_API_KEY,
         },
         body: JSON.stringify({ query, variables }),
         signal: controller.signal,
       })

       if (!response.ok) {
         throw new Error(`RAGStack request failed: ${response.status}`)
       }

       const json = await response.json()
       if (json.errors) {
         throw new Error(json.errors[0]?.message || 'GraphQL error')
       }
       return json.data
     } finally {
       clearTimeout(timeoutId)
     }
   }
   ```
2. The 15-second timeout is generous — RAGStack queries should normally complete in under 5 seconds. Adjust if needed.
3. Note: The existing `cancellable-fetch.ts` utility in `frontend/lib/utils/` could potentially be used here, but the `AbortController` approach is simpler and more explicit for this single function. Do not add new dependencies.

**Verification Checklist:**
- [ ] `ragstackQuery()` uses `AbortController` with a timeout
- [ ] `clearTimeout` is called in `finally` block to prevent leaks
- [ ] `npm run lint` passes
- [ ] `npm run build` passes

**Testing Instructions:**
- No unit test for this (frontend service with `fetch` — would require a fetch mock setup not currently in place). Verify by code review.

**Commit Message Template:**
```
fix(gallery): add 15s timeout to RAGStack GraphQL fetch calls

- Prevents gallery page from hanging indefinitely if RAGStack is slow
- Uses AbortController with cleanup in finally block
```

---

### Task 4: Improve Error Handling in getImageById()

**Goal:** `getImageById()` in `media-service.ts` has a bare `catch` that swallows all errors and returns `null`. Network failures become indistinguishable from "image not found."

**Audit references:** Health audit #10.

**Files to Modify:**
- `frontend/lib/services/media-service.ts` — Improve `getImageById()` error handling

**Prerequisites:** None.

**Implementation Steps:**
1. Find `getImageById()` (around line 402 per the audit).
2. Instead of a bare catch returning null, differentiate error types:
   ```typescript
   export async function getImageById(imageId: string): Promise<MediaItem | null> {
     try {
       // ... existing fetch logic
     } catch (error) {
       // Re-throw auth errors so callers can redirect to login
       if (error instanceof Error && error.message.includes('not authenticated')) {
         throw error
       }
       // For network/other errors, return null but let the caller know
       // via the existing error state mechanism in the gallery
       return null
     }
   }
   ```
3. The key improvement: do NOT silently catch auth errors. If the user's session expired, the caller needs to know. For genuine network errors, returning null is acceptable since the gallery has fallback UI.
4. If there is no existing pattern for auth error detection, check how other functions in the file handle auth — look for `auth.isAuthenticated` checks or token refresh patterns.

**Verification Checklist:**
- [ ] `getImageById()` does not swallow auth/token errors
- [ ] Network errors still return null (graceful degradation)
- [ ] `npm run lint` passes
- [ ] `npm run build` passes

**Testing Instructions:**
- No unit test (frontend service). Verify by code review.

**Commit Message Template:**
```
fix(gallery): improve error handling in getImageById

- Re-throw authentication errors instead of swallowing
- Network errors still gracefully degrade to null
```

---

### Task 5: Add Unit Tests for Route Handlers

**Goal:** The API has zero unit tests for its 8 route handlers. Add tests for at least the 3 most critical handlers: comments, messages, and profile. Focus on the happy path, auth checks, and validation errors.

**Audit references:** Health audit #19, Eval Test Value remediation (6/10 → target 9/10).

**Files to Create:**
- `tests/unit/comments-handler.test.ts`
- `tests/unit/messages-handler.test.ts`
- `tests/unit/profile-handler.test.ts`

**Prerequisites:** Phase 2 complete (all fixes applied — tests should verify the fixed behavior).

**Implementation Steps:**

The route handlers are exported as `handle(event, context)` functions. To test them:

1. Create mock event and context factories:
   ```typescript
   import type { APIGatewayProxyEvent } from 'aws-lambda'

   function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
     return {
       httpMethod: 'GET',
       resource: '/comments/{itemId}',
       path: '/comments/test-item',
       pathParameters: { itemId: 'test-item' },
       queryStringParameters: null,
       headers: { Origin: 'https://example.com' },
       body: null,
       isBase64Encoded: false,
       requestContext: {} as any,
       stageVariables: null,
       multiValueHeaders: {},
       multiValueQueryStringParameters: null,
       ...overrides,
     }
   }

   function createMockContext(overrides = {}) {
     return {
       requesterId: 'user-123',
       requesterEmail: 'test@example.com',
       isAdmin: false,
       isApprovedUser: true,
       correlationId: 'test-correlation',
       requestOrigin: 'https://example.com',
       ...overrides,
     }
   }
   ```

2. Mock DynamoDB using `aws-sdk-client-mock`:
   ```typescript
   import { mockClient } from 'aws-sdk-client-mock'
   import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb'

   const ddbMock = mockClient(DynamoDBDocumentClient)

   beforeEach(() => {
     ddbMock.reset()
   })
   ```

3. For **comments-handler.test.ts**, test:
   - GET /comments/{itemId} — returns comments array with 200
   - POST /comments/{itemId} — creates comment, returns 201
   - Missing requesterId — returns 401
   - Rate limiting — returns 429
   - Invalid content length — returns 400

4. For **messages-handler.test.ts**, test:
   - GET /messages/conversations — returns conversation list
   - POST /messages/conversations — creates conversation with 201
   - Missing requesterId — returns 401
   - Malformed JSON body — returns 400 (tests the Phase 2 fix)
   - Invalid pagination cursor — returns 400 (tests the Phase 2 fix)

5. For **profile-handler.test.ts**, test:
   - GET /profile/{userId} — returns profile data
   - PUT /profile — updates profile
   - Missing requesterId — returns 401
   - Malformed JSON body — returns 400

6. All response assertions should verify:
   - Correct status code
   - Response body contains expected structure
   - `Access-Control-Allow-Origin` header is present (CORS fix verification)

**Verification Checklist:**
- [ ] `tests/unit/comments-handler.test.ts` exists with at least 4 test cases
- [ ] `tests/unit/messages-handler.test.ts` exists with at least 5 test cases
- [ ] `tests/unit/profile-handler.test.ts` exists with at least 4 test cases
- [ ] All tests pass: `npm test`
- [ ] Tests verify CORS headers are present in responses
- [ ] Tests use `aws-sdk-client-mock` (no real AWS calls)

**Testing Instructions:**
- Run `npm test -- tests/unit/comments-handler.test.ts`
- Run `npm test -- tests/unit/messages-handler.test.ts`
- Run `npm test -- tests/unit/profile-handler.test.ts`
- All should pass.

**Commit Message Template:**
```
test(api): add unit tests for comments, messages, and profile handlers

- Test happy paths, auth checks, validation errors
- Verify CORS headers present in all responses
- Use aws-sdk-client-mock for DynamoDB mocking
```

---

## Phase Verification

1. Run `npm test` — all tests pass (including 3 new handler test files)
2. Run `npm run lint` — zero warnings
3. Run `npm run build` — frontend builds
4. Verify S3 consolidation: `grep -rn "new S3Client" backend/lambdas/api/src/` returns only `s3-utils.ts`
5. Verify no Scan: `grep -rn "ScanCommand" backend/lambdas/api/src/routes/drafts.ts` returns no results (or only an import if ScanCommand is needed for another function)
6. Verify test count: `npm test -- --reporter=verbose 2>&1 | grep "Tests"` shows increased test count

**Known limitations:**
- MessageRepository extraction is deferred. The messages route is still a monolith, but it now has unit tests and all the critical bugs are fixed. A full repository extraction is a larger refactor best done as a follow-up feature.
- Gallery component decomposition (health audit #5) is out of scope for this remediation plan. It requires UI design decisions and is better handled as a dedicated feature.
- `activity-aggregator/index.js` and `notification-processor/index.js` remain as JavaScript. TypeScript migration of these separate Lambda deployment units is a separate effort.
