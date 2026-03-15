---
type: repo-health
plan_id: 2026-03-15-audit-family-archive
date: 2026-03-15
goal: General health check
scope: Full repo
existing_tooling: Linters, CI, pre-commit hooks
constraints: None
---

## CODEBASE HEALTH AUDIT

### EXECUTIVE SUMMARY
- Overall health: **FAIR**
- Biggest structural risk: Legacy JavaScript files alongside TypeScript rewrites create a parallel codebase that can silently drift, and the gallery page component at 1072 lines is a monolith mixing UI, state management, caching, search, navigation, and upload logic.
- Biggest operational risk: Multiple route handlers (messages, comments, reactions, drafts) never pass `requestOrigin` to response helpers, causing CORS headers to be missing or incorrect on error and success responses in production.
- Total findings: 3 critical, 7 high, 9 medium, 6 low

### TECH DEBT LEDGER

#### CRITICAL

1. **[Operational Debt]** `backend/lambdas/api/src/routes/messages.ts:1-647`, `backend/lambdas/api/src/routes/comments.ts:1-293`, `backend/lambdas/api/src/routes/reactions.ts:1-235`, `backend/lambdas/api/src/routes/drafts.ts:1-287`
   - **The Debt:** Four out of eight route handlers never destructure or pass `requestOrigin` from the `RequestContext` to `successResponse()` or `errorResponse()`. The `letters.ts` and `profile.ts` handlers correctly pass it. The CORS helper in `responses.ts:70-78` falls back to the first allowed origin when no `requestOrigin` is provided, but this fallback is fragile -- it will set the wrong origin for multi-domain deployments and may break browser CORS for any response from these four route files.
   - **The Risk:** In production with `ALLOWED_ORIGINS` set to multiple domains, responses from messages, comments, reactions, and drafts endpoints will use the wrong `Access-Control-Allow-Origin` header, causing CORS failures for users on the non-first domain. Error responses under these handlers will similarly lack proper CORS headers.

2. **[Operational Debt]** `backend/lambdas/api/src/routes/messages.ts:148`, `backend/lambdas/api/src/routes/letters.ts:87`
   - **The Debt:** Pagination cursor `lastEvaluatedKey` is decoded via `JSON.parse(Buffer.from(lastEvaluatedKey, 'base64').toString())` with no validation. The codebase has a `validatePaginationKey()` function in `backend/lambdas/api/src/lib/validation.ts:140-185` that performs base64 decoding, JSON parsing, structure validation, and PK prefix checking -- but messages and letters routes do not use it.
   - **The Risk:** An attacker can craft a malicious base64-encoded JSON pagination key to scan arbitrary partition keys in the DynamoDB table, potentially accessing data outside the intended access pattern. The `JSON.parse` can also throw on malformed input, causing 500 errors.

3. **[Operational Debt]** `backend/lambdas/api/src/routes/profile.ts:140`, `backend/lambdas/api/src/routes/profile.ts:311`, `backend/lambdas/api/src/routes/messages.ts:200`, `backend/lambdas/api/src/routes/messages.ts:273`, `backend/lambdas/api/src/routes/messages.ts:317`, `backend/lambdas/api/src/routes/drafts.ts:101`
   - **The Debt:** Multiple route handlers call `JSON.parse(event.body || '{}')` without try/catch. If a client sends malformed JSON, this throws an unhandled exception that propagates to the top-level catch in `index.ts`, returning a generic 500 error instead of a 400 validation error. Other handlers (letters, comments, reactions, contact) properly wrap their `JSON.parse` in try/catch.
   - **The Risk:** Inconsistent error handling: malformed JSON bodies cause 500 Internal Server Error instead of 400 Bad Request for profile updates, message sending, upload URL requests, and draft upload requests.

#### HIGH

4. **[Structural Debt]** `backend/lambdas/api/lib/` (8 JS files), `backend/lambdas/api/repositories/` (6 JS files)
   - **The Debt:** The API Lambda contains a complete parallel set of JavaScript files alongside the TypeScript source in `src/`. The JS `lib/` directory has `database.js`, `keys.js`, `logger.js`, `prefixes.js`, `rate-limit.js`, `responses.js`, `user.js`, `validation.js`. The JS `repositories/` directory has `base-repository.js`, `comment-repository.js`, `index.js`, `message-repository.js`, `reaction-repository.js`, `user-repository.js`. The TS counterparts exist in `src/lib/` and `src/repositories/`.
   - **The Risk:** Two codebases that must be kept in sync. If the build system references the wrong set, logic divergence causes silent bugs. Developers may accidentally import from the JS path. The JS files also lack type safety.

