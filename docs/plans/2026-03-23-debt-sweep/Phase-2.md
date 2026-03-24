# Phase 2 -- [ARCHITECTURE] Router, MessagingRepository, Frontend Consolidation, and Docs

## Phase Goal

Replace the if/else route dispatcher with a type-safe `Router` class, extract `MessagingRepository` from the messages route monolith, fix performance issues in the message request path, consolidate 10 frontend services onto `apiClient`, rename `client.ts` → `auth-utils.ts`, and update documentation.

**Success criteria:**

- `backend/lambdas/api/src/lib/router.ts` exists with Express-like `router.get()` / `router.post()` pattern
- `backend/lambdas/api/src/index.ts` uses declarative route registration (no if/else chain)
- Rate-limit middleware is defined once, applied declaratively per route
- `backend/lambdas/api/src/repositories/messaging-repository.ts` encapsulates all 17 DynamoDB operations from messages.ts
- `messages.ts` is reduced to request parsing and response formatting (~200 LOC, down from ~765)
- `createMessageInternal` no longer re-fetches sender profile (passed from caller)
- `deleteConversation` message query has `Limit: 25`
- 10 frontend services use `apiClient` instead of raw `fetch` + manual auth
- `frontend/lib/auth/client.ts` is renamed to `auth-utils.ts` with all imports updated
- Documentation updated: CLAUDE.md, FEATURES_ROADMAP.md
- `npm test` passes
- `npm run lint` passes

**Estimated tokens:** ~60,000

## Prerequisites

- Phase 1 complete (shared types, type fixes, TS migration done)
- Phase 0 read (ADR-2, ADR-3, ADR-5)
- Tests pass before starting: `cd frontend && npm test`

## Tasks

### Task 1: Create Router class

**Goal:** Create a type-safe Express-like router in `backend/lambdas/api/src/lib/router.ts` per ADR-2. Supports `{param}` path placeholders, middleware chains, and method-based registration.

**Files to create:**

- `backend/lambdas/api/src/lib/router.ts`

**Prerequisites:** None

**Implementation Steps:**

1. Create `backend/lambdas/api/src/lib/router.ts` with the following API:

   ```typescript
   import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
   import type { RequestContext } from '../types'

   export type RouteHandler = (
     event: APIGatewayProxyEvent,
     context: RequestContext
   ) => Promise<APIGatewayProxyResult>

   export type Middleware = (
     event: APIGatewayProxyEvent,
     context: RequestContext
   ) => Promise<APIGatewayProxyResult | null | undefined>

   type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

   interface Route {
     method: HttpMethod
     pattern: string       // e.g. '/messages/{conversationId}'
     regex: RegExp
     paramNames: string[]
     middlewares: Middleware[]
     handler: RouteHandler
   }
   ```

1. Implement the `Router` class:
   - `get(pattern, ...middlewaresAndHandler)`, `post(...)`, `put(...)`, `delete(...)` registration methods
   - Last argument is always the handler; preceding arguments are middleware
   - `handle(event, context)` matches `event.resource` (after stripping `/v1` prefix) against registered patterns
   - Pattern `{param}` compiles to regex `([^/]+)` for matching; parameter names are extracted but not injected (API Gateway already provides `event.pathParameters`)
   - If no route matches, returns `null` (caller handles 404)
   - Middleware chain: run each middleware in order; if any returns an `APIGatewayProxyResult`, short-circuit and return it; if all return `null`/`undefined`, run the handler

1. The router should be stateless per request — no mutation of shared state during `handle()`.

**Verification:** Unit test the router (see Task 2).

---

### Task 2: Unit test the Router class

**Goal:** Create tests for the Router class covering: route matching, parameter extraction, middleware short-circuiting, 404 handling, and method discrimination.

**Files to create:**

- `tests/unit/router.test.ts`

**Prerequisites:** Task 1

**Implementation Steps:**

1. Create `tests/unit/router.test.ts` with tests:
   - Basic GET route matches correctly
   - POST route does not match GET request
   - Parameterized route `/messages/{conversationId}` matches `/messages/abc123`
   - Middleware that returns a response short-circuits the handler
   - Middleware that returns `null` passes through to handler
   - Multiple middleware execute in order
   - Unmatched route returns `null`
   - Route with version prefix stripped matches correctly

