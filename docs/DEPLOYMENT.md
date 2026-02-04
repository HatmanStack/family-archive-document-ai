# Deployment Guide

## Prerequisites

- **Node.js** v24 LTS (via nvm)
- **npm** (included with Node.js)
- **AWS CLI** configured with credentials
- **AWS SAM CLI** for serverless deployment

## Project Structure

This is a monorepo with npm workspaces:

```text
├── frontend/          # SvelteKit app (has own package.json)
├── backend/           # AWS SAM application
│   ├── lambdas/       # Lambda function code
│   ├── scripts/       # Deployment scripts
│   └── template.yaml  # SAM template
├── tests/             # Centralized tests
└── package.json       # Root orchestration
```

## Quick Deploy

```bash
# From repository root:

# Backend (Lambda + API Gateway + DynamoDB)
npm run deploy

# Frontend (build for production)
npm run build
```

## Backend Deployment

### Deploy (First-time or Subsequent)

```bash
npm run deploy
```

The deploy script will prompt for:
- AWS Region
- Stack Name
- App Domain (for OAuth callbacks)
- Allowed Origins (CORS)
- Google OAuth Client ID & Secret (optional)
- Google Gemini API Key (for letter processing)
- DynamoDB Table Name
- SES From Email (for notifications)
- S3 Archive Bucket

Configuration is saved to `backend/.env.deploy` for future runs. The script also:
- Generates `samconfig.toml` automatically
- Builds and deploys the SAM application
- Updates frontend `.env` with stack outputs

**Note:** Do not use `sam deploy --guided`. The deploy script handles all configuration interactively and keeps everything in sync.

## Frontend Deployment

### Install Dependencies

```bash
# From repository root
npm install              # Root dependencies
cd frontend && npm install  # Frontend dependencies
```

### Build

```bash
# From repository root
npm run build
```

Output is in `frontend/build/`.

### Deploy Frontend

The built frontend in `frontend/build/` can be deployed to any static hosting provider (S3 + CloudFront, Vercel, etc.).

### Environment Variables

The deploy script automatically copies `.env` to `frontend/.env` for Vite.

Required variables (set in `.env` or hosting platform):

| Variable | Description |
|----------|-------------|
| `PUBLIC_AWS_REGION` | AWS region (e.g., `us-west-2`) |
| `PUBLIC_API_GATEWAY_URL` | API Gateway URL (auto-populated by deploy) |
| `PUBLIC_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `PUBLIC_COGNITO_USER_POOL_CLIENT_ID` | Cognito App Client ID |
| `PUBLIC_COGNITO_IDENTITY_POOL_ID` | Cognito Identity Pool ID |
| `PUBLIC_COGNITO_HOSTED_UI_URL` | Cognito Hosted UI URL (for OAuth) |
| `PUBLIC_COGNITO_HOSTED_UI_DOMAIN` | Cognito domain prefix |

## Infrastructure Components

### Created by SAM Deploy

- **API Gateway** - REST API with Cognito authorizer
- **Lambda Functions** - ApiFunction, LetterProcessorFunction, ActivityAggregatorFunction, NotificationProcessorFunction
- **DynamoDB Table** - Single-table design for all data
- **Cognito User Pool** - User authentication with Identity Pool and domain

### Required Parameters (existing resources)

- **S3 Buckets** - Archive bucket, photo bucket, media bucket (must exist before deploy)

### Manual Setup Required

1. **Cognito Google OAuth** - Add Google as identity provider in Cognito console
2. **SES Email Verification** - Verify sender email address for notifications
3. **CloudFront** (optional) - CDN for S3 media

## Cognito Setup

### Add Google OAuth

#### Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create or select an OAuth 2.0 Client ID (Application type: Web application)
3. Under "Authorized JavaScript origins", add your Cognito Hosted UI URL:
   ```
   https://<your-domain-prefix>.auth.<region>.amazoncognito.com
   ```
4. Under "Authorized redirect URIs", add the Cognito OAuth callback:
   ```
   https://<your-domain-prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse
   ```
5. Save and copy the **Client ID** and **Client Secret** for Cognito setup

#### AWS Cognito Console Setup

1. Go to Cognito Console → User Pool → Sign-in experience
2. Add identity provider → Google
3. Enter Google Client ID and Secret
4. Map attributes: `email`, `name`, `picture`

### User Groups

**Groups are auto-created by CloudFormation:**
- `ApprovedUsers` - Required for app access (frontend enforces this)
- `Admins` - Full administrative access

**Add users to ApprovedUsers group** (required after signup):

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_POOL_ID \
  --username user@example.com \
  --group-name ApprovedUsers \
  --region us-east-1
```

**Verify group membership:**

```bash
aws cognito-idp admin-list-groups-for-user \
  --user-pool-id YOUR_POOL_ID \
  --username user@example.com \
  --region us-east-1
```

**Add admin privileges** (optional):

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_POOL_ID \
  --username user@example.com \
  --group-name Admins \
  --region us-east-1
```

### Guest Access (Optional)

One-click guest login for demos and showcases. Creates a pre-configured user that visitors can use without registration.

```bash
# Create the guest user (requires ApprovedUsers group to exist)
cd backend && node scripts/create-guest-user.js

# Add to .env
PUBLIC_GUEST_EMAIL=guest@showcase.demo
PUBLIC_GUEST_PASSWORD=GuestDemo123!
```

When both env vars are set, a "Continue as Guest" button appears on the login page. Leave empty to disable guest access.

## Development Workflow

```bash
# Start dev server (from root)
npm run dev

# Run tests
npm test

# Run all checks (lint + tests)
npm run check

# Frontend-specific commands
cd frontend
npm run check:lint    # ESLint
npm run check:types   # Svelte type check
npm run lint:fix      # Auto-fix lint issues
```

