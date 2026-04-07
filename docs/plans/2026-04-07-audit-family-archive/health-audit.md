---
type: repo-health
date: 2026-04-07
---

## CODEBASE HEALTH AUDIT

### EXECUTIVE SUMMARY
- Overall health: GOOD
- Biggest structural risk: A single 1,075-line Svelte gallery page conflates fetching, search, modal, upload, caption, and pagination state, and several backend route files (`profile.ts`, `letters.ts`, `messages.ts`, `drafts.ts`) carry an internal "method+resource" sub-router that duplicates the global `Router` registered in `index.ts`.
- Biggest operational risk: Sequential `await` over S3 GetObjects in `letter-processor` plus serial DynamoDB BatchGet/Get patterns under Lambda time/memory limits, combined with unbounded result mapping in `messages.getMessages` (signing up to N URLs per request with a 1h TTL).
- Total findings: 0 critical, 6 high, 8 medium, 6 low

### TECH DEBT LEDGER

#### HIGH

1. **[Architectural]** `backend/lambdas/api/src/routes/profile.ts:31-66` (also `letters.ts`, `comments.ts`, `media.ts`, `reactions.ts`, `drafts.ts`)
   - **The Debt:** Despite the declarative `Router` in `lib/router.ts` and `index.ts`, these route files still expose a monolithic `handle(event, context)` that re-implements method+resource matching by string compare against `event.resource`. Two routing layers coexist; the inner one bypasses middleware features and re-parses paths.
   - **The Risk:** Drift between the two routers causes silent 404s, missing middleware (auth/rate-limit) on inner routes, and confusion about which file owns a path. The `messages` module already migrated to function-per-route — the rest is half-migrated tech debt.

2. **[Structural]** `frontend/routes/gallery/+page.svelte:1-1075`
   - **The Debt:** 1,075-line Svelte component combining: section tabs, media list with stale-while-revalidate, search via RAGStack, modal selection, file upload, caption modal, preview URL lifecycle, background refresh timer set, all-items map cache, and comments section.
   - **The Risk:** God component. Any change risks regressions in unrelated features; impossible to unit test; high cognitive load. Likely source of future bugs around the manual timer/preview-URL cleanup logic at lines 38-60.

3. **[Structural]** `frontend/routes/profile/settings/+page.svelte:1-693`
   - **The Debt:** 693-line settings component holding profile form, family relationships CRUD, notification settings, photo upload, and validation in one script block.
   - **The Risk:** Same god-component pattern; relationship list and photo upload are independent concerns sharing one save lifecycle.

4. **[Operational]** `backend/lambdas/letter-processor/src/index.ts:114-157`
   - **The Debt:** Sequential `for…of` over S3 objects, each issuing `s3.send(GetObjectCommand)` then `streamToBuffer` before the next. No parallelism, no per-call timeout, no abort on partial failure cleanup.
   - **The Risk:** Up to 20 files * cold-start latency serialized — easily blows past Lambda timeout budget for legitimate large uploads, and ties up memory holding all buffers (50 MB cap) on a single thread.

5. **[Operational]** `backend/lambdas/api/src/routes/messages.ts:81-110` and `:265-285`
   - **The Debt:** `getMessages` signs S3 URLs for every attachment in every message in batches of 10 with `expiresIn: 3600` on each call. No caching, no conditional signing, no request-time budget. Each list call can issue dozens of presign operations.
   - **The Risk:** Tail latency under load and amplifies cold-start CPU. 1-hour TTL means every page fetch leaks fresh signed URLs even when the client just refetched seconds ago.

6. **[Operational]** `backend/lambdas/api/src/index.ts:127-138`
   - **The Debt:** `ensureProfile` runs synchronously on EVERY authenticated request before routing, with no caching across invocations and a hard 500 short-circuit on failure.
   - **The Risk:** Adds a DynamoDB round-trip to every API call (cold + warm), and a single transient DDB hiccup turns the whole API into a 500 — fail-closed on a non-critical bootstrap step.

#### MEDIUM

1. **[Architectural]** `backend/lambdas/api/src/index.ts:11,29-82`
   - **The Debt:** Single API Lambda imports every route module at top level (`comments, messages, profile, reactions, media, letters, drafts, contact`), pulling all S3/DDB clients into one bundle.
   - **The Risk:** Cold-start cost grows with every new module; no tree-shaking benefit; one slow import penalizes every endpoint.

2. **[Structural]** `backend/lambdas/api/src/routes/messages.ts:482` and `repositories/messaging-repository.ts:476`
   - **The Debt:** Both files exceed 470 lines; route file still owns S3 signing logic and attachment shape conversion that the repository or a dedicated `attachment-service` should own.
   - **The Risk:** The "repository pattern" boundary is leaky — S3 work lives in routes while DynamoDB work lives in the repo, so neither layer is independently testable.

3. **[Operational]** `backend/lambdas/api/src/repositories/messaging-repository.ts:84-93`
   - **The Debt:** Hardcoded `Limit: 50` in `listConversationsForUser` regardless of caller-supplied page size.
   - **The Risk:** Pagination contract mismatch — caller can ask for fewer/more but always gets 50; future scaling issue once users have many conversations.

4. **[Operational]** `backend/lambdas/letter-processor/src/index.ts:196-224`
   - **The Debt:** Catch-all `console.error` then attempts a best-effort error PutCommand with no retry, no DLQ acknowledgement, and no correlation ID.
   - **The Risk:** Failures are observable only via raw CloudWatch text; no structured logging unlike the API lambda; harder to diagnose Gemini transient failures.

