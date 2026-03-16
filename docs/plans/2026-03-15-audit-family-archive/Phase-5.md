# Phase 5 — [DOC-ENGINEER] Documentation Remediation

## Phase Goal

Fix all documentation drift, fill gaps, remove stale content, correct code examples, and document missing environment variables. This phase addresses all 37 findings from the documentation audit.

**Success criteria:**
- All 14 drift findings are corrected (docs match code)
- All 5 gap findings are addressed (undocumented code gets documented)
- All 3 stale findings are corrected or removed
- All 4 stale code examples are updated
- All 8 config drift items are addressed
- All 3 structure issues are resolved
- `CLAUDE.md` key prefixes list is complete

**Estimated tokens:** ~15,000

## Prerequisites

- Phase 0 read and understood
- Phase 3 complete (architecture changes may affect docs)
- Phase 4 complete (new tooling to document)
- Read the full doc-audit findings at `docs/plans/2026-03-15-audit-family-archive/doc-audit.md`

---

## Tasks

### Task 1: Fix DATA_MODEL.md Drift and Contradictions

**Goal:** The DATA_MODEL.md has internal contradictions between its Key Patterns table and Entity Schema section. The Key Patterns table is correct (matches code). Fix the Entity Schema section to match.

**Audit references:** Doc audit drift #1, #2, #3, #4.

**Files to Modify:**
- `docs/DATA_MODEL.md`

**Prerequisites:** None.

**Implementation Steps:**

Fix these specific contradictions:

1. **Drift #1 (line 18 vs ~200):** If there is a later section that says Letter SK = `METADATA`, change it to `CURRENT`. The Key Patterns table (line 18) already correctly says `CURRENT`, matching `keys.ts:77`.

2. **Drift #2 (lines 110-111):** In the Entity Schema section for Comments, fix GSI1PK. The doc says `GSI1PK: string // USER#{userId}#COMMENT#{itemId}`. Change to:
   - `GSI1PK: USER#{userId}`
   - `GSI1SK: COMMENT#{timestamp}`
   This matches the Key Patterns table and `comment-repository.ts:150`.

3. **Drift #3 (line 14 Entity Schema):** If Entity Schema says GSI1SK = `{timestamp}#{commentId}`, change to `COMMENT#{timestamp}` to match the Key Patterns table.

4. **Drift #4 (lines 129-141):** In the Entity Schema section for Reactions, fix:
   - Change `PK: REACTION#{commentId}` to `PK: COMMENT#{itemId}`
   - Change `SK: {userId}` to `SK: REACTION#{commentId}#{userId}`
   This matches `keys.ts:43` and the Key Patterns table.

**General approach:** The Key Patterns table at the top of the file is the source of truth (it matches code). Make the Entity Schema section consistent with it. If in doubt, verify against `backend/lambdas/api/src/lib/keys.ts`.

**Verification Checklist:**
- [x] No contradictions between Key Patterns table and Entity Schema section
- [x] Letter SK is `CURRENT` everywhere
- [x] Comment GSI1 keys match Key Patterns table
- [x] Reaction PK/SK match Key Patterns table

**Commit Message Template:**
```text
docs(data-model): fix entity schema contradictions with key patterns table

- Letter SK: METADATA → CURRENT
- Comment GSI1PK: remove itemId suffix
- Reaction PK/SK: align with COMMENT#{itemId}/REACTION#{commentId}#{userId}
```

---

### Task 2: Fix API_REFERENCE.md Drift

**Goal:** The API reference has multiple response format mismatches with the actual code.

**Audit references:** Doc audit drift #5, #6, #7, #8, #9, #10, #14.

**Files to Modify:**
- `docs/API_REFERENCE.md`

**Prerequisites:** None.

**Implementation Steps:**

Fix each drift item by checking the corresponding route handler code:

1. **Drift #5 (line 26-38):** GET /comments/{itemId} response. Change `"items"` to `"comments"` and add `"count"` field:
   ```json
   {
     "comments": [...],
     "lastEvaluatedKey": "string|null",
     "count": "number"
   }
   ```

2. **Drift #6 (line 27-36):** Comment entity fields. Change:
   - `"userId"` → `"authorId"`
   - Remove `"userName"` and `"userPhotoUrl"` (not in the Comment type)
   - Remove `"reactionCount"` (not in base comment response)
   - Add `"authorEmail"` if present in the Comment type
   Verify by checking `backend/lambdas/api/src/types/` for the Comment interface.

