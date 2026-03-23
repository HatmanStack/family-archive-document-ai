---
type: repo-health
date: 2026-03-23
goal: General health check — scan all 4 vectors equally
---

# Codebase Health Audit: family-archive-document-ai

## Configuration
- **Goal:** General health check — scan all 4 vectors equally
- **Scope:** Full repo, no constraints
- **Deployment Target:** Serverless (Lambda) — cold starts, execution limits, stateless constraints
- **Existing Tooling:** Full setup — linters, CI pipeline, pre-commit hooks, type checking
- **Constraints:** None

## Summary
- Overall health: **FAIR**
- Biggest structural risk: Triple-duplicated JWT decode implementation across 3 frontend auth files means a security-sensitive function has 3 copies that can diverge.
- Biggest operational risk: `deleteConversation` performs unbounded DynamoDB scans + S3 deletes in a single Lambda invocation with a 30-second timeout, making it a ticking time bomb for conversations with significant message volume.
- Total findings: **4 critical, 8 high, 12 medium, 6 low**

## Tech Debt Ledger

### CRITICAL

1. **[Operational Debt]** `backend/lambdas/api/src/routes/messages.ts:527-578`
   - **The Debt:** `deleteConversation` performs an unbounded paginated query of ALL messages in a conversation, then issues unbounded `Promise.all` S3 deletes for every attachment, then a batch DynamoDB delete of all items. There is no limit, no timeout guard, and no chunking of the S3 deletes. The API Lambda has a 30-second timeout.
   - **The Risk:** A conversation with thousands of messages will exceed the Lambda timeout, leaving the conversation in a partially deleted state with orphaned DynamoDB records and S3 objects. The S3 `Promise.all` can also exhaust memory or connections.

2. **[Operational Debt]** `backend/lambdas/api/src/routes/messages.ts:225-253`
   - **The Debt:** `getMessages` generates a presigned URL for every attachment on every message returned, plus a `signPhotoUrl` call per message, all via `Promise.all` with no concurrency limit. For a page of 50 messages each with multiple attachments, this could issue 100+ S3 signing operations in parallel.
   - **The Risk:** Excessive concurrent AWS SDK calls can exhaust connections and cause timeouts under Lambda's 30-second limit, particularly during cold starts when SDK initialization adds latency.

3. **[Architectural Debt]** `backend/lambdas/api/src/lib/logger.ts:17`
   - **The Debt:** `currentCorrelationId` is stored as module-level mutable state (`let currentCorrelationId`). In a Lambda execution environment, the module state persists across warm invocations. If multiple requests are processed concurrently (Lambda Provisioned Concurrency or container reuse), the correlation ID from one request will bleed into another.
   - **The Risk:** Misattributed log entries in production, making incident debugging unreliable. A correlation ID from request A appears in logs for request B.

4. **[Security Debt]** `backend/lambdas/api/src/repositories/base-repository.ts:194-198`
   - **The Debt:** `BaseRepository.query()` parses pagination keys with `JSON.parse(Buffer.from(lastEvaluatedKey, 'base64').toString())` without any validation. The dedicated `validatePaginationKey()` function exists in `lib/validation.ts` and is used by route handlers (messages, letters), but the repository layer bypasses it entirely. Any route using `commentRepository.listByItemId()` or `commentRepository.listByUserId()` passes unvalidated pagination keys.
   - **The Risk:** Attacker-crafted pagination keys could inject arbitrary DynamoDB `ExclusiveStartKey` values, potentially reading data from unintended partitions. This is a data access boundary violation.

### HIGH

5. **[Structural Debt]** `frontend/lib/auth/auth-service.ts:8-24`, `frontend/lib/auth/client.ts:63-79`, `frontend/lib/auth/google-oauth.ts:83-97`
   - **The Debt:** The JWT decode function is copy-pasted 3 times with identical logic across `decodeJWT` (auth-service), `decodeJWTPayload` (client), and `decodeJWT` (google-oauth). Additionally, a proper cryptographic JWT verification exists in `frontend/lib/auth/jwt.ts` using the `jose` library.
   - **The Risk:** Security-sensitive code exists in 3 unverified copies. A fix to one (e.g., handling malformed tokens) will not propagate to the others. Meanwhile, the proper verification in `jwt.ts` may not be used consistently.

