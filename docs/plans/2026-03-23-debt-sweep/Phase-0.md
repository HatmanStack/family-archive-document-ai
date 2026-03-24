# Phase 0 - Foundation

## Architecture Decisions

### ADR-1: Shared code between Lambdas via `backend/lambdas/shared/`

The activity-aggregator and notification-processor Lambdas need shared types and utilities (e.g., `escapeHtml`). Rather than a workspace package, we use a `backend/lambdas/shared/` directory with relative imports. The SAM template for these two Lambdas must be updated to use esbuild bundling (like the API Lambda already does) so that `../shared/` imports are resolved and bundled at build time.

**Rationale:** esbuild bundling is already proven in the API Lambda config. Adding `Metadata.BuildMethod: esbuild` to the two JS Lambdas (which are being migrated to TS anyway) is the simplest path. No workspace config, no symlinks, no duplicate code.

**SAM template change:** Add `Metadata` block with `BuildMethod: esbuild` and `BuildProperties` to both `ActivityAggregatorFunction` and `NotificationProcessorFunction`. Set `EntryPoints` to `index.ts` and `External` to exclude `@aws-sdk/*` (provided by Lambda runtime). Change `Handler` from `index.handler` to `index.handler` (stays the same since esbuild preserves exports).

### ADR-2: Router class pattern

The new `Router` class in `backend/lambdas/api/src/lib/router.ts` implements an Express-like pattern:

```typescript
router.get('/letters', handler)
router.post('/messages/conversations', rateLimitMiddleware('message'), handler)
```

Key design points:

