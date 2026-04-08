# Tests

This directory holds every automated test in the repo. Tests are organized
by layer of the test pyramid.

## Test Pyramid

1. `unit/` — Vitest unit tests for pure functions and Lambda handlers.
   Fast, hermetic, no network. Run on every push and PR.
1. `integration/` — Jest tests that call the deployed API over HTTPS using a
   Cognito test user. Run against a development stack.
1. `e2e/` — Playwright browser tests that drive the SvelteKit frontend end
   to end. Run against a deployed development stack.
1. `load/` — Artillery load scenarios for rate-limit and capacity
   verification. Run on demand.

## Running Tests

From the repo root:

```bash
# Unit tests (fast, no deps)
npm test

# Single unit test file
npm test -- tests/unit/profile-handler.test.js

# Integration tests (requires deployed stack + Cognito test user)
cd tests/integration && npm install && npm test

# Single integration test file
cd tests/integration && npm test letters.test.js

# E2E tests (Playwright)
npm run test:e2e

# Load tests (Artillery)
npm run test:load
```

## aws-sdk-client-mock Pattern

Unit tests for Lambda handlers mock AWS clients with
[`aws-sdk-client-mock`](https://github.com/m-radzikowski/aws-sdk-client-mock).
The pattern is: create a mock for each client module, reset it in
`beforeEach`, and stub per-command responses inside each test.

Minimal example:

```javascript
import { mockClient } from 'aws-sdk-client-mock'
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb'
import { handler } from '../../backend/lambdas/api/src/routes/profile'

const ddbMock = mockClient(DynamoDBDocumentClient)

beforeEach(() => {
  ddbMock.reset()
})

test('returns profile when present', async () => {
  ddbMock.on(GetCommand).resolves({
    Item: { PK: 'USER#abc', SK: 'PROFILE', displayName: 'Alice' },
  })

  const result = await handler(
    { pathParameters: { userId: 'abc' } },
    { requestOrigin: 'https://example.test' },
  )

  expect(result.statusCode).toBe(200)
  expect(JSON.parse(result.body).displayName).toBe('Alice')
})
```

Notes:

- Reset every mock in `beforeEach` to avoid state leaking between tests.
- Prefer `.on(Command, input)` with a payload matcher when a handler issues
  multiple commands of the same type.
- Use `ddbMock.calls()` to assert on the commands a handler issued.

## Fixtures

- `tests/integration/fixtures/` — JSON payloads and small binary blobs used
  by integration tests. Name files after the route they exercise
  (for example `letters/upload-request.json`).
- `tests/e2e/fixtures/` — Static assets such as tiny PDFs or images used by
  Playwright specs. Prefer inlining base64 literals for files under 2 KB to
  avoid committing binaries.

## Environment Variables

Integration and E2E tests require a deployed stack. Set these before
running:

- `API_URL` — API Gateway base URL (for integration tests).
- `COGNITO_CLIENT_ID` — Cognito App Client ID.
- `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` — Seeded approved user.
- `LETTER_UPLOAD_TIMEOUT_MS`, `LETTER_UPLOAD_POLL_MS` — Optional overrides
  for the letter upload smoke test (defaults 60000 and 2000).

See the root `.env.example` for the full list.
