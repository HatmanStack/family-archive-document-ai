# Authentication

Family Archive - Document AI uses Amazon Cognito for authentication with JWT tokens.

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
PUBLIC_AWS_REGION=us-west-2
PUBLIC_COGNITO_USER_POOL_ID=us-west-2_XXXXXXXXX
PUBLIC_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxx
PUBLIC_COGNITO_IDENTITY_POOL_ID=us-west-2:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PUBLIC_COGNITO_HOSTED_UI_URL=https://your-app.auth.us-west-2.amazoncognito.com
PUBLIC_COGNITO_HOSTED_UI_DOMAIN=your-app
```

### Google OAuth (Optional)

To enable "Sign in with Google":

#### Step 1: Create Google Cloud Project
1. Navigate to https://console.cloud.google.com
2. Click "Select a project" → "New Project"
3. Name: `family-archive-oauth`
4. Click "Create"

#### Step 2: Configure OAuth Consent Screen
1. Navigate to "APIs & Services" → "OAuth consent screen"
2. Select "External" (unless using Google Workspace)
3. Click "Create"
4. Fill required fields:
   - App name: `Family Archive - Document AI`
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
4. Name: `Family Archive - Document AI Web Client`
5. Authorized JavaScript origins:
   - `https://your-app-domain.com`
   - `http://localhost:5173` (for dev)
6. Authorized redirect URIs:
   - `https://your-cognito-domain.auth.us-west-2.amazoncognito.com/oauth2/idpresponse`
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

Cognito automatically configures the identity provider and attribute mapping (email→email, name→name).

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
- Default mapping configured automatically in template (backend/template.yaml:361-363)
- Verify user pool client includes Google provider

### Guest Access (Optional)

For demo purposes, enable one-click guest login:

```bash
PUBLIC_GUEST_EMAIL=guest@example.com
PUBLIC_GUEST_PASSWORD=GuestPassword123!
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

The login flow uses `AuthService` (which wraps `cognitoAuth` from `lib/auth/cognito-client.ts`):

```typescript
// lib/auth/auth-service.ts
import { authService } from '$lib/auth/auth-service'

const result = await authService.signIn(email, password)

if (result.success) {
  // Tokens are stored in authStore automatically
  const { user, tokens } = result
}
else if (result.challengeName === 'NEW_PASSWORD_REQUIRED') {
  // First login with temporary password — prompt user for new password
  await authService.completeNewPasswordChallenge(email, newPassword, result.session)
}
```

Under the hood, `CognitoAuthClient` uses the AWS SDK `InitiateAuthCommand` with `USER_PASSWORD_AUTH` flow:

```typescript
// lib/auth/cognito-client.ts (simplified)
const command = new InitiateAuthCommand({
  ClientId: cognitoConfig.userPoolWebClientId,
  AuthFlow: 'USER_PASSWORD_AUTH',
  AuthParameters: { USERNAME: email, PASSWORD: password },
})
const response = await client.send(command)
```

### Token Refresh

Token refresh is handled automatically by `AuthService`, which schedules a refresh 5 minutes before expiry:

```typescript
// lib/auth/auth-service.ts
const newTokens = await authService.refreshTokens()
// authStore is updated automatically
```

Under the hood, this uses `CognitoAuthClient.refreshToken()` with `REFRESH_TOKEN_AUTH` flow.

### API Requests

There are two patterns for authenticated API requests:

**1. ApiClient (lib/auth/api-client.ts)** — a class-based client with convenience methods:

```typescript
// lib/auth/api-client.ts
import { apiClient } from '$lib/auth/api-client'

// GET request
const data = await apiClient.get('/comments/some-item-id')

// POST request
const result = await apiClient.post('/comments/some-item-id', { content: 'Hello' })
```

**2. authenticatedFetch (lib/auth/client.ts)** — a lower-level wrapper around `fetch`:

```typescript
// lib/auth/client.ts
import { authenticatedFetch } from '$lib/auth/client'

const response = await authenticatedFetch(`${API_URL}/comments/some-item-id`)
const data = await response.json()
```

Individual service files (e.g., `comment-service.ts`, `profile-service.ts`, `media-service.ts`) build on these patterns to provide domain-specific API functions.

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
  authStore.clearAuth()

  // Optionally revoke refresh token
  await client.send(new RevokeTokenCommand({
    Token: refreshToken,
    ClientId: PUBLIC_COGNITO_USER_POOL_CLIENT_ID
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
