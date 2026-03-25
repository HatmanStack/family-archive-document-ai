# Phase 1 -- [FOUNDATION] Shared Infrastructure, Type Fixes, and TypeScript Migration

## Phase Goal

Create the shared code layer (`backend/lambdas/shared/`), fix all type mismatches in the API Lambda, make `BaseRepository.putItem` generic, optimize `ensureProfile`, and migrate the two remaining JavaScript Lambdas (activity-aggregator, notification-processor) to TypeScript with esbuild bundling.

**Success criteria:**

- `backend/lambdas/shared/types.ts` exists with stream event types used by both background Lambdas
- `backend/lambdas/shared/html-utils.ts` contains the single `escapeHtml` implementation
- `Reaction` type has `reactionType` field (not `emoji`)
- `UserProfile` type uses `profilePhotoUrl`/`profilePhotoKey` (matching route code)
- `BaseRepository.putItem` accepts `<T extends Record<string, unknown>>` (no more `as unknown as` casts)
- `drafts.ts` cast on line 299 is replaced with a type guard
- `ensureProfile` skips GSI backfill check for already-verified users within a Lambda instance
- `activity-aggregator/index.ts` and `notification-processor/index.ts` are TypeScript
- Both test files are TypeScript
- SAM template has esbuild `Metadata` for both background Lambdas
- `npm test` passes
- `npm run lint` passes

**Estimated tokens:** ~40,000

## Prerequisites

- Phase 0 read and understood (ADR-1 through ADR-6)
- All dependencies installed
- Tests pass before starting: `cd frontend && npm test`

## Tasks

### Task 1: Create shared types module

**Goal:** Create `backend/lambdas/shared/types.ts` with DynamoDB stream event types and entity-type constants shared between the API Lambda and background processors.

**Files to create:**

- `backend/lambdas/shared/types.ts`

**Prerequisites:** None

**Implementation Steps:**

1. Create directory `backend/lambdas/shared/`.
1. Create `backend/lambdas/shared/types.ts` with the following exports:

   ```typescript
   /**
    * Shared types for cross-Lambda use
    */

   /** DynamoDB Stream new-image attribute shapes (unmarshalled) */
   export interface StreamMessageImage {
     conversationId: { S: string }
     senderId: { S: string }
     senderName?: { S: string }
     messageText?: { S: string }
     participants?: { SS: string[] }
     entityType: { S: string }
   }

   export interface StreamCommentImage {
     itemId?: { S: string }
     itemType?: { S: string }
     userId?: { S: string }
     userName?: { S: string }
     commentText?: { S: string }
     itemTitle?: { S: string }
     previousCommenters?: { L: Array<{ S: string }> }
     entityType: { S: string }
   }

   export interface StreamReactionImage {
     userId?: { S: string }
     entityType: { S: string }
   }

   /** Entity type constants */
   export const ENTITY_TYPES = {
     MESSAGE: 'MESSAGE',
     COMMENT: 'COMMENT',
     REACTION: 'REACTION',
     USER_PROFILE: 'USER_PROFILE',
     CONVERSATION_MEMBER: 'CONVERSATION_MEMBER',
     CONVERSATION_META: 'CONVERSATION_META',
   } as const

   /** DynamoDB key prefixes (subset needed by background processors) */
   export const SHARED_PREFIX = {
     USER: 'USER#',
   } as const
   ```

1. Verify file compiles: `npx tsc --noEmit backend/lambdas/shared/types.ts` (or rely on esbuild to validate later).

**Verification:** File exists and exports compile without errors.

---

### Task 2: Create shared html-utils module

**Goal:** Deduplicate `escapeHtml` into `backend/lambdas/shared/html-utils.ts`. This closes the TODO in `notification-processor/index.js:213`.

**Files to create:**

- `backend/lambdas/shared/html-utils.ts`

**Prerequisites:** Task 1 (shared directory exists)

**Implementation Steps:**

