---
type: repo-eval
date: 2026-04-07
role_level: Senior Developer
pillar_overrides: none
---

# Repo Evaluation — Family Archive Document AI

Three evaluators (Pragmatist, Oncall Engineer, Team Lead) scored 12 pillars against a Senior Developer bar.

## HIRE EVALUATION — The Pragmatist

### VERDICT
- **Decision:** HIRE
- **Grade:** A-
- **One-Line:** Senior-grade backend with thoughtful router/middleware/repository layering, real defensive coding, and broad test coverage; held back by partial migration leaving legacy `handle()` dispatchers alongside the new declarative router.

### SCORECARD
| Pillar | Score | Evidence |
|---|---|---|
| Problem-Solution Fit | 8/10 | `backend/template.yaml` + `backend/lambdas/api/src/index.ts:26-83` (single Lambda + declarative router right-sized for a family archive); `letter-processor/src/index.ts:30-157` (resource limits matched to use case) |
| Architecture | 8/10 | `lib/router.ts:35-141` (clean Express-like router w/ middleware chains); `repositories/base-repository.ts:49-258` (real repo pattern w/ pagination cursor PK validation 196-213); `lib/middleware.ts:15-82`. Drag: routes still funnel through legacy `comments.handle` switch in `routes/comments.ts:28-65` |
| Code Quality | 8/10 | `lib/errors.ts:11-208` (typed AppError hierarchy + bullet-proof `toError`); `lib/rate-limit.ts:36-188` (atomic ADD with conditional PUT race recovery); `letter-processor/src/index.ts:64-157` (env validation, caps, error-status persisted without masking original throw 196-224); 25 test files |
| Creativity | 7/10 | `lib/router.ts:35-45` (compile `{param}` → regex); `repositories/base-repository.ts:202-211` (cursor PK-mismatch rejection — defense against cross-tenant pagination tampering); `rate-limit.ts:93-178` (3-stage race resolution) |

### HIGHLIGHTS
**Brilliance:**
- Pagination cursor partition-key binding (`base-repository.ts:202-211`) prevents a real auth-bypass class.
- Rate limiter race handling (`rate-limit.ts:93-178`).
- `toError` (`errors.ts:119-162`) properly handles `unknown` throws.
- Letter processor fails fast on env, enforces 20 files / 10 MB / 50 MB caps, persists ERROR draft without swallowing original error.

**Concerns:**
- Migration debt: `routes/comments.ts:28-65` and `profile.ts`/`letters.ts`/`drafts.ts` still re-dispatch on method+resource.
- Auth bypass surface: comments/profile/letters/drafts/media routes registered without `requireAuth()` middleware in `index.ts:28-73`.
- `getMessages` in `routes/messages.ts:83-118` batches presigned URLs serially.
- String-sniffing error handling (`messages.ts:55-58`) instead of `instanceof ValidationError`.

### REMEDIATION TARGETS

**Architecture → 9/10**
- Convert `routes/comments.ts`, `profile.ts`, `letters.ts`, `drafts.ts`, `media.ts` to per-verb exports like `routes/messages.ts`; delete `handle()` dispatchers.
- Move all auth into router middleware (`index.ts:28-73`); make `requireAuth()` the default.
- 9/10 looks like: zero `event.resource`/`event.httpMethod` switches inside route files.
- Complexity: M (1–2 days incl. tests).

**Code Quality → 9/10**
- Replace string-match error handling with `instanceof ValidationError`.
- Parallelize `getMessages` URL signing fully or cache per-sender photo URLs.
- Add `requireAuth()`-by-default convention so handlers stop re-checking `requesterId`.
- Complexity: S (~half day).

**Creativity → 9/10**
- Add OpenAPI/Zod schema generation off the router.
- Consider DynamoDB TransactWrite for the rate-limit reset path.
- Complexity: M.

---

## STRESS EVALUATION — The Oncall Engineer

