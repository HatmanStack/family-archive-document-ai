# Phase 6 -- [DOC-ENGINEER] Documentation Fixes and Drift Prevention

## Phase Goal

Fix all documentation drift, gaps, and stale references identified in the doc-audit. Update
project-level CLAUDE.md to reflect current state. This phase also updates the Svelte version
references across all docs (Svelte 4 to Svelte 5).

**Success criteria:**

- All 13 drift findings are resolved
- All 4 stale findings are resolved
- Broken line reference in AUTHENTICATION.md is fixed
- Stale code examples are updated
- Config drift items are resolved
- CLAUDE.md at project level reflects current architecture accurately

**Estimated tokens:** ~15,000

## Prerequisites

- All previous phases complete (code changes done before doc updates)
- Access to read all files in `docs/` and project root
- Current Svelte version confirmed: `^5.54.0` in `frontend/package.json`

## Tasks

### Task 1: Fix Svelte version references across all docs

**Goal:** Update all documentation that says "Svelte 4" to say "Svelte 5". This fixes
doc-audit drift finding #1.

**Files to modify:**

- `README.md` -- Update Svelte version reference
- `CLAUDE.md` (project level) -- Update "SvelteKit 2.x + Svelte 4" to "SvelteKit 2.x + Svelte 5"
- `docs/FRONTEND.md` -- Update Svelte version references (lines 3, 10)
- `docs/ARCHITECTURE.md` -- Update Svelte version reference (line 264)

**Prerequisites:** None

**Implementation Steps:**

1. Search all docs for "Svelte 4" references: `grep -rn "Svelte 4" docs/ README.md CLAUDE.md`
1. Replace each occurrence with "Svelte 5".
1. Do NOT change SvelteKit version references -- SvelteKit 2.x is still correct.

**Verification Checklist:**

- [x] Zero "Svelte 4" references in documentation (excluding changelogs and git history)
- [x] SvelteKit version references unchanged
- [x] Matches `frontend/package.json` which has `"svelte": "^5.54.0"`

**Testing Instructions:**

- `grep -rn "Svelte 4" docs/ README.md CLAUDE.md` should return 0 results

**Commit Message Template:**

```text
docs: update Svelte version references from 4 to 5

- All docs now reflect Svelte 5 (matching frontend/package.json ^5.54.0)
```

### Task 2: Fix deployment and infrastructure doc drift

**Goal:** Fix doc-audit findings related to deployment, S3 buckets, CI triggers, and
environment variables.

**Files to modify:**

