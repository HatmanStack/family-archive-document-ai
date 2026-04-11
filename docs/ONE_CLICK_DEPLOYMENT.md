# One-Click Deployment Guide

Deploy Family Archive - Document AI to your AWS account in ~15 minutes using CloudFormation.

## Prerequisites

- AWS Account
- AWS CLI installed and configured
- Google Gemini API key (for letter transcription)

## Step 1: Deploy via CloudFormation Template

**Template URL:**

```text
https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?templateURL=https://hold-that-thought-quicklaunch-public-631094035453.s3.us-east-1.amazonaws.com/hold-that-thought-template.yaml
```

### Required Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| **StackName** | CloudFormation stack name | `family-archive` |
| **AdminEmail** | Your email — receives the login invite, contact form submissions, and RAGStack dashboard access | `you@example.com` |
| **GeminiApiKey** | Google Gemini API key for transcription | `AIza...` |

### Optional Parameters

| Parameter | Description | Default |
|-----------|-------------|---------|
| **GoogleClientId** | Google OAuth client ID (for "Sign in with Google") | _(empty — skip OAuth)_ |
| **GoogleClientSecret** | Google OAuth secret | _(empty)_ |
| **RagStackBuildWebComponent** | Build RAGStack chat widget | `true` |
| **RagStackBuildDashboard** | Build RAGStack admin dashboard | `true` |

Leave **AppDomain** and **AllowedOrigins** at their defaults for now — you'll update them after the stack creates your Amplify app.

Deployment takes ~10-15 minutes.

---

## Step 2: Check Your Welcome Email

Once the stack finishes (~15 minutes), check the email you entered for **AdminEmail**. You'll receive a welcome message with:

- **Your app URL** — the Amplify hosting link (e.g., `https://main.d1abc23.amplifyapp.com`)
- **Your username** — the email you provided
- **A temporary password** — use this for your first login

Log in at the app URL and set a new password on first sign-in.

If you don't see the email, check your spam folder. The sender is `no-reply@verificationemail.com`.

### Update AppDomain and CORS

The stack deployed with `localhost:5173` as the default OAuth domain. Now that you have your Amplify URL, update it:

1. Go to **CloudFormation** → your stack → **Update**
2. Choose **Use current template**
3. Set **AppDomain** to your Amplify domain from the welcome email (e.g., `main.d1abc23.amplifyapp.com`)
4. Set **AllowedOrigins** to `https://main.d1abc23.amplifyapp.com`
5. Deploy the update

This configures Cognito OAuth callbacks and API Gateway CORS for your real domain.

---

## Step 3: Set Up Google OAuth (Optional)

To enable "Sign in with Google":

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Credentials → Create OAuth Client
2. Add these as **Authorized redirect URIs**:
   - `https://{StackName}-{AccountId}.auth.{Region}.amazoncognito.com/oauth2/idpresponse`
   - `https://main.{your-amplify-id}.amplifyapp.com/auth/callback`
3. Add your Amplify URL as an **Authorized JavaScript origin**
4. Update the CloudFormation stack with the **GoogleClientId** and **GoogleClientSecret**

The Cognito Hosted UI domain follows the pattern `{StackName}-{AccountId}` — find the exact value in the stack outputs.

---

## Step 4: Understanding User Management

This stack creates **two separate user systems**:

| System | Purpose | Where |
|--------|---------|-------|
| **Cognito User Pool** | Family Archive app login | Same region as your stack |
| **RAGStack User Pool** | RAGStack admin dashboard | us-east-1 (nested stack) |

The admin user created during deployment is added to the **Family Archive** Cognito pool only. To access the RAGStack admin dashboard, you'll need to create a separate account there.

### Adding Family Members

After a family member signs up through the app, add them to the ApprovedUsers group:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username their-email@example.com \
  --group-name ApprovedUsers \
  --region YOUR_REGION
```

To make someone an admin:

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_USER_POOL_ID \
  --username their-email@example.com \
  --group-name Admins \
  --region YOUR_REGION
```

---

## Step 5: Upload First Letter

1. Navigate to **Letters** → **Upload**
2. Upload PDF or images (max 20 files, 10MB each)
3. Click **Process Upload**
4. Wait for AI transcription (~30 seconds)
5. Review draft in **Admin** → **Drafts**
6. Click **Publish** to make letter live

---

## Step 6: Custom Domain (Optional)

To use your own domain instead of the Amplify URL:

1. Go to **Amplify Console** → your app → **Domain Management**
2. Add your custom domain and follow the DNS setup
3. Update the CloudFormation stack:
   - **AppDomain** → your custom domain
   - **AllowedOrigins** → `https://your-custom-domain.com`
4. If using Google OAuth, add the new domain to your Google Cloud Console redirect URIs

---

## Troubleshooting

### No invite email received

**Cause:** AdminEmail was left empty or the email went to spam
**Fix:** Check spam folder. If still missing, manually create a user:

```bash
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username your-email@example.com \
  --user-attributes Name=email,Value=your-email@example.com Name=email_verified,Value=true \
  --region YOUR_REGION
```

### 403 Error after login

**Cause:** User not in ApprovedUsers group
**Fix:** Run the `admin-add-user-to-group` command from Step 4

### Google login shows "Login option is not available"

**Cause:** The Cognito client ID in the frontend doesn't match the Google OAuth client, or the redirect URI in Google Cloud Console is wrong
**Fix:** Verify the redirect URI matches your Cognito Hosted UI domain

### Letter Processing Stuck

**Cause:** Invalid Gemini API key or API rate limit
**Check:** CloudWatch Logs → `/aws/lambda/{StackName}-LetterProcessorFunction`

### Frontend Not Updating

**Cause:** Amplify build still in progress
**Check:** Amplify Console → Your App → Build history (builds take 5-10 minutes)

---

## Cost Estimate

| Service | Estimated Monthly Cost |
|---------|----------------------|
| Lambda | ~$1 (1M free tier) |
| DynamoDB | ~$1 (25GB free tier) |
| S3 | ~$1 (5GB storage) |
| API Gateway | ~$1 (1M free tier) |
| Amplify Hosting | ~$0 (free tier) |
| Cognito | Free (under 50K MAU) |
| RAGStack | ~$5-10 (embeddings + vector DB) |

**Total**: ~$5-15/month for small family use

---

## Next Steps

- **Invite Family**: Share the app URL and add members to ApprovedUsers
- **Custom Domain**: Configure in Amplify → Domain Management
- **Email Notifications**: Verify SES sender email (see [SES_SETUP.md](SES_SETUP.md))
- **RAGStack Search**: Access the admin dashboard to configure semantic search

---

## Support

- **GitHub Issues**: https://github.com/HatmanStack/family-archive-document-ai/issues
- **Documentation**: See [docs/](../docs/) directory
