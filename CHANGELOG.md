# Changelog

All notable changes to Family Archive - Document AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-03-25

### Added
- Declarative Router class with Express-like `router.get()` / `router.post()` pattern and middleware chains
- MessagingRepository encapsulating all 17 DynamoDB messaging operations
- Rate-limit, auth, and admin middleware factories for declarative per-route application
- Shared `backend/lambdas/shared/` module with cross-Lambda types and `escapeHtml` utility
- Structured `ApiError` class in frontend API client with HTTP status property
- Unit tests for Router, MessagingRepository, and migrated Lambda handlers

### Changed
- Migrated activity-aggregator and notification-processor from JavaScript to TypeScript with esbuild bundling
- Consolidated 10 frontend services onto shared `apiClient` singleton with centralized auth
- Renamed `lib/auth/client.ts` to `lib/auth/auth-utils.ts` (all imports updated)
- Router matches against `event.path` and populates `pathParameters` from regex capture groups
- Replaced dynamic `uuid` import with static top-level import in MessagingRepository
- Frontend service layer uses concrete response interfaces instead of `Record<string, unknown>`

### Fixed
- Router path parameter extraction now works with proxy+ resources
- `requireAdmin` / `requireApproved` middleware return 401 for unauthenticated callers before checking roles
- `requireAuth()` middleware added to all message routes for defense-in-depth
- Route param `{draftId}` corrected to `{uploadId}` to match SAM template
- Activity-aggregator updates guarded with `ConditionExpression` to prevent phantom profile rows
- GSI1 backfill cache only marks users verified when backfill actually succeeds
- `previousCommenters` in notification-processor filtered for undefined entries
- Profile service uses `ApiError.status` instead of fragile string matching for 403/404 detection
- Frontend service type parameters added to all `apiClient` calls (17 TypeScript errors resolved)
- MessagingRepository test table name mismatch in `fetchUserNames` mock responses

## [1.3.0] - 2026-03-23

### Added
- Unit tests for letters, contact, reactions, and media route handlers (56 new tests, 224 total)
- `Vary: Origin` CORS header on all response paths to prevent CDN caching issues
- Request timeout (30s) with `AbortController` in frontend API client
- Pagination limit on `listUsers` query (`MAX_PAGE_SIZE` guard)
- Pagination support for draft listing (replaces unbounded scan)
- Features roadmap with interactive family tree visualization design (`docs/FEATURES_ROADMAP.md`)

### Fixed
- **Security:** Base repository pagination key bypass — now validates via `validatePaginationKey()`
- **Security:** Profile photo filename sanitized with `path.basename()` and regex extraction
- Letters route error handling standardized — all 6 `throw error` re-throws replaced with `return errorResponse()`
- Comment content length constant aligned to runtime value (5000 → 10000)
- Contact form validates both `ADMIN_EMAIL` and `SES_FROM_EMAIL` before sending
- `console.warn` in `user.ts` replaced with structured `log.warn`
- Presigned URL generation batched (groups of 10) to prevent connection exhaustion
- S3 deletes in `deleteConversation` batched (groups of 25)
- Pagination limits capped with `Math.min(limit, MAX_PAGE_SIZE)` in letters, messages, and comments routes

### Changed
- Deduplicated JWT decode into shared `frontend/lib/auth/jwt-decode.ts` (removed 3 copies)
- API client types tightened: `T = any` → `T = unknown`, `body?: any` → `body?: Record<string, unknown>`
- JWT payload return type changed from `any` to `Record<string, unknown> | null`
- Correlation ID documented with ADR-5 safety comment for Lambda concurrency model

### Documentation
- Full codebase audit (health, evaluation, documentation) with 6-phase remediation
- Fixed Svelte 4 → Svelte 5 references across all docs
- Fixed S3 bucket description (single auto-created, not 3 pre-existing)
- Fixed Google OAuth attribute mapping (email + name only, no picture)
- Fixed CI trigger docs (main only, not main + develop)
- Fixed auth store API examples (`setAuthenticated`/`clearAuth`, not `set`/`set(null)`)
- Updated frontend project structure with config/, utils/, all auth files, all stores
- Fixed SES log group reference (ApiFunction, not ContactFunction)
- Fixed tailwind config filename (.ts not .js)
- Standardized region references to us-west-2
- Removed stale references to signup route, events/ directory, legacy table labels

## [1.2.0] - 2026-03-15

### Added
- Unit tests for comments, messages, and profile handlers
- Rate limiting across all mutating API endpoints
- Pagination key validation for all paginated queries
- Husky pre-commit hooks with lint-staged for frontend linting
- Commitlint for conventional commit message enforcement
- Automatic package.json version sync in release workflow