1. Create `backend/lambdas/shared/html-utils.ts`:

   ```typescript
   /**
    * HTML utility functions shared across Lambdas
    */

   /**
    * Escape HTML special characters to prevent XSS in email templates.
    * Canonical implementation — imported by API validation and notification-processor.
    */
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

**Verification:** File exists with typed `escapeHtml` function.

---

### Task 3: Fix `Reaction` type — rename `emoji` to `reactionType`

**Goal:** The `Reaction` interface in `types/index.ts` uses `emoji: string` but the `reactions.ts` route reads and writes `reactionType`. Fix the type to match actual usage.

**Files to modify:**

- `backend/lambdas/api/src/types/index.ts` — Change `emoji` to `reactionType` in `Reaction` interface

**Prerequisites:** None

**Implementation Steps:**

1. Read `backend/lambdas/api/src/types/index.ts` lines 90-95.
1. In the `Reaction` interface, replace `emoji: string` with `reactionType: string`.
1. Grep the codebase for any references to `Reaction.emoji` or `.emoji` in the reactions context to confirm nothing else uses the old name. The `reactions.ts` route uses `reactionType` throughout, confirming this is correct.

**Verification:** `npm run lint` passes. No TypeScript errors referencing `emoji` on `Reaction`.

---

### Task 4: Fix `UserProfile` type — rename photo fields

**Goal:** The `UserProfile` interface uses `photoUrl`/`photoKey` but all route code uses `profilePhotoUrl`/`profilePhotoKey`. Align the type to match actual field names in DynamoDB.

**Files to modify:**

- `backend/lambdas/api/src/types/index.ts` — Rename fields in `UserProfile`

**Prerequisites:** None

**Implementation Steps:**

1. In the `UserProfile` interface, rename:
   - `photoUrl?: string` → `profilePhotoUrl?: string`
   - `photoKey?: string` → `profilePhotoKey?: string`
1. Grep for `\.photoUrl` and `\.photoKey` in the backend to confirm no code uses the old names. All profile route code already uses `profilePhotoUrl`/`profilePhotoKey`.

**Verification:** `npm run lint` passes. Grep confirms no references to old field names.

---

### Task 5: Make `BaseRepository.putItem` generic

**Goal:** Change `putItem` signature from `(item: Record<string, unknown>)` to `<T extends Record<string, unknown>>(item: T)`. This removes the need for the `as unknown as Record<string, unknown>` cast in `comment-repository.ts:84`.

**Files to modify:**

- `backend/lambdas/api/src/repositories/base-repository.ts` — Make `putItem` generic (line 74)
- `backend/lambdas/api/src/repositories/comment-repository.ts` — Remove cast (line 84)

**Prerequisites:** None

**Implementation Steps:**

1. In `base-repository.ts`, change the `putItem` method signature at line 74:

   **Before:**
   ```typescript
   async putItem(
     item: Record<string, unknown>,
     options: PutOptions = {}
   ): Promise<void> {
   ```

   **After:**
   ```typescript
   async putItem<T extends Record<string, unknown>>(
     item: T,
     options: PutOptions = {}
   ): Promise<void> {
   ```

1. In `comment-repository.ts` line 84, remove the cast:

   **Before:**
   ```typescript
   await this.putItem(comment as unknown as Record<string, unknown>)
   ```

   **After:**
   ```typescript
   await this.putItem(comment)
   ```

1. Grep for other `as unknown as Record<string, unknown>` casts to `putItem` and fix any found.

**Verification:** `npm run lint` passes. No `as unknown as` casts remain for `putItem` calls.

---

### Task 6: Fix `drafts.ts` double cast

**Goal:** Replace the `parsed as unknown as PublishData` double cast at line 299 with a type-safe approach.

**Files to modify:**

- `backend/lambdas/api/src/routes/drafts.ts` — Replace double cast with type assertion after validation

**Prerequisites:** None

**Implementation Steps:**

1. Read `drafts.ts` lines 275-305 to understand the `PublishData` interface and the cast location.
1. The `parseRequestBody` returns `Record<string, unknown> | null`. After the null check on line 296, we have a `Record<string, unknown>`. The subsequent lines (301-303) already validate the required fields. Change the cast to a single `as PublishData` after validation:

   **Before (line 299):**
   ```typescript
   const body = parsed as unknown as PublishData
   ```

   **After:**
   ```typescript
   const body = parsed as PublishData
   ```

   This works because `Record<string, unknown>` is a valid supertype assignment target for `PublishData`. The double cast was unnecessary — `as PublishData` is sufficient since `PublishData` extends the shape of `Record<string, unknown>`.

**Verification:** `npm run lint` passes. No `as unknown as` cast in drafts.ts.

---

### Task 7: Optimize `ensureProfile` — skip GSI backfill after first check

**Goal:** Add a module-level `Set<string>` to `user.ts` that tracks user IDs whose GSI1 attributes have been verified. Skip the `backfillGSI1IfMissing` call for users already in the set. Per ADR-6, the profile fetch still happens every request.

**Files to modify:**

- `backend/lambdas/api/src/lib/user.ts` — Add verified set, skip backfill for known users

**Prerequisites:** None

**Implementation Steps:**

1. At the top of `user.ts` (after imports), add:

   ```typescript
   /** Users whose GSI1 attributes have been verified this Lambda instance */
   const gsi1VerifiedUsers = new Set<string>()
   ```

1. In `ensureProfile`, after the existing profile is fetched (line 67-70), wrap the backfill call:

   **Before:**
   ```typescript
   if (result.Item) {
     return backfillGSI1IfMissing(result.Item as UserProfile)
   }
   ```

   **After:**
   ```typescript
   if (result.Item) {
     const profile = result.Item as UserProfile
     if (gsi1VerifiedUsers.has(userId)) {
       return profile
     }
     const updated = await backfillGSI1IfMissing(profile)
     gsi1VerifiedUsers.add(userId)
     return updated
   }
   ```

1. After a new profile is created (line 93-108), also add the user to the verified set since new profiles include GSI1 keys:

   Add `gsi1VerifiedUsers.add(userId)` before `return profile` at line 108.

**Verification:** `npm test` passes. The optimization is transparent — same behavior, fewer DynamoDB conditional updates on warm Lambda instances.

---

### Task 8: Migrate activity-aggregator to TypeScript

**Goal:** Convert `backend/lambdas/activity-aggregator/index.js` to TypeScript. Add esbuild metadata to the SAM template.

**Files to modify:**

- `backend/lambdas/activity-aggregator/index.js` → rename to `index.ts`
- `backend/template.yaml` — Add `Metadata` block to `ActivityAggregatorFunction`

**Files to create:**

- `backend/lambdas/activity-aggregator/tsconfig.json` (minimal, for editor support)

**Prerequisites:** Tasks 1-2 (shared types and html-utils exist)

**Implementation Steps:**

1. Read the current `index.js` (70 LOC) to confirm the full logic.
1. Create `backend/lambdas/activity-aggregator/index.ts` with the same logic, using:
   - `import` syntax instead of `require()`
   - `import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda'` for the handler signature
   - `import { SHARED_PREFIX } from '../shared/types'` for the `USER#` prefix
   - Typed function signatures for `processInsertEvent`, `incrementCommentCount`, `updateLastActive`
   - Proper typing for the DynamoDB stream record's `newImage` using the stream image interfaces from shared types

1. Delete `index.js`.

1. Add SAM esbuild metadata to `ActivityAggregatorFunction` in `template.yaml`:

   ```yaml
   ActivityAggregatorFunction:
     Type: AWS::Serverless::Function
     Metadata:
       BuildMethod: esbuild
       BuildProperties:
         Minify: true
         Target: es2022
         Sourcemap: true
         EntryPoints:
           - index.ts
         External:
           - '@aws-sdk/*'
     Properties:
       CodeUri: lambdas/activity-aggregator/
       Handler: index.handler
       ...
   ```

   Insert the `Metadata` block between `Type:` and `Properties:`, matching the API Lambda pattern.

1. Create minimal `tsconfig.json` for editor support (not used by SAM build):

   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "moduleResolution": "bundler",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true
     },
     "include": ["index.ts", "../shared/**/*.ts"]
   }
   ```

**Verification:** `npm test` passes (existing tests still work). SAM esbuild will bundle the TS on next deploy.

---

### Task 9: Migrate notification-processor to TypeScript

**Goal:** Convert `backend/lambdas/notification-processor/index.js` (255 LOC) to TypeScript. Import `escapeHtml` from shared module. Add esbuild metadata.

**Files to modify:**

- `backend/lambdas/notification-processor/index.js` → rename to `index.ts`
- `backend/template.yaml` — Add `Metadata` block to `NotificationProcessorFunction`

**Files to create:**

- `backend/lambdas/notification-processor/tsconfig.json`

**Prerequisites:** Tasks 1-2 (shared types and html-utils)

**Implementation Steps:**

1. Create `backend/lambdas/notification-processor/index.ts` with the same logic:
   - `import` syntax instead of `require()`
   - `import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda'`
   - `import { escapeHtml } from '../shared/html-utils'`
   - `import { SHARED_PREFIX, type StreamMessageImage, type StreamCommentImage } from '../shared/types'`
   - Remove the local `escapeHtml` function (lines 212-223 in the JS file)
   - Type all functions: `processInsertEvent(record: DynamoDBRecord)`, `processMessageNotification(newImage: StreamMessageImage)`, etc.
   - Type `sendEmail` return as `Promise<boolean>`
   - `maskEmail(email: string): string`
   - Keep `exports.sendEmail = sendEmail` as `export { sendEmail }` (used by tests)