1. Use mock `APIGatewayProxyEvent` objects (no AWS SDK mocking needed — Router is pure logic).

**Verification:** `npm test -- tests/unit/router.test.ts` passes.

---

### Task 3: Extract rate-limit middleware

**Goal:** Create a reusable rate-limit middleware factory for use with the Router, replacing the 6 copy-pasted `checkRateLimit` blocks in `messages.ts`.

**Files to create:**

- `backend/lambdas/api/src/lib/middleware.ts`

**Prerequisites:** Task 1

**Implementation Steps:**

1. Create `backend/lambdas/api/src/lib/middleware.ts`:

   ```typescript
   import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
   import type { RequestContext } from '../types'
   import { checkRateLimit, getRetryAfter } from './rate-limit'
   import { rateLimitResponse, errorResponse } from './responses'

   /**
    * Middleware that enforces rate limiting for a given action.
    */
   export function rateLimit(action: string) {
     return async (
       event: APIGatewayProxyEvent,
       context: RequestContext
     ): Promise<APIGatewayProxyResult | null> => {
       if (!context.requesterId) return null // auth middleware handles this
       const result = await checkRateLimit(context.requesterId, action)
       if (!result.allowed) {
         return rateLimitResponse(
           getRetryAfter(result.resetAt),
           'Rate limit exceeded. Please try again later.',
           context.requestOrigin
         )
       }
       return null // continue to handler
     }
   }

   /**
    * Middleware that requires authentication.
    */
   export function requireAuth() {
     return async (
       _event: APIGatewayProxyEvent,
       context: RequestContext
     ): Promise<APIGatewayProxyResult | null> => {
       if (!context.requesterId) {
         return errorResponse(401, 'Unauthorized: Missing user context', context.requestOrigin)
       }
       return null
     }
   }

   /**
    * Middleware that requires admin access.
    */
   export function requireAdmin() {
     return async (
       _event: APIGatewayProxyEvent,
       context: RequestContext
     ): Promise<APIGatewayProxyResult | null> => {
       if (!context.isAdmin) {
         return errorResponse(403, 'Admin access required', context.requestOrigin)
       }
       return null
     }
   }

   /**
    * Middleware that requires approved user or admin access.
    */
   export function requireApproved() {
     return async (
       _event: APIGatewayProxyEvent,
       context: RequestContext
     ): Promise<APIGatewayProxyResult | null> => {
       if (!context.isApprovedUser && !context.isAdmin) {
         return errorResponse(403, 'Approved user access required', context.requestOrigin)
       }
       return null
     }
   }
   ```

**Verification:** Middleware functions are importable and type-check correctly.

---

### Task 4: Rewrite `index.ts` with Router

**Goal:** Replace the if/else dispatch chain in `index.ts` with declarative route registration using the Router class.

**Files to modify:**

- `backend/lambdas/api/src/index.ts` — Rewrite with Router

**Prerequisites:** Tasks 1, 3

**Implementation Steps:**

1. Import the Router and middleware at the top of `index.ts`.
1. Create a module-level router instance with all routes registered:

   ```typescript
   import { Router } from './lib/router'
   import { rateLimit, requireAuth, requireAdmin, requireApproved } from './lib/middleware'
   import { comments, messages, profile, reactions, media, letters, drafts, contact } from './routes'

   const router = new Router()

   // Comments
   router.get('/comments/{itemId}', comments.handle)
   router.post('/comments/{itemId}', requireAuth(), rateLimit('comment'), comments.handle)
   // ... etc for all routes
   ```

1. The handler function becomes:
   - Extract auth context and build `RequestContext` (same as current)
   - Call `ensureProfile` (same as current)
   - Call `router.handle(event, context)`
   - If router returns `null`, return 404 error response
   - Wrap in try/catch (same as current)

