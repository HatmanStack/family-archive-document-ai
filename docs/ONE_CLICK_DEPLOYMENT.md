# One-Click Deployment Guide

Deploy Family Archive - Document AI to your AWS account in ~15 minutes using CloudFormation.

## Prerequisites

- AWS Account
- AWS CLI installed and configured
- Google Gemini API key (for letter transcription)

## Step 1: Deploy via CloudFormation Template

**Template URL:**
```
https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?templateURL=https://hold-that-thought-quicklaunch-public-631094035453.s3.us-east-1.amazonaws.com/hold-that-thought-template.yaml
```

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| **StackName** | CloudFormation stack name | `family-archive-prod` |
| **AppDomain** | Domain for OAuth callbacks | `localhost:5173` (dev) or `yourdomain.com` |
| **GeminiApiKey** | Google Gemini API key for transcription | `AIza...` |
| **AdminEmail** | Admin email for contact form | `admin@yourdomain.com` |
| **AllowedOrigins** | CORS origins (comma-separated) | `http://localhost:5173` or `https://yourdomain.com` |

### Optional Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| **GoogleClientId** | Google OAuth client ID | _(empty - skip OAuth)_ |
| **GoogleClientSecret** | Google OAuth secret | _(empty)_ |
| **RagStackAdminEmail** | RAGStack admin email | _(uses AdminEmail)_ |
| **RagStackBuildWebComponent** | Build RAGStack chat widget | `true` |
| **RagStackBuildDashboard** | Build RAGStack admin dashboard | `true` |
| **DeployUI** | Deploy frontend via Amplify | `true` |

**Deploy the stack** - CloudFormation creates:
- API Gateway + Lambda functions
- DynamoDB table
- S3 buckets
- Cognito User Pool + **ApprovedUsers and Admins groups** (auto-created)
- Amplify frontend hosting
- RAGStack nested stack (optional)

Deployment takes ~10-15 minutes.

---

## Step 2: Add Yourself to ApprovedUsers Group

**REQUIRED:** The app blocks access without group membership.

### Get User Pool ID

After stack creation, go to **Outputs** tab:

```bash
# From CloudFormation Console Outputs, find:
USER_POOL_ID=us-east-1_xxxxxxx
```

### Add User to Group

**After signing up**, add yourself to ApprovedUsers:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username your-email@example.com \
  --group-name ApprovedUsers \
  --region us-east-1
```

**Verify group membership:**

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username your-email@example.com \
  --region us-east-1
```

### Make Admin (Optional)

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username your-email@example.com \
  --group-name Admins \
  --region us-east-1
```

---

## Step 3: Access Your Application

### Get Application URL

From CloudFormation **Outputs**:

- **AmplifyAppUrl**: Your frontend URL (e.g., `https://main.xxxxxx.amplifyapp.com`)
- **ApiGatewayUrl**: Backend API URL
- **RagStackAdminDashboardUrl**: RAGStack admin dashboard (if enabled)

### First Login

1. Navigate to AmplifyAppUrl
2. Sign up with your email
3. **Wait for admin to add you to ApprovedUsers group** (Step 2)
4. Refresh page - you now have full access

---

## Step 4: Configure RAGStack (Optional)

If you enabled RAGStack (`RagStackBuildWebComponent=true`), configure semantic search:

### Access RAGStack Admin Dashboard

From CloudFormation **Outputs**, copy **RagStackAdminDashboardUrl**:
```
https://main.xxxxxx.amplifyapp.com/admin
```

### Configure Search & Chat

1. **Login** to admin dashboard with RagStackAdminEmail
2. **Data Sources**: Verify S3 bucket connection
3. **Embeddings**: Configure vector search (default: OpenAI embeddings)
4. **Chat Widget**: Customize appearance and behavior
5. **Index Content**: Trigger initial indexing of uploaded letters/media

### RAGStack Environment Variables

The frontend `.env` is auto-configured with:
- `PUBLIC_RAGSTACK_GRAPHQL_URL` - GraphQL API endpoint
- `PUBLIC_RAGSTACK_API_KEY` - API authentication key
- `PUBLIC_RAGSTACK_CHAT_URL` - Chat widget URL

---

## Step 5: Upload First Letter

1. Navigate to **Letters** → **Upload**
2. Upload PDF or images (max 20 files, 10MB each)
3. Click **Process Upload**
4. Wait for AI transcription (~30 seconds)
5. Review draft in **Admin** → **Drafts**
6. Click **Publish** to make letter live

---

## Troubleshooting

### 403 Error: "Access denied. User is not in ApprovedUsers group"

**Cause:** User not added to ApprovedUsers group
**Fix:** Run Step 2 commands to add user to group

### Letter Processing Stuck

**Cause:** Invalid Gemini API key or API rate limit
**Check:** CloudWatch Logs → `/aws/lambda/{StackName}-LetterProcessorFunction`
**Fix:** Verify API key starts with `AIza` and has Gemini API enabled

### RAGStack Chat Not Working

**Cause:** RAGStack build parameters disabled
**Fix:** Update stack with `RagStackBuildWebComponent=true`
**Verify:** Check RagStackAdminDashboardUrl in Outputs

### Frontend Not Updating After Deploy

**Cause:** Amplify build in progress
**Check:** Amplify Console → Your App → Build history
**Wait:** Builds take 5-10 minutes

---

## Cost Estimate

- **Lambda**: ~$1/month (1M free tier)
- **DynamoDB**: ~$1/month (25GB free tier)
- **S3**: ~$1/month (5GB storage)
- **API Gateway**: ~$1/month (1M free tier)
- **Amplify Hosting**: ~$0 (free tier)
- **Cognito**: Free (under 50K MAU)
- **RAGStack**: ~$5-10/month (embeddings + vector DB)

**Total**: ~$5-15/month for small family use

---

## Next Steps

- **Invite Family**: Add more users to ApprovedUsers group
- **Customize**: Update frontend branding in Amplify Console
- **Custom Domain**: Configure in Amplify → Domain Management
- **Email Notifications**: Verify SES sender email (see [SES_SETUP.md](SES_SETUP.md))
- **Backups**: Enable DynamoDB point-in-time recovery (auto-enabled in template)

---

## Support

- **GitHub Issues**: https://github.com/HatmanStack/family-archive-document-ai/issues
- **Email**: gemenielabs@gmail.com
- **Documentation**: See [docs/](../docs/) directory