3. **Drift #7 (line 92):** DELETE /comments/{commentId} response. Change `{ "message": "Comment deleted" }` to `{ "success": true }`.

4. **Drift #8 (line 106):** DELETE /admin/comments/{commentId} response. Same fix: `{ "success": true }`.

5. **Drift #9 (line 53):** POST /comments/{itemId} body. Remove `itemType` and `itemTitle` from the documented request body — code only parses `content`.

6. **Drift #10 (line 21):** MAX_COMMENT_LENGTH. The doc says `1-10000 chars` which matches the code validation (`comments.ts:133`), but note that `MAX_COMMENT_LENGTH` in constants.ts is 5000. Check which is actually enforced. If code checks 10000, doc is correct. If code checks `MAX_COMMENT_LENGTH` (5000), update doc.

7. **Drift #14 (lines 588-603):** GET /admin/drafts auth. Change `Auth: Admins only` to `Auth: ApprovedUsers or Admins` (matching `index.ts:118-121`).

**Verification Checklist:**
- [x] GET /comments response uses `"comments"` key (not `"items"`)
- [x] Comment entity uses `"authorId"` (not `"userId"`)
- [x] DELETE responses show `{ "success": true }`
- [x] POST body only documents `content` field
- [x] Admin drafts auth is correctly documented
- [x] Comment length limit matches actual code enforcement

**Commit Message Template:**
```text
docs(api-reference): fix response format and field name drift

- Comments response key: items → comments
- Comment entity: userId → authorId
- Delete responses: message → success: true
- Admin drafts auth: Admins only → ApprovedUsers or Admins
```

---

### Task 3: Fix ARCHITECTURE.md and CLAUDE.md Drift

**Goal:** Update architecture docs to match actual routing and key prefixes.

**Audit references:** Doc audit drift #11, #12.

**Files to Modify:**
- `docs/ARCHITECTURE.md` — Add missing media route paths
- `CLAUDE.md` — Add missing key prefixes

**Prerequisites:** None.

**Implementation Steps:**

1. **Drift #11:** In `docs/ARCHITECTURE.md` (around line 113), update the media routing to include all paths:
   ```
   /media/* -> media.handle()
   /pdf/* -> media.handle()
   /download/* -> media.handle()
   /upload/* -> media.handle()
   ```

2. **Drift #12:** In `CLAUDE.md`, update the key prefixes list to include `RATE#` and `VERSION#`:
   ```
   Key prefixes: `USER#`, `COMMENT#`, `CONV#`, `MSG#`, `REACTION#`, `LETTER#`, `DRAFT#`, `RATE#`, `VERSION#`
   ```

**Verification Checklist:**
- [x] ARCHITECTURE.md shows all 4 media route paths
- [x] CLAUDE.md lists all 9 key prefixes

**Commit Message Template:**
```text
docs: update architecture routing and CLAUDE.md key prefixes

- Add /pdf, /download, /upload to media routing docs
- Add RATE# and VERSION# to key prefix list
```

---

### Task 4: Fix DEVELOPMENT.md CI Trigger Drift

**Goal:** The development docs say CI runs on push/PR to main only. It actually runs on both main and develop.

**Audit references:** Doc audit drift #13.

**Files to Modify:**
- `docs/DEVELOPMENT.md` — Fix CI trigger description

**Prerequisites:** None.

**Implementation Steps:**
1. Find the CI trigger description (around line 305).
2. Change "GitHub Actions runs on push/PR to main" to "GitHub Actions runs on push/PR to main and develop".

**Verification Checklist:**
- [x] DEVELOPMENT.md correctly states CI triggers on main AND develop

**Commit Message Template:**
```text
docs(development): fix CI trigger branch description

