# Phase 5 -- [FORTIFIER] Type Rigor and CORS Hardening

## Phase Goal

Add type safety guardrails to the frontend API client, add request timeouts to frontend
services, and tighten types where `any` is used on security-critical boundaries. This phase
also adds an `AbortController` timeout to the API client to prevent indefinite hangs.

**Success criteria:**

- `ApiClient.request()` has a configurable timeout via `AbortController`
- `T = any` defaults in `ApiClient` methods are replaced with `T = unknown`
- `body?: any` in `ApiRequestOptions` is typed as `Record<string, unknown>`
- `decodeJWTPayload` (from Phase 1) returns `Record<string, unknown> | null` (not `any`)

**Estimated tokens:** ~20,000

## Prerequisites

- Phase 1 complete (JWT decode deduplicated)
- Phase 4 complete (tests exist to catch regressions)
- Tests pass: `npm test`

## Tasks

### Task 1: Add request timeout to ApiClient

**Goal:** Add an `AbortController` with a configurable timeout to the `ApiClient.request()`
method. This closes health-audit finding #6 (quick win #5) and addresses the eval Pragmatism
concern about indefinite hangs.

**Files to modify:**

- `frontend/lib/auth/api-client.ts` -- Add timeout support

**Prerequisites:** None

**Implementation Steps:**

1. Read `frontend/lib/auth/api-client.ts` fully (already read during planning).
1. Add a `timeout` option to `ApiRequestOptions`:

   ```typescript
   export interface ApiRequestOptions {
     method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
     body?: Record<string, unknown>
     headers?: Record<string, string>
     requireAuth?: boolean
     timeout?: number  // milliseconds, defaults to DEFAULT_TIMEOUT
   }
   ```

1. Add a default timeout constant at the top of the file:

   ```typescript
   const DEFAULT_TIMEOUT = 30_000 // 30 seconds
   ```

1. In the `request()` method, create an `AbortController` and pass its signal to `fetch`:

   ```typescript
   const controller = new AbortController()
   const timeoutId = setTimeout(
     () => controller.abort(),
     timeout ?? DEFAULT_TIMEOUT
   )

   try {
     const response = await fetch(url, {
       ...requestOptions,
       signal: controller.signal,
     })
     // ... existing response handling
   } catch (error) {
     if (error instanceof DOMException && error.name === 'AbortError') {
       throw new Error(`Request timeout after ${timeout ?? DEFAULT_TIMEOUT}ms: ${method} ${url}`)
     }
     throw error
   } finally {
     clearTimeout(timeoutId)
   }
   ```

1. Note: the existing `cancellable-fetch.ts` utility in `frontend/lib/utils/` provides a
   different pattern (caller-controlled abort). The `ApiClient` timeout is separate -- it is
   an automatic safety net, not caller-controlled cancellation. Both can coexist.

**Verification Checklist:**

- [x] `AbortController` created in `request()` method
- [x] Timeout defaults to 30 seconds
- [x] Timeout is configurable via `options.timeout`
- [x] `AbortError` is caught and re-thrown as a descriptive error
- [x] `clearTimeout` called in `finally` block
- [x] `npm run lint` passes from frontend

**Testing Instructions:**

- No unit tests for the API client currently exist. The timeout is a runtime behavior that
  would require integration testing. Verify via lint and manual review.

**Commit Message Template:**

```text
feat(api-client): add configurable request timeout via AbortController

- Default 30s timeout prevents indefinite hangs
- Timeout configurable per-request via options.timeout
- AbortError caught and re-thrown with descriptive message
```

### Task 2: Tighten types in ApiClient

**Goal:** Replace `any` types in `ApiClient` with `unknown` or specific types. This addresses
health-audit finding #13 and eval Type Rigor concerns.

**Files to modify:**

- `frontend/lib/auth/api-client.ts` -- Replace `any` with proper types

**Prerequisites:** Task 1 (timeout changes are in the same file)

**Implementation Steps:**

1. Replace all `T = any` type defaults with `T = unknown`:

   ```typescript
   async request<T = unknown>(endpoint: string, options: ApiRequestOptions = {}): Promise<T>
   async get<T = unknown>(endpoint: string, options: ...): Promise<T>
   async post<T = unknown>(endpoint: string, body?: Record<string, unknown>, ...): Promise<T>
   async put<T = unknown>(endpoint: string, body?: Record<string, unknown>, ...): Promise<T>
   async delete<T = unknown>(endpoint: string, ...): Promise<T>
   async patch<T = unknown>(endpoint: string, body?: Record<string, unknown>, ...): Promise<T>
   ```

1. Change `body?: any` in `ApiRequestOptions` to `body?: Record<string, unknown>`.
1. Change the `body` parameter in convenience methods (`post`, `put`, `patch`) from `any`
   to `Record<string, unknown>`.
1. After making these changes, run `cd frontend && npm run lint` to see if any callers
   break. If callers pass non-object bodies, add a union type:
   `body?: Record<string, unknown> | unknown[]`
1. Fix any type errors in callers by adding explicit type annotations where needed.

**Verification Checklist:**

- [x] Zero `any` types in `api-client.ts`
- [x] `body` parameter typed as `Record<string, unknown>` (or union if needed)
- [x] Default type parameter is `unknown` not `any`
- [x] `cd frontend && npm run lint` passes
- [x] `npm test` passes