1. **Important:** Each route module's `handle` function continues to do its own internal dispatch for sub-routes. The router replaces only the top-level path prefix matching. For example, `/comments/{itemId}` routes to `comments.handle`, which internally handles GET vs POST vs DELETE. This is an incremental refactor — full per-endpoint registration can be done later.

   Alternatively, if route modules export individual handlers (like `comments.listComments`, `comments.createComment`), register those directly. Check what each route module exports to determine the best approach.

1. Remove the old if/else chain entirely.

**Verification:** `npm test` passes. All existing API handler tests still work (they test route handlers, not the dispatcher).

---

### Task 5: Create MessagingRepository

**Goal:** Extract all DynamoDB operations from `messages.ts` into `backend/lambdas/api/src/repositories/messaging-repository.ts` per ADR-3.

**Files to create:**

- `backend/lambdas/api/src/repositories/messaging-repository.ts`

**Files to modify:**

- `backend/lambdas/api/src/repositories/index.ts` — Add barrel export

**Prerequisites:** Phase 1 Task 5 (generic `putItem`)

**Implementation Steps:**

1. Identify the 17 DynamoDB operations in `messages.ts`:
   - `listConversations`: QueryCommand for user's conversations
   - `getMessages`: GetCommand (member check) + QueryCommand (messages)
   - `createConversation`: BatchWrite (member records + meta)
   - `sendMessage`: GetCommand (member check) + PutCommand (message) + UpdateCommands (members)
   - `generateUploadUrl`: PutObjectCommand (S3, keep in route)
   - `markAsRead`: UpdateCommand
   - `deleteConversation`: GetCommand (meta) + GetCommand (fallback member) + QueryCommand (all messages) + BatchWrite (deletes) + S3 deletes
   - `deleteMessage`: GetCommand + DeleteCommand + S3 deletes
   - `createMessageInternal`: GetCommand (sender profile) + PutCommand (message)
   - `updateConversationMembers`: UpdateCommands per participant
   - `fetchUserNames`: BatchGetCommand

1. Create `messaging-repository.ts` extending `BaseRepository`:

   ```typescript
   import { BaseRepository } from './base-repository'

   export class MessagingRepository extends BaseRepository {
     async listConversationsForUser(userId: string, lastEvaluatedKey?: string): Promise<...>
     async getConversationMembership(userId: string, conversationId: string): Promise<...>
     async getMessages(conversationId: string, limit: number, lastEvaluatedKey?: string): Promise<...>
     async createConversationWithMembers(conversationId: string, ...): Promise<void>
     async createMessage(conversationId: string, messageId: string, ...): Promise<void>
     async markConversationRead(userId: string, conversationId: string): Promise<void>
     async deleteConversationData(conversationId: string, participantIds: string[]): Promise<{ s3Keys: string[] }>
     async deleteMessage(conversationId: string, messageId: string): Promise<{ s3Keys: string[] }>
     async updateConversationMembers(conversationId: string, senderId: string, participantIds: string[]): Promise<void>
     async fetchUserNames(userIds: string[]): Promise<string[]>
     async getSenderProfile(senderId: string): Promise<{ displayName: string, photoUrl: string | null }>
     async getConversationMeta(conversationId: string): Promise<...>
   }

   export const messagingRepository = new MessagingRepository()
   ```

1. Each method encapsulates the DynamoDB logic currently inline in `messages.ts`. Keep S3 operations (presigned URLs, attachment deletion) in the route handler or pass S3 keys back for the route to handle.

1. Add to `repositories/index.ts` barrel export.

**Verification:** The new repository compiles. Integration happens in Task 7.

---

### Task 6: Unit test MessagingRepository

**Goal:** Test the repository methods using `aws-sdk-client-mock`, following the `comment-repository` test pattern.

**Files to create:**

- `tests/unit/messaging-repository.test.ts`

**Prerequisites:** Task 5

**Implementation Steps:**

1. Create tests covering:
   - `listConversationsForUser` returns filtered conversation members
   - `getConversationMembership` returns member record or null
   - `createMessage` stores message with correct keys
   - `markConversationRead` sets unreadCount to 0
   - `deleteConversationData` returns S3 keys for cleanup
   - `fetchUserNames` returns names from batch get
   - Pagination key validation in `getMessages`

