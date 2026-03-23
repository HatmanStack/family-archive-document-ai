# Phase 0 -- Foundation

This phase documents architecture decisions, conventions, and strategies that apply to all
subsequent phases. No code changes are made in Phase 0.

## Architecture Decision Records

### ADR-1: Error handling strategy -- return over throw

**Context:** The codebase has two patterns: some routes `throw error` to the global catch in
`index.ts`, while others `return errorResponse(...)`. The `throw` pattern loses handler context
and produces inconsistent response shapes (health-audit finding #16, eval Defensiveness concern).

**Decision:** All route handlers MUST return `errorResponse()` directly. The global catch in
`index.ts` is a safety net for truly unexpected errors only.

**Rationale:** Returning error responses gives handlers full control over status codes and messages,
keeps error flows explicit, and makes testing straightforward (assert on return value).

### ADR-2: Pagination limits -- always cap

**Context:** Some routes cap `limit` parameters (comments uses `Math.min(limit, 100)`) while
others pass user-supplied limits directly to DynamoDB (letters, messages). Unbounded queries
risk Lambda timeout (health-audit findings #1, #10; eval Performance concern).

**Decision:** All `limit` parameters parsed from query strings MUST be capped with
`Math.min(parsedLimit, MAX_PAGE_SIZE)` where `MAX_PAGE_SIZE = 100` is defined in
`lib/constants.ts`.

### ADR-3: Pagination key validation -- repository layer must validate

**Context:** The `validatePaginationKey()` function in `lib/validation.ts` is used by route
handlers, but `BaseRepository.query()` parses pagination keys with raw `JSON.parse(Buffer.from(...))`
bypassing validation entirely (health-audit finding #4, eval Defensiveness concern).

**Decision:** `BaseRepository.query()` MUST use `validatePaginationKey()` for all pagination
key parsing. The `expectedPKPrefix` parameter should be derived from the query's key condition.

### ADR-4: Deduplication strategy -- shared utility over copy-paste

**Context:** JWT decode is duplicated 3 times in frontend auth; `escapeHtml` is duplicated
between API validation and notification-processor (health-audit findings #5, #9).

**Decision:** Deduplicate by extracting into a single shared module. For cross-Lambda utilities
like `escapeHtml`, the canonical location is `backend/lambdas/api/src/lib/validation.ts`. The
notification-processor will import from the API lib when migrated to TypeScript. Until then,
keep the TODO comment and ensure both copies stay in sync.

For frontend JWT decode, extract to `frontend/lib/auth/jwt-decode.ts` as a single typed function.

### ADR-5: Correlation ID storage -- keep module-level for now

**Context:** `logger.ts` uses module-level `let currentCorrelationId` which could theoretically
leak between concurrent invocations (health-audit finding #3).

**Decision:** Keep module-level storage. AWS Lambda processes one request at a time per execution
environment (even with provisioned concurrency, each environment is single-threaded). The risk
only materializes if the architecture moves to a long-running server. Add a code comment
documenting this assumption. AsyncLocalStorage adds complexity with no current benefit.

**Revisit trigger:** If the API is ever deployed as a container/Fargate service instead of Lambda.

## Testing Strategy

### Test framework and mocking

- **Framework:** Vitest (already configured in `vitest.config.ts`)
- **AWS mocking:** `aws-sdk-client-mock` for DynamoDB, S3, SES
- **Test location:** `tests/unit/` directory, following `*-handler.test.ts` naming convention
- **Test pattern:** Import the route handler's `handle()` function, pass mock `APIGatewayProxyEvent`
  and `RequestContext`, assert on the returned `APIGatewayProxyResult`

### Test patterns to follow

Reference `tests/unit/comments-handler.test.ts` as the canonical example:

1. Create `createMockEvent()` and `createMockContext()` helper functions
1. Mock `rate-limit` module via `vi.mock()` before importing the handler
1. Mock DynamoDB client via `mockClient(DynamoDBDocumentClient)`
1. Reset mocks in `beforeEach`
1. Test through the public `handle()` function -- never test private functions directly
1. Assert on `statusCode` and parsed `JSON.parse(result.body)` of the response

### Running tests

```bash
# All unit tests
npm test

# Single file
npm test -- tests/unit/<filename>.test.ts

# With coverage
npm test -- --coverage
```

## Commit Message Format

All commits use conventional commits:

```text
type(scope): brief description

- Detail 1
- Detail 2
```

Types: `fix`, `refactor`, `test`, `docs`, `chore`, `perf`

Scopes: `auth`, `messages`, `letters`, `comments`, `media`, `drafts`, `contact`,
`reactions`, `profile`, `api-client`, `logger`, `validation`, `ci`, `docs`

## Shared Patterns and Conventions

### File organization

- Backend routes: `backend/lambdas/api/src/routes/<entity>.ts`
- Backend lib: `backend/lambdas/api/src/lib/<utility>.ts`
- Backend repos: `backend/lambdas/api/src/repositories/<entity>-repository.ts`
- Frontend services: `frontend/lib/services/<entity>-service.ts`
- Frontend auth: `frontend/lib/auth/<module>.ts`
- Tests: `tests/unit/<entity>-handler.test.ts`

### Import conventions

- Backend uses relative imports within `api/src/`
- Tests import from relative paths like `../../backend/lambdas/api/src/routes/comments`
- Rate-limit mock must be registered via `vi.mock()` BEFORE importing the handler under test
