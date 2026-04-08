# Phase 0 — Foundations, ADRs, Conventions

## Goal

Establish the shared decisions, conventions, and ground rules every later phase
relies on. No code changes in this phase. Read through it once before starting
Phase 1.

Estimated tokens: 8k.

## Project Conventions

Source: repo `CLAUDE.md`, `~/.claude/projects/-home-christophergalliart-projects/memory/`.

- Runtime: Node 24 LTS via nvm. Python 3.13 via uv (only used by 3 CFN custom resources).
- Package manager: npm. Lockfile committed at repo root and in `frontend/`.
- Install: `npm ci` at repo root and inside `frontend/`.
- Dev: `npm run dev` from `frontend/`.
- Build: `npm run build` from `frontend/`.
- Test: `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run test:load` (Artillery).
- Lint: `npm run lint` (ESLint with `--max-warnings 0` plus type check).
- Deploy: `npm run deploy` (SAM). Never run unless the user explicitly asks.
- AWS: SSO profile `dev`, default workload region `us-west-2`.
- Worktree-only work. Never amend commits. Never switch branches without user request.
- Commit messages: conventional commits, no `Co-Authored-By` lines, no emojis.
- Writing style: no em dashes, no filler, no emojis, no fake enthusiasm, direct and factual.

## ADRs

### ADR-0001 Single Declarative Router

The declarative `Router` in `backend/lambdas/api/src/lib/router.ts` is the only
routing mechanism. Per-route files export per-verb handler functions. Inner
`handle(event, context)` switch dispatchers are removed in Phase 2. No new
`event.resource`/`event.httpMethod` switches inside route files.

### ADR-0002 Auth-by-Default Middleware

`requireAuth()` becomes a default router middleware in `index.ts`. Public
endpoints opt out via an explicit allow list. Route handlers stop reading
`event.requestContext.authorizer` directly and stop using `userId!` non-null
assertions.

### ADR-0003 Typed Errors over String Sniffing

Control flow uses `instanceof ValidationError`, `instanceof NotFoundError`, etc.
No `error.message.includes(...)` for routing decisions. All `unknown` errors
flow through `toError()`.

### ADR-0004 Repository Pattern Boundary

Repositories own DynamoDB access. Routes own HTTP shape. S3 presigning lives in
a dedicated helper module (`lib/s3-presign.ts`), not inline in routes. The dead
`CommentRepository` is deleted in Phase 1; comments either get a real
repository in Phase 3 or stay direct DDB with that decision documented.

### ADR-0005 Subtract Before Refactor

Phase 1 deletes dead code first so later phases do not migrate corpses. Knip
findings are resolved by deletion unless a Phase 1 task explicitly chooses to
wire a constant in.

### ADR-0006 Documentation-as-Code

Markdownlint and lychee run in CI on every PR (Phase 7). Doc drift becomes a
build failure, not a quarterly cleanup.

## Tech Stack Snapshot

- Frontend: SvelteKit 2, Svelte 5, TailwindCSS, DaisyUI, MDsveX.
- Backend: AWS SAM, Node 24 Lambda, single consolidated API Lambda plus
  letter-processor, notification-processor, activity-aggregator, and three
  Python CFN custom resources.
- Storage: DynamoDB single-table design, S3 buckets for letters/media/profile
  photos, Cognito for auth.
- Tests: Vitest unit, Playwright E2E, Artillery load, `aws-sdk-client-mock`.
- CI: GitHub Actions, lint and test gates required for merge.

## Testing Strategy

- Every `[IMPLEMENTER]` task must add or update unit tests for changed code.
- Every `[HYGIENIST]` task must run `npm run lint` and `npm test` to prove no
  regressions before commit.
- `[FORTIFIER]` tasks add CI checks; the new check must pass on the same PR.
- `[DOC-ENGINEER]` tasks must run `npx markdownlint-cli2` and `lychee` locally.

## Commit Format

```text
<type>(<scope>): <subject>
```

- Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `ci`, `perf`.
- Scopes used in this repo: `api`, `letter-processor`, `frontend`, `gallery`,
  `messages`, `profile`, `deps`, `ci`, `docs`, `tests`.
- Subject: imperative, lower-case, no trailing period.
- Atomic commits. One logical change per commit. Tasks below specify exact
  messages.
- No `Co-Authored-By` lines.

## Markdown Lint Rules

All plan files and repo docs follow markdownlint defaults:

- Fenced code blocks must have a language tag.
- Headings must not end with punctuation.
- Ordered lists use `1.` for every item.
- Blank lines surround headings, lists, and code blocks.
- No trailing whitespace.

## Phase Verification

Read this file end to end before starting Phase 1. No code or tests to run.