### VERDICT
- **Decision:** SENIOR HIRE
- **Seniority Alignment:** Meets bar for Senior. Demonstrates production reflexes (atomic rate limiting, fail-closed CORS, pagination key validation, GSI backfill via read-repair, resource caps in letter processor). A few hot-path traps prevent INSTANT LEAD.
- **One-Line:** Code that lets you sleep through most nights, but a few latency cliffs and N+1 DynamoDB calls will eventually wake you.

### SCORECARD
| Pillar | Score | Evidence |
|---|---|---|
| Pragmatism | 8/10 | Declarative router with middleware (`api/src/lib/router.ts:47`), repository pattern (`repositories/messaging-repository.ts:73`). Rate-limit retry-on-retry-on-fail-open ladder (`lib/rate-limit.ts:124`) is over-engineered. |
| Defensiveness | 8/10 | Fail-closed CORS (`lib/responses.ts:13`), validatePaginationKey enforces PK prefix (`lib/validation.ts:204`), letter processor enforces caps (`letter-processor/src/index.ts:30`). Concerns: `userId!` non-null assertions in `routes/messages.ts:37,75,163`; error string-matching for control flow (`messages.ts:56,128,476`). |
| Performance | 6/10 | `ensureProfile` runs DDB Get on EVERY request (`index.ts:127`); `getMessages` does N+1 S3 presign per attachment + per-message sender photo (`routes/messages.ts:87-118`); `updateConversationMembers` unbounded `Promise.all` fanout (`messaging-repository.ts:412`); `deleteConversationData` accumulates all message keys in memory (`messaging-repository.ts:322`); rate limiter does 3 sequential DDB calls (`rate-limit.ts:124-175`). |
| Type Rigor | 7/10 | Almost no `any`. Good typed errors. But `getMessages` returns `Record<string, unknown>[]` (`messaging-repository.ts:149`) forcing casts; `(error as Error).message` in `letter-processor/src/index.ts:211` instead of `toError()`; `event.pathParameters` mutation in router (`router.ts:104`). |

### CRITICAL FAILURE POINTS
1. `backend/lambdas/api/src/index.ts:127` — `ensureProfile()` runs on every authenticated request before any auth check. Multiplies DDB RCU and adds p50 latency to every endpoint.
2. `backend/lambdas/api/src/routes/messages.ts:87-118` — N+1 presigned URL generation. 50 messages × 2 attachments = 150 sign ops per request. Presigning is CPU-bound.
3. `backend/lambdas/api/src/repositories/messaging-repository.ts:312-343` — `deleteConversationData` accumulates all message keys in memory. Long-lived group chat = OOM and 15-min Lambda timeout.
4. `backend/lambdas/api/src/index.ts:29-50` — Several routes (comments, letters, profile, reactions, media) have no `requireAuth()` middleware on the router. `userId!` assertions will produce 500s instead of 401s if a code path slips.
5. `backend/lambdas/api/src/lib/rate-limit.ts:124-175` — Triple-nested DDB call ladder on contention. Latency for the rate limiter can exceed the action being rate-limited.
6. `backend/lambdas/letter-processor/src/index.ts:114` — Sequential `for` loop over S3 GetObject downloads. Up to 20 files × network RTT before merge begins.

### HIGHLIGHTS
**Brilliance:**
- `lib/responses.ts:13` — CORS fails closed in production with explicit env-only configuration.
- `lib/validation.ts:174` — Pagination key validation enforces PK prefix, blocking IDOR via crafted cursors.
- `lib/rate-limit.ts:36` — Atomic `ADD` with conditional window check.
- `letter-processor/src/index.ts:30` — Hard caps with clear user-facing messages.
- `letter-processor/src/index.ts:217` — Wraps the error-status write so the failure logger never masks the real exception.

**Concerns:**
- Logger uses `console.log` (`lib/logger.ts:76,81`) — no debug sampling.
- `gsi1VerifiedUsers` in-memory Set (`lib/user.ts:12`) — invisible memory growth across warm Lambda lifetime; no eviction.
- Error control-flow via `error.message.includes('pagination')` (`messages.ts:56`).