5. **[Hygiene]** `backend/lambdas/api/src/lib/constants.ts:19,47,52,57,66,71,76,86` (knip)
   - **The Debt:** 8 exported constants are unused (`PRESIGNED_UPLOAD_URL_EXPIRY_SECONDS`, `MAX_MESSAGE_LENGTH`, `MAX_BIO_LENGTH`, `MAX_DISPLAY_NAME_LENGTH`, `MAX_PROFILE_PHOTO_SIZE_BYTES`, `MAX_ATTACHMENT_SIZE_BYTES`, `ALLOWED_PHOTO_TYPES`, `ALLOWED_PHOTO_EXTENSIONS`).
   - **The Risk:** Route handlers hardcode equivalent values (`expiresIn: 900`, `expiresIn: 3600` at `messages.ts:98,275,333`, `profile.ts:341`, `drafts.ts:171`) instead of consuming the named constants — limits are scattered and inconsistent.

6. **[Hygiene]** `backend/lambdas/api/src/lib/validation.ts:39,67,90`, `lib/user.ts:126`, `repositories/comment-repository.ts:21` (knip)
   - **The Debt:** 27 unused exports including `validateCommentId`, `sanitizeContent`, `validateEmail`, `getProfile` (function), and an entire `CommentRepository` class.
   - **The Risk:** `CommentRepository` being unused while `messaging-repository` is used signals an abandoned refactor — comment routes still hit DynamoDB directly, contradicting the documented "repository pattern".

7. **[Hygiene]** `backend/lambdas/api/src/types/index.ts:72-189`
   - **The Debt:** 24 unused exported types/interfaces (`Conversation`, `Message`, `Reaction`, `Letter`, `Draft`, `ParsedLetterData`, `RateLimitRecord`, `ApiResponse`, `RouteHandler`, `PrefixKey`, `PrefixValue`, etc.).
   - **The Risk:** Type definitions duplicated/inlined elsewhere (e.g., `MessageRecord` interface re-declared in `messaging-repository.ts:53`). Source-of-truth ambiguity for domain types.

8. **[Hygiene]** `package.json` (npm audit)
   - **The Debt:** 1 high vulnerability — `vite` in range affected by `GHSA-p9ff-h696-f583`, `GHSA-4w7w-66w2-5vf9`, `GHSA-v2wj-q39q-566r` (dev server arbitrary file read, path traversal, fs.deny bypass).
   - **The Risk:** Dev-only impact, but the most recent commit was `fix(deps): resolve all 17 npm audit vulnerabilities` — regression since then.

#### LOW

1. **[Hygiene]** `frontend/lib/config/general.ts:54,56,62,72,82` — 5 unused exports (`head`, `header`, `footer`, `date`, `feed`).
2. **[Hygiene]** `frontend/lib/auth/middleware.ts:16,47,72,85` — 4 unused auth helpers (`requireApprovedUser`, `getAuthenticatedUser`, `getOptionalUser`, `isAuthenticated`); suggests middleware pattern was abandoned in favor of stores.
3. **[Hygiene]** Multiple test files import unused symbols (`@aws-sdk/lib-dynamodb`, `aws-lambda` types) per knip.
4. **[Hygiene]** `backend/lambdas/notification-processor/package.json` & `activity-aggregator/package.json` — knip reports `index.js` entry not found; package metadata out of sync with actual `.ts` entry.
5. **[Hygiene]** `backend/lambdas/letter-processor/src/index.ts:197,219` — `console.error` instead of structured `log` used elsewhere in the API lambda.
6. **[Hygiene]** `backend/lambdas/api/src/index.ts:106` and `routes/profile.ts:43` — `replace(/^\/v1/, '')` duplicated; version-strip logic not centralized.

### QUICK WINS
1. `frontend/routes/gallery/+page.svelte:9-13` — fix indent inconsistency on `Head`/`filterResultsByCategory` imports (effort: < 5 min).
2. `backend/lambdas/api/src/lib/constants.ts:19-86` — delete 8 unused exports OR wire them into the 5 hardcoded `expiresIn`/photo-validation sites (effort: < 1 hour).
3. `backend/lambdas/api/src/repositories/comment-repository.ts:21` — delete dead `CommentRepository` class or migrate `comments` route to use it (effort: < 1 hour for delete).
4. `backend/lambdas/api/src/index.ts:127-138` — short-circuit `ensureProfile` for warm invocations using a module-level `Set<string>` cache (effort: < 30 min).
5. `package.json` — bump `vite` to a patched version (effort: < 15 min).
6. `backend/lambdas/api/src/types/index.ts` — delete the 24 unused type exports (effort: < 30 min).

### AUTOMATED SCAN RESULTS
- **npm audit**: 1 high (`vite` — three advisories: arbitrary file read, path traversal, fs.deny bypass). 0 critical/moderate/low.
- **knip**: 27 unused exports, 24 unused exported types, 1 unlisted binary (`svelte-kit` in CI), 4 config hints, multiple unused test imports.
- **Secrets scan**: `.env` is gitignored, `.env.example` present (no secrets observed in tracked files reviewed).
- **Git hygiene**: Clean main, conventional commits, recent dependency hygiene work — but the new vite finding is a regression since `5fac6a8 fix(deps): resolve all 17 npm audit vulnerabilities`.
- **Vulture/pip-audit**: Not run — Python footprint is limited to 3 CloudFormation custom resources without a tracked `requirements.txt`.
