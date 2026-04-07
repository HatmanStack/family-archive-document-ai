---
type: doc-health
date: 2026-04-07
---

## DOCUMENTATION AUDIT

### SUMMARY
- Docs scanned: 14 root/docs files (README, CHANGELOG, CLAUDE.md, API_REFERENCE, ARCHITECTURE, AUTHENTICATION, DATA_MODEL, DEPLOYMENT, DEVELOPMENT, FEATURES_ROADMAP, FRONTEND, ONE_CLICK_DEPLOYMENT, RAGSTACK_INTEGRATION, SES_SETUP, TROUBLESHOOTING) plus .env.example
- Code modules cross-checked: 9 API routes, 13 frontend services, 4 lambdas, rate-limit + constants, env vars
- Findings: 6 drift, 3 gaps, 2 stale, 0 broken links, 2 stale code examples, 1 config drift, 2 structure issues

### DRIFT
- **CLAUDE.md** says `npm test -- tests/unit/profile-handler.test.js` — file is `profile-handler.test.ts` (TS, not JS). All migrated handler tests are `.test.ts`.
- **docs/FRONTEND.md** lists `lib/auth/client.ts` in the auth file map — file does not exist. Per CHANGELOG 1.4.0 it was renamed to `auth-utils.ts` (which IS present and used). FRONTEND.md never updated.
- **docs/FRONTEND.md** auth file map omits `auth-utils.ts` (the actual replacement) and `cognito-client.ts` (exists in code).
- **docs/ARCHITECTURE.md** "API Lambda Structure" pseudocode lists routing groups `/media/*`, `/pdf/*`, `/upload/*` — none of these exist in `index.ts`. Actual routes use `/download/presigned-url`, `/letters/*` for upload-request, etc. The doc misrepresents how dispatch works (it's now a declarative `Router`, not path-prefix dispatch).
- **docs/API_REFERENCE.md** documents `POST /messages/{conversationId}/upload-url` but code (index.ts:40) also registers `POST /messages/attachments/upload-url` — undocumented alias.
- **docs/DEPLOYMENT.md** Cognito User Pool description says "Email as username, password policy 8+ chars mixed case…" — needs verification against template.yaml.

### GAPS
- **`POST /messages/attachments/upload-url`** route exists in code (index.ts:40) but not in API_REFERENCE.md.
- **Repositories layer** (`backend/lambdas/api/src/repositories/`: base-repository, comment-repository, messaging-repository) is mentioned in CLAUDE.md and CHANGELOG but absent from ARCHITECTURE.md "Shared Libraries" table and DEVELOPMENT.md "Lambda Structure" tree.
- **`backend/lambdas/shared/`** module (html-utils.ts, types.ts) is mentioned in CHANGELOG only — not in ARCHITECTURE.md or DEVELOPMENT.md structure listings.
- **Letter processor `lib/` utilities** (`config.ts`, `retry.ts`) are mentioned in CLAUDE.md but absent from ARCHITECTURE.md and DEVELOPMENT.md.
- **Backend env vars**: `LOG_LEVEL` is documented for the wrong lambdas (DEPLOYMENT.md lists "frontend-builder, amplify-deployer" but logger.ts using it lives in API lambda).

### STALE
- **CHANGELOG.md** version 1.4.0 dated 2026-03-25 references rename of `client.ts` → `auth-utils.ts`, but **docs/FRONTEND.md** still documents `client.ts`. Doc is stale relative to code.
- **docs/ARCHITECTURE.md** routing pseudocode (`/media/*`, `/pdf/*`, `/upload/*`) appears to predate the declarative Router refactor in 1.4.0; describes a dispatch model that no longer exists.

### BROKEN LINKS
- None found. All `docs/*.md` referenced from README.md exist; image paths `data/images/banner.webp` and `data/images/family-archive-architecture.png` exist.

### STALE CODE EXAMPLES
- **docs/FRONTEND.md** Letters Service example: `listLetters(authToken, limit, cursor)`, `getLetter(date, authToken)` — passes `authToken` as a positional arg. Per CHANGELOG 1.4.0 frontend services were "consolidated onto shared apiClient singleton with centralized auth", so explicit `authToken` parameters are obsolete.
- **docs/FRONTEND.md** Comment.svelte example uses `export let` (Svelte 4 syntax) and `on:click` while the project uses Svelte 5. Should be `$props()` / `onclick`.

### CONFIG DRIFT
- **`.env.example`** documents `PUBLIC_AWS_REGION=us-west-2` while DEPLOYMENT.md/AUTHENTICATION.md examples mix `us-west-2` and `us-east-1`. Default region inconsistent across docs and code (`s3-utils.ts` defaults to `us-west-2`, `RAGSTACK_REGION` defaults `us-east-1`, scripts default `us-east-1`).
- `.env.example` does NOT document `PUBLIC_GUEST_EMAIL`/`PUBLIC_GUEST_PASSWORD` defaults clearly — create-guest script comment in `.env.example` says `node create-guest-user.js guest@showcase.demo GuestDemo@123` while DEPLOYMENT.md says `node scripts/create-guest-user.js` (no args) and uses `GuestDemo123!`. Two different guest passwords/invocations.

### STRUCTURE ISSUES
- **docs/FRONTEND.md** project tree includes `lib/config/` and `lib/utils/` — both exist but neither described in body. Tree includes `lib/components/letters/` but actual `lib/components/` also has many top-level loose components (`MarkdownEditor.svelte`, `VersionHistory.svelte`, `head.svelte`, etc.) not represented.
- **docs/DEVELOPMENT.md** Lambda Structure tree omits `repositories/` directory entirely (significant since CHANGELOG 1.4.0 introduced MessagingRepository).
- **CLAUDE.md** describes the api lambda's `lib/` listing but omits `database.ts`, `keys.ts`, `s3-utils.ts`, `user.ts`, `index.ts`. Minor since CLAUDE.md is intentionally curated.

### PREVENTION TOOLING (selected)
- Markdown linting (markdownlint) + link checking (lychee) on every PR.
