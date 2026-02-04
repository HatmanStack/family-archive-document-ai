# SES Email Verification

Verify sender email before deployment.

## Email Verification

```bash
aws ses verify-email-identity \
  --email-address noreply@yourdomain.com \
  --region us-east-1
```

Check email inbox for verification link. Click to verify.

Confirm:
```bash
aws ses get-identity-verification-attributes \
  --identities noreply@yourdomain.com \
  --region us-east-1
```

Status should show "Success". Use this email when running `npm run deploy`.

## Domain Verification (Production)

```bash
aws ses verify-domain-identity \
  --domain yourdomain.com \
  --region us-east-1
```

Add returned TXT record to DNS at `_amazonses.yourdomain.com`.

Check status:
```bash
aws ses get-identity-verification-attributes \
  --identities yourdomain.com \
  --region us-east-1
```

## Production Access

SES starts in sandbox (verified addresses only).

Request production access:
- AWS Console → SES → Account dashboard → "Request production access"
- Describe use case and daily volume estimate
- Review takes 24 hours

## Troubleshooting

- Email not received: Check spam, verify region matches deployment
- Domain verification: Wait 48 hours for DNS propagation, verify with `dig TXT _amazonses.yourdomain.com`
- Contact form errors: Check CloudWatch logs `/aws/lambda/{StackName}-ContactFunction`
