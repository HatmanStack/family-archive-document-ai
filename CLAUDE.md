# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Family Archive - Document AI is a private family platform for sharing letters, photos, and memories. It features AI-powered transcription, a media gallery, semantic search via RAG, and a chat interface for conversational access to family content.

## Commands

```bash
# Development
npm run dev                    # Start SvelteKit dev server (from frontend/)
npm run build                  # Production build

# Testing
npm test                       # Run unit tests (Vitest)
npm test -- tests/unit/profile-handler.test.js  # Run single test file
npm run test:e2e               # Playwright E2E tests
npm run test:load              # Artillery load tests

# Linting
npm run lint                   # ESLint + type check (strict, zero warnings)
cd frontend && npm run lint:fix  # Auto-fix lint issues

# Deployment (run only when explicitly requested)
npm run deploy                 # Deploy backend via SAM
```

## Architecture

### Frontend (SvelteKit 2.x + Svelte 4)

```
frontend/
├── routes/                    # SvelteKit file-based routing
│   ├── auth/                  # Login, signup, callback, password reset
│   ├── gallery/               # Media gallery with RAGStack integration
│   ├── letters/               # Letter viewing and editing
│   ├── messages/              # Direct messaging between users
│   └── profile/               # User profiles
├── lib/
│   ├── auth/                  # Cognito authentication logic
│   ├── components/            # Svelte components (comments, messages, profile)
│   ├── services/              # API service modules (*-service.ts)
│   ├── stores/                # Svelte stores for state
│   └── types/                 # TypeScript type definitions
└── static/                    # Static assets
```

**Key patterns:**
- Services in `lib/services/` handle all API communication
- Auth state managed via Cognito with tokens in stores
- DaisyUI for component styling, TailwindCSS for utilities
- MDSvex for markdown rendering in letters

### Backend (AWS SAM + Lambda)

```
backend/
├── template.yaml              # SAM template - single consolidated definition
├── lambdas/
│   ├── api/src/               # Main API Lambda (consolidated)
│   │   ├── index.ts           # Entry point, route dispatcher
│   │   ├── routes/            # Route handlers (comments, letters, media, messages, profile, reactions)
│   │   ├── repositories/      # DynamoDB data access
│   │   └── lib/               # Shared utilities
│   ├── activity-aggregator/   # DynamoDB stream processor for user stats
│   ├── letter-processor/      # PDF merge + Gemini AI parsing
│   └── notification-processor/# Email notifications via SES
└── scripts/                   # Deployment and utility scripts
```

**Key patterns:**
- Single consolidated API Lambda handles all REST endpoints
- Background processors triggered by DynamoDB Streams
- Single-table DynamoDB design (see `docs/DATA_MODEL.md` for key patterns)
- S3 buckets for letters, media, profile photos with presigned URLs

**Shared utilities (`api/src/lib/`):**
- `errors.ts` - Typed error classes (ValidationError, NotFoundError, etc.) and `toError()` for safe error conversion
- `constants.ts` - Presigned URL expiry times, pagination limits, content length limits
- `validation.ts` - Input validators including `validatePaginationKey()` for secure cursor handling
- `rate-limit.ts` - Atomic rate limiting with DynamoDB (fail-open for availability)
- `logger.ts` - Structured JSON logging with correlation ID support
- `responses.ts` - CORS-aware response helpers (fail-closed in production)

**Letter processor utilities (`letter-processor/src/lib/`):**
- `config.ts` - Environment validation with API key format checking
- `retry.ts` - Exponential backoff with `withRetry()` and transient error detection

### DynamoDB Single-Table Design

Key prefixes: `USER#`, `COMMENT#`, `CONV#`, `MSG#`, `REACTION#`, `LETTER#`, `DRAFT#`

Common access patterns:
- User profile: `PK=USER#{userId}, SK=PROFILE`
- Comments on item: `PK=COMMENT#{itemId}, SK begins_with timestamp`
- User's comments: `GSI1PK=USER#{userId}, GSI1SK begins_with COMMENT#`
- All letters: `GSI1PK=LETTERS` (sorted by date)
- All users: `GSI1PK=USERS` (for user listings)

### Test Structure

```
tests/
├── unit/                      # Vitest unit tests (handler tests)
├── integration/               # API integration tests
├── e2e/                       # Playwright browser tests
└── load/                      # Artillery load tests
```

Tests use `aws-sdk-client-mock` for mocking AWS services.

## Environment Configuration

Copy `.env.example` to `.env` and configure:
- `PUBLIC_COGNITO_*` - Required for auth (from SAM deploy outputs)
- `PUBLIC_API_GATEWAY_URL` - Backend API endpoint
- `PUBLIC_RAGSTACK_*` - Optional RAGStack integration for AI search/chat

## CI Pipeline

GitHub Actions runs on push/PR to main/develop:
1. **Lint**: ESLint with `--max-warnings 0`, TypeScript type check
2. **Test**: Vitest unit tests in parallel

Both must pass for PR merge.

## Key Documentation

- `docs/API_REFERENCE.md` - REST API endpoints
- `docs/DATA_MODEL.md` - DynamoDB schema and access patterns
- `docs/DEPLOYMENT.md` - Full AWS deployment guide
