---
type: doc-health
date: 2026-03-23
prevention_scope: Markdown linting (markdownlint) + link checking (lychee)
language_stack: JS/TS + Python (both)
---

# Documentation Audit: family-archive-document-ai

## Configuration
- **Prevention Scope:** Markdown linting (markdownlint) + link checking (lychee) — catches formatting issues and broken links on every PR
- **Language Stack:** JS/TS + Python (both)
- **Constraints:** None

## Summary
- Docs scanned: 14 files
- Code modules scanned: 8 Lambda entry points, 8 route handlers, 11 lib modules, 3 repository files, 13 frontend services, 9 auth files, 7 type files, 10 utility files
- Findings: **13 drift, 5 gaps, 4 stale, 1 broken reference, 2 stale code examples, 2 config drift, 3 structure issues**

## Findings

### DRIFT (doc exists, doesn't match code)

1. **`README.md:10`, `CLAUDE.md:32`, `docs/FRONTEND.md:3,10`, `docs/ARCHITECTURE.md:264`** → `frontend/package.json:53`
   - Doc says: Svelte 4.x
   - Code says: `"svelte": "^5.54.0"`
   - The project has been upgraded to Svelte 5 but every doc still says Svelte 4.

2. **`docs/DEPLOYMENT.md:132`** → `backend/template.yaml:410`
   - Doc says: "S3 Buckets - Archive bucket, photo bucket, media bucket (must exist before deploy)"
   - Code says: Template creates a single `ArchiveBucketResource` (`AWS::S3::Bucket`) automatically. There is no separate "photo bucket" or "media bucket" and the bucket does NOT need to exist before deploy.

3. **`docs/API_REFERENCE.md:54`** → `backend/lambdas/api/src/routes/comments.ts:135`
   - Doc says: Comment content is `1-10000 chars`
   - Code constant `MAX_COMMENT_LENGTH` in `backend/lambdas/api/src/lib/constants.ts:42` is `5000`
   - The route hardcodes `10000` instead of using the constant, so the doc matches runtime behavior but the constant is wrong/unused. This is an internal code inconsistency the doc exposes.

4. **`docs/AUTHENTICATION.md:94,120`** → `backend/template.yaml:361-363`
   - Doc says: attribute mapping maps `email, name, picture`
   - Code says: attribute mapping only maps `email: email` and `name: name`. `picture` is not mapped in the template.

5. **`docs/AUTHENTICATION.md:120`** → `backend/template.yaml:346`
   - Doc says: "Default mapping configured automatically in template (backend/template.yaml:346-359)"
   - Lines 346-348 are the `UserPoolDomain` resource. The actual attribute mapping is at lines 361-363. Line reference is stale.

6. **`docs/DEVELOPMENT.md:305-306`, `CLAUDE.md` CI section** → `.github/workflows/ci.yml:6`
   - Doc says: "GitHub Actions runs on push/PR to main and develop"
   - Code says: CI only triggers on `main`, not `develop`. The `develop` branch trigger was removed.

7. **`docs/TROUBLESHOOTING.md:240`** → `frontend/tailwind.config.ts`
   - Doc says: "Check `tailwind.config.js` content paths"
   - Actual file is `tailwind.config.ts` (TypeScript, not JavaScript).

8. **`docs/FRONTEND.md:53`** → `frontend/lib/auth/`
   - Doc says: auth directory contains `client.ts` and `auth-store.ts`
   - Auth directory actually contains 9 files: `api-client.ts`, `auth-service.ts`, `auth-store.ts`, `client.ts`, `cognito-client.ts`, `cognito-config.ts`, `google-oauth.ts`, `jwt.ts`, `middleware.ts`

9. **`docs/AUTHENTICATION.md:150`** → `frontend/lib/auth/auth-service.ts`
   - Doc says: `AuthService` wraps `CognitoAuthClient` from `lib/auth/cognito-client.ts`
   - Code says: The actual import in `auth-service.ts:4` is `import { cognitoAuth } from './cognito-client'`. Doc uses wrong class name.

10. **`docs/FRONTEND.md:18-79` (project structure)** → actual frontend filesystem
    - Doc omits: `lib/config/` (4 files), `lib/utils/` (10 files)
    - Doc omits routes: `api/`, `atom.xml/`, `feed.json/`, `manifest.webmanifest/`, `posts.json/`, `sitemap.xml/`, `tags.json/`
    - Doc omits components: `auth/` subdirectory, many `post_*.svelte` components, `prose/` subdirectory

11. **`docs/ARCHITECTURE.md:263`** → `backend/template.yaml:164`
    - Doc says: "Google Gemini 3.1 Flash Lite Preview"
    - Code default model: `gemini-3.1-flash-lite-preview` — name matches but should be verified against current Gemini model naming.

12. **`docs/DEPLOYMENT.md:109`** → `backend/lambdas/activity-aggregator/index.js:6`
    - Doc says: Lambda env var `USER_PROFILES_TABLE` described as "DynamoDB profiles table (legacy)"
    - Code says: `USER_PROFILES_TABLE` is actively used, mapped to `!Ref TableName`. The "(legacy)" label is misleading.

13. **`backend/lambdas/api/src/types/index.ts:90-95`** → `backend/lambdas/api/src/routes/reactions.ts:69`, `docs/DATA_MODEL.md`
    - TypeScript `Reaction` type uses `emoji: string` but route code and DATA_MODEL use `reactionType: string`
    - `UserProfile` type uses `photoUrl`/`photoKey` but route code and DATA_MODEL use `profilePhotoUrl`
    - TypeScript entity types are out of sync with both route implementations and data model docs.