**Verification:** `npm test -- tests/unit/messaging-repository.test.ts` passes.

---

### Task 7: Refactor `messages.ts` to use MessagingRepository

**Goal:** Rewrite `messages.ts` to use the repository. The route handler should only do: parse request → validate → call repository → format response.

**Files to modify:**

- `backend/lambdas/api/src/routes/messages.ts` — Replace inline DynamoDB calls with repository methods

**Prerequisites:** Tasks 5-6

**Implementation Steps:**

1. Import `messagingRepository` from the repositories.
1. Refactor each handler function:
   - `listConversations`: call `messagingRepository.listConversationsForUser()`
   - `getMessages`: call `messagingRepository.getConversationMembership()` then `messagingRepository.getMessages()`. Keep S3 URL signing in the route handler (it's response formatting).
   - `createConversation`: validate input, call `messagingRepository.createConversationWithMembers()` and optionally `messagingRepository.createMessage()`
   - `sendMessage`: validate, call repository methods. **Fix N+1:** pass sender profile from `getConversationMembership` call (which already has the user context) instead of re-fetching in `createMessageInternal`.
   - `markAsRead`: call `messagingRepository.markConversationRead()`
   - `deleteConversation`: call `messagingRepository.deleteConversationData()`, then delete returned S3 keys
   - `deleteMessage`: call `messagingRepository.deleteMessage()`, then delete returned S3 keys

1. Remove all direct DynamoDB imports (`GetCommand`, `PutCommand`, `QueryCommand`, etc.) from `messages.ts` except S3-related ones.

1. Remove the `fetchUserNames` and `createMessageInternal` helper functions (moved to repository).

1. **Performance fix — `deleteConversation` pagination:** In the repository's message scan, add `Limit: 25` to the QueryCommand to process deletions in smaller batches, reducing peak memory usage.

**Verification:** `npm test` passes. All existing message handler tests still work.

---

### Task 8: Consolidate frontend comment-service to apiClient

**Goal:** Rewrite `comment-service.ts` to use `apiClient` instead of raw `fetch` + `getAuthHeader()`.

**Files to modify:**

- `frontend/lib/services/comment-service.ts`

**Prerequisites:** None (independent of backend tasks)

**Implementation Steps:**

1. Replace `getApiBaseUrl()` + `getAuthHeader()` + `fetch()` pattern with `apiClient.get()` / `apiClient.post()` / `apiClient.put()` / `apiClient.delete()`.
1. Remove imports: `authTokens` from auth-store, `getApiBaseUrl` from utils, `get` from svelte/store.
1. Add import: `apiClient` from `$lib/auth/api-client`.
1. Keep the `encodeItemId()` helper (comment-specific).
1. Keep the `{ success, data, error }` return wrapper — only change the HTTP layer.
1. Error handling: `apiClient` throws on non-2xx responses. Wrap each call in try/catch and return `{ success: false, error: ... }` as before.

**Verification:** `npm run lint` passes.

---

### Task 9: Consolidate remaining frontend services to apiClient

**Goal:** Apply the same pattern from Task 8 to the remaining 9 services: content, draft, gallery, letters, media, message, profile, reaction, search.

**Files to modify:**

- `frontend/lib/services/content-service.ts`
- `frontend/lib/services/draft-service.ts`
- `frontend/lib/services/gallery-service.ts`
- `frontend/lib/services/letters-service.ts`
- `frontend/lib/services/media-service.ts`
- `frontend/lib/services/message-service.ts`
- `frontend/lib/services/profile-service.ts`
- `frontend/lib/services/reaction-service.ts`
- `frontend/lib/services/search-service.ts`

**Prerequisites:** Task 8 (establish the pattern)

**Implementation Steps:**

1. For each service:
   - Replace raw `fetch` + manual auth with `apiClient` methods
   - Remove `getAuthHeader()`, `getApiBaseUrl()`, `authTokens` store imports
   - Add `apiClient` import
   - Preserve function signatures and return types
   - Keep any service-specific logic (caching in media-service, query string building, etc.)

1. **Special cases:**
   - `search-service.ts`: Uses RAGStack GraphQL endpoint with its own API key, not the main API. **Leave as-is** — this talks to a different service.
   - `content-service.ts`: Uses `refreshSession` from `client.ts`. Replace `fetch` + manual auth, but keep `refreshSession` import for token refresh on 401.
   - `media-service.ts`: Has its own caching layer. Replace the HTTP calls but preserve the cache logic.

1. After all services are updated, grep for remaining `getAuthHeader()` usage. It should only exist in files that are explicitly out of scope (letter-upload, ragstack-upload).

**Verification:** `npm run lint` passes. Grep confirms `getAuthHeader` is gone from consolidated services.

---

### Task 10: Rename `client.ts` → `auth-utils.ts`

**Goal:** Per ADR decision #5, rename `frontend/lib/auth/client.ts` to `auth-utils.ts` since it only contains auth utility functions after consolidation.

**Files to modify:**

- `frontend/lib/auth/client.ts` → rename to `frontend/lib/auth/auth-utils.ts`
- `frontend/lib/utils/s3Client.ts` — Update import path
- `frontend/lib/services/markdown.ts` — Update import path
- `frontend/lib/services/content-service.ts` — Update import path
- `frontend/routes/admin/+page.svelte` — Update import path

**Prerequisites:** Tasks 8-9 (consolidation done, so we know the final import list)

**Implementation Steps:**

1. Rename the file: `mv frontend/lib/auth/client.ts frontend/lib/auth/auth-utils.ts`
1. Update all imports from `$lib/auth/client` to `$lib/auth/auth-utils`:
   - `frontend/lib/utils/s3Client.ts`: `import { refreshSession } from '$lib/auth/auth-utils'`
   - `frontend/lib/services/markdown.ts`: `import { refreshSession } from '$lib/auth/auth-utils'`
   - `frontend/lib/services/content-service.ts`: `import { refreshSession } from '$lib/auth/auth-utils'`
   - `frontend/routes/admin/+page.svelte`: `import { authenticatedFetch } from '$lib/auth/auth-utils'`
1. Grep for any remaining `auth/client` imports to catch anything missed.

**Verification:** `npm run lint` passes. No imports reference the old path.

---

### Task 11: Update documentation

**Goal:** Update CLAUDE.md, FEATURES_ROADMAP.md to reflect the changes.

**Files to modify:**

- `CLAUDE.md` — Add `messaging-repository` to repositories description
- `docs/FEATURES_ROADMAP.md` — Remove completed tech debt items, keep family tree

**Prerequisites:** Tasks 1-10

**Implementation Steps:**

1. In `CLAUDE.md`, under the Backend section's repository pattern description, add mention of `messaging-repository.ts`.
1. In `CLAUDE.md`, add the Router class under "Key patterns".
1. In `CLAUDE.md`, update the frontend services description to mention `apiClient` pattern.
1. In `docs/FEATURES_ROADMAP.md`:
   - Remove all "Deferred Technical Debt" items that are now complete:
     - TypeScript migration of JS Lambdas
     - Type safety cleanup
     - MessagingRepository extraction
     - Router class
     - Frontend service consolidation
     - ensureProfile optimization
   - Keep the family tree visualization as future work.

**Verification:** Documentation is accurate and reflects the current state.

---

### Task 12: Run full test suite and lint

**Goal:** Final verification of all changes.

**Prerequisites:** Tasks 1-11 complete

**Implementation Steps:**

1. Run `cd frontend && npm test` — all tests pass.
1. Run `cd frontend && npm run lint` — zero warnings.
1. If any failures, fix them before marking Phase 2 complete.
1. Verify total line counts:
   - `messages.ts` should be ~200 LOC (down from ~765)
   - `index.ts` should have declarative route registration (no if/else chain)
   - No `getAuthHeader()` in consolidated frontend services

**Verification:** Clean test and lint output. Code size reduction confirmed.

## Rollback

All changes are in a single PR. Revert the PR to return to the previous state. No database migrations involved. The Router class is backward-compatible — if it causes issues in production, the old if/else dispatch can be restored by reverting `index.ts` alone.
