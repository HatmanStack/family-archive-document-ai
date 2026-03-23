# Phase 4 -- [IMPLEMENTER] Test Coverage for Untested Routes

## Phase Goal

Add unit tests for the 4 API route handlers that have zero dedicated test files: `letters.ts`,
`media.ts`, `reactions.ts`, and `contact.ts`. This addresses the eval Test Value finding
(7/10) and the Day 2 red flag about untested routes.

**Success criteria:**

- New test files exist for all 4 untested routes
- Each test file covers: happy path, validation errors, auth errors, and error handling
- All tests pass in CI (`npm test`)
- Tests follow the established pattern from `comments-handler.test.ts`

**Estimated tokens:** ~25,000

## Prerequisites

- Phase 2 complete (error handling standardized in letters.ts)
- Phase 3 complete (pagination limits and batching in place)
- Phase 0 read (testing strategy section)
- Understand the test pattern from `tests/unit/comments-handler.test.ts`

## Tasks

### Task 1: Add unit tests for letters route handler

**Goal:** Create `tests/unit/letters-handler.test.ts` covering the letters route.

**Files to create:**

- `tests/unit/letters-handler.test.ts`

**Prerequisites:** Phase 2 Task 2 complete (letters error handling standardized)

**Implementation Steps:**

1. Read `backend/lambdas/api/src/routes/letters.ts` fully to understand all endpoints:
   - `GET /letters` -- list letters (paginated)
   - `GET /letters/{date}` -- get single letter by date
   - `GET /letters/{date}/pdf` -- get PDF download URL
1. Read `tests/unit/comments-handler.test.ts` as the reference pattern.
1. Create the test file with this structure:

   ```typescript
   import { describe, it, expect, beforeEach, vi } from 'vitest'
   import { mockClient } from 'aws-sdk-client-mock'
   import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb'
   ```

1. Mock the rate-limit module (even if letters don't use rate limiting, mock it to prevent
   import side effects).
1. Mock S3 presigned URL generation if `getSignedUrl` is used (letters PDF endpoint).
1. Test cases for `listLetters`:
   - Returns paginated list of letters
   - Respects limit parameter
   - Rejects invalid pagination cursor with 400
   - Returns empty list when no letters exist
1. Test cases for `getLetter`:
   - Returns letter by date
   - Returns 404 when letter not found
   - Returns 400 for missing date parameter
1. Test cases for `getPdfUrl`:
   - Returns presigned URL for PDF
   - Returns 404 when PDF not found
1. Test cases for error handling:
   - DynamoDB errors return 500 (not throw) -- verifies Phase 2 Task 2

**Verification Checklist:**

- [x] Test file exists at `tests/unit/letters-handler.test.ts`
- [x] All test cases pass: `npm test -- tests/unit/letters-handler.test.ts`
- [x] Covers list, get, and PDF endpoints
- [x] Verifies error responses (not throws) from catch blocks
- [x] Uses `createMockEvent()` and `createMockContext()` helpers

**Testing Instructions:**

```bash
npm test -- tests/unit/letters-handler.test.ts
```

**Commit Message Template:**

```text
test(letters): add unit tests for letters route handler

- Test list, get, and PDF URL endpoints
- Verify pagination, 404 handling, and error responses
- Follow established pattern from comments-handler.test.ts
```

### Task 2: Add unit tests for contact route handler

**Goal:** Create `tests/unit/contact-handler.test.ts` covering the contact route.

**Files to create:**

- `tests/unit/contact-handler.test.ts`

**Prerequisites:** Phase 1 Task 3 complete (SES_FROM_EMAIL validation)

**Implementation Steps:**

1. Read `backend/lambdas/api/src/routes/contact.ts` fully. It has a single endpoint:
   - `POST /contact` -- send contact form email via SES
1. Create the test file. Mock both DynamoDB (for rate limiting side effects) and SES.
1. Mock the SES client:

   ```typescript
   import { mockClient } from 'aws-sdk-client-mock'
   import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
   const sesMock = mockClient(SESClient)
   ```

1. Set up environment variables in test:

   ```typescript
   beforeEach(() => {
     process.env.SES_FROM_EMAIL = 'noreply@example.com'
     process.env.ADMIN_EMAIL = 'admin@example.com'
   })
   ```

1. Test cases:
   - Successfully sends contact email (happy path)
   - Returns 400 for missing email
   - Returns 400 for missing message
   - Returns 400 for invalid email format
   - Returns 400 for message exceeding 5000 chars
   - Returns 405 for non-POST methods
   - Returns 500 when ADMIN_EMAIL not configured
   - Returns 500 when SES_FROM_EMAIL not configured (Phase 1 fix)
   - Returns 400 for malformed JSON body
   - Returns 500 when SES send fails

