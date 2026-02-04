# Development

Local development setup and workflows for Family Archive - Document AI.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | v24 LTS | Runtime (use nvm) |
| npm | 10+ | Package manager |
| AWS CLI | v2 | AWS operations |
| AWS SAM CLI | Latest | Lambda deployment |

### Install Node.js (via nvm)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js 24
nvm install 24
nvm use 24
```

### Install AWS CLI

```bash
# macOS
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure credentials
aws configure
```

### Install SAM CLI

```bash
# macOS
brew install aws-sam-cli

# Linux
pip install aws-sam-cli
```

## Project Setup

### Clone and Install

```bash
git clone https://github.com/HatmanStack/family-archive-document-ai.git
cd family-archive-document-ai

# Install root dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Copy environment template
cp .env.example .env
```

### Configure Environment

Edit `.env` with your settings:

```bash
# Required for frontend
PUBLIC_API_GATEWAY_URL=https://xxx.execute-api.us-east-1.amazonaws.com
PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxx
PUBLIC_COGNITO_DOMAIN=your-app.auth.us-east-1.amazoncognito.com
PUBLIC_COGNITO_REDIRECT_URI=http://localhost:5173/auth/callback
PUBLIC_COGNITO_LOGOUT_URI=http://localhost:5173/auth/logout
PUBLIC_COGNITO_REGION=us-east-1

# Optional for RAGStack integration
PUBLIC_RAGSTACK_CHAT_URL=
PUBLIC_RAGSTACK_GRAPHQL_URL=
PUBLIC_RAGSTACK_API_KEY=
```

## Development Server

### Start Frontend

```bash
npm run dev
# or
cd frontend && npm run dev
```

The development server runs at `http://localhost:5173`.

### Hot Reload

SvelteKit provides hot module replacement (HMR). Changes to `.svelte` files update instantly without full page reload.

## Testing

### Test Structure

```
tests/
├── unit/                    # Vitest unit tests
│   ├── errors.test.js
│   ├── retry.test.js
│   ├── config.test.js
│   ├── letter-processor.test.js
│   ├── frontend-retry.test.ts
│   ├── request-deduplication.test.ts
│   └── migration/
│       ├── date-parser.test.js
│       ├── frontmatter-stripper.test.js
│       ├── s3-operations.test.js
│       └── slug-generator.test.js
├── integration/             # API integration tests
│   ├── comments.test.js
│   ├── profile.test.js
│   ├── messages.test.js
│   └── reactions.test.js
├── e2e/                     # Playwright browser tests
│   ├── comments.spec.ts
│   ├── messages.spec.ts
│   └── profile.spec.ts
└── load/                    # Artillery load tests
    ├── comments-load.yml
    ├── messages-load.yml
    └── profile-load.yml
```

### Run Unit Tests

```bash
# Run all unit tests
npm test

# Run in watch mode
npm test -- --watch

# Run specific test file
npm test -- tests/unit/errors.test.js

# Run tests matching pattern
npm test -- -t "rate limit"

# Run with coverage
npm test -- --coverage
```

### Run Integration Tests

Integration tests require a deployed backend and valid credentials:

```bash
# Set environment variables
export API_URL=https://xxx.execute-api.us-east-1.amazonaws.com
export COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
export COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxx
export TEST_USER_EMAIL=test@example.com
export TEST_USER_PASSWORD=TestPassword123!

# Run integration tests
cd tests/integration
npm test
```

### Run E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in UI mode (interactive)
npm run test:e2e -- --ui

# Run specific test file
npm run test:e2e -- tests/e2e/comments.spec.ts

# Run headed (visible browser)
npm run test:e2e -- --headed
```

### Run Load Tests

```bash
# Run all load tests
npm run test:load

# Run specific load test
npx artillery run tests/load/comments-load.yml
```

## Linting

### Run Linter

```bash
# Run ESLint + type check
npm run lint