1. Delete `index.js`.

1. Add SAM esbuild metadata to `NotificationProcessorFunction`, same pattern as Task 8.

1. Create minimal `tsconfig.json`, same as Task 8.

**Verification:** `npm test` passes. The local `escapeHtml` is gone, replaced by the shared import.

---

### Task 10: Create test files for migrated Lambdas

**Goal:** Write new TypeScript unit tests for the activity-aggregator and notification-processor Lambdas. No prior test files exist for these Lambdas — these are new tests.

**Files to create:**

- `tests/unit/activity-aggregator-handler.test.ts`
- `tests/unit/notification-processor-handler.test.ts`

**Prerequisites:** Tasks 8-9 (Lambda source files are TS)

**Implementation Steps:**

1. Study the existing test pattern in `tests/unit/` (e.g., `profile-handler.test.ts`, `comments-handler.test.ts`) to understand the project's Vitest + `aws-sdk-client-mock` conventions: how environment variables are set, how mocks are initialized, and how handler functions are imported.

1. Create `tests/unit/activity-aggregator-handler.test.ts`:
   - Mock `DynamoDBDocumentClient` using `aws-sdk-client-mock`
   - Mock `UpdateCommand` to capture calls
   - Test `processInsertEvent` for each entity type:
     - `COMMENT` entity: verify `incrementCommentCount` sends UpdateCommand with `ADD commentCount :inc` and `updateLastActive` sends UpdateCommand with `SET lastActive`
     - `MESSAGE` entity: verify `updateLastActive` is called for the senderId
     - `REACTION` entity: verify `updateLastActive` is called for the userId
   - Test that unknown entity types are silently ignored
   - Test that records without `eventName: 'INSERT'` are skipped
   - Build mock DynamoDB stream event records using the `DynamoDBStreamEvent` type from `@types/aws-lambda`
   - Set `process.env.TABLE_NAME` and `process.env.USER_PROFILES_TABLE` before importing the handler

