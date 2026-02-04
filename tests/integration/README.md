# Integration Tests

Automated integration tests for Family Archive - Document AI backend APIs.

## Setup

1. Install dependencies:
```bash
cd tests/integration
npm install
```

2. Set environment variables:
```bash
export API_URL=https://<api-id>.execute-api.us-east-1.amazonaws.com/prod
export COGNITO_CLIENT_ID=<your-client-id>
export TEST_USER_EMAIL=test@example.com
export TEST_USER_PASSWORD=TestPassword123!
export TEST_USER_ID=test-user-123
export TEST_USER_2_ID=test-user-2
```

3. Ensure test users exist in Cognito ApprovedUsers group

## Running Tests

Run all integration tests:
```bash
npm test
```

Run specific test suite:
```bash
npm test profile.test.js
```

## Tests Included

- **profile.test.js** - Profile API (5 tests)
- **comments.test.js** - Comments API (6 tests)
- **reactions.test.js** - Reactions API (3 tests)
- **messages.test.js** - Messages API (7 tests)

**Total: 21 integration tests**

## Notes

- Tests run sequentially (`--runInBand`) to avoid race conditions
- Tests use eventual consistency delays where needed
- Tests create real data in DynamoDB (clean up manually if needed)
- Tests require valid Cognito credentials and deployed infrastructure