6. **[Operational Debt]** `frontend/lib/services/search-service.ts:81-91`, `frontend/lib/services/gallery-service.ts:26`, `frontend/lib/services/comment-service.ts:46`, `frontend/lib/services/reaction-service.ts:21`, `frontend/lib/services/draft-service.ts:66`, `frontend/lib/services/profile-service.ts:25`, `frontend/lib/services/message-service.ts:35`
   - **The Debt:** Nearly all frontend service `fetch()` calls have no timeout or `AbortController`. Only `media-service.ts:65` (ragstackQuery) and `letter-upload-service.ts:128` (XHR) implement timeouts. The `api-client.ts` wrapper also has no timeout.
   - **The Risk:** A slow or unresponsive backend causes the UI to hang indefinitely with no way for the user to cancel. Particularly impactful for mobile/spotty connections.

7. **[Architectural Debt]** `backend/lambdas/api/src/routes/messages.ts:650-713`
   - **The Debt:** `createMessageInternal` performs a `GetCommand` to DynamoDB to fetch the sender's profile (name, photo) on every message send, then generates presigned URLs for attachments. This is an N+1 pattern: every message send triggers an additional DB read unrelated to the message itself.
   - **The Risk:** Adds unnecessary latency to every message send. The sender's name/photo could be cached in the conversation member record or passed from the caller.

8. **[Operational Debt]** `backend/lambdas/api/src/index.ts:59-69`
   - **The Debt:** `ensureProfile` is called on every single API request for authenticated users. This performs a DynamoDB `GetCommand` and potentially a `PutCommand` or `UpdateCommand` (for GSI1 backfill) before any business logic runs.
   - **The Risk:** Adds 5-15ms of latency to every API call. For a warm Lambda handling many requests, this is wasted work for the 99.9% of requests where the profile already exists. On cold starts (serverless context), this compounds with SDK initialization.

9. **[Structural Debt]** `backend/lambdas/notification-processor/index.js:215-223`, `backend/lambdas/api/src/lib/validation.ts:112-120`
   - **The Debt:** `escapeHtml` is duplicated between the notification-processor (JS) and the API validation module (TS). The notification-processor file itself acknowledges this with a comment at line 212-214.
   - **The Risk:** Divergent implementations of an XSS-prevention function. If one is updated with an additional escape (e.g., backticks), the other is forgotten.

10. **[Operational Debt]** `backend/lambdas/api/src/routes/drafts.ts:205-231`
    - **The Debt:** `handleListDrafts` performs an unbounded paginated query (`do...while (lastEvaluatedKey)`) to fetch ALL drafts into memory with no limit guard. All items are collected into a single array and returned in one response.
    - **The Risk:** If drafts accumulate (e.g., many failed processing attempts), this query grows unbounded. In the 30-second Lambda timeout, this could timeout or exhaust memory. The response payload could also exceed API Gateway's 10MB limit.

11. **[Security Debt]** `backend/lambdas/api/src/routes/profile.ts:329`
    - **The Debt:** The S3 key for profile photo uploads uses `filename.split('.').pop()` for the extension without sanitizing. While the content type is validated, the extension is user-controlled: a filename like `photo.../../../etc/passwd.jpg` would produce extension `jpg` but the split before `.pop()` doesn't protect against all path traversal variants in the initial filename.
    - **The Risk:** Low direct risk due to `Date.now()` in the key, but the pattern of using unsanitized user input in S3 keys is fragile. Compare with `messages.ts:425` which properly uses `path.basename()` and regex sanitization.

12. **[Operational Debt]** `backend/lambdas/api/src/routes/contact.ts:69-72`
    - **The Debt:** The `SES_FROM_EMAIL` and `ADMIN_EMAIL` environment variables are read at module initialization (lines 13-14) and default to empty string. The function only checks `ADMIN_EMAIL` at line 69 but does not check `SES_FROM_EMAIL`. If `SES_FROM_EMAIL` is empty, the `SendEmailCommand` will fail with an AWS SDK error rather than a clean 500.
    - **The Risk:** Obscure AWS error message exposed to operations; potential confusion during debugging.

### MEDIUM

13. **[Code Hygiene Debt]** `frontend/lib/auth/api-client.ts:6,25,96,100,104,108,112`
    - **The Debt:** 10 uses of `any` type in the API client: `body?: any`, return types `T = any`, and method signatures all use `any` for request/response bodies.
    - **The Risk:** Eliminates compile-time type checking for all API communication, which is the most error-prone boundary in the application.

14. **[Code Hygiene Debt]** `frontend/lib/auth/client.ts:63`
    - **The Debt:** `decodeJWTPayload` returns `any` type.
    - **The Risk:** Propagates type unsafety to all callers; JWT payloads are security-sensitive and should have typed interfaces.