### GAPS (code exists, no doc)

1. **`frontend/lib/config/`** — 4 configuration files (`general.ts`, `icon.ts`, `post.ts`, `site.ts`) with no documentation in FRONTEND.md or any other doc.

2. **`frontend/lib/utils/`** — 10 utility files (including `api-url.ts`, `retry.ts`, `request-deduplication.ts`, `cancellable-fetch.ts`, `s3Client.ts`) with no documentation.

3. **`frontend/lib/auth/google-oauth.ts`, `jwt.ts`, `middleware.ts`** — Three auth-related modules not mentioned in FRONTEND.md or AUTHENTICATION.md structure sections.

4. **`frontend/routes/api/`, `atom.xml/`, `feed.json/`, `manifest.webmanifest/`, `posts.json/`, `sitemap.xml/`, `tags.json/`** — Seven route directories not documented in any routing table.

5. **`backend/scripts/`** — Multiple utility scripts (`backfill-user-profiles.js`, `backfill-user-gsi1.js`, `add-approved-user.js`, `bulk-upload-pictures.cjs`, `seed-sample-letters.js`, `create-guest-user.js`) not documented in DEVELOPMENT.md or DEPLOYMENT.md.

### STALE (doc exists, code doesn't)

1. **`README.md:122` (project structure)** → `frontend/routes/auth/` directory
   - Doc says: `auth/           # Login, signup, password reset`
   - Code says: No `signup` route exists. Auth routes are: `login`, `callback`, `forgot-password`, `reset-password`, `logout`, `pending-approval`. Signup is handled via Cognito Hosted UI, not a dedicated route.

2. **`docs/SES_SETUP.md:54`** → No such Lambda
   - Doc says: "Check CloudWatch logs `/aws/lambda/{StackName}-ContactFunction`"
   - Code says: There is no separate ContactFunction Lambda. Contact handling is done by the consolidated `ApiFunction` (`backend/lambdas/api/src/routes/contact.ts`). Correct log group: `/aws/lambda/{StackName}-ApiFunction`.

3. **`docs/DEPLOYMENT.md:229-230`** → `frontend/package.json`
   - Doc says: `npm run check:lint` and `npm run check:types`
   - The root `npm run check` runs `npm run lint && npm run test` which differs from what the development workflow section implies.

4. **`docs/DEVELOPMENT.md:267-270`** → No `backend/events/` directory
   - Doc says: `sam local invoke ApiFunction -e events/test-event.json`
   - No `events/` directory exists in the backend. The example references a non-existent test event file.

### BROKEN REFERENCES

1. **`docs/AUTHENTICATION.md:120`** → `backend/template.yaml:346-359`
   - Reference says line 346-359 contains Google attribute mapping.
   - Line 346 is actually `UserPoolDomain` resource. Google attribute mapping starts at line 361.

### STALE CODE EXAMPLES

1. **`docs/FRONTEND.md:92-93`** → `frontend/lib/services/profile-service.ts`
   - Doc says: `import { getProfile, updateProfile, getAllUsers } from '$lib/services/profile-service'`
   - Code: These functions exist but the service also exports `getCommentHistory` and `uploadProfilePhoto` which are not mentioned. Import example is technically valid but incomplete.

2. **`docs/AUTHENTICATION.md:199-200`, `docs/FRONTEND.md:193-211`** → `frontend/lib/auth/auth-store.ts`
   - Doc shows auth store as a simple `writable` with `authStore.set({ accessToken, refreshToken, idToken, userId, email })`.
   - Code says: Auth store is a custom store with methods: `init()`, `setAuthenticated()`, `updateTokens()`, `clearAuth()`, `setLoading()`. The state shape is `{ isAuthenticated, user, tokens, loading }`, not a flat token object. The documented `authStore.set(null)` pattern does not match the code's `authStore.clearAuth()` API.

### CONFIG DRIFT

1. **Code reads `DYNAMODB_TABLE`** (`backend/lambdas/api/src/lib/database.ts:18` — fallback: `process.env.DYNAMODB_TABLE`) — not in `.env.example`, not in any docs. This is a fallback variable that could confuse deployers.

2. **`.env.example` has `PUBLIC_AWS_REGION=us-west-2`** but `docs/DEVELOPMENT.md:74` shows `PUBLIC_AWS_REGION=us-east-1` and `docs/AUTHENTICATION.md:36` shows `us-east-1`. The default region is inconsistent across docs and the env example.

### STRUCTURE ISSUES

1. **FRONTEND.md claims "stores manage application state"** but only documents one store (`auth-store`). The actual stores directory contains 4 files: `messages.ts`, `posts.ts`, `profiles.ts`, `title.ts` — none documented.

2. **CLAUDE.md `repositories/` description** → `backend/lambdas/api/src/repositories/`
   - Doc says: `repositories/      # DynamoDB data access`
   - Only `base-repository.ts`, `comment-repository.ts`, and `index.ts` exist. All other entity access is handled inline in route handlers. The doc implies a complete repository layer that does not exist.

3. **`docs/DEVELOPMENT.md:18`** → nvm install command
   - Doc says: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash`
   - v0.39.0 is from 2022. Current nvm is v0.40.x+.

### ADDITIONAL NOTES

- Root `package.json` Vite version (`^5.4.21`) differs from frontend `package.json` Vite version (`^8.0.0`). No documentation mentions this split.
- `Ancestry/README.md` exists but is not referenced from any documentation. Its purpose is undocumented.
- `docs/plans/` contains a prior audit from 2026-03-15. Many findings have been remediated but some drift items remain or are new.
