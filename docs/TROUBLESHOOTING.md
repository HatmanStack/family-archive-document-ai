# Troubleshooting

Common issues and solutions for Family Archive - Document AI.

## Authentication Issues

### "Unauthorized" Error on API Calls

**Symptom:** API returns 401 Unauthorized

**Causes & Solutions:**

1. **Token expired**
   - Access tokens expire after 1 hour
   - Solution: Implement token refresh or re-login

2. **Missing Authorization header**
   ```typescript
   // Ensure header is included
   headers: {
     'Authorization': `Bearer ${accessToken}`
   }
   ```

3. **Wrong token type**
   - Use `accessToken`, not `idToken` for API calls

4. **Cognito misconfiguration**
   - Verify `PUBLIC_COGNITO_USER_POOL_ID` matches your pool
   - Verify `PUBLIC_COGNITO_USER_POOL_CLIENT_ID` matches your app client

### "User is not authorized" (403)

**Symptom:** API returns 403 Forbidden

**Causes & Solutions:**

1. **Missing group membership**
   ```bash
   # Add user to ApprovedUsers group
   aws cognito-idp admin-add-user-to-group \
     --user-pool-id YOUR_POOL_ID \
     --username user@example.com \
     --group-name ApprovedUsers
   ```

2. **Resource ownership**
   - Users can only edit/delete their own content
   - Admins can modify any content

### Login Redirect Loop

**Symptom:** Stuck in redirect after login

**Causes & Solutions:**

1. **Mismatched redirect URI**
   - `PUBLIC_COGNITO_HOSTED_UI_URL` must match your Cognito domain
   - Include protocol: `https://` or `http://localhost:5173`

2. **Cookie issues**
   - Clear browser cookies
   - Check for third-party cookie blocking

## CORS Errors

### "CORS policy: No 'Access-Control-Allow-Origin' header"

**Symptom:** Browser blocks API response

**Causes & Solutions:**

1. **Missing ALLOWED_ORIGINS**
   ```bash
   # In Lambda environment variables
   ALLOWED_ORIGINS=https://your-domain.com,http://localhost:5173
   ```

2. **Origin not in allowed list**
   - Add your domain to `ALLOWED_ORIGINS` (comma-separated)

3. **Preflight failure**
   - Ensure API Gateway handles OPTIONS requests
   - Check that all CORS headers are returned

### CORS Works Locally But Not in Production

**Cause:** `ALLOWED_ORIGINS` defaults to `*` in local/test mode

**Solution:** Set explicit origins for production:
```yaml
# template.yaml
Environment:
  Variables:
    ALLOWED_ORIGINS: !Ref AllowedOrigins
```

## Rate Limiting

### "Rate limit exceeded" (429)

**Symptom:** API returns 429 Too Many Requests

**Current Limits:**
| Action | Limit | Window |
|--------|-------|--------|
| Comment | 20 | 1 minute |
| Message | 30 | 1 minute |
| Reaction | 60 | 1 minute |
| Upload | 10 | 5 minutes |

**Solutions:**
1. Wait for window to reset (check `Retry-After` header)
2. Batch operations where possible
3. Implement client-side throttling

### Rate Limit Not Resetting

**Cause:** DynamoDB TTL delay (can be up to 48 hours)

**Solution:** Rate limit records use atomic counters that reset on window expiry, not TTL. If stuck, the window-based logic should auto-reset.

## File Upload Issues

### "Presigned URL expired"

**Symptom:** S3 upload fails with signature error

**Causes & Solutions:**

1. **Upload took too long**
   - Upload URLs expire in 15 minutes
   - For large files, request URL closer to upload time

2. **Clock skew**
   - Sync system clock
   - AWS requires clocks within 15 minutes

### Upload Succeeds But File Not Visible

**Causes & Solutions:**

1. **Wrong S3 prefix**
   - Check file uploaded to correct path
   - Verify `ARCHIVE_BUCKET` environment variable

2. **Permissions**
   - Lambda needs `s3:GetObject` and `s3:PutObject`

## Letter Processing

### Draft Stuck in "Processing" Status

**Symptom:** Draft never transitions to "Review"

**Causes & Solutions:**

1. **Letter Processor Lambda failed**
   - Check CloudWatch logs for errors
   - Common: Gemini API key missing or invalid

2. **Lambda timeout**
   - Large files may exceed 15-minute timeout
   - Solution: Process smaller batches

3. **S3 file missing**
   - Verify files uploaded to `temp/{uploadId}/`

### Gemini Transcription Failed

**Symptom:** Draft has "Error" status

**Causes & Solutions:**

1. **API key not configured**
   ```bash
   # Set in Lambda environment
   GEMINI_API_KEY=your-api-key
   ```