- Add develop branch to CI trigger documentation
```

---

### Task 5: Document Missing Components and Routes

**Goal:** Fill documentation gaps for undocumented Lambda functions and frontend routes.

**Audit references:** Doc audit gaps #1, #2, #3, #5.

**Files to Modify:**
- `docs/ARCHITECTURE.md` — Add Python Lambda descriptions
- `docs/FRONTEND.md` — Add missing route entries
- `CLAUDE.md` — Add Python Lambda mentions

**Prerequisites:** None.

**Implementation Steps:**

1. **Gap #1, #2, #3:** Add a "Utility Lambdas" section to `docs/ARCHITECTURE.md` (or the appropriate section) listing:
   - `admin-provisioner/index.py` — Python Lambda for admin provisioning
   - `amplify-deployer/index.py` — Python Lambda for Amplify deployment
   - `frontend-builder/index.py` — Python Lambda for frontend build automation

   Keep descriptions brief — just name, language, and purpose.

2. **Gap #5:** Add missing frontend routes to `docs/FRONTEND.md` route table (around line 329-339):
   - `/family` — Family page
   - `/dashboard` — Dashboard
   - `/auth-status` — Auth status check
   - `/auth/pending-approval` — Pending approval page
   - `/auth/logout` — Logout
   - `/letters/upload` — Letter upload
   - `/letters/drafts` — Draft listing
   - `/letters/drafts/[id]` — Draft detail
   - `/messages/new` — New message
   - `/admin` — Admin panel

   Verify each route exists by checking `frontend/routes/` directory.

3. In `CLAUDE.md`, add the Python Lambdas to the backend structure if not already listed.

**Verification Checklist:**
- [x] All 3 Python Lambdas appear in architecture docs
- [x] All missing frontend routes are documented in FRONTEND.md
- [x] CLAUDE.md backend structure includes utility Lambdas

**Commit Message Template:**
```text
docs: document Python utility Lambdas and missing frontend routes

- Add admin-provisioner, amplify-deployer, frontend-builder to architecture
- Add 10 missing frontend routes to FRONTEND.md route table
```

---

### Task 6: Remove or Fix Stale Documentation

**Goal:** Fix docs that reference code or features that no longer exist.

**Audit references:** Doc audit stale #1, #2, #3.

**Files to Modify:**
- `docs/FRONTEND.md` — Remove or annotate stale `auth/signup/` route
- `CLAUDE.md` — Clarify repository status
- `docs/TROUBLESHOOTING.md` — Remove reference to non-existent `SKIP_VALIDATION`

**Prerequisites:** None.

**Implementation Steps:**

1. **Stale #1:** In `docs/FRONTEND.md` (line 28), either:
   - Remove the `auth/signup/` route entry, or
   - Add a note: "Signup is handled via Cognito Hosted UI — no dedicated frontend route"

2. **Stale #2:** In `CLAUDE.md`, the `repositories/` entry under `api/src/` is not stale per se — `base-repository.ts`, `comment-repository.ts`, and `index.ts` exist. But the implication of a "full set" is misleading. Clarify:
   ```
   ├── repositories/      # DynamoDB data access (comment-repository; others TBD)
   ```

3. **Stale #3:** In `docs/TROUBLESHOOTING.md` (around line 297), remove the reference to `SKIP_VALIDATION=true` environment variable. No such variable exists in the codebase.

**Verification Checklist:**
- [x] `auth/signup/` is removed or annotated in FRONTEND.md
- [x] Repository listing in CLAUDE.md is accurate
- [x] SKIP_VALIDATION reference is removed from TROUBLESHOOTING.md

**Commit Message Template:**
```text
docs: remove stale references and clarify repository status

- Remove non-existent auth/signup route
- Clarify repositories/ only contains comment-repository
- Remove SKIP_VALIDATION env var reference
```

---

### Task 7: Fix Stale Code Examples

**Goal:** Update code examples in documentation that no longer match the actual implementation.

**Audit references:** Doc audit stale code examples #1, #2, #3, #4.

**Files to Modify:**
- `docs/AUTHENTICATION.md` — Fix login code example and API request example
- `docs/FRONTEND.md` — Fix comment component example
- `docs/TROUBLESHOOTING.md` — Fix config validation description

**Prerequisites:** None.

**Implementation Steps:**

1. **Stale example #1 (AUTHENTICATION.md lines 152-169):** The login code example shows direct SDK usage. Check `frontend/lib/auth/client.ts` for the actual auth flow and update the example to match, or replace with a simplified version that shows the correct import paths and API.

2. **Stale example #2 (AUTHENTICATION.md lines 196-208):** Remove reference to `lib/services/api.ts` which does not exist. Update to reference the actual service pattern (individual service files like `comment-service.ts`, `profile-service.ts`).

3. **Stale example #3 (FRONTEND.md lines 210-222):** Check the actual comment component interface and update the example. Verify the exported props in the actual Svelte component.

4. **Stale example #4 (TROUBLESHOOTING.md lines 260-266):** Fix the config validation description:
   - Update line references to match actual code (`config.ts:36-59` and `65-91`)
   - Remove claim that "GEMINI_API_KEY must start with 'AIza'" — no such prefix check exists

**Verification Checklist:**
- [x] AUTHENTICATION.md login example matches actual auth flow
- [x] AUTHENTICATION.md API example references correct service file paths
- [x] FRONTEND.md comment component example matches actual props
- [x] TROUBLESHOOTING.md config validation description matches code

**Commit Message Template:**
```text
docs: update stale code examples to match current implementation

