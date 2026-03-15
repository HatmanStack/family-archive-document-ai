# Phase 4 — [FORTIFIER] Guardrails & Enforcement

## Phase Goal

Add pre-commit hooks, enforce commit conventions, harden `.gitignore`, and add a root `.nvmrc`. These are additive guardrails that prevent the issues found in the audit from recurring.

**Success criteria:**
- Husky + lint-staged is installed and runs `npm run lint` on staged frontend files
- Commitlint enforces conventional commit format
- Root `.nvmrc` pins Node version (matching CI)
- `.gitignore` is comprehensive (no gaps for common artifacts)
- `npm test` passes, `npm run lint` passes

**Estimated tokens:** ~10,000

## Prerequisites

- Phase 0 read and understood
- Phase 3 complete (all code fixes applied, tests passing)
- `npm install` has been run from the repo root

---

## Tasks

### Task 1: Add Root .nvmrc File

**Goal:** Pin the Node version at the repo root so all developers use the same version. The CI uses Node 24 (`ci.yml:10`), and `frontend/.nvmrc` already specifies `v24`. Add a root-level `.nvmrc` for consistency.

**Audit references:** Eval Reproducibility remediation, Eval Onboarding remediation.

**Files to Create:**
- `.nvmrc` — At repo root

**Prerequisites:** None.

**Implementation Steps:**
1. Create `.nvmrc` at the repo root with content: `v24`
2. This matches `ci.yml` env `NODE_VERSION: '24'` and `frontend/.nvmrc`.

**Verification Checklist:**
- [x] `.nvmrc` exists at repo root
- [x] Contains `v24` (matching CI config)

**Testing Instructions:**
- Run `nvm use` from repo root (if nvm is installed) — should pick up v24.

**Commit Message Template:**
```
chore: add root .nvmrc pinning Node 24

- Matches CI configuration and frontend/.nvmrc
```

---

### Task 2: Install and Configure Husky + lint-staged

**Goal:** Add pre-commit hooks that run linting on staged files before each commit. This prevents lint failures from reaching CI.

**Audit references:** Eval Reproducibility remediation (7/10 → 9/10), Eval Git Hygiene remediation.

**Files to Create/Modify:**
- `package.json` — Add husky and lint-staged to devDependencies; add `prepare` script
- `.husky/pre-commit` — Pre-commit hook script
- `.lintstagedrc.json` (or config in `package.json`) — lint-staged configuration

**Prerequisites:** None.

**Implementation Steps:**
1. Install husky and lint-staged:
   ```bash
   npm install --save-dev husky lint-staged
   ```
2. Add a `prepare` script to root `package.json`:
   ```json
   "prepare": "husky"
   ```
3. Initialize husky:
   ```bash
   npx husky init
   ```
4. Create `.husky/pre-commit` with:
   ```bash
   npx lint-staged
   ```
5. Add lint-staged config to root `package.json` (or a separate `.lintstagedrc.json`):
   ```json
   "lint-staged": {
     "frontend/**/*.{ts,svelte}": [
       "cd frontend && npm run check:lint -- --max-warnings 0"
     ],
     "backend/**/*.ts": [
       "npx tsc --noEmit --project backend/lambdas/api/tsconfig.json"
     ]
   }
   ```
