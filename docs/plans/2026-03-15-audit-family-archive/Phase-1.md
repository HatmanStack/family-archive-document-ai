# Phase 1 — [HYGIENIST] Subtractive Cleanup

## Phase Goal

Remove dead code, build artifacts, and unused files from the repository. This phase is purely subtractive — it deletes things and tightens `.gitignore`. No new features, no new logic.

**Success criteria:**
- All 14 legacy JavaScript files in `backend/lambdas/api/lib/` and `backend/lambdas/api/repositories/` are deleted
- Committed `__pycache__` build artifact is removed and `.gitignore` excludes future Python bytecache
- `npm run lint` passes with zero warnings
- `npm test` passes (no test depends on the deleted files)
- `npm run build` succeeds

**Estimated tokens:** ~8,000

## Prerequisites

- Phase 0 read and understood
- Git working tree is clean (no uncommitted changes)
- `npm install` has been run from the repo root

---

## Tasks

### Task 1: Remove Legacy JavaScript Files from API Lambda

**Goal:** Delete the 14 legacy JS files that shadow the TypeScript source. These are dead code — the SAM build compiles from `src/`. Their existence creates confusion about which files are canonical.

**Audit references:** Health audit #4, Eval (Problem-Solution Fit remediation), Doc audit gap #4.

**Files to Delete:**
- `backend/lambdas/api/lib/database.js`
- `backend/lambdas/api/lib/keys.js`
- `backend/lambdas/api/lib/logger.js`
- `backend/lambdas/api/lib/prefixes.js`
- `backend/lambdas/api/lib/rate-limit.js`
- `backend/lambdas/api/lib/responses.js`
- `backend/lambdas/api/lib/user.js`
- `backend/lambdas/api/lib/validation.js`
- `backend/lambdas/api/repositories/base-repository.js`
- `backend/lambdas/api/repositories/comment-repository.js`
- `backend/lambdas/api/repositories/index.js`
- `backend/lambdas/api/repositories/message-repository.js`
- `backend/lambdas/api/repositories/reaction-repository.js`
- `backend/lambdas/api/repositories/user-repository.js`

**Prerequisites:** None.

**Implementation Steps:**
1. Verify no imports reference the JS paths. Search the codebase for any `require` or `import` from `../lib/database` (without `.ts` extension) that could resolve to the JS file instead of the TS file. The TS source uses relative imports from `../lib/` which TypeScript resolves to `.ts` files, so the JS files should be unreferenced.
2. Delete all 14 files listed above.
3. If the `backend/lambdas/api/lib/` directory is now empty, delete the directory itself.
4. If the `backend/lambdas/api/repositories/` directory is now empty, delete the directory itself.
5. Run `npm test` to confirm no test imports from the deleted paths.
6. Run `npm run build` to confirm the frontend build is unaffected.

**Verification Checklist:**
- [x] All 14 JS files are deleted
- [x] `backend/lambdas/api/lib/` directory no longer exists (or is empty)
- [x] `backend/lambdas/api/repositories/` directory no longer exists (or is empty)
- [x] `npm test` passes
- [ ] `npm run build` passes (pre-existing failure: missing env vars)

**Testing Instructions:**
- No new tests needed. This is a deletion task.
- Run `npm test` to verify existing tests still pass.

**Commit Message Template:**
```
chore(api): remove legacy JavaScript files shadowing TypeScript source

- Delete 8 JS files in backend/lambdas/api/lib/
- Delete 6 JS files in backend/lambdas/api/repositories/
- TS source in src/ is the canonical implementation
```

---

### Task 2: Remove Committed Python Build Artifact and Update .gitignore

**Goal:** Remove the committed `__pycache__` directory and add patterns to `.gitignore` to prevent future Python bytecode from being tracked.

**Audit references:** Health audit #7, Quick Win #2.

**Files to Modify:**
- `.gitignore` — Add Python bytecode exclusions
- `backend/lambdas/amplify-deployer/__pycache__/` — Remove from git tracking

**Prerequisites:** None.

**Implementation Steps:**
1. Add the following entries to the root `.gitignore` file, in a new section near the existing `# build output` section:
   ```
   # Python
   __pycache__/
   *.pyc
   *.pyo
   ```
2. Remove the cached `__pycache__` directory from git tracking: `git rm -r --cached backend/lambdas/amplify-deployer/__pycache__/`
3. Verify the file is no longer tracked.

**Verification Checklist:**
- [x] `.gitignore` contains `__pycache__/` and `*.pyc` patterns
- [x] `git status` shows the `__pycache__` removal staged
- [x] No `.pyc` files appear in `git ls-files`

**Testing Instructions:**
- No tests needed. This is a git hygiene task.

**Commit Message Template:**
```
chore: remove committed __pycache__ and add Python bytecache to .gitignore

- git rm --cached backend/lambdas/amplify-deployer/__pycache__/
- Add __pycache__/, *.pyc, *.pyo to .gitignore
```

---

### Task 3: Remove console.log/console.error Calls from Gallery Component

**Goal:** Remove the 8 `console.error`/`console.warn` calls from the gallery Svelte component. These provide no production observability and are code smell.

**Audit references:** Health audit #11.

**Files to Modify:**
- `frontend/routes/gallery/+page.svelte` — Remove or replace console calls

**Prerequisites:** None.

**Implementation Steps:**
1. Open `frontend/routes/gallery/+page.svelte`.
2. Find all `console.error` and `console.warn` calls (approximately at lines 98, 233, 234, 245, 308, 343, 438, 491 per the audit).
3. For each call, evaluate context:
   - If the error is in a `catch` block that already has user-facing error handling (e.g., sets an error state variable), simply remove the `console.error` line.
   - If the error is the only indication of failure, keep minimal error handling (e.g., set a user-visible error state) but remove the console call.
4. Do NOT add a logging framework or new dependencies. This is subtractive only.

**Verification Checklist:**
- [x] No `console.error` or `console.warn` calls remain in `frontend/routes/gallery/+page.svelte`
- [x] `npm run lint` passes with zero warnings
- [ ] `npm run build` passes (pre-existing failure: missing env vars)

**Testing Instructions:**
- No unit tests (Svelte component, no existing test infrastructure for it).
- Visual check: the component should still function — errors are handled, just not logged to console.

**Commit Message Template:**
```
refactor(gallery): remove console.error/console.warn calls from gallery page

- Remove 8 console logging calls that provide no production observability
- Preserve existing user-facing error handling
```

---

## Phase Verification

1. Run `npm test` — all existing tests pass
2. Run `npm run lint` — zero warnings
3. Run `npm run build` — frontend builds successfully
4. Run `git ls-files | grep '\.pyc'` — no results
5. Run `ls backend/lambdas/api/lib/ 2>/dev/null` — directory should not exist or be empty
6. Run `ls backend/lambdas/api/repositories/ 2>/dev/null` — directory should not exist or be empty
7. Verify `frontend/routes/gallery/+page.svelte` has no `console.error` or `console.warn` calls

**Known limitations:** The gallery component (1072 lines) is not being decomposed in this phase. That is a structural change addressed in Phase 3. This phase only removes console noise.
