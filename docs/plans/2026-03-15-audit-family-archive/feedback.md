# Feedback — 2026-03-15 Audit Remediation

## Active Feedback

<!-- Items added by reviewers. Format:
### FB-{NNN} [{SOURCE}] {Title}
- **Phase/Task:** Phase-N, Task M
- **Severity:** BLOCKING | SUGGESTION
- **Detail:** ...
-->

## Resolved Feedback

<!-- Moved here after resolution. Add:
- **Resolution:** Description of what was done
- **Resolved in:** Phase-N, Task M (or commit ref)
-->

### FB-009 [CODE_REVIEW] FRONTEND.md comment service example shows stale destructured return
- **Phase/Task:** Phase-5, Task 7
- **Severity:** SUGGESTION
- **Detail:** `docs/FRONTEND.md:108` shows `const { items, lastEvaluatedKey } = await getComments(itemId, limit)`. The actual `comment-service.ts` returns a `CommentApiResponse` object with `{ success, data, lastEvaluatedKey, error }` shape -- not `{ items, lastEvaluatedKey }`.
- **Resolution:** Updated FRONTEND.md to use `const { success, data, lastEvaluatedKey, error } = await getComments(itemId, limit)` matching the actual `CommentApiResponse` shape.
- **Resolved in:** Phase-5, Task 7

### FB-008 [CODE_REVIEW] Task 7 Stale example #1: AUTHENTICATION.md login code example not verified
- **Phase/Task:** Phase-5, Task 7
- **Severity:** SUGGESTION
- **Detail:** `docs/AUTHENTICATION.md:150-171` shows a login example using direct `CognitoIdentityProviderClient` and `InitiateAuthCommand`. The spec asks to check `frontend/lib/auth/client.ts` for the actual auth flow.
- **Resolution:** Rewrote the login example to show the actual `authService.signIn()` API from `lib/auth/auth-service.ts`, with `NEW_PASSWORD_REQUIRED` challenge handling. Added a secondary code block showing the underlying `CognitoAuthClient` SDK usage for reference.
- **Resolved in:** Phase-5, Task 7

### FB-007 [CODE_REVIEW] Task 8 Structure issue #1: README.md still says `cd frontend && cp .env.example .env`
- **Phase/Task:** Phase-5, Task 8
- **Severity:** BLOCKING
- **Detail:** `README.md:93` instructs users to run `cp .env.example .env` from inside the `frontend/` directory, but `frontend/.env.example` does not exist. CI correctly runs `cp .env.example frontend/.env` from the repo root.
- **Resolution:** Updated README.md to use `cp .env.example frontend/.env` from repo root, matching CI behavior. Moved `cd frontend` to just before `npm run dev`.
- **Resolved in:** Phase-5, Task 8

### FB-006 [CODE_REVIEW] Task 8: .env.example missing backend vars comment block
- **Phase/Task:** Phase-5, Task 8
- **Severity:** BLOCKING
- **Detail:** `.env.example` was missing a comment block about backend vars, and no backend env var reference table existed in deployment docs.
- **Resolution:** Added backend env vars comment block to `.env.example` header. Added backend Lambda environment variables reference table to `docs/DEPLOYMENT.md` with all 12 variables, their Lambda targets, and descriptions.
- **Resolved in:** Phase-5, Task 8

### FB-005 [CODE_REVIEW] Task 7 Stale example #2: AUTHENTICATION.md still references non-existent lib/services/api.ts
- **Phase/Task:** Phase-5, Task 7
- **Severity:** BLOCKING
- **Detail:** `docs/AUTHENTICATION.md:196` showed a code example importing from `lib/services/api.ts` which does not exist.
- **Resolution:** Updated AUTHENTICATION.md to reference individual service files (`comment-service.ts`, `profile-service.ts`) with correct import paths and actual API patterns.
- **Resolved in:** Phase-5, Task 7

### FB-004 [CODE_REVIEW] Task 7 Stale example #4: TROUBLESHOOTING.md still claims GEMINI_API_KEY must start with 'AIza'
- **Phase/Task:** Phase-5, Task 7
- **Severity:** BLOCKING
- **Detail:** TROUBLESHOOTING.md contained false claims about `AIza` prefix requirement for Gemini API keys.
- **Resolution:** Replaced "Key should start with `AIza`" with "Key should be ~39 characters (see config.ts validation)". Updated validation description to correctly state the code checks for placeholder values and minimum length (< 20 chars), not prefix format. Fixed line references to `config.ts:36-58`.
- **Resolved in:** Phase-5, Task 7

### FB-003 [CODE_REVIEW] Task 6 Stale #3: SKIP_VALIDATION reference not removed from TROUBLESHOOTING.md
- **Phase/Task:** Phase-5, Task 6
- **Severity:** BLOCKING
- **Detail:** `docs/TROUBLESHOOTING.md:297` contained a "Development Override" section referencing non-existent `SKIP_VALIDATION` env var.
- **Resolution:** Removed the entire "Development Override" section (heading + `SKIP_VALIDATION=true` line) from TROUBLESHOOTING.md.
- **Resolved in:** Phase-5, Task 6

### FB-002 [CODE_REVIEW] ESLint brace-style violation in media-service.ts ragstackQuery
- **Phase/Task:** Phase-3, Task 3
- **Severity:** BLOCKING
- **Detail:** `frontend/lib/services/media-service.ts` line 88 has `} finally {` on the same line, violating the `style/brace-style` ESLint rule.
- **Resolution:** Split `} finally {` onto separate lines in `ragstackQuery()` at line 88 of `media-service.ts`, placing `finally {` on its own line to match the project's brace-style convention. ESLint now passes with zero errors and zero warnings.
- **Resolved in:** Phase-3, Task 3

### FB-001 [CODE_REVIEW] media.ts and contact.ts still missing requestOrigin in all response calls
- **Phase/Task:** Phase-2, Tasks 1-4 (CORS fixes)
- **Severity:** BLOCKING
- **Detail:** `media.ts` (15 response calls) and `contact.ts` (8 response calls) were missing `requestOrigin` parameter in all response helper calls.
- **Resolution:** Destructured `requestOrigin` from `RequestContext` in both `media.ts` and `contact.ts`. Threaded `requestOrigin` through all internal functions and passed it as the last argument to every `successResponse()` and `errorResponse()` call in both files.
- **Resolved in:** Phase-2, Tasks 1-4 (CORS fix follow-up)
