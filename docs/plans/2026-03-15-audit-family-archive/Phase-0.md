# Phase 0 — Foundation

**Applies to all subsequent phases.**

This document defines the architecture decisions, conventions, testing strategy, and shared patterns that every phase implementer must follow.

---

## Architecture Decisions

### ADR-1: Preserve Single-Table DynamoDB Design

**Decision:** All DynamoDB changes must maintain the existing single-table design with key prefixes (`USER#`, `COMMENT#`, `CONV#`, `MSG#`, `REACTION#`, `LETTER#`, `DRAFT#`, `RATE#`, `VERSION#`).

**Rationale:** The codebase consistently uses this pattern via `backend/lambdas/api/src/lib/keys.ts`. Migrating to multi-table would be a rewrite, not a remediation.

### ADR-2: Repository Pattern for DynamoDB Access

**Decision:** All new DynamoDB access code must use the repository pattern. Existing inline DynamoDB operations in route handlers should be extracted to repository classes when touched.

**Rationale:** The codebase already demonstrates this pattern with `comment-repository.ts` and `base-repository.ts`. Route handlers that do inline DynamoDB (messages, letters, drafts, reactions, profile) are harder to test and violate separation of concerns.

**Pattern to follow:** See `backend/lambdas/api/src/repositories/comment-repository.ts` for the canonical example. Repositories extend `BaseRepository` from `base-repository.ts`.

### ADR-3: TypeScript Is the Canonical Source

**Decision:** The TypeScript files under `backend/lambdas/api/src/` are the canonical source. The legacy JavaScript files under `backend/lambdas/api/lib/` and `backend/lambdas/api/repositories/` are dead code to be removed.

**Rationale:** The TS and JS files are parallel implementations. The SAM build references the TS source. The JS files are a maintenance hazard.

### ADR-4: No New Dependencies Without Explicit Justification

**Decision:** Phases should not add npm dependencies unless the task explicitly calls for it. Use existing utilities (`toError()`, `validatePaginationKey()`, `withRetry()`, etc.) before writing new code.

**Rationale:** The codebase has well-crafted utilities that are underused. The audit found multiple cases where existing utilities were ignored (e.g., `validatePaginationKey()` exists but is not used by messages or letters routes).

### ADR-5: Fail-Closed CORS Pattern

**Decision:** All route handlers must pass `requestOrigin` from `RequestContext` to every `successResponse()` and `errorResponse()` call. The CORS helper in `responses.ts` is fail-closed by design — missing origin causes restrictive headers.

**Rationale:** Critical finding #1. Four route handlers currently omit `requestOrigin`, causing incorrect CORS in production.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | SvelteKit 2.x, Svelte 4, TailwindCSS, DaisyUI | No framework migration in scope |
| Backend API | AWS Lambda (Node.js), TypeScript, SAM | Single consolidated Lambda |
| Database | DynamoDB (single-table) | Key builders in `keys.ts` |
| Storage | S3 (presigned URLs) | Via `s3-utils.ts` |
| Auth | Cognito | Claims extracted in `index.ts` |
| AI | Gemini (letter-processor) | Separate Lambda |
| Testing | Vitest (unit), Playwright (E2E), Artillery (load) | `aws-sdk-client-mock` for AWS mocks |
| CI | GitHub Actions | Lint (zero warnings) + Vitest |

---

## Testing Strategy

### Unit Tests

- **Location:** `tests/unit/` (centralized, not colocated)
- **Framework:** Vitest with `globals: true` and `environment: 'node'`
- **Config:** `vitest.config.ts` at repo root
- **Run command:** `npm test` (from repo root) or `npm test -- tests/unit/specific-file.test.js`
- **AWS Mocking:** Use `aws-sdk-client-mock` (already in devDependencies). See `tests/unit/letter-processor.test.js` for examples of mocking S3, DynamoDB, etc.
- **Pattern:** Each test file corresponds to one source module. Name as `{module-name}.test.ts` (or `.test.js` for existing JS tests).

### Mocking Conventions

```typescript
// AWS SDK mocking pattern (from existing tests)
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  ddbMock.reset()
})
```

- Mock AWS clients at the SDK level, not at the repository level
- Use `ddbMock.on(GetCommand).resolves({...})` for happy paths
- Use `ddbMock.on(GetCommand).rejects(new Error('...'))` for error paths
- Do NOT use real AWS credentials or live cloud resources in unit tests

### Integration Tests

- **Location:** `tests/integration/`
- **Note:** Currently excluded from Vitest config (line 18 of `vitest.config.ts`). Do not modify this exclusion without explicit instruction.

### Test Coverage Expectations

- New route handler tests: cover happy path, auth failure, validation error, and at least one error path per handler function
- New utility tests: cover all branches, edge cases, and error conditions
- Existing test patterns to follow: `tests/unit/errors.test.js` (behavioral tests), `tests/unit/retry.test.js` (timer-based tests)

---

## Commit Conventions

Use conventional commits format:

```
type(scope): brief description

- Detail 1
- Detail 2
```

**Types:** `fix`, `feat`, `refactor`, `test`, `docs`, `chore`, `perf`

**Scopes:** `api`, `frontend`, `gallery`, `messages`, `comments`, `letters`, `media`, `profile`, `reactions`, `drafts`, `ci`, `deps`, `docs`

**Examples:**
- `fix(api): pass requestOrigin to CORS headers in messages route`
- `chore(api): remove legacy JavaScript files`
- `test(api): add unit tests for comments route handler`
- `docs(data-model): fix entity schema contradictions`

---

## Shared Patterns and Conventions

### Error Handling in Route Handlers

The correct pattern (from `backend/lambdas/api/src/lib/errors.ts`):

```typescript
import { toError } from '../lib/errors'

try {
  const body = JSON.parse(event.body || '{}')
  // ... handle request
} catch (err) {
  const error = toError(err)
  log.error('handler_name_failed', { error: error.message })
  return errorResponse(500, 'Internal server error', requestOrigin)
}
```

- Always use `toError(err)` to safely convert unknown caught values
- Always return `errorResponse()` with `requestOrigin` for CORS
- Wrap `JSON.parse(event.body)` in its own try/catch to return 400 (not 500)

### Response Helpers

All responses must use helpers from `backend/lambdas/api/src/lib/responses.ts`:

```typescript
import { successResponse, errorResponse } from '../lib/responses'

// Always pass requestOrigin as the last argument
return successResponse(data, 200, requestOrigin)
return errorResponse(400, 'Validation error', requestOrigin)
```

### RequestContext Threading

The `RequestContext` is created in `backend/lambdas/api/src/index.ts` and passed to all route handlers. It contains:

```typescript
interface RequestContext {
  requesterId: string
  requesterEmail: string
  isAdmin: boolean
  isApprovedUser: boolean
  correlationId: string
  requestOrigin?: string  // <-- MUST be destructured and used
}
```

### File Organization

- Route handlers: `backend/lambdas/api/src/routes/{resource}.ts`
- Repositories: `backend/lambdas/api/src/repositories/{resource}-repository.ts`
- Shared utilities: `backend/lambdas/api/src/lib/`
- Types: `backend/lambdas/api/src/types/`
- Tests: `tests/unit/{module-name}.test.{ts,js}`

---

## Deployment Strategy

This is a remediation plan. No deployment changes are in scope. All changes must be verifiable locally via:

1. `npm run lint` (zero warnings)
2. `npm test` (all Vitest tests pass)
3. `npm run build` (frontend builds successfully)

No `npm run deploy` or SAM deploy should be run unless explicitly requested by the user.