- `docs/DEPLOYMENT.md` -- Fix S3 bucket description (finding #2), fix npm scripts (finding STALE #3), fix USER_PROFILES_TABLE label (finding #12)
- `docs/DEVELOPMENT.md` -- Fix CI branch reference (finding #6), remove non-existent events/ reference (finding STALE #4), fix nvm version (structure finding #3)

**Prerequisites:** None

**Implementation Steps:**

1. **DEPLOYMENT.md line 132** (finding #2): Change "S3 Buckets - Archive bucket, photo bucket,
   media bucket (must exist before deploy)" to "S3 Bucket - Single `ArchiveBucketResource`
   created automatically by the SAM template. No pre-existing buckets required."

1. **DEPLOYMENT.md line 109** (finding #12): Change `USER_PROFILES_TABLE` description from
   "DynamoDB profiles table (legacy)" to "DynamoDB table name (maps to main table via
   `!Ref TableName`)".

1. **DEPLOYMENT.md lines 229-230** (stale finding #3): Update `npm run check:lint` and
   `npm run check:types` references to match actual root scripts. Read `package.json` scripts
   section to determine the correct commands.

1. **DEVELOPMENT.md lines 305-306** (finding #6): Change "GitHub Actions runs on push/PR to
   main and develop" to "GitHub Actions runs on push/PR to main". Remove `develop` reference.

1. **DEVELOPMENT.md lines 267-270** (stale finding #4): Remove or update the
   `sam local invoke ... -e events/test-event.json` example since no `events/` directory exists.
   Replace with a note that test events can be created manually.

1. **DEVELOPMENT.md line 18** (structure finding #3): Update nvm install URL from
   `v0.39.0` to a current version or use a generic latest URL:
   `https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh`

**Verification Checklist:**

- [ ] S3 bucket description matches `template.yaml` (single bucket, auto-created)
- [ ] USER_PROFILES_TABLE not labeled as "(legacy)"
- [ ] CI docs say "main" only, not "main and develop"
- [ ] No reference to non-existent `events/` directory
- [ ] nvm install URL is current

**Testing Instructions:**

- Read each modified section and verify it matches the codebase.

**Commit Message Template:**

```text
docs: fix deployment and development guide drift

- Correct S3 bucket description (single auto-created bucket)
- Fix CI branch triggers (main only, not develop)
- Remove reference to non-existent events/ directory
- Update nvm install URL to current version
```

### Task 3: Fix authentication doc drift

**Goal:** Fix stale references in AUTHENTICATION.md for Google OAuth attribute mapping
and auth store API.

**Files to modify:**

- `docs/AUTHENTICATION.md` -- Fix attribute mapping (findings #4, #5), fix auth store example (stale code example #2), fix class name (finding #9)

**Prerequisites:** None

**Implementation Steps:**

1. **Line 94,120** (finding #4): Change attribute mapping description from "email, name,
   picture" to "email, name". Remove `picture` from the mapped attributes list.

1. **Line 120** (finding #5): Fix the line reference from "template.yaml:346-359" to the
   correct lines where Google attribute mapping is defined (around line 361-363). Read
   `backend/template.yaml` to find the exact line numbers.

1. **Lines 199-200** (stale code example #2): Update the auth store example to match the
   actual API. Replace the flat token object pattern with the actual store methods:

   ```typescript
   // Setting auth state
   authStore.setAuthenticated(user, tokens)

   // Clearing auth
   authStore.clearAuth()

   // State shape: { isAuthenticated, user, tokens, loading }
   ```

1. **Line 150** (finding #9): Change "AuthService wraps CognitoAuthClient" to use the
   correct import: `cognitoAuth` from `./cognito-client`.

**Verification Checklist:**

- [ ] Attribute mapping lists only `email` and `name` (not `picture`)
- [ ] Line references match actual `template.yaml` line numbers
- [ ] Auth store example uses `setAuthenticated()`, `clearAuth()` methods
- [ ] `CognitoAuthClient` reference replaced with actual import name

**Testing Instructions:**

- Read each modified section and compare with the source code files referenced.

**Commit Message Template:**

```text
docs(auth): fix authentication guide drift

- Correct Google OAuth attribute mapping (email and name only)
- Fix template.yaml line references
- Update auth store API examples to match actual code
```

### Task 4: Fix frontend doc structure gaps

**Goal:** Update FRONTEND.md to reflect the actual frontend structure, including missing
directories and the correct auth file listing.

**Files to modify:**

- `docs/FRONTEND.md` -- Update project structure, auth directory listing, stores listing

**Prerequisites:** None

**Implementation Steps:**

1. **Line 53** (finding #8): Update the auth directory listing to include all 9 files:
   `api-client.ts`, `auth-service.ts`, `auth-store.ts`, `client.ts`, `cognito-client.ts`,
   `cognito-config.ts`, `google-oauth.ts`, `jwt.ts`, `middleware.ts`, and `jwt-decode.ts`
   (added in Phase 1).

1. **Lines 18-79** (finding #10): Update the project structure tree to include `lib/config/`
   and `lib/utils/` directories. Do not exhaustively list every file in these directories --
   just add the directory entries with brief descriptions:

   ```text
   lib/
   ├── auth/          # Authentication (Cognito, JWT, OAuth)
   ├── components/    # Svelte components
   ├── config/        # Site configuration (general, icons, posts)
   ├── services/      # API service modules
   ├── stores/        # Svelte stores for state
   ├── types/         # TypeScript type definitions
   └── utils/         # Utility functions (retry, fetch, dedup)
   ```

1. **Structure finding #1**: Add the stores listing. The actual stores directory has 4 files:
   `messages.ts`, `posts.ts`, `profiles.ts`, `title.ts`. Add a brief mention of each.

1. **Structure finding #2**: Update the CLAUDE.md repositories description to accurately
   reflect that only `base-repository.ts`, `comment-repository.ts`, and `index.ts` exist.
   Other entities use inline DynamoDB operations in route handlers.

**Verification Checklist:**

- [ ] Auth directory listing shows all files (including `jwt-decode.ts` from Phase 1)
- [ ] Project structure includes `config/` and `utils/` directories
- [ ] Stores section lists all 4 store files
- [ ] Repository description is accurate

**Testing Instructions:**

- Compare the updated structure tree with `ls frontend/lib/` output.

**Commit Message Template:**

```text
docs(frontend): update project structure and auth file listing

- Add config/ and utils/ directories to structure tree
- List all auth module files including jwt-decode.ts
- Document all 4 Svelte stores
```

### Task 5: Fix remaining drift and stale references

**Goal:** Clean up the remaining smaller doc findings: tailwind config reference,
SES CloudWatch log group, README auth routes, config drift.

**Files to modify:**

- `docs/TROUBLESHOOTING.md` -- Fix tailwind config reference (finding #7)
- `docs/SES_SETUP.md` -- Fix Lambda log group reference (stale finding #2)
- `README.md` -- Fix auth routes description (stale finding #1)
- `.env.example` or `docs/DEVELOPMENT.md` -- Resolve region inconsistency (config drift #2)

**Prerequisites:** None

**Implementation Steps:**

1. **TROUBLESHOOTING.md line 240** (finding #7): Change `tailwind.config.js` to
   `tailwind.config.ts`.

1. **SES_SETUP.md line 54** (stale finding #2): Change
   `/aws/lambda/{StackName}-ContactFunction` to `/aws/lambda/{StackName}-ApiFunction`.
   Add a note that contact handling is part of the consolidated API Lambda.

1. **README.md line 122** (stale finding #1): Update auth routes from
   "Login, signup, password reset" to "Login, callback, forgot-password, reset-password,
   logout, pending-approval". Remove mention of "signup" route (handled via Cognito Hosted UI).

1. **Config drift #2**: Pick one consistent default region. Since the SAM template and most
   code defaults to `us-west-2`, update `docs/DEVELOPMENT.md:74` and
   `docs/AUTHENTICATION.md:36` to use `us-west-2` to match `.env.example`.

**Verification Checklist:**

- [ ] `tailwind.config.ts` referenced (not `.js`)
- [ ] SES log group references `ApiFunction` (not `ContactFunction`)
- [ ] README auth routes match actual route directories
- [ ] Region references are consistent (`us-west-2`)

**Testing Instructions:**

- Read each modified line and verify against the codebase.

**Commit Message Template:**

```text
docs: fix remaining drift and stale references

- Correct tailwind config filename (.ts not .js)
- Fix SES CloudWatch log group to ApiFunction
- Update README auth routes to match actual routes
- Standardize region references to us-west-2
```

### Task 6: Update project CLAUDE.md

**Goal:** Ensure the project-level CLAUDE.md accurately reflects the codebase after all
remediation phases. This is the most important doc for AI-assisted development.

**Files to modify:**

- `CLAUDE.md` (project level at repo root)

**Prerequisites:** All other tasks in this phase complete

**Implementation Steps:**

1. Read the current `CLAUDE.md` at project root.
1. Update the Frontend section heading from "SvelteKit 2.x + Svelte 4" to
   "SvelteKit 2.x + Svelte 5" (may already be done in Task 1).
1. Update the CI Pipeline section: change "push/PR to main/develop" to "push/PR to main".
1. Verify the repository description: update to note that only `base-repository.ts` and
   `comment-repository.ts` exist. Other entities use inline DynamoDB operations.
1. Verify all file paths and directory listings are accurate.
1. Do NOT add new sections or expand the CLAUDE.md significantly -- it should remain concise.

**Verification Checklist:**

- [ ] Svelte version is "5" not "4"
- [ ] CI section says "main" only
- [ ] Repository layer description is accurate
- [ ] All file paths in CLAUDE.md exist on disk

**Testing Instructions:**

- Read each path/reference in CLAUDE.md and verify it exists.

**Commit Message Template:**

```text
docs: update project CLAUDE.md to reflect current codebase state

- Fix Svelte version, CI branch, repository layer description
```

## Phase Verification

After completing all tasks:

1. Run a full text search for known stale references:
   - `grep -rn "Svelte 4" docs/ README.md CLAUDE.md` -- should return 0
   - `grep -rn "develop" docs/DEVELOPMENT.md` -- should not mention develop branch for CI
   - `grep -rn "ContactFunction" docs/` -- should return 0
   - `grep -rn "tailwind.config.js" docs/` -- should return 0
1. Read through each modified doc file to verify consistency
1. Run `npm test` to ensure no code was accidentally changed

**Known limitations:**

- Doc-audit gap findings #1-5 (undocumented directories, scripts, routes) are partially
  addressed by updating the structure tree in FRONTEND.md. Exhaustive documentation of
  every utility file, backend script, and route is not in scope -- the structure overview
  is sufficient for orientation.
- The `Ancestry/README.md` existence (doc-audit additional note) is not addressed. It is
  a separate data directory unrelated to the main application.
- The Vite version split between root and frontend `package.json` (doc-audit additional note)
  is not documented. This is a monorepo artifact that does not affect runtime behavior.
