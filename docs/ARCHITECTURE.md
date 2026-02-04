# Architecture

## System Design

```text
User Request → API Gateway → Lambda (consolidated) → DynamoDB / S3
                   ↓
              Cognito JWT validation
```

**Principles:**
- Serverless (auto-scaling, pay-per-use)
- Single-table DynamoDB design for efficient access patterns
- Consolidated API Lambda for simplified deployment
- Presigned URLs for secure S3 access (no direct bucket access)
- Type-safe TypeScript throughout

## Components

| Component | Purpose |
|-----------|---------|
| **API Lambda** | Consolidated REST API handler with route-based dispatch |
| **Letter Processor Lambda** | PDF merge + Gemini AI transcription |
| **Activity Aggregator Lambda** | DynamoDB Streams processor for user stats |
| **Notification Processor Lambda** | Email notifications via SES |
| **API Gateway** | HTTP routing with Cognito authorizer |
| **DynamoDB** | Single-table design for all entities |
| **S3** | File storage (letters, media, profile photos) |
| **Cognito** | User authentication and authorization |
| **SES** | Transactional email (contact form, notifications) |

## Data Flow

### Authentication

```text
1. User → Cognito (login)
2. Cognito → JWT token
3. Frontend stores token
4. API requests include Authorization header
5. API Gateway validates JWT
6. Lambda receives claims (sub, email, groups)
```

### Letter Upload & Processing

```text
1. User uploads PDF/images via presigned URL
2. Frontend calls POST /letters/upload-request
3. Lambda returns presigned URLs for each file
4. User uploads files directly to S3 temp/
5. Frontend calls POST /letters/process/{uploadId}
6. API Lambda invokes Letter Processor (async)
7. Letter Processor:
   a. Downloads files from S3
   b. Merges PDFs/images into single PDF
   c. Sends to Gemini AI for transcription
   d. Saves draft to DynamoDB
8. Admin reviews and publishes draft
```

### Comment System

```text
1. User submits comment on letter/media
2. Rate limit check (atomic DynamoDB update)
3. Comment saved with composite key:
   - PK: COMMENT#{itemId}
   - SK: {timestamp}#{commentId}
4. GSI1 enables user's comment history:
   - GSI1PK: USER#{userId}
   - GSI1SK: COMMENT#{timestamp}
```

### Messaging

```text
1. Create conversation:
   - Direct (2 users): ID = sorted user IDs
   - Group (3+ users): ID = UUID
2. Messages stored with conversation partition
3. Participant membership tracked per-user
4. Unread counts updated atomically
5. S3 attachments linked via s3Key
```

### Media Gallery

```text
1. User requests upload URL
2. Lambda generates presigned PUT URL
3. User uploads directly to S3
4. File categorized (pictures/videos/documents)
5. List operations return presigned GET URLs
6. Optional: RAGStack indexes for semantic search
```

## API Lambda Structure

The consolidated API Lambda uses route-based dispatch:

```typescript
// index.ts - Main handler
handler(event) {
  // Extract auth context from Cognito claims
  // Route to appropriate handler based on path:

  /comments/*     → comments.handle()
  /messages/*     → messages.handle()
  /profile/*      → profile.handle()
  /reactions/*    → reactions.handle()
  /media/*        → media.handle()
  /letters/*      → letters.handle()
  /admin/drafts/* → drafts.handle()
  /contact        → contact.handle()
}
```

### Shared Libraries

| Library | Purpose |
|---------|---------|
| `lib/errors.ts` | Typed error classes (ValidationError, NotFoundError, etc.) |
| `lib/responses.ts` | CORS-aware response helpers |
| `lib/validation.ts` | Input validation and sanitization |
| `lib/rate-limit.ts` | Atomic rate limiting with DynamoDB |
| `lib/logger.ts` | Structured JSON logging with correlation IDs |
| `lib/keys.ts` | DynamoDB key builders |
| `lib/database.ts` | DynamoDB client and table config |
| `lib/constants.ts` | Shared constants (limits, expiry times) |
| `lib/user.ts` | User profile management |
| `lib/s3-utils.ts` | S3 presigned URL helpers |

## Security

### Authentication
- Cognito User Pool with email/password
- Optional Google OAuth federation
- JWT tokens with 1-hour expiry
- Refresh tokens for session persistence

### Authorization
- User groups: `Admins`, `ApprovedUsers`
- Resource ownership checks (comments, messages)
- Admin-only routes protected

### Input Validation
- UUID format validation
- Path traversal prevention
- HTML sanitization (XSS prevention)
- Content length limits

### Rate Limiting
- Atomic DynamoDB counters
- Per-action limits (comments: 20/min, messages: 30/min)
- Fail-open for availability (log + allow on errors)

### CORS
- Fail-closed: requires explicit `ALLOWED_ORIGINS`
- Per-request origin validation
- Credentials support for authenticated requests

### S3 Security
- No public bucket access
- Presigned URLs for all operations
- Short expiry (15 min upload, 1 hour download)
- Path prefix restrictions

## Error Handling

### Typed Errors

```typescript
// Application errors with HTTP semantics
ValidationError    → 400
AuthenticationError → 401
AuthorizationError → 403
NotFoundError      → 404
ConflictError      → 409
RateLimitError     → 429
InternalError      → 500
```

### Error Flow

```text
1. Route handler throws typed error
2. Main handler catches with toError()
3. getStatusCode() extracts HTTP status
4. getUserMessage() returns safe message
5. errorResponse() sends JSON with CORS
```

### Operational vs System Errors
- Operational (isOperational=true): Show message to user
- System (isOperational=false): Generic "unexpected error" message

## Observability

### Logging
- Structured JSON format
- Correlation ID from X-Amzn-Trace-Id
- Log levels: debug, info, warn, error

### Metrics
- CloudWatch Lambda metrics (invocations, errors, duration)
- Custom metrics via log-based filters

### Tracing
- X-Ray tracing (when enabled)
- Correlation IDs for request tracking

## Performance

### DynamoDB
- Single-table design minimizes round trips
- GSI for alternate access patterns
- Batch operations for bulk updates

### S3
- Direct uploads via presigned URLs (bypass Lambda)
- CloudFront optional for global distribution

### Lambda
- Consolidated handler reduces cold starts
- Connection reuse for AWS SDK clients

## Cost Optimization

- Lambda: Pay only for execution time
- DynamoDB: On-demand capacity (no provisioning)
- S3: Standard storage class
- API Gateway: Per-request pricing

**Estimated costs (small family use - 10 users, 100 requests/day):**
- Lambda: ~$1/month (1M free tier)
- DynamoDB: ~$1/month (25GB free tier)
- S3: ~$1/month (5GB storage)
- API Gateway: ~$1/month (1M free tier)
- Cognito: Free (under 50K MAU)
- SES: ~$0.10/month (first 62K emails free)
- Total: ~$5/month

Pricing as of 2026. Check current rates: https://aws.amazon.com/pricing/

## Stack

- **Infrastructure:** AWS SAM, CloudFormation
- **Compute:** Lambda (Node.js 20)
- **Database:** DynamoDB (single-table)
- **Storage:** S3
- **Auth:** Cognito
- **API:** API Gateway (HTTP API)
- **Email:** SES
- **AI:** Google Gemini (letter transcription)
- **Frontend:** SvelteKit 2, Svelte 4, DaisyUI, TailwindCSS