5. **[Structural Debt]** `frontend/routes/gallery/+page.svelte:1-1072`
   - **The Debt:** A 1072-line Svelte component containing: media loading/caching (stale-while-revalidate), file upload with caption modal, semantic search with RAGStack, search result display, media modal with keyboard navigation, URL-based deep linking, auth/approval guards, and background refresh timers.
   - **The Risk:** Untestable -- the component has no unit tests and couples UI rendering to caching logic, search logic, and authentication guards. Any change risks regression across all these concerns.

6. **[Architectural Debt]** `backend/lambdas/api/src/routes/messages.ts:1-647`
   - **The Debt:** The messages route handler is 647 lines containing route dispatching, DynamoDB queries, S3 presigned URL generation, batch operations, and business logic (conversation creation, unread counting, participant management). Unlike the comments handler which uses a repository pattern via `commentRepository`, messages performs all DynamoDB operations inline.
   - **The Risk:** Cannot unit test message business logic without mocking all AWS SDK calls. Duplicated DynamoDB access patterns that would be centralized in a repository.

7. **[Code Hygiene Debt]** `backend/lambdas/amplify-deployer/__pycache__/index.cpython-313.pyc`
   - **The Debt:** A Python bytecode file is committed to the repository. Neither `.gitignore` nor `backend/.gitignore` excludes `__pycache__` or `*.pyc` files.
   - **The Risk:** Build artifacts in source control; can cause confusing diffs and merge conflicts.

8. **[Operational Debt]** `backend/lambdas/api/src/routes/drafts.ts:164-178`
   - **The Debt:** `handleListDrafts()` uses a `ScanCommand` with a `FilterExpression` to find all drafts. DynamoDB Scan reads the entire table and filters client-side.
   - **The Risk:** As the table grows, this operation becomes increasingly expensive. Latency will degrade linearly with table size.

9. **[Structural Debt]** `backend/lambdas/notification-processor/index.js:212-220` and `backend/lambdas/api/src/routes/contact.ts:14-22`
   - **The Debt:** The `escapeHtml()` function is duplicated verbatim across two files. Both implement the same five-replacement pattern for HTML entity encoding.
   - **The Risk:** Bug fixes or security improvements to one copy will not propagate to the other. This is a security-sensitive function where divergence creates XSS risk.

10. **[Operational Debt]** `frontend/lib/services/media-service.ts:402`
    - **The Debt:** `getImageById()` has a bare `catch` block that swallows all errors and returns `null`. A network failure, auth expiration, or GraphQL error is silently treated as "image not found."
    - **The Risk:** Users see broken thumbnails with no error feedback; transient failures are indistinguishable from missing images.

#### MEDIUM

11. **[Code Hygiene Debt]** `frontend/routes/gallery/+page.svelte:98,233,234,245,308,343,438,491`
    - **The Debt:** Eight `console.error` / `console.warn` calls in a production Svelte component.
    - **The Risk:** No observability for production errors in the gallery; error context is only visible if a user opens developer tools.

12. **[Operational Debt]** `backend/lambdas/api/src/routes/messages.ts:252-256`, `backend/lambdas/api/src/routes/messages.ts:472-476`
    - **The Debt:** `BatchWriteCommand` responses can contain `UnprocessedItems` when DynamoDB throttles. The code does not check for or retry unprocessed items.
    - **The Risk:** Under load, some conversation member records or message deletions may silently fail.

13. **[Structural Debt]** `backend/lambdas/api/src/routes/letters.ts:11-13` and `backend/lambdas/api/src/routes/media.ts:14-16`
    - **The Debt:** `RAGSTACK_BUCKET`, `RAGSTACK_REGION`, and the `ragstackS3Client` construction are duplicated across `letters.ts` and `media.ts`.
    - **The Risk:** Configuration drift between the two files; wasted connections/resources from duplicate S3 client instances.

14. **[Architectural Debt]** `backend/lambdas/api/src/routes/messages.ts:17-19`, `backend/lambdas/api/src/routes/profile.ts:17-19`, `backend/lambdas/api/src/lib/s3-utils.ts:8-10`
    - **The Debt:** Five separate `new S3Client(...)` instantiations across route handlers and utils in the same Lambda.
    - **The Risk:** Each consumes memory and connection resources. Inconsistent region configuration.

15. **[Code Hygiene Debt]** `backend/lambdas/letter-processor/src/gemini.ts:25,97,105,115`, `backend/lambdas/letter-processor/src/index.ts:195,215`
    - **The Debt:** The letter-processor Lambda uses raw `console.error`/`console.warn` calls instead of a structured logger.
    - **The Risk:** Letter processing errors lack structured metadata, making production debugging harder.

