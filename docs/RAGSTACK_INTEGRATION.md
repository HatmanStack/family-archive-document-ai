# RAGStack Integration Guide

RAGStack provides AI-powered semantic search and conversational chat for Family Archive content. It's deployed as a nested CloudFormation stack with optional components.

## Architecture

### Nested Stack Pattern

Family Archive deploys RAGStack as a **nested CloudFormation stack**:

```yaml
Resources:
  ragstack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: https://ragstack-quicklaunch-public-{AccountId}.s3.us-east-1.amazonaws.com/ragstack-template.yaml
      Parameters:
        AdminEmail: !Ref RagStackAdminEmail
        StackPrefix: !Sub '${AWS::StackName}-rag'
        BuildWebComponent: !Ref RagStackBuildWebComponent
        BuildDashboard: !Ref RagStackBuildDashboard
        AdditionalCorsOrigins: !Sub 'https://main.${AmplifyApp.AppId}.amplifyapp.com'
```

**Benefits:**
- Single deployment command creates both stacks
- Automatic resource passing (S3 buckets, API URLs)
- Coordinated updates and rollbacks
- Stack outputs automatically available to parent

### RAGStack Components

When deployed, RAGStack creates:

1. **AppSync GraphQL API** - Query interface for semantic search
2. **OpenSearch Serverless** - Vector database for embeddings
3. **Lambda Functions** - Indexing, search, chat processing
4. **S3 Data Bucket** - Indexed content storage
5. **CloudFront CDN** - Chat widget distribution (if enabled)
6. **Amplify Dashboard** - Admin UI (if enabled)

---

## Deployment Parameters

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| **RagStackAdminEmail** | Admin access for dashboard | `admin@yourdomain.com` |

### Build Control Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| **RagStackBuildWebComponent** | `true` / `false` | Build chat widget for embedding |
| **RagStackBuildDashboard** | `true` / `false` | Build admin dashboard UI |

**Initial deployment:** Set both to `true`
**Stack updates:** Set to `false` to skip rebuild (faster updates)

### Advanced Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| **RagStackTemplateUrl** | S3 URL of RAGStack template | Auto-configured |
| **AdditionalCorsOrigins** | Amplify app URL | Auto-configured from parent stack |

---

## Stack Outputs

RAGStack provides these outputs to the parent stack:

| Output | Usage | Auto-configured in |
|--------|-------|-------------------|
| **GraphQLApiUrl** | AppSync endpoint | Frontend env vars |
| **GraphQLApiKey** | API authentication | Frontend env vars |
| **WebComponentCDNUrl** | Chat widget JS URL | Frontend env vars |
| **DataBucketName** | S3 bucket for indexed content | Backend Lambda env vars |
| **UIUrl** | Admin dashboard URL | CloudFormation stack outputs |

**Frontend environment variables** (auto-configured):
```bash
PUBLIC_RAGSTACK_GRAPHQL_URL=https://xxxxxx.appsync-api.us-east-1.amazonaws.com/graphql
PUBLIC_RAGSTACK_API_KEY=da2-xxxxxxxxxxxxxxxxxx
PUBLIC_RAGSTACK_CHAT_URL=https://xxxxx.cloudfront.net/ragstack-chat.js
```

---

## Admin Dashboard Access

### Get Dashboard URL

From CloudFormation **Outputs** tab:
```
RagStackAdminDashboardUrl: https://main.xxxxxx.amplifyapp.com/admin
```

### Dashboard Features

1. **Data Sources**
   - View connected S3 buckets
   - Monitor indexing status
   - Trigger manual re-indexing

2. **Search Configuration**
   - Configure embedding models (default: OpenAI)
   - Adjust search relevance thresholds
   - Test search queries

3. **Chat Widget Settings**
   - Customize appearance (colors, position)
   - Configure chat behavior
   - Set response tone and length

4. **Analytics**
   - Search query volume
   - Top queries
   - User engagement metrics

---

## Content Indexing

### Automatic Indexing

RAGStack automatically indexes:
- **Letters** uploaded via draft system
- **Media** uploaded to gallery
- **Documents** uploaded as attachments

**Indexing flow:**
1. User uploads content → S3 archive bucket
2. S3 event triggers Lambda
3. Lambda extracts text/metadata
4. Embeddings generated via OpenAI
5. Vector stored in OpenSearch
6. Content queryable via GraphQL

### Manual Indexing

Re-index existing content via admin dashboard:
1. Navigate to **Data Sources**
2. Select S3 bucket
3. Click **Trigger Indexing**
4. Monitor progress in dashboard

### Supported Content Types

| Type | Indexing Method |
|------|-----------------|
| **Letters (Markdown)** | Full text + metadata (date, author) |
| **PDFs** | Text extraction via Textract |
| **Images** | OCR via Textract + AI description |
| **Videos** | Metadata only (title, description) |
| **Documents** | Text extraction (DOCX, TXT) |

---

## GraphQL API Usage

### Query Interface

**Endpoint:** From `PUBLIC_RAGSTACK_GRAPHQL_URL`
**Auth:** API Key in `x-api-key` header

### Example Queries

**Semantic search:**
```graphql
query SearchContent {
  searchDocuments(query: "grandmother's recipes", limit: 10) {
    items {
      id
      title
      content
      metadata {
        date
        author
        type
      }
      score
    }
  }
}
```

**List all documents:**
```graphql
query ListDocuments {
  listDocuments(limit: 50, nextToken: null) {
    items {
      id
      title
      createdAt
      documentType
    }
    nextToken
  }
}
```