1. Create `tests/unit/notification-processor-handler.test.ts`:
   - Mock `DynamoDBDocumentClient` (for `GetCommand` profile lookups) and `SESClient` (for `SendEmailCommand`)
   - Test `processMessageNotification`:
     - Verify email is sent to each participant except the sender
     - Verify `notifyOnMessage === false` suppresses the email
     - Verify missing profile skips notification
   - Test `processCommentNotification`:
     - Verify email is sent to previous commenters (excluding the commenter)
     - Verify `notifyOnComment === false` suppresses the email
     - Verify deduplication (same user not notified twice)
   - Test `sendEmail`: verify `SendEmailCommand` is called with correct source, destination, and HTML body
   - Test `maskEmail`: verify masking logic (e.g., `ab***@example.com`)
   - Set `process.env.TABLE_NAME`, `process.env.SES_FROM_EMAIL`, `process.env.BASE_URL` before importing

**Verification:** `npm test` passes with the new test files. Both Lambda handlers have coverage for their core logic paths.

---

### Task 11: Update `escapeHtml` import in API Lambda

**Goal:** Update the API Lambda's `validation.ts` to re-export `escapeHtml` from the shared module, or update `contact.ts` to import from shared directly.

**Files to modify:**

- `backend/lambdas/api/src/lib/validation.ts` — Replace the `escapeHtml` function body with a re-export from shared, preserving the existing import path for `contact.ts`

**Prerequisites:** Task 2 (shared html-utils exists)

**Implementation Steps:**

1. In `validation.ts`, find the `escapeHtml` function at line 112.
1. Replace it with a re-export:

   **Before:**
   ```typescript
   export function escapeHtml(text: string): string {
     // ... implementation
   }
   ```

   **After:**
   ```typescript
   export { escapeHtml } from '../../shared/html-utils'
   ```

   This preserves the import path for `contact.ts` (`import { escapeHtml } from '../lib/validation'`) without changes.

**Verification:** `npm run lint` passes. `contact.ts` import resolves. No duplicate `escapeHtml` implementations remain.

---

### Task 12: Run full test suite and lint

**Goal:** Verify everything works end-to-end.

**Prerequisites:** Tasks 1-11 complete

**Implementation Steps:**

1. Run `cd frontend && npm test` — all tests pass.
1. Run `cd frontend && npm run lint` — zero warnings.
1. If any failures, fix them before marking Phase 1 complete.

**Verification:** Clean test and lint output.

## Rollback

All changes are additive or rename-only. Revert the commit to return to the previous state. No database changes are involved.