# Auto-fix issues
cd frontend && npm run lint:fix
```

### Run All Checks

```bash
# Lint + tests (CI equivalent)
npm run check
```

## Backend Development

### Lambda Structure

The API Lambda uses a consolidated handler pattern:

```
backend/lambdas/api/src/
├── index.ts           # Main handler, route dispatch
├── routes/            # Route handlers
│   ├── index.ts      # Route dispatcher (not a handler)
│   ├── comments.ts   # Comment CRUD with soft delete
│   ├── contact.ts    # Contact form via SES
│   ├── drafts.ts     # Letter draft upload/processing
│   ├── letters.ts    # Letter CRUD, versioning
│   ├── media.ts      # Media download with presigned URLs
│   ├── messages.ts   # Conversations, DMs
│   ├── profile.ts    # User profiles, photos
│   └── reactions.ts  # Comment reactions
├── lib/               # Shared utilities
│   ├── errors.ts     # Typed error classes
│   ├── responses.ts  # HTTP responses
│   ├── validation.ts # Input validation
│   ├── rate-limit.ts # Rate limiting
│   ├── logger.ts     # Structured logging
│   ├── keys.ts       # DynamoDB keys
│   ├── database.ts   # DB client
│   ├── constants.ts  # Shared constants
│   ├── user.ts       # User management
│   └── s3-utils.ts   # S3 helpers
└── types/             # TypeScript types
    └── index.ts
```

### Local Lambda Testing

Use SAM CLI for local testing:

```bash
cd backend

# Start local API
sam local start-api

# Invoke single function
sam local invoke ApiFunction -e events/test-event.json
```

### Deploy Backend

```bash
# Interactive deploy
npm run deploy

# Or direct SAM deploy
cd backend
sam build
sam deploy --guided
```

## Git Workflow

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch (optional)
- `feature/*` - Feature branches
- `fix/*` - Bug fixes

### Commit Messages

Follow conventional commits:

```
feat: Add comment reactions
fix: Resolve rate limit race condition
docs: Update API reference
test: Add retry utility tests
refactor: Extract validation utilities
```

### Pull Request Process

1. Create feature branch from `main`
2. Make changes with tests
3. Run `npm run check` (lint + tests)
4. Push and create PR
5. Wait for CI to pass
6. Get review and merge

## CI/CD

GitHub Actions runs on push/PR to main:

1. **Lint**: ESLint with `--max-warnings 0`
2. **Type Check**: `svelte-check`
3. **Unit Tests**: Vitest in parallel

Both must pass for merge.

## Debugging

### Frontend Debugging

```typescript
// Console logging
console.log('Debug:', data)

// Svelte reactive debugging
$: console.log('Store changed:', $myStore)

// Browser DevTools
// - Network tab for API calls
// - Application tab for localStorage
// - Console for errors
```

### Backend Debugging

```typescript
// Structured logging
import { log } from './lib/logger'

log.debug('Processing request', { userId, action })
log.info('Request completed', { duration: Date.now() - start })
log.error('Request failed', { error: error.message, stack: error.stack })
```

### CloudWatch Logs

```bash
# View Lambda logs
aws logs tail /aws/lambda/YourFunctionName --follow

# Search logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/YourFunctionName \
  --filter-pattern "ERROR"
```

## Common Tasks

### Add New API Endpoint

1. Add route handler in `backend/lambdas/api/src/routes/`
2. Add types in `backend/lambdas/api/src/types/`
3. Register route in `backend/lambdas/api/src/index.ts`
4. Add API Gateway route in `backend/template.yaml`
5. Add frontend service in `frontend/lib/services/`
6. Write tests

### Add New Component

1. Create component in `frontend/lib/components/`
2. Add types if needed
3. Export from index if shared
4. Write tests

### Update DynamoDB Schema

1. Update types in `backend/lambdas/api/src/types/`
2. Update key builders in `backend/lambdas/api/src/lib/keys.ts`
3. Update documentation in `docs/DATA_MODEL.md`
4. Consider migration for existing data