16. **[Operational Debt]** `frontend/lib/services/media-service.ts:65-72`
    - **The Debt:** The `ragstackQuery()` function makes `fetch()` calls to an external GraphQL endpoint with no timeout.
    - **The Risk:** If RAGStack becomes slow or unresponsive, gallery page fetches hang indefinitely.

17. **[Code Hygiene Debt]** Multiple frontend service files
    - **The Debt:** None of the frontend service files use the `withRetry` utility from `frontend/lib/utils/retry.ts` or the `cancellableFetch` from `frontend/lib/utils/cancellable-fetch.ts`. These utilities exist but appear unused in production code.
    - **The Risk:** API calls from the frontend have no retry logic for transient network failures despite the infrastructure being available.

18. **[Operational Debt]** `backend/lambdas/api/src/routes/profile.ts:343`
    - **The Debt:** `listUsers()` function signature accepts `requesterId` and `requestOrigin` parameters but drops the `requestOrigin` parameter. The call site passes both but the second argument is silently ignored.
    - **The Risk:** CORS headers missing from `listUsers` responses.

19. **[Code Hygiene Debt]** Test coverage gaps
    - **The Debt:** No unit tests exist for any route handler, the `validation.ts` module, the `rate-limit.ts` module, or the `responses.ts` module.
    - **The Risk:** Core API business logic has no unit test coverage.

#### LOW

20. **[Code Hygiene Debt]** `frontend/routes/gallery/+page.svelte:914-916`
    - **The Debt:** Two `svelte-ignore` comments to suppress accessibility warnings.
    - **The Risk:** The media modal overlay is not fully keyboard-accessible.

21. **[Code Hygiene Debt]** `frontend/lib/services/media-service.ts:52-55`
    - **The Debt:** Module-level mutable state used as an in-memory cache with no size limit or TTL-based expiry.
    - **The Risk:** Memory usage grows unbounded in long-lived browser sessions.

22. **[Structural Debt]** `Ancestry/exporter.js:93`, `Ancestry/exporter.js:242`
    - **The Debt:** Two empty catch blocks that silently swallow errors.
    - **The Risk:** Errors during Ancestry export are completely hidden.

23. **[Code Hygiene Debt]** npm audit: 23 vulnerabilities
    - **The Debt:** 23 vulnerabilities (5 low, 11 moderate, 7 high) in frontend dependencies including Svelte SSR XSS vulnerabilities.
    - **The Risk:** SSR-related XSS vulnerabilities could be exploitable if user content is rendered server-side.

24. **[Structural Debt]** `backend/lambdas/api/src/routes/profile.ts:334`
    - **The Debt:** Hardcoded S3 URL construction for profile photos using public URL pattern, but bucket likely uses private ACLs.
    - **The Risk:** Non-functional URL stored as profile photo reference, requiring re-sign on every access.

25. **[Code Hygiene Debt]** `backend/lambdas/letter-processor/src/lib/config.ts:21`
    - **The Debt:** Config validation rejects API keys matching `/^TODO/i` -- minor code smell.
    - **The Risk:** Minimal.

### QUICK WINS

1. `backend/lambdas/api/src/routes/messages.ts:34` -- Destructure `requestOrigin` from context and pass it to all `successResponse()` / `errorResponse()` calls (same for `comments.ts`, `reactions.ts`, `drafts.ts`). Estimated effort: < 1 hour.
2. `.gitignore` -- Add `__pycache__/` and `*.pyc` entries, then `git rm --cached backend/lambdas/amplify-deployer/__pycache__/`. Estimated effort: < 15 minutes.
3. `backend/lambdas/api/src/routes/messages.ts:148` and `backend/lambdas/api/src/routes/letters.ts:87` -- Replace raw `JSON.parse(Buffer.from(...))` with the existing `validatePaginationKey()` utility. Estimated effort: < 30 minutes.

### AUTOMATED SCAN RESULTS

- **Dead code tool:** `npx knip` failed to run due to missing dependency. The presence of 14 JS files alongside their TS equivalents in `backend/lambdas/api/` strongly suggests dead code.
- **Vulnerability scan:** `npm audit` reports 23 vulnerabilities in `frontend/`: 7 high (Svelte SSR XSS, serialize-javascript), 11 moderate, 5 low. Fix requires Svelte 5.x breaking change.
- **Secrets scan:** No hardcoded secrets detected. API keys use environment variables. Test files use clearly labeled fake keys. `.env` and `.env.local` are in `.gitignore`.
- **Git hygiene:** One committed build artifact (`__pycache__/index.cpython-313.pyc`). Commit history is clean with conventional commit messages. `.gitignore` missing Python bytecode patterns.