- Fix auth flow example in AUTHENTICATION.md
- Fix service import paths in AUTHENTICATION.md
- Update comment component example in FRONTEND.md
- Correct config validation description in TROUBLESHOOTING.md
```

---

### Task 8: Document Backend Environment Variables

**Goal:** The config drift findings show 8 backend environment variables that are not documented in `.env.example`. Since backend env vars are configured via SAM template, add documentation clarifying this and listing all backend env vars.

**Audit references:** Doc audit config drift #1-#8, structure issue #1.

**Files to Modify:**
- `.env.example` — Add a comment section for backend vars (reference only)
- `docs/DEPLOYMENT.md` or `docs/DEVELOPMENT.md` — Add backend env var reference table

**Prerequisites:** None.

**Implementation Steps:**

1. The root `.env.example` is for frontend variables only (all `PUBLIC_*`). Backend env vars are set via `backend/template.yaml` SAM parameters. Do NOT add backend vars to `.env.example` as actual values — instead, add a comment block:
   ```
   # Backend Lambda Environment Variables
   # These are configured via backend/template.yaml SAM parameters.
   # See docs/DEPLOYMENT.md for the full list.
   # They are NOT needed in this .env file.
   ```

2. In `docs/DEPLOYMENT.md` (or `docs/DEVELOPMENT.md`, whichever has the environment config section), add a table of backend Lambda environment variables:

   | Variable | Lambda(s) | Description |
   |----------|-----------|-------------|
   | `TABLE_NAME` | API, activity-aggregator | DynamoDB table name |
   | `ARCHIVE_BUCKET` | API | S3 bucket for letters, media, profile photos |
   | `USER_PROFILES_TABLE` | activity-aggregator | DynamoDB profiles table (legacy) |
   | `SES_FROM_EMAIL` | notification-processor, contact | SES sender email |
   | `ADMIN_EMAIL` | contact | Admin notification email |
   | `BASE_URL` | notification-processor | App base URL for email links |
   | `LOG_LEVEL` | API | Logging level (default: info) |
   | `LETTER_PROCESSOR_FUNCTION_NAME` | API (drafts) | Lambda function name for letter processing |
   | `RAGSTACK_BUCKET` | API (media, letters) | RAGStack S3 bucket |
   | `RAGSTACK_REGION` | API (media, letters) | RAGStack S3 region |
   | `GEMINI_MODEL` | letter-processor | Gemini model name (default: gemini-3.1-flash-lite-preview) |
   | `ALLOWED_ORIGINS` | API | CORS allowed origins (comma-separated) |

3. **Structure issue #1:** The README says `cd frontend && cp .env.example .env` but `frontend/.env.example` does not exist. Fix by either:
   - Creating a `frontend/.env.example` as a symlink or copy of the root `.env.example`, OR
   - Updating README.md to say `cp .env.example frontend/.env` (copy from root to frontend)

   Check which approach CI uses — `ci.yml:32` does `cp .env.example frontend/.env`, so update README to match.

**Verification Checklist:**
- [x] `.env.example` has comment block about backend vars
- [x] Backend env var table exists in deployment/development docs
- [x] README setup instructions match CI setup (`cp .env.example frontend/.env`)

**Commit Message Template:**
```text
docs: document backend environment variables and fix .env setup instructions

- Add backend env var reference table to deployment docs
- Add clarifying comment to .env.example
- Fix README setup to match CI: cp .env.example frontend/.env
```

---

## Phase Verification

1. Read through each modified doc file and verify it matches the current code
2. Check all cross-references between docs still work
3. Verify `CLAUDE.md` is accurate and complete
4. Verify `.env.example` comment is clear and non-misleading
5. Run `npm run build` to verify no changes broke the frontend (docs changes shouldn't, but verify)

**Known limitations:**
- Some doc examples may need further refinement once the actual component interfaces are checked. The instructions say "check the actual code" — the implementer must verify.
- The legacy JS file documentation gap (doc audit gap #4) is resolved by Phase 1's deletion of those files.
- Backend env vars are documented as a reference table, not as a `.env` template, because they are managed by SAM.
