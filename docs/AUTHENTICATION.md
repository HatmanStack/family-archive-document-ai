# Authentication

Hold That Thought uses Amazon Cognito for authentication with JWT tokens.

## Overview

```
User → Cognito (login) → JWT Token → API Gateway → Lambda
                                         ↓
                              Validate + Extract Claims
```

## User Groups

| Group | Purpose | Permissions |
|-------|---------|-------------|
| `Admins` | Full administrative access | All operations, delete any content |
| `ApprovedUsers` | Verified family members | Create/edit letters, upload media |
| (No group) | Basic authenticated users | View content, comments, messages |

## Cognito Setup

### User Pool Configuration

The SAM template creates a Cognito User Pool with:
- Email as username
- Required attributes: email
- Password policy: 8+ chars, mixed case, numbers, symbols
- Email verification required

### Environment Variables

Frontend requires these Cognito settings:

```bash
PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxx
PUBLIC_COGNITO_DOMAIN=your-app.auth.us-east-1.amazoncognito.com
PUBLIC_COGNITO_REDIRECT_URI=https://your-app.com/auth/callback
PUBLIC_COGNITO_LOGOUT_URI=https://your-app.com/auth/logout
PUBLIC_COGNITO_REGION=us-east-1
```

### Google OAuth (Optional)

To enable "Sign in with Google":

#### Step 1: Create Google Cloud Project
1. Navigate to https://console.cloud.google.com
2. Click "Select a project" → "New Project"
3. Name: `hold-that-thought-oauth`
4. Click "Create"

#### Step 2: Configure OAuth Consent Screen
1. Navigate to "APIs & Services" → "OAuth consent screen"
2. Select "External" (unless using Google Workspace)
3. Click "Create"
4. Fill required fields:
   - App name: `Hold That Thought`
   - User support email: your email
   - Developer contact: your email
5. Click "Save and Continue"
6. Scopes: Click "Add or Remove Scopes"
   - Select: `email`, `profile`, `openid`
   - Click "Update" → "Save and Continue"
7. Test users (if External):
   - Add email addresses of family members
   - Click "Save and Continue"
8. Click "Back to Dashboard"

#### Step 3: Create OAuth Client ID
1. Navigate to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: `Hold That Thought Web Client`
5. Authorized JavaScript origins:
   - `https://your-app-domain.com`
   - `http://localhost:5173` (for dev)
6. Authorized redirect URIs:
   - `https://your-cognito-domain.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
   - Replace `your-cognito-domain` with your actual domain
   - Get domain from: `aws cognito-idp describe-user-pool --user-pool-id YOUR_POOL_ID --query 'UserPool.Domain'`
7. Click "Create"
8. **Save Client ID and Client Secret** (shown once)

#### Step 4: Deploy with Google OAuth
Run `npm run deploy` and provide Google credentials when prompted:
```
Enable Google OAuth? (y/n): y
Google Client ID: {paste your Client ID}
Google Client Secret: {paste your Client Secret}
```

Cognito automatically configures the identity provider and attribute mapping (email→email, name→name, picture→picture).

#### Step 5: Test OAuth Flow
1. Open: `https://your-app-domain.com/auth/login`
2. Click "Sign in with Google"
3. Should redirect to Google consent screen
4. After consent, redirects to app

#### Troubleshooting

**"redirect_uri_mismatch" error:**
- Verify redirect URI in Google Console matches Cognito domain exactly
- Format: `https://{cognito-domain}.auth.{region}.amazoncognito.com/oauth2/idpresponse`
- No trailing slash
- Check region matches deployment

**"unauthorized_client" error:**
- Verify Client ID and Secret in deploy config match Google Console
- Re-deploy if credentials changed

**Cognito doesn't show Google provider:**
- Verify GoogleClientId was provided during deployment
- Check backend/.env.deploy for GoogleClientId
- Re-run `npm run deploy` with correct credentials

**User attributes not mapping:**
- Default mapping configured automatically in template (backend/template.yaml:346-359)
- Verify user pool client includes Google provider

### Guest Access (Optional)

For demo purposes, enable one-click guest login:

```bash
PUBLIC_COGNITO_GUEST_ENABLED=true
PUBLIC_COGNITO_GUEST_USERNAME=guest@example.com
PUBLIC_COGNITO_GUEST_PASSWORD=GuestPassword123!
```

