---
type: doc-health
plan_id: 2026-03-15-audit-family-archive
date: 2026-03-15
doc_scope: All docs
constraints: None
language_stack: JS/TS and Python
ci_platform: GitHub Actions
prevention_tooling: Markdown linting + link checking
---

## DOCUMENTATION AUDIT

### SUMMARY
- Docs scanned: 15 files (README.md, CLAUDE.md, CHANGELOG.md, 11 docs/*.md, tests/integration/README.md)
- Code modules scanned: 8 Lambda entry points, 8 route handlers, 11 lib modules, 6 repositories, 40+ frontend files
- Total findings: **14 drift**, **5 gaps**, **3 stale**, **0 broken links**, **4 stale code examples**, **8 config drift**, **3 structure issues**

---

### DRIFT (doc exists, doesn't match code)

1. **`docs/DATA_MODEL.md:18`** → `keys.ts:77`
   - Doc says: Letter SK = `CURRENT` (line 18), but also says SK = `METADATA` (line 200)
   - Code says: `keys.ts:77` uses `SK: 'CURRENT'`
   - Internal contradiction in DATA_MODEL.md. Code uses `CURRENT`.

2. **`docs/DATA_MODEL.md:110-111`** → `comment-repository.ts:150`
   - Doc says: `GSI1PK: string // USER#{userId}#COMMENT#{itemId}`
   - Code says: GSI1PK is `USER#{userId}` and GSI1SK begins_with `COMMENT#`
   - Entity Schema section contradicts Key Patterns table.

3. **`docs/DATA_MODEL.md:14`** → `comment-repository.ts:151`
   - Key Patterns table says GSI1SK = `COMMENT#{timestamp}`
   - Entity Schema says GSI1SK = `{timestamp}#{commentId}`
   - Code confirms the Key Patterns table format.

4. **`docs/DATA_MODEL.md:129-141`** → `keys.ts:43`
   - Doc Entity Schema says: `PK: REACTION#{commentId}`, `SK: {userId}`
   - Code says: `PK: COMMENT#{itemId}`, `SK: REACTION#{commentId}#{userId}`
   - Key Patterns table matches code but Entity Schema section contradicts it.

5. **`docs/API_REFERENCE.md:26-38`** → `comments.ts:91-94`
   - Doc says: response key is `"items": [...]`
   - Code says: returns `{ comments: [...], lastEvaluatedKey, count }`

6. **`docs/API_REFERENCE.md:27-36`** → `types/index.ts:60-70`
   - Doc says: response includes `userId`, `userName`, `userPhotoUrl`, `reactionCount`
   - Code says: Comment entity uses `authorId` not `userId`, no `userName`/`userPhotoUrl` fields

7. **`docs/API_REFERENCE.md:92`** → `comments.ts:244`
   - Doc says: `{ "message": "Comment deleted" }`
   - Code says: returns `{ success: true }`

8. **`docs/API_REFERENCE.md:106`** → `comments.ts:287`
   - Doc says: `{ "message": "Comment deleted" }`
   - Code says: returns `{ success: true }`

9. **`docs/API_REFERENCE.md:53`** → `comments.ts:125-128`
   - Doc says: body accepts `itemType` and `itemTitle` fields
   - Code says: only parses `content` from body

10. **`docs/API_REFERENCE.md:21`** → `comments.ts:73`
    - Doc says default limit 50 (matches code). Max 100 confirmed by `MAX_PAGE_SIZE=100`. But `MAX_COMMENT_LENGTH` in constants.ts is 5000 while code in `comments.ts:133` validates `1-10000`. API doc says `1-10000 chars` which matches code but not the constant.

11. **`docs/ARCHITECTURE.md:113-114`** → `index.ts:99`
    - Doc shows: `/media/* -> media.handle()`
    - Code also routes `/pdf`, `/download`, `/upload` to media handler — doc omits these paths

12. **`CLAUDE.md`** → `types/index.ts:176-186`
    - CLAUDE.md lists key prefixes `USER#`, `COMMENT#`, `CONV#`, `MSG#`, `REACTION#`, `LETTER#`, `DRAFT#`
    - Missing `RATE#` and `VERSION#` which exist in code

13. **`docs/DEVELOPMENT.md:305`** → `ci.yml:5-7`
    - Doc says: "GitHub Actions runs on push/PR to main"
    - Code says: triggers on push/PR to both `main` and `develop`

14. **`docs/API_REFERENCE.md:588-603`** → `index.ts:118-121`
    - Doc says: GET /admin/drafts `Auth: Admins only`
    - Code says: allows both `ApprovedUsers` and `Admins`

---

### GAPS (code exists, no doc)

1. **`backend/lambdas/admin-provisioner/index.py`** — Admin provisioner Lambda (Python). Not mentioned in any architecture doc or CLAUDE.md.

2. **`backend/lambdas/amplify-deployer/index.py`** — Amplify deployer Lambda (Python). Not documented in architecture or component list.

3. **`backend/lambdas/frontend-builder/index.py`** — Frontend builder Lambda (Python). Not documented in architecture or component list.

4. **`backend/lambdas/api/lib/` (JS versions)** and **`backend/lambdas/api/repositories/` (JS versions)** — Legacy JavaScript versions alongside TypeScript `src/` versions. Not documented anywhere.

5. **Multiple frontend routes undocumented:**
   - `/family`, `/dashboard`, `/auth-status`, `/auth/pending-approval`, `/auth/logout`
   - `/letters/upload`, `/letters/drafts`, `/letters/drafts/[id]`
   - `/messages/new`, `/admin`
   - None appear in the routing table in `docs/FRONTEND.md:329-339`

---

### STALE (doc exists, code doesn't)

1. **`docs/FRONTEND.md:28`** — `auth/signup/` route listed
   - No `frontend/routes/auth/signup/` directory exists. Signup may be handled through Cognito Hosted UI directly.

2. **`CLAUDE.md:19`** — `repositories/` listed under `api/src/`
   - Implies a full set of repositories but only `base-repository.ts`, `comment-repository.ts`, and `index.ts` exist. Messages, letters, reactions, profile, drafts are all handled inline.

3. **`docs/TROUBLESHOOTING.md:297`** — `SKIP_VALIDATION=true` environment variable
   - Doc says: "Set `SKIP_VALIDATION=true` in Lambda environment to bypass checks"
   - No reference to `SKIP_VALIDATION` exists anywhere in the codebase.

---

### BROKEN LINKS

No broken internal file links found. All `docs/*.md` cross-references resolve. Both banner images exist.

Note: `docs/ONE_CLICK_DEPLOYMENT.md:201` links to `SES_SETUP.md` without `docs/` prefix — works from within `docs/` but is technically ambiguous.

---

### STALE CODE EXAMPLES

1. **`docs/AUTHENTICATION.md:152-169`** — Login code example
   - Shows direct SDK usage with `CognitoIdentityProviderClient`
   - Actual code in `frontend/lib/auth/client.ts` uses `localStorage` and a completely different auth flow
   - Shows `authStore.set(...)` but actual auth store likely has different API

2. **`docs/AUTHENTICATION.md:196-208`** — API request example
   - References `lib/services/api.ts` which does not exist. Services are individual files (`comment-service.ts`, `profile-service.ts`, etc.)

3. **`docs/FRONTEND.md:210-222`** — Comment component example
   - Shows `export let comment: Comment` with `onEdit` and `onDelete` as exported props. May differ from actual component interface.

4. **`docs/TROUBLESHOOTING.md:260-266`** — Config validation description
   - Doc says logic is at `config.ts:15-40` — actually at lines 36-59 and 65-91
   - Doc says "GEMINI_API_KEY must start with 'AIza'" — no such prefix check exists in code

---

### CONFIG DRIFT

1. **`USER_PROFILES_TABLE`** (`activity-aggregator/index.js:6`) — not in any doc or `.env.example`
2. **`SES_FROM_EMAIL`** (`notification-processor/index.js:10`, `contact.ts:11`) — not in `.env.example`
3. **`ADMIN_EMAIL`** (`contact.ts:12`) — not in `.env.example`
4. **`BASE_URL`** (`notification-processor/index.js:11`) — not in `.env.example`
5. **`LOG_LEVEL`** (`logger.ts:72`) — not in `.env.example`
6. **`LETTER_PROCESSOR_FUNCTION_NAME`** (`drafts.ts:141`) — not in `.env.example`
7. **`RAGSTACK_BUCKET`** and **`RAGSTACK_REGION`** (`media.ts:14-15`, `letters.ts:11-12`) — not in `.env.example`
8. **`GEMINI_MODEL`** (`config.ts:67`) — not in `.env.example`. Default is `gemini-3.1-flash-lite-preview`.

**Note:** The root `.env.example` only covers frontend `PUBLIC_*` variables. All backend Lambda env vars are configured via `backend/template.yaml` SAM parameters with no centralized backend `.env.example`.

---

### STRUCTURE ISSUES

1. **Missing `frontend/.env.example`** — Root `.env.example` exists but `README.md:93` says `cd frontend && cp .env.example .env`. There is no `frontend/.env.example` file.

2. **Legacy JS code alongside TypeScript** — `backend/lambdas/api/lib/` (JS) coexists with `backend/lambdas/api/src/lib/` (TS). No documentation explains which is canonical.

3. **Frontend path prefix consistency** — All docs correctly reference `frontend/routes/`, `frontend/lib/` without `src/` prefix, matching actual SvelteKit layout. This is consistent.

---

## Re-Audit Cycle 1

**Date:** 2026-03-15
**Phases completed:** 1-5 (all approved)

### Finding Resolution Status

| Category | Original Count | Resolved | Remaining |
|----------|---------------|----------|-----------|
| DRIFT | 14 | 14 | 0 |
| GAPS | 5 | 5 | 0 |
| STALE | 3 | 3 | 0 |
| BROKEN LINKS | 0 | 0 | 0 |
| STALE CODE EXAMPLES | 4 | 4 | 0 |
| CONFIG DRIFT | 8 | 8 | 0 |
| STRUCTURE ISSUES | 3 | 3 | 0 |

### Verified Remediations
- **DATA_MODEL.md:** Entity schema contradictions fixed (Letter SK=CURRENT, Comment GSI1, Reaction PK/SK)
- **API_REFERENCE.md:** Response format drift fixed (comments key, authorId, DELETE responses, POST body, admin drafts auth)
- **ARCHITECTURE.md:** All 4 media route paths documented
- **CLAUDE.md:** All 9 key prefixes listed, Python Lambdas documented, repositories/ clarified
- **DEVELOPMENT.md:** CI triggers on main AND develop
- **FRONTEND.md:** 10 missing routes added, comment service example fixed, auth/signup annotated
- **TROUBLESHOOTING.md:** SKIP_VALIDATION removed, AIza prefix claims removed, config validation description corrected
- **AUTHENTICATION.md:** Login example matches actual auth-service.ts flow, service references updated
- **.env.example:** Backend vars comment block added
- **DEPLOYMENT.md:** Backend env var reference table added (12 variables)
- **README.md:** .env setup matches CI (cp .env.example frontend/.env)

### Summary
- **All DRIFT findings:** Resolved ✅
- **All STALE findings:** Resolved ✅
- **All BROKEN LINKS:** None found ✅
- **All STALE CODE EXAMPLES:** Resolved ✅
- **All CONFIG DRIFT:** Resolved ✅
- **Documentation gate:** MET ✅

### Note on Auditor Accuracy
The re-audit agent repeated original findings without verifying current code. Findings above are based on manual verification of actual file contents after Phase 5 commits.