6. **Important:** The lint-staged config should match what CI runs, but scoped to staged files only. If the project's lint command doesn't support file arguments (ESLint with SvelteKit often doesn't), use the full lint command but it will check all files in the scope, not just staged ones. This is acceptable for a small project.
7. Test by making a small change and running `git commit` — the hook should fire.

**Verification Checklist:**
- [x] `husky` and `lint-staged` are in root `package.json` devDependencies
- [x] `prepare` script exists in root `package.json`
- [x] `.husky/pre-commit` exists and is executable
- [x] lint-staged config exists
- [x] Running `git commit` triggers the pre-commit hook

**Testing Instructions:**
- Stage a file with a lint error, attempt `git commit` — should fail.
- Stage a clean file, attempt `git commit` — should succeed.

**Commit Message Template:**
```
chore(ci): add pre-commit hooks with husky and lint-staged

- Install husky for git hooks
- Install lint-staged for scoped pre-commit checks
- Run lint on staged frontend and backend TypeScript files
```

---

### Task 3: Add Commitlint for Conventional Commits

**Goal:** Enforce conventional commit message format via a commit-msg hook. This prevents commit messages that drift from the project's convention.

**Audit references:** Eval Git Hygiene remediation (7/10 → 9/10).

**Files to Create/Modify:**
- `package.json` — Add commitlint dependencies
- `.commitlintrc.json` — Commitlint configuration
- `.husky/commit-msg` — Commit-msg hook

**Prerequisites:** Task 2 complete (husky installed).

**Implementation Steps:**
1. Install commitlint:
   ```bash
   npm install --save-dev @commitlint/cli @commitlint/config-conventional
   ```
2. Create `.commitlintrc.json` at repo root:
   ```json
   {
     "extends": ["@commitlint/config-conventional"],
     "rules": {
       "scope-enum": [1, "always", [
         "api", "frontend", "gallery", "messages", "comments", "letters",
         "media", "profile", "reactions", "drafts", "ci", "deps", "docs"
       ]],
       "subject-max-length": [2, "always", 100]
     }
   }
   ```
   Note: `scope-enum` severity is `1` (warning, not error) to allow new scopes to be added organically.
3. Create `.husky/commit-msg`:
   ```bash
   npx --no -- commitlint --edit ${1}
   ```
4. Test with a non-conventional commit message — should reject.

**Verification Checklist:**
- [x] `@commitlint/cli` and `@commitlint/config-conventional` are in devDependencies
- [x] `.commitlintrc.json` exists at repo root
- [x] `.husky/commit-msg` exists and is executable
- [x] Non-conventional commit messages are rejected

**Testing Instructions:**
- Run `echo "bad message" | npx commitlint` — should fail.
- Run `echo "fix(api): good message" | npx commitlint` — should pass.

**Commit Message Template:**
```
chore(ci): add commitlint for conventional commit enforcement

- Install @commitlint/cli and config-conventional
- Configure commit-msg hook via husky
- Warn on non-standard scopes, error on non-conventional format
```

---

### Task 4: Harden .gitignore

**Goal:** Add missing patterns to `.gitignore` to prevent common artifacts from being tracked. Task 2 of Phase 1 already added `__pycache__` and `*.pyc`. This task covers any remaining gaps.

**Audit references:** Health audit #7 (additional patterns beyond Python bytecache).

**Files to Modify:**
- `.gitignore` — Add any missing patterns

**Prerequisites:** Phase 1 Task 2 complete.

**Implementation Steps:**
1. Review the current `.gitignore` and verify these patterns are present. Add any that are missing:
   ```gitignore
   # Python (should already exist from Phase 1)
   __pycache__/
   *.pyc
   *.pyo

   # Editor
   *.swp
   *.swo
   *~

   # Compiled output
   *.js.map
   dist/
   ```
2. Most patterns are already present based on the current `.gitignore`. Only add patterns that are genuinely missing.
3. Do NOT remove any existing patterns — they may be there for a reason.

**Verification Checklist:**
- [x] `.gitignore` has Python bytecache patterns
- [x] No obvious gaps remain
- [x] `git status` does not show newly ignored files that should be tracked

**Testing Instructions:**
- Run `git status` — should show no unexpected changes.

**Commit Message Template:**
```
chore: harden .gitignore with additional exclusion patterns
```

---

## Phase Verification

1. Run `npm test` — all tests pass
2. Run `npm run lint` — zero warnings
3. Run `npm run build` — frontend builds
4. Verify husky is set up: `ls .husky/` shows `pre-commit` and `commit-msg`
5. Test commit hook: make a trivial change, commit with a non-conventional message — should be rejected by commitlint
6. Test lint hook: introduce a lint error, attempt to commit — should fail at pre-commit
7. Verify `.nvmrc` at root: `cat .nvmrc` shows `v24`

**Known limitations:**
- lint-staged on frontend files may run the full ESLint check rather than file-scoped checks, depending on the SvelteKit ESLint config. This is acceptable — it takes a few seconds longer but catches more issues.
- Commitlint scope-enum is a warning, not an error, to allow flexibility for new scopes.