### Fixed
- Input validation hardening: safe JSON parsing, URI decoding, participantId type checks
- CORS origin propagation across all response helpers in messages, comments, reactions, drafts, media, and contact routes
- Unsafe error type casts replaced with `toError()` utility throughout API
- BatchWriteCommand retry on DynamoDB UnprocessedItems in messages
- S3 key sanitization to prevent path traversal
- Atomic draft-to-letter publish with duplicate detection (409 on conflict)
- MIME type allowlist for draft uploads (reject arbitrary ContentType)
- Pagination cursors validated against exact partition key, not just prefix
- `decodeURIComponent` calls wrapped in try/catch for malformed parameters
- RAGStack GraphQL fetch calls given 15s timeout in gallery
- Error handling improvements in `getImageById`
- Brace-style lint violation in media-service

### Changed
- Consolidated S3 client instantiations into shared `s3-utils` module
- Replaced DynamoDB Scan with GSI query for draft listing
- Removed `console.error`/`console.warn` from gallery page (use structured logger)
- Removed legacy JavaScript files shadowing TypeScript source
- Removed committed `__pycache__` bytecache from repository
- Extracted `escapeHtml` to shared validation utility
- Pinned Node version to 24 via `.nvmrc`
- Hardened `.gitignore` with additional exclusion patterns

### Documentation
- Full codebase audit (health, evaluation, documentation) with remediation plan
- Corrected API reference response formats and field name drift
- Fixed DynamoDB data model entity schema contradictions
- Documented Python utility Lambdas and missing frontend routes
- Updated architecture docs for routing and key prefixes

## [1.1.0] - 2026-03-10

### Added
- Upgraded AI capabilities to Google Gemini 3.1 for enhanced letter processing
- New changelog-driven release workflow for CI/CD automation

### Fixed
- Improved SPA stability and resolved routing 404s for better frontend reliability
- Prevented duplicate markdown uploads to RAGStack during letter publication
- Standardized published PDF filenames with a consistent `letter-` prefix
- Refined routing regexes and tightened letter filename filtering
- Resolved linting errors in media-service and gallery components
- Updated sitemap XML namespaces to use `http` as per official specification

### Changed
- Refined build artifact management for the API Lambda to reduce package size

## [1.0.2] - 2026-02-04

### Added
- Stale-while-revalidate caching for gallery media (pictures, videos, documents)
- Background refresh with diff-based UI updates (no flicker)
- DeepWiki documentation badge

### Changed
- Unified cache structure for all media types
- Tab switching now returns cached data instantly with background refresh
- New uploads appear automatically when indexed (no page refresh needed)

## [1.0.1] - 2026-02-04

### Added
- Auto-provision Cognito ApprovedUsers and Admins groups during stack deployment
- Auto-create initial admin user with branded welcome email containing Amplify URL
- RAGStack integration guide documentation

### Fixed
- Admin provisioner updates UserPool invite template before creating user
- Cognito environment variable names in documentation (matched to actual .env)
- ApprovedUsers requirement documentation
- One-click deployment tutorial accuracy

### Changed
- Removed legacy migration infrastructure
- Cleaned up stale documentation references

## [1.0.0] - 2026-02-04

### Added
- Initial public release of Family Archive - Document AI
- AI-powered letter transcription using Google Gemini
- Private family collaboration with comments, reactions, and messaging
- Media gallery with support for photos, videos, and documents
- Semantic search via optional RAGStack integration
- User authentication with Amazon Cognito
- Cost-optimized serverless architecture on AWS
- Admin dashboard with content moderation
- Draft management for letters
- Guest access for showcases
- RAGStack Admin Dashboard URL in CloudFormation outputs
- CodeBuild-based frontend build during stack creation
- RAGStack build control parameters
- EventBridge integration for deployment automation

### Changed
- Rebranded from "Hold That Thought" to "Family Archive - Document AI"
- Updated all package names and references
- Improved frontend build process with Amplify integration
- Enhanced security based on code review findings

### Fixed
- Package-lock.json sync issues for CI/CD
- RAGStack build parameters in CloudFormation parameter groups
- Lambda self-permission for EventBridge integration
- Frontend build environment variable configuration
- CodeBuild artifacts directory structure
- Missing optional dependencies in lockfile
- CloudFormation resource references in Amplify configuration

### Security
- Addressed code review findings from security audit
- Implemented secure authentication with Amazon Cognito
- Added proper IAM permissions for all Lambda functions

## Project Information

**Repository**: https://github.com/HatmanStack/family-archive-document-ai
**License**: Apache 2.0
**AWS Marketplace**: Available with limited visibility
**Demo**: https://showcase-htt.hatstack.fun (guest access available)