**Verification Checklist:**

- [x] Test file exists at `tests/unit/contact-handler.test.ts`
- [x] All test cases pass
- [x] Covers validation, auth, and SES error scenarios
- [x] Verifies both ADMIN_EMAIL and SES_FROM_EMAIL validation

**Testing Instructions:**

```bash
npm test -- tests/unit/contact-handler.test.ts
```

**Commit Message Template:**

```text
test(contact): add unit tests for contact route handler

- Test email validation, message limits, and SES error handling
- Verify env var validation for both ADMIN_EMAIL and SES_FROM_EMAIL
```

### Task 3: Add unit tests for reactions route handler

**Goal:** Create `tests/unit/reactions-handler.test.ts` covering the reactions route.

**Files to create:**

- `tests/unit/reactions-handler.test.ts`

**Prerequisites:** None

**Implementation Steps:**

1. Read `backend/lambdas/api/src/routes/reactions.ts` fully to understand endpoints:
   - `POST /reactions` -- toggle a reaction on an item
   - `GET /reactions/{itemId}` -- get reactions for an item
1. Note the `itemIdVariants` pattern (health-audit finding #22) -- the route tries both
   plain and URL-encoded item IDs.
1. Create the test file following the standard pattern.
1. Mock the rate-limit module.
1. Test cases for `toggleReaction`:
   - Successfully adds a reaction
   - Successfully removes an existing reaction (toggle off)
   - Returns 401 for unauthenticated requests
   - Returns 400 for missing required fields
   - Rate limiting returns 429
1. Test cases for `getReactions`:
   - Returns reactions for an item
   - Returns empty array when no reactions exist
   - Returns 400 for missing itemId

**Verification Checklist:**

- [x] Test file exists at `tests/unit/reactions-handler.test.ts`
- [x] All test cases pass
- [x] Covers toggle (add/remove) and list scenarios
- [x] Tests rate limiting behavior

**Testing Instructions:**

```bash
npm test -- tests/unit/reactions-handler.test.ts
```

**Commit Message Template:**

```text
test(reactions): add unit tests for reactions route handler

- Test toggle (add/remove) and list endpoints
- Verify auth, validation, and rate limiting behavior
```

### Task 4: Add unit tests for media route handler

**Goal:** Create `tests/unit/media-handler.test.ts` covering the media route.

**Files to create:**

- `tests/unit/media-handler.test.ts`

**Prerequisites:** None

**Implementation Steps:**

1. Read `backend/lambdas/api/src/routes/media.ts` fully to understand endpoints. This route
   handles media gallery, downloads, uploads, and PDF access.
1. Create the test file following the standard pattern.
1. Mock S3 (`S3Client`, `GetObjectCommand`, `PutObjectCommand`) and presigned URL generation.
1. The `getSignedUrl` function from `@aws-sdk/s3-request-presigner` needs to be mocked:

   ```typescript
   vi.mock('@aws-sdk/s3-request-presigner', () => ({
     getSignedUrl: vi.fn().mockResolvedValue('https://mock-presigned-url.com'),
   }))
   ```

1. Test cases (scope depends on the route's complexity -- focus on the most important paths):
   - Returns presigned download URL for valid media
   - Returns 404 for non-existent media
   - Returns presigned upload URL with correct content type
   - Returns 401 for unauthenticated requests
   - Returns 400 for missing required parameters
   - Handles S3 errors gracefully (500 response, not throw)

**Verification Checklist:**

- [x] Test file exists at `tests/unit/media-handler.test.ts`
- [x] All test cases pass
- [x] Covers download, upload URL generation, and error handling
- [x] S3 operations are properly mocked

**Testing Instructions:**

```bash
npm test -- tests/unit/media-handler.test.ts
```

**Commit Message Template:**

```text
test(media): add unit tests for media route handler

- Test download URL, upload URL, and error handling
- Mock S3 and presigned URL generation
```

## Phase Verification

After completing all tasks:

1. Run full test suite: `npm test` -- all tests must pass
1. Verify all 4 new test files exist:

   ```bash
   ls tests/unit/letters-handler.test.ts \
      tests/unit/contact-handler.test.ts \
      tests/unit/reactions-handler.test.ts \
      tests/unit/media-handler.test.ts
   ```

1. Verify coverage improvement: `npm test -- --coverage` and check that
   `letters.ts`, `contact.ts`, `reactions.ts`, and `media.ts` have meaningful coverage
1. All new tests follow the established pattern (mock event, mock context, assert on response)

**Known limitations:**

- Integration tests and E2E tests are out of scope for this phase. The eval mentions adding
  E2E to CI, but that is infrastructure work, not code remediation.
- The letter-processor parsing tests (eval mention) are not included because the processor
  has a different test pattern (module structure tests) and would need a different approach.
