# Feature: Technical Debt Sweep

## Overview

A comprehensive single-PR remediation of all remaining deferred technical debt from the 2026-03-23 audit. This covers six themes: TypeScript migration of the last two JavaScript Lambdas, type safety cleanup across entity types and unsafe casts, extraction of a `MessagingRepository` from the 765-line messages route monolith, replacement of the if/else route dispatcher with an Express-like type-safe router class, consolidation of 10 frontend service files onto the shared `apiClient`, and targeted performance fixes in the request path.

The goal is to close every item in the "Deferred Technical Debt" section of `docs/FEATURES_ROADMAP.md` in one shot, leaving only the family tree visualization as future work.

## Decisions

1. **Type-safe router: Express-like class** — `router.get('/letters', authMiddleware, rateLimitMiddleware, handler)` pattern with chainable middleware. Replaces the if/else string matching in `index.ts`.
2. **Messages repository: single `MessagingRepository`** — not split into MessageRepository + ConversationRepository. Conversations and messages are tightly coupled (create, delete operations span both), so one repository avoids cross-repo coordination.
3. **Shared types: `backend/lambdas/shared/types.ts`** — activity-aggregator and notification-processor import from a shared package rather than reaching into `api/src/types/`. Clean cross-Lambda boundary for SAM bundling.
4. **Frontend consolidation: full sweep of 10 services** — all services except `letter-upload-service.ts` (XHR with progress) and `ragstack-upload-service.ts` (RAGStack GraphQL with API key auth) are migrated to `apiClient`.
5. **Rename `client.ts` → `auth-utils.ts`** — after consolidation, client.ts only contains auth utility functions (getUserInfo, isUserApproved, etc.), not HTTP client logic. Rename reflects actual purpose.
6. **`ensureProfile` simplification, not caching** — reduce work per request by only doing the GSI backfill check once per cold start (not every request), rather than adding an in-memory cache with TTL/invalidation complexity.
7. **`escapeHtml` dedup** — move to `backend/lambdas/shared/` alongside shared types, imported by both API validation and notification-processor.
8. **Upload services left as-is** — `letter-upload-service.ts` uses XHR for progress callbacks, `ragstack-upload-service.ts` talks to a separate GraphQL endpoint with its own API key auth. Forcing these through `apiClient` would add complexity.

## Scope: In

- Migrate `backend/lambdas/activity-aggregator/index.js` → TypeScript
- Migrate `backend/lambdas/notification-processor/index.js` → TypeScript
- Migrate both test files to TypeScript
- Create `backend/lambdas/shared/types.ts` with shared entity/stream event types
- Move `escapeHtml` to `backend/lambdas/shared/html-utils.ts`, import from both API and notification-processor
- Fix `Reaction` type: add `reactionType` field, remove/alias `emoji`
- Fix `UserProfile` type: rename `photoUrl`/`photoKey` to `profilePhotoUrl`/`profilePhotoKey` to match route code
- Remove `as unknown as` cast in `comment-repository.ts:84` (fix BaseRepository generic typing)
- Remove `as unknown as` cast in `drafts.ts:302` (add type guard or fix parseRequestBody)
- Create `MessagingRepository` extending `BaseRepository` in `backend/lambdas/api/src/repositories/messaging-repository.ts`
- Refactor `messages.ts` route handler to use `MessagingRepository` (request parsing + response formatting only)
- Create Express-like `Router` class in `backend/lambdas/api/src/lib/router.ts` with middleware support
- Rewrite `index.ts` to use the new router with declarative route definitions
- Extract middleware functions: auth, rate-limit, validation
- Consolidate 10 frontend services to use `apiClient` (comment, content, draft, gallery, letters, media, message, profile, reaction, search)
- Rename `frontend/lib/auth/client.ts` → `frontend/lib/auth/auth-utils.ts`, update all imports
- Simplify `ensureProfile` — GSI backfill check once per cold start via module-level flag
- Add `Limit: 25` to `deleteConversation` DynamoDB message query
- Fix `createMessageInternal` N+1 — pass sender profile from caller instead of re-fetching
- Document `DYNAMODB_TABLE` env var fallback in `.env.example`
- Update CLAUDE.md repositories description (now includes messaging-repository)
- Update FRONTEND.md service examples to show `apiClient` pattern
- Update `docs/FEATURES_ROADMAP.md` — remove completed items, keep only family tree

## Scope: Out

- Family tree visualization (separate future feature)
- `letter-upload-service.ts` consolidation (XHR with progress, fundamentally different)
- `ragstack-upload-service.ts` consolidation (RAGStack GraphQL with API key auth)
- Full `ensureProfile` caching with TTL/invalidation
- New unit tests for previously untestable paths (module-load-time env vars)

## Open Questions

