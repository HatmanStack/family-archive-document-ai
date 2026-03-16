# Changelog

All notable changes to Family Archive - Document AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