15. **[Structural Debt]** `frontend/lib/auth/client.ts:45-61` and `frontend/lib/auth/auth-service.ts:52-53`
    - **The Debt:** Two parallel auth systems exist: `client.ts` (stores tokens in `localStorage` directly, uses `authenticatedFetch`, `refreshSession`) and `auth-service.ts` (uses `authStore` Svelte store, `cognitoAuth` client, `scheduleTokenRefresh`). Both implement token refresh, storage, and session management with different mechanisms.
    - **The Risk:** Ambiguity about which auth path to use. A component using `client.ts`'s `getStoredTokens()` may get stale tokens while `auth-service.ts` has already refreshed them in the store, or vice versa.

16. **[Architectural Debt]** `backend/lambdas/api/src/routes/letters.ts:109,146,228,260,346,391`
    - **The Debt:** Six `catch` blocks in letters.ts re-throw errors with `throw error` after logging. These unhandled throws propagate to the top-level handler in `index.ts:140-153`, which catches them and returns a generic error response. This creates an inconsistent error handling pattern: some routes return `errorResponse(500, ...)` while letters.ts throws to the global handler.
    - **The Risk:** Inconsistent error response format between routes. The global catch in `index.ts` uses `getStatusCode(err)` and `getUserMessage(err)`, which only work for `AppError` instances; raw throws produce different response shapes.

17. **[Operational Debt]** `frontend/lib/services/media-service.ts:52-55`
    - **The Debt:** Module-level `cache` object persists in the browser's JavaScript runtime for the lifetime of the SPA. There is no TTL or cache invalidation beyond explicit `invalidateMediaCache()` calls.
    - **The Risk:** Stale data displayed indefinitely if the user doesn't trigger a refresh or navigate away.

18. **[Code Hygiene Debt]** `backend/lambdas/activity-aggregator/index.js`, `backend/lambdas/notification-processor/index.js`
    - **The Debt:** Two Lambda functions remain as plain JavaScript (CommonJS) while the rest of the backend is TypeScript. They use `require()` and have no type checking.
    - **The Risk:** These functions handle DynamoDB stream events and SES emails with no compile-time safety. Typos in property access would only be caught at runtime.

19. **[Operational Debt]** `backend/lambdas/notification-processor/index.js:80-127`
    - **The Debt:** `processMessageNotification` loops over each recipient sequentially, calling `getUserProfile` (a DynamoDB read) and `sendEmail` (an SES call) one at a time. For group conversations with many participants, this is an O(n) sequence of network calls.
    - **The Risk:** For a group conversation with 10+ participants, the sequential processing adds significant latency and risks exceeding the Lambda timeout.

20. **[Security Debt]** `frontend/lib/auth/cognito-config.ts:22-23`
    - **The Debt:** Guest credentials (`PUBLIC_GUEST_EMAIL`, `PUBLIC_GUEST_PASSWORD`) are exposed as `PUBLIC_` environment variables, meaning they are embedded in the client-side JavaScript bundle.
    - **The Risk:** By design for demo mode, but if guest credentials share any permissions with real users or if the guest account is inadvertently given elevated privileges, the exposed credentials become an attack vector.

21. **[Structural Debt]** `backend/lambdas/api/src/routes/messages.ts:1-128`
    - **The Debt:** The `handle` function in messages.ts is 128 lines of `if/else` routing with duplicated rate-limit boilerplate. Each route check follows the same pattern: check method + resource, optionally check rate limit, call handler. The rate-limit check is copy-pasted 6 times.
    - **The Risk:** Adding a new message route requires copying the rate-limit pattern again. A change to the rate-limit logic must be replicated in 6 places.

22. **[Operational Debt]** `backend/lambdas/api/src/routes/reactions.ts:88-99`
    - **The Debt:** `toggleReaction` iterates over `itemIdVariants` (plain and URL-encoded) issuing sequential `GetCommand` calls to find a comment. This is a workaround for inconsistent data encoding in stored records.
    - **The Risk:** Every reaction toggle issues at least one, potentially two, DynamoDB reads just to locate the comment. This is a data model inconsistency tax paid on every request.

23. **[Structural Debt]** `backend/lambdas/api/src/repositories/comment-repository.ts:30-51`
    - **The Debt:** `listByItemId` also iterates `itemIdVariants` with sequential queries — the same workaround as reactions. The hardcoded SK prefix `'20'` (line 39) assumes all comment timestamps start with year `20xx`.
    - **The Risk:** Comments with IDs not starting with "20" would be silently dropped. The assumption breaks in the year 3000 or with non-timestamp sort keys.