None — all scope decisions resolved.

## Relevant Codebase Context

### Backend — Lambda Structure

- `backend/lambdas/activity-aggregator/index.js` (70 LOC) — DynamoDB stream processor, uses `UpdateCommand`, has own `package.json` with SDK `^3.1012.0`
- `backend/lambdas/notification-processor/index.js` (255 LOC) — DynamoDB stream processor + SES email, contains duplicate `escapeHtml`, has own `package.json` with SDK `^3.1012.0`
- `backend/lambdas/api/src/` — main API Lambda, fully TypeScript
- Both JS Lambdas have comprehensive test files (`index.test.js`) using Vitest + aws-sdk-client-mock

### Backend — Repository Pattern

- `backend/lambdas/api/src/repositories/base-repository.ts` — abstract base with `query()`, `putItem()`, `getItem()`, `updateItem()`, `deleteItem()`
- `backend/lambdas/api/src/repositories/comment-repository.ts` (140 LOC) — canonical example: `getById()`, `listByItemId()`, `create()`, `updateContent()`, `delete()`
- `backend/lambdas/api/src/repositories/index.ts` — barrel export
- Messages route has ~17 distinct DynamoDB operations to extract

### Backend — Current Route Dispatch

- `backend/lambdas/api/src/index.ts` — if/else chain matching `method + resource`, calls route handlers
- Each route module exports `handle(event, context)` with its own internal if/else dispatch
- Rate limiting is copy-pasted per route check (6x in messages.ts alone)

### Backend — Type Issues

- `types/index.ts` `Reaction` interface uses `emoji: string` but `reactions.ts` uses `reactionType`
- `types/index.ts` `UserProfile` uses `photoUrl`/`photoKey` but all route code uses `profilePhotoUrl`/`profilePhotoKey`
- `comment-repository.ts:84` casts `Comment` to `Record<string, unknown>` because `putItem()` isn't generic
- `drafts.ts:302` casts parsed body to `PublishData` with double cast

### Backend — Performance

- `backend/lambdas/api/src/lib/user.ts` — `ensureProfile()` does `GetCommand` + potential `PutCommand`/`UpdateCommand` on every authenticated request
- `messages.ts:661-724` — `createMessageInternal` fetches sender profile via `GetCommand` on every message send
- `messages.ts:535-566` — `deleteConversation` scans all messages with no `Limit` parameter

### Frontend — Service Pattern

- 4 services use `getAuthHeader()` pattern: comment, message, profile, reaction
- 4 services use direct fetch with inline auth: content, draft, gallery, letters
- 2 services use special mechanisms: letter-upload (XHR), ragstack-upload (GraphQL)
- 1 service uses `apiClient` already: search-service (partially)
- 1 service has its own caching layer: media-service
- `frontend/lib/auth/api-client.ts` — class-based `ApiClient` with timeout, auth, error handling, exported as `apiClient` singleton
- `frontend/lib/auth/client.ts` — legacy auth utilities (`getUserInfo`, `isUserApproved`, `getStoredTokens`, `refreshSession`, re-exported `decodeJWTPayload`)

### Testing

- Backend tests use `aws-sdk-client-mock` for DynamoDB/S3/SES
- Frontend services are not unit-tested (tested indirectly through component tests)
- Test command: `npm test` (Vitest, 224 tests currently passing)
- Lint: `npm run lint` (ESLint + svelte-check)

### Build & Deploy

- SAM template at `backend/template.yaml` bundles each Lambda independently
- Each Lambda with its own `package.json` gets its own `node_modules` in the SAM build
- Shared code between Lambdas requires either: shared directory with relative imports, or a workspace package
- CI: GitHub Actions on push/PR to main — lint, type-check, test

## Technical Constraints

- **SAM bundling**: Each Lambda is bundled independently. A `backend/lambdas/shared/` directory with relative imports works if SAM's `CodeUri` is set to include the shared path, or if we use `esbuild` bundling (already configured for the API Lambda). Need to verify that activity-aggregator and notification-processor SAM configs can resolve `../shared/` imports.
- **Module-load-time env vars**: Several env vars (`SES_FROM_EMAIL`, `ADMIN_EMAIL`, `RAGSTACK_BUCKET`) are captured at import time as module-level constants. The router/middleware refactor should preserve this pattern.
- **Frontend import paths**: Renaming `client.ts` → `auth-utils.ts` requires updating every `import from './client'` across the frontend. Grep shows imports in `auth-service.ts`, `google-oauth.ts`, and potentially Svelte components.
- **Svelte 5**: Frontend uses Svelte 5.54.0 — ensure any store access patterns in services are compatible.
- **Pre-commit hooks**: Husky + lint-staged + commitlint enforced. All commits must pass ESLint and use conventional commit format.