## JWT Token Structure

Cognito JWTs include these claims:

```json
{
  "sub": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "email": "user@example.com",
  "cognito:groups": ["ApprovedUsers"],
  "iat": 1234567890,
  "exp": 1234571490
}
```

## Frontend Auth Flow

### Login

```typescript
// lib/auth/client.ts
import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider'

async function login(email: string, password: string) {
  const response = await client.send(new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: PUBLIC_COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password
    }
  }))

  // Store tokens
  authStore.set({
    accessToken: response.AuthenticationResult.AccessToken,
    refreshToken: response.AuthenticationResult.RefreshToken,
    idToken: response.AuthenticationResult.IdToken
  })
}
```

### Token Refresh

```typescript
async function refreshSession() {
  const response = await client.send(new InitiateAuthCommand({
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: PUBLIC_COGNITO_CLIENT_ID,
    AuthParameters: {
      REFRESH_TOKEN: currentRefreshToken
    }
  }))

  // Update access token
  authStore.update(state => ({
    ...state,
    accessToken: response.AuthenticationResult.AccessToken
  }))
}
```

### API Requests

```typescript
// lib/services/api.ts
async function apiRequest(endpoint: string, options = {}) {
  const token = get(authStore).accessToken

  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  })
}
```

## Backend Auth Handling

### API Gateway Authorizer

The SAM template configures a Cognito authorizer:

```yaml
Auth:
  DefaultAuthorizer: CognitoAuthorizer
  Authorizers:
    CognitoAuthorizer:
      UserPoolArn: !GetAtt UserPool.Arn
```

### Extracting Claims

```typescript
// backend/lambdas/api/src/index.ts
const claims = event.requestContext?.authorizer?.claims as AuthClaims
const requesterId = claims.sub
const requesterEmail = claims.email
const requesterGroups = claims['cognito:groups'] || ''
const isAdmin = requesterGroups.includes('Admins')
const isApprovedUser = requesterGroups.includes('ApprovedUsers')
```

### Request Context

```typescript
interface RequestContext {
  requesterId: string | undefined
  requesterEmail: string | undefined
  isAdmin: boolean
  isApprovedUser: boolean
  correlationId: string
  requestOrigin?: string
}
```

## User Management

### Add User (Console)

1. Go to **Cognito** → **User pools** → your pool
2. Click **Create user**
3. Enter email and temporary password
4. User receives email with login instructions

### Add User (CLI)

```bash
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_POOL_ID \
  --username user@example.com \
  --user-attributes Name=email,Value=user@example.com Name=email_verified,Value=true \
  --temporary-password TempPass123!
```

### Add User to Group

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id YOUR_POOL_ID \
  --username user@example.com \
  --group-name ApprovedUsers
```

### List Users

```bash
aws cognito-idp list-users \
  --user-pool-id YOUR_POOL_ID
```

### List Group Members

```bash
aws cognito-idp list-users-in-group \
  --user-pool-id YOUR_POOL_ID \
  --group-name ApprovedUsers
```

## Auto Profile Creation

When a user first authenticates, the API automatically creates their profile:

```typescript
// backend/lambdas/api/src/index.ts
if (requesterId) {
  await ensureProfile(requesterId, requesterEmail, requesterGroups)
}
```

The profile includes:
- User ID (Cognito sub)
- Email
- Display name (from email prefix)
- Groups
- Timestamps
- GSI1 keys for user listing

## Session Management

### Token Expiry
- Access token: 1 hour
- ID token: 1 hour
- Refresh token: 30 days (configurable)

### Logout

```typescript
async function logout() {
  // Clear local tokens
  authStore.set(null)

  // Optionally revoke refresh token
  await client.send(new RevokeTokenCommand({
    Token: refreshToken,
    ClientId: PUBLIC_COGNITO_CLIENT_ID
  }))

  // Redirect to logout endpoint
  window.location.href = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${LOGOUT_URI}`
}
```

## Security Best Practices

1. **Never expose tokens in URLs** - Use Authorization header
2. **Validate on every request** - API Gateway handles this
3. **Short access token expiry** - 1 hour default
4. **Secure token storage** - Use httpOnly cookies or secure storage
5. **HTTPS only** - Required for token transmission
6. **Group-based access** - Don't hardcode user IDs