- Routes are registered with `router.get()`, `router.post()`, `router.put()`, `router.delete()`
- Path patterns support `{param}` placeholders (matching API Gateway's format)
- Middleware functions receive `(event, context)` and either return an `APIGatewayProxyResult` (to short-circuit) or `undefined`/`null` (to continue)
- The router's `handle(event)` method matches the incoming request and runs middleware chain then handler
- No external dependencies -- pure TypeScript

### ADR-3: MessagingRepository scope

A single `MessagingRepository` class extending `BaseRepository` encapsulates all 17 DynamoDB operations from `messages.ts`. This includes conversation CRUD, message CRUD, participant management, and the batch operations. The route handler (`messages.ts`) is reduced to request parsing, validation, and response formatting.

### ADR-4: `putItem` generic typing fix

The `BaseRepository.putItem` method currently accepts `Record<string, unknown>`, forcing callers to cast typed entities. The fix is to make `putItem` generic: `putItem<T extends Record<string, unknown>>(item: T)`. This removes the need for `as unknown as Record<string, unknown>` casts in `comment-repository.ts` and anywhere else.

### ADR-5: Frontend `apiClient` consolidation approach

Each service file is rewritten to use `apiClient.get()`, `apiClient.post()`, etc. instead of raw `fetch()` with manual auth headers. The `getAuthHeader()` helper and `getApiBaseUrl()` calls are removed from each service. The `encodeItemId()` utility in `comment-service.ts` is preserved as a local helper since it is comment-specific.

Services that return wrapped `{ success, data, error }` responses keep that pattern for now -- the refactor is about the HTTP layer, not the response shape.

### ADR-6: `ensureProfile` cold-start optimization

Instead of caching profiles, we add a module-level `Set<string>` that tracks user IDs whose GSI1 attributes have been verified during this Lambda instance's lifetime. On subsequent requests for the same user, we skip the `backfillGSI1IfMissing` check entirely. The profile fetch (`GetCommand`) still happens on every request (needed for correctness), but the conditional update is skipped after first verification.

## Design Conventions

### Commit message format

All commits use conventional commits:

```text
type(scope): description

- detail 1
- detail 2
```

Types: `feat`, `refactor`, `fix`, `test`, `docs`, `chore`
Scopes: `api`, `activity-aggregator`, `notification-processor`, `shared`, `frontend`, `sam`, `docs`

### File naming

- Backend TypeScript files: `kebab-case.ts`
- Test files: co-located or in `tests/unit/` matching `*.test.ts`
- Shared code: `backend/lambdas/shared/types.ts`, `backend/lambdas/shared/html-utils.ts`

### Import conventions

- Shared types: `import type { DynamoDBStreamEvent } from '../shared/types'` (relative from each Lambda)
- Shared utils: `import { escapeHtml } from '../shared/html-utils'`
- Within API Lambda: existing patterns preserved (relative imports within `src/`)

### Error handling

- Typed errors using the existing `errors.ts` classes (`ValidationError`, `NotFoundError`, etc.)
- `toError()` for safe error conversion in catch blocks
- Structured logging via `log` from `logger.ts`

## Testing Strategy

### Backend unit tests

- All tests run via `npm test` from `frontend/` (Vitest configured at project root)
- AWS SDK mocking via `aws-sdk-client-mock`
- Environment variables set at top of test files before module imports
- New test files follow existing naming: `tests/unit/<scope>-handler.test.ts`

### Test files for background Lambdas

No unit test files currently exist for `activity-aggregator` or `notification-processor`. New test files will be created in Phase 1 Task 10 following the existing `tests/unit/<scope>-handler.test.ts` naming pattern. Tests should use `aws-sdk-client-mock` for DynamoDB/SES mocking and build mock DynamoDB stream event records using the `DynamoDBStreamEvent` type from `@types/aws-lambda`.

### Mocking strategy for Router tests

The Router class is pure logic (no AWS SDK calls), so unit tests are straightforward: create a router, register routes, pass mock API Gateway events, assert correct handler is called. No SDK mocking needed.

### MessagingRepository tests

Follow the `comment-repository` test pattern. Mock `DynamoDBDocumentClient` with `aws-sdk-client-mock`. Test each repository method independently. The existing `tests/unit/messages-handler.test.ts` tests the route handler -- new repository tests should be in a separate file like `tests/unit/messaging-repository.test.ts`.

### Frontend

Frontend services are not unit-tested (tested indirectly through component and E2E tests). The consolidation changes the HTTP layer but preserves function signatures and return types, so existing component tests should continue to pass.

## Deployment Strategy

- All changes deploy via `npm run deploy` (SAM)
- The SAM template changes (adding esbuild to two Lambdas) require a deploy to take effect
- No database migrations needed -- only code changes
- Rollback: revert the PR (all changes are in one PR)

## Shared Patterns Reference

### BaseRepository methods

| Method | Signature | Notes |
|--------|-----------|-------|
| `getItem<T>` | `(key: DynamoDBKey) => Promise<T or null>` | Single item fetch |
| `putItem<T>` | `(item: T, options?) => Promise<void>` | After generic fix |
| `updateItem<T>` | `(key, expression, values, options?) => Promise<T>` | Returns updated item |
| `deleteItem` | `(key: DynamoDBKey) => Promise<void>` | Hard delete |
| `query<T>` | `(params: QueryParams) => Promise<PaginatedResult<T>>` | Full query |
| `queryByPKAndSKPrefix<T>` | `(pk, skPrefix, options?) => Promise<PaginatedResult<T>>` | Convenience |
| `batchGetItems<T>` | `(keys: DynamoDBKey[]) => Promise<T[]>` | Batch fetch |

### Router middleware signature

```typescript
type Middleware = (
  event: APIGatewayProxyEvent,
  context: RequestContext
) => Promise<APIGatewayProxyResult | null | undefined>
```

Returning `APIGatewayProxyResult` short-circuits. Returning `null`/`undefined` continues to next middleware or handler.

### apiClient methods

| Method | Signature |
|--------|-----------|
| `get<T>` | `(endpoint, options?) => Promise<T>` |
| `post<T>` | `(endpoint, body?, options?) => Promise<T>` |
| `put<T>` | `(endpoint, body?, options?) => Promise<T>` |
| `delete<T>` | `(endpoint, options?) => Promise<T>` |
| `patch<T>` | `(endpoint, body?, options?) => Promise<T>` |

The `endpoint` is relative to the versioned base URL (e.g., `/comments/abc123`). Auth is handled automatically.