2. **API key is placeholder**
   - Replace `your-api-key` with actual key
   - Key should start with `AIza`

3. **Rate limited by Gemini**
   - Retry logic handles transient errors
   - Check Gemini quota in Google Cloud Console

## Database Issues

### "ConditionalCheckFailedException"

**Symptom:** Write operation fails

**Causes & Solutions:**

1. **Concurrent modification**
   - Another request modified the item
   - Retry with exponential backoff

2. **Item doesn't exist**
   - For updates, ensure item exists first
   - Use `attribute_exists(PK)` appropriately

### Missing Data After Write

**Cause:** DynamoDB is eventually consistent for GSI reads

**Solution:**
- Use strongly consistent reads when needed
- Add small delay before reading after write
- Read from main table, not GSI, when possible

## Frontend Issues

### Page Shows Loading Forever

**Causes & Solutions:**

1. **API call failed silently**
   - Check browser Network tab for errors
   - Check Console for JavaScript errors

2. **Store not updating**
   - Verify reactive declarations: `$: data = ...`
   - Check store subscription

3. **Auth state lost**
   - Tokens may have expired
   - Check `authStore` state

### Styles Not Applying

**Causes & Solutions:**

1. **Missing TailwindCSS classes**
   - Run `npm run dev` to regenerate styles
   - Check `tailwind.config.js` content paths

2. **DaisyUI theme not loaded**
   - Verify `daisyui` in `tailwind.config.js` plugins
   - Check `data-theme` attribute on HTML

### Hot Reload Not Working

**Causes & Solutions:**

1. **Vite HMR disconnected**
   - Refresh browser manually
   - Restart dev server

2. **File not watched**
   - Check file is in watched directory
   - Restart dev server after config changes

## Environment Variable Validation

### Backend Validation

Letter processor Lambda validates env vars at startup (backend/lambdas/letter-processor/src/lib/config.ts:15-40):

**Gemini API Key format:**
- Must start with "AIza"
- Error: `Invalid configuration: GEMINI_API_KEY must start with 'AIza'`
- Get key: https://aistudio.google.com/app/apikey

**Required variables:**
- `TABLE_NAME` - DynamoDB table name
- `ARCHIVE_BUCKET` - S3 bucket for letters
- `GEMINI_API_KEY` - Google AI API key

### Validation Errors

Check CloudWatch logs:
```bash
aws logs tail /aws/lambda/{StackName}-LetterProcessorFunction --follow
```

Look for "Invalid configuration" errors on cold start.

### Fix Invalid Config

1. Update parameter in template.yaml
2. Redeploy:
   ```bash
   npm run deploy
   ```
3. Verify environment:
   ```bash
   aws lambda get-function-configuration \
     --function-name {StackName}-LetterProcessorFunction \
     --query 'Environment.Variables'
   ```

### Development Override

Set `SKIP_VALIDATION=true` in Lambda environment to bypass checks. **Never use in production.**

## Deployment Issues

### SAM Deploy Fails

**Common Errors:**

1. **"Stack is in ROLLBACK_COMPLETE state"**
   ```bash
   # Delete failed stack
   aws cloudformation delete-stack --stack-name your-stack-name
   # Then redeploy
   ```

2. **"Resource already exists"**
   - Use unique resource names
   - Or delete existing resources

3. **"Insufficient permissions"**
   - Check IAM user/role has required permissions
   - SAM needs CloudFormation, Lambda, S3, DynamoDB, etc.

### Lambda Not Updating

**Cause:** SAM caches builds

**Solution:**
```bash
# Force clean build
sam build --use-container --skip-pull-image
# Or delete .aws-sam directory
rm -rf .aws-sam && sam build
```

## Performance Issues

### Slow API Responses

**Causes & Solutions:**

1. **Cold start**
   - First request after idle period is slower
   - Consider provisioned concurrency for production

2. **Large payloads**
   - Paginate large result sets
   - Compress responses

3. **Inefficient queries**
   - Use GSI for common access patterns
   - Avoid scans, use queries with key conditions

### High Lambda Costs

**Causes & Solutions:**

1. **Long execution time**
   - Optimize code, reduce SDK calls
   - Use connection reuse

2. **Too much memory**
   - Start with 128MB, increase if needed
   - Monitor with CloudWatch metrics

## Getting Help

### Logs to Check

1. **CloudWatch Logs**
   ```bash
   aws logs tail /aws/lambda/YourFunctionName --follow
   ```

2. **Browser Console**
   - JavaScript errors
   - Network requests/responses

3. **API Gateway Logs**
   - Enable access logging in API Gateway settings

### Information to Include in Bug Reports

- Error message (exact text)
- Steps to reproduce
- Environment (local/deployed)
- Browser/OS (for frontend issues)
- Relevant log snippets
- Request/response bodies (sanitized)