24. **[Code Hygiene Debt]** `backend/lambdas/api/src/routes/profile.ts:348`
    - **The Debt:** `listUsers` issues a single GSI1 query with no pagination (no `Limit` parameter set). DynamoDB will return up to 1MB of data in a single Query. For a family archive this is likely sufficient, but there is no pagination token handling.
    - **The Risk:** If the user base grew beyond what fits in a single DynamoDB page, the response would silently omit users beyond the first page.

### LOW

25. **[Code Hygiene Debt]** `backend/lambdas/letter-processor/src/index.ts:197`, `backend/lambdas/letter-processor/src/gemini.ts:25,97,105,115`
    - **The Debt:** The letter-processor Lambda uses `console.error`/`console.warn` directly instead of the structured logger used by the API Lambda.
    - **The Risk:** Unstructured logs lack correlation IDs, making cross-service debugging harder.

26. **[Code Hygiene Debt]** `backend/lambdas/api/src/lib/user.ts:41`
    - **The Debt:** Uses `console.warn` directly instead of the structured `log.warn` from the logger module.
    - **The Risk:** One log line in the API Lambda bypasses structured logging.

27. **[Maintenance Debt]** `package.json:9-16`
    - **The Debt:** The `_securityNotes` field references an audit from `2025-12-16` (over 3 months old) and `npm audit` currently shows 17 vulnerabilities (6 high).
    - **The Risk:** Stale security documentation may create false confidence.

28. **[Code Hygiene Debt]** `frontend/lib/services/media-service.ts:420`
    - **The Debt:** `getImageById` uses `(error as Record<string, unknown>)?.status` to extract status codes, a type-unsafe pattern.
    - **The Risk:** Fragile error handling that could break with SDK updates or different error shapes.

29. **[Maintenance Debt]** `backend/template.yaml:206`
    - **The Debt:** API Gateway CORS `AllowOrigin: "'*'"` is set globally in the template, while the Lambda response handler has a more restrictive origin check via `ALLOWED_ORIGINS`. Preflight OPTIONS responses from API Gateway still return `*`.
    - **The Risk:** Browser preflight requests succeed for any origin, even though actual API responses are correctly restricted. This could confuse security audits.

30. **[Code Hygiene Debt]** Multiple files
    - **The Debt:** 25+ empty `catch` blocks across the codebase. Most are in input validation/parsing contexts where silently swallowing errors is intentional.
    - **The Risk:** If an unexpected error type is thrown in a future change, it will be silently swallowed.

## Quick Wins

1. `frontend/lib/auth/auth-service.ts:8`, `frontend/lib/auth/client.ts:63`, `frontend/lib/auth/google-oauth.ts:83` — Extract the 3 identical `decodeJWT` implementations into a single shared utility (estimated effort: < 30 minutes)

2. `backend/lambdas/api/src/repositories/base-repository.ts:194-198` — Replace raw `JSON.parse(Buffer.from(...))` with the existing `validatePaginationKey()` from `lib/validation.ts` to close the unvalidated pagination key bypass (estimated effort: < 30 minutes)

3. `backend/lambdas/api/src/lib/user.ts:41` — Replace `console.warn(...)` with `log.warn(...)` for consistent structured logging (estimated effort: < 5 minutes)

4. `backend/lambdas/api/src/routes/contact.ts:74` — Add a check for `!SES_FROM_EMAIL` alongside the existing `!ADMIN_EMAIL` check (estimated effort: < 5 minutes)

5. `frontend/lib/auth/api-client.ts` — Add an `AbortController` with a configurable timeout to the `request()` method to prevent indefinite hangs (estimated effort: < 30 minutes)

## Automated Scan Results

**Vulnerability Scan (`npm audit`):**
- 17 total vulnerabilities: 7 low, 4 moderate, 6 high
- Notable high-severity: `flatted` (unbounded recursion DoS, prototype pollution), `serialize-javascript` (RCE via RegExp.flags)
- Notable moderate: `fast-xml-parser` (entity expansion bypass affecting AWS SDK `@aws-sdk/xml-builder`)
- Most are in dev/build dependencies; the `fast-xml-parser` issue affects the production AWS SDK chain

**Dead Code Analysis:**
- `npx knip` failed to run due to missing `@playwright/test` module (not installed, only in devDependencies for CI)
- Manual inspection found no obvious dead exports in backend code; the repository pattern has some unused methods (`queryByPK`, `queryByPKAndSKPrefix`)

**Secrets Scan:**
- No hardcoded secrets found in source code
- `.env` files properly gitignored
- `.env.example` contains only placeholders
- Guest credentials are intentionally public (`PUBLIC_` prefix) by design for demo mode

**Git Hygiene:**
- Clean commit history with conventional commit format
- `.gitignore` is comprehensive and appropriate
- No committed build artifacts or node_modules found