**Get document by ID:**
```graphql
query GetDocument {
  getDocument(id: "letter-2024-01-15") {
    id
    title
    content
    metadata {
      date
      author
    }
    ragstackDocumentId
  }
}
```

---

## Chat Widget Integration

### Automatic Embedding

If `RagStackBuildWebComponent: true`, the chat widget is automatically embedded in the frontend:

**Location:** `frontend/routes/+layout.svelte` or `frontend/app.html`

```html
<script src="{PUBLIC_RAGSTACK_CHAT_URL}"></script>
<script>
  RagstackChat.init({
    apiUrl: '{PUBLIC_RAGSTACK_GRAPHQL_URL}',
    apiKey: '{PUBLIC_RAGSTACK_API_KEY}',
    theme: 'light',
    position: 'bottom-right'
  })
</script>
```

### Chat Features

- **Conversational search** - Natural language queries
- **Context-aware responses** - Uses indexed content
- **Source citations** - Links back to original letters/media
- **Multi-turn conversations** - Maintains context

---

## Data Bucket Integration

### Backend Lambda Access

Backend Lambda functions have read access to RAGStack data bucket:

```typescript
// Environment variable auto-configured
const RAGSTACK_BUCKET = process.env.RAGSTACK_BUCKET // Output from nested stack

// Generate presigned URL for RAGStack content
const url = await getSignedUrl(s3Client, new GetObjectCommand({
  Bucket: RAGSTACK_BUCKET,
  Key: 'content/letter-2024-01-15.md'
}), { expiresIn: 3600 })
```

### Dual-Bucket Strategy

- **Archive bucket** - Original uploads, profile photos, temp files
- **RAGStack bucket** - Processed/indexed content for search

**Letter workflow:**
1. Upload PDF → Archive bucket (`temp/` prefix)
2. Process & merge → Archive bucket (`letters/` prefix)
3. Index for search → RAGStack bucket (`content/` prefix)
4. Frontend displays → Presigned URL from RAGStack bucket

---

## Updating RAGStack Configuration

### Via CloudFormation Console

1. Navigate to CloudFormation → Stacks
2. Select parent stack (e.g., `family-archive-prod`)
3. Click **Update**
4. Modify RAGStack parameters:
   - Set `RagStackBuildWebComponent: false` (skip rebuild)
   - Set `RagStackBuildDashboard: false` (skip rebuild)
5. Review and update

**Note:** Rebuilding components adds 10-15 minutes to update time.

### Via Admin Dashboard

Most configuration changes can be made via the admin dashboard without stack updates:
- Search parameters
- Chat widget appearance
- Indexing triggers

---

## Troubleshooting

### Chat Widget Not Loading

**Check:**
1. Verify `PUBLIC_RAGSTACK_CHAT_URL` in frontend `.env`
2. Check CloudFront distribution status (may take 5-10 min after deploy)
3. Verify CORS configuration in RAGStack stack

**Fix:**
```bash
# Check frontend env vars
grep RAGSTACK frontend/.env

# Verify CloudFront URL is accessible
curl -I $PUBLIC_RAGSTACK_CHAT_URL
```

### Search Returns No Results

**Causes:**
- Content not indexed yet
- OpenSearch cluster initializing
- Embedding model misconfigured

**Fix:**
1. Admin Dashboard → Data Sources → Verify indexing status
2. Check CloudWatch Logs: `/aws/lambda/{StackName}-rag-IndexerFunction`
3. Manually trigger re-indexing

### GraphQL API 401 Unauthorized

**Cause:** Invalid API key

**Fix:**
```bash
# Get correct API key from stack outputs
aws cloudformation describe-stacks \
  --stack-name family-archive-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`RagStackGraphQLApiKey`].OutputValue' \
  --output text

# Update frontend .env
PUBLIC_RAGSTACK_API_KEY=<new-key>
```

### Indexing Lambda Timeouts

**Cause:** Large PDF/image files

**Fix:**
1. Increase Lambda timeout (RAGStack template)
2. Split large PDFs into smaller files
3. Check CloudWatch Logs for specific errors

---

## Cost Breakdown

| Service | Usage | Estimated Cost |
|---------|-------|----------------|
| **AppSync GraphQL** | 1M requests | ~$4 |
| **OpenSearch Serverless** | 1 OCU | ~$30 |
| **Lambda** | Indexing + search | ~$2 |
| **CloudFront** | Chat widget CDN | ~$0 (free tier) |
| **Amplify Dashboard** | Static hosting | ~$0 (free tier) |
| **OpenAI Embeddings** | text-embedding-3-small | ~$5 |

**Total:** ~$40-50/month

**Cost optimization:**
- Disable dashboard if not needed
- Use smaller embedding models
- Reduce OpenSearch OCU during low traffic

---

## Advanced: Custom Embedding Models

RAGStack supports custom embedding providers:

1. **OpenAI** (default) - Best quality, moderate cost
2. **Cohere** - Good quality, lower cost
3. **AWS Bedrock** - Titan embeddings, AWS-native
4. **Self-hosted** - Sentence transformers, lowest cost

Configure via admin dashboard → **Search Configuration** → **Embedding Provider**

---

## Further Reading

- [RAGStack Documentation](https://github.com/HatmanStack/RAGStack-Lambda)
- [AppSync GraphQL API](https://docs.aws.amazon.com/appsync/)
- [OpenSearch Serverless](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/serverless.html)
- [Semantic Search Best Practices](https://www.pinecone.io/learn/semantic-search/)