### REMEDIATION TARGETS
- **Pragmatism (8):** Collapse rate-limit retry ladder to one attempt, fail open. Replace string-match error routing with typed errors.
- **Defensiveness (8):** Move `requireAuth()` to default middleware; whitelist exceptions. Stop using `userId!`. Cap `gsi1VerifiedUsers` Set or use TTL.
- **Performance (6):** (a) Make `ensureProfile` lazy / opt-in per route; (b) batch presign or shift to long-lived CloudFront signed cookies; (c) chunk-delete in `deleteConversationData`; (d) cap `Promise.all` fanout in `updateConversationMembers`; (e) parallelize S3 downloads in letter-processor with concurrency 5.
- **Type Rigor (7):** Type messages query result so `routes/messages.ts` doesn't need field-by-field casts. Replace `(error as Error)` with `toError()`.

---

## DAY 2 EVALUATION — The Team Lead

### VERDICT
- **Decision:** TEAM LEAD MATERIAL
- **Collaboration Score:** High
- **One-Line:** Onboarding-ready codebase with strong test coverage, lockfiles, declarative CI, and a clean repository pattern — a junior could open a PR within their first week.

### SCORECARD
| Pillar | Score | Evidence |
|---|---|---|
| Test Value | 8/10 | 25 unit specs (`tests/unit/router.test.ts`, `messaging-repository.test.ts`); integration suite (`tests/integration/comments.test.js`); Playwright E2E (`tests/e2e/messages.spec.ts`); Artillery load (`tests/load/comments-load.yml`). Mocks isolated under `tests/unit/__mocks__/`. Pyramid healthy (~25 unit / 4 integration / 3 e2e). Drag: integration suite small relative to API surface. |
| Reproducibility | 9/10 | `package-lock.json` (926KB) committed at root; `.nvmrc` pins Node; `.env.example` documents every public var (`/.env.example:20-50`); CI uses `npm ci` with Node 24 (`.github/workflows/ci.yml:64-70`); SAM template centralizes backend. No Docker, but stack is serverless. |
| Git Hygiene | 9/10 | 583 commits, conventional-commit style: `feat(api): extract MessagingRepository`, `refactor(api): replace if/else dispatch with declarative Router`. `.commitlintrc.json` + Husky enforce it. Story arc visible. Mild drag: heavy `chore: sync skills` noise from claude-forge automation. |
| Onboarding | 9/10 | 202-line `README.md`; 376-line `docs/DEVELOPMENT.md`; topic docs (`API_REFERENCE.md`, `DATA_MODEL.md`, `AUTHENTICATION.md`, `TROUBLESHOOTING.md`, `FRONTEND.md`); `CLAUDE.md` is essentially a CONTRIBUTING/architecture primer. Missing: explicit `CONTRIBUTING.md` and a Makefile. |

### RED FLAGS
- `.env` is present in the working tree — verify it's gitignored and free of secrets; risk of accidental commit.
- Author concentration: ~88% of commits from a single human author + Claude — bus factor of 1.
- `tests/integration/` only covers 4 routes; new endpoints could be merged with only unit coverage.
- README points to a hardcoded public S3 CloudFormation template URL (`README.md:46`) — drift risk.

### HIGHLIGHTS
- **Process Win:** Declarative router refactor arc is textbook (`9129c69` → `8642933`). CI has path filters, concurrency cancel, and timeouts (`.github/workflows/ci.yml:17-19, 27`).
- **Maintenance Drag:** Recent history dominated by `chore: sync skills`/dependabot churn (5 of last 10 commits).

### REMEDIATION TARGETS
- **Test Value (8/10):** expand `tests/integration/` to cover letters, media, reactions, drafts routes; add a smoke E2E for the letter upload → Gemini parse pipeline; document the `aws-sdk-client-mock` pattern in a `tests/README.md`.