**Testing Instructions:**

- Run `cd frontend && npm run lint` -- this will catch type errors in callers.
- If callers need explicit type annotations, update them in this task.

**Commit Message Template:**

```text
refactor(api-client): replace any types with unknown for type safety

- Default generic T = unknown instead of T = any
- body parameter typed as Record<string, unknown>
- Forces callers to specify expected response types
```

### Task 3: Type the decodeJWTPayload return value

**Goal:** Ensure the shared `decodeJWTPayload` from Phase 1 returns `Record<string, unknown> | null`
and that all callers handle the type properly. Addresses health-audit finding #14.

**Files to modify:**

- `frontend/lib/auth/jwt-decode.ts` -- Verify return type (should already be typed from Phase 1)
- `frontend/lib/auth/client.ts` -- Update callers if they expect `any`
- `frontend/lib/auth/auth-service.ts` -- Update callers

**Prerequisites:** Phase 1 Task 1 complete (JWT decode deduplicated)

**Implementation Steps:**

1. Read `frontend/lib/auth/jwt-decode.ts` to verify it returns `Record<string, unknown> | null`.
   If Phase 1 was done correctly, this should already be the case.
1. Check `client.ts` -- the `getUserInfo()` function accesses `payload.sub`, `payload.email`,
   etc. With `Record<string, unknown>`, these accesses need type narrowing:

   ```typescript
   const payload = decodeJWTPayload(tokens.idToken)
   if (!payload) return null

   return {
     id: payload.sub as string,
     email: payload.email as string,
     username: payload['cognito:username'] as string,
     groups: (payload['cognito:groups'] as string[]) || [],
     // ...
   }
   ```

1. Check `auth-service.ts` -- the `mapJwtPayloadToUser()` function takes a
   `Record<string, unknown>` parameter (already typed correctly from Phase 1).
1. Check `google-oauth.ts` -- verify its callers handle `Record<string, unknown> | null`.
1. Fix any remaining type errors.

**Verification Checklist:**

- [x] `decodeJWTPayload` returns `Record<string, unknown> | null` (not `any`)
- [x] All callers use type narrowing or `as` casts for specific fields
- [x] `cd frontend && npm run lint` passes
- [x] `npm test` passes

**Testing Instructions:**

- Lint is the primary test -- `cd frontend && npm run lint` catches type errors.

**Commit Message Template:**

```text
refactor(auth): type JWT payload as Record<string, unknown>

- Ensure decodeJWTPayload return type is Record<string, unknown> | null
- Add type narrowing in callers for specific JWT claim fields
```

### Task 4: Add explicit contentType validation in profile photo upload

**Goal:** The `contentType` parameter in profile photo upload could be `undefined`, relying
on `includes(undefined)` returning `false`. Add an explicit check. Eval Code Quality concern.

**Files to modify:**

- `backend/lambdas/api/src/routes/profile.ts` -- Add explicit check

**Prerequisites:** Phase 1 Task 4 may have already done this. Verify and skip if so.

**Implementation Steps:**

1. Read `profile.ts` line 323-324 to check if Phase 1 Task 4 already added the check.
1. If not, change:

   ```typescript
   if (!allowedTypes.includes(contentType)) {
   ```

   to:

   ```typescript
   if (!contentType || !allowedTypes.includes(contentType)) {
   ```

1. This is a one-line change.

**Verification Checklist:**

- [x] `contentType` is explicitly checked for falsy before `includes()`
- [x] `npm test` passes

**Testing Instructions:**

- Covered by Phase 4 profile handler tests if they exist, or by new tests in this phase's
  contact/reactions tests.

**Commit Message Template:**

```text
fix(profile): add explicit contentType validation for photo upload

- Check contentType is defined before allowedTypes.includes()
- Prevents reliance on includes(undefined) returning false
```

## Phase Verification

After completing all tasks:

1. Run full test suite: `npm test` -- all tests must pass
1. Run frontend lint: `cd frontend && npm run lint` -- no errors or warnings
1. Verify no `any` in api-client: `grep "any" frontend/lib/auth/api-client.ts` should return
   0 results (excluding comments)
1. Verify AbortController: read `api-client.ts` and confirm timeout is implemented
1. Verify JWT return type: read `jwt-decode.ts` and confirm `Record<string, unknown> | null`

**Known limitations:**

- The two remaining JavaScript Lambdas (activity-aggregator, notification-processor) are NOT
  migrated to TypeScript in this plan. That is a larger effort (MEDIUM complexity per eval)
  that would require setting up a build pipeline for those Lambdas, creating shared types,
  and rewriting significant amounts of code. It is better suited for a dedicated feature plan.
- The `as unknown as` casts in `comment-repository.ts:84` and `drafts.ts:286` are NOT addressed.
  These are safe casts at the DynamoDB boundary where the SDK returns untyped objects. Removing
  them would require runtime type validation (e.g., Zod) which is out of scope.
- Frontend service error handling deduplication (extracting a shared `apiCall()` wrapper) is
  NOT included. While identified in the eval, it is a structural refactor that risks breaking
  many service modules. Better as a separate plan.
