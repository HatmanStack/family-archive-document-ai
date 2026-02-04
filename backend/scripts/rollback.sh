#!/bin/bash
#
# Rollback Script for Family Archive - Document AI
# Usage: ./scripts/rollback.sh [environment]
#

set -e

ENVIRONMENT=${1:-production}

echo "========================================="
echo "Rolling back Family Archive - Document AI"
echo "Environment: $ENVIRONMENT"
echo "========================================="
echo ""

# Step 1: Disable Features via Environment Variables
echo "Step 1: Disabling features..."
echo "Updating Lambda environment variables to disable features..."

FUNCTIONS=(
  "comments-api-lambda-$ENVIRONMENT"
  "messages-api-lambda-$ENVIRONMENT"
  "profile-api-lambda-$ENVIRONMENT"
)

for FUNCTION in "${FUNCTIONS[@]}"; do
  echo "  - Disabling features for $FUNCTION"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION" \
    --environment "Variables={
      FEATURE_COMMENTS_ENABLED=false,
      FEATURE_MESSAGES_ENABLED=false,
      FEATURE_PROFILES_ENABLED=false
    }" \
    --region us-east-1 \
    > /dev/null 2>&1 || echo "    Warning: Could not update $FUNCTION (may not exist)"
done

echo "  ✓ Features disabled"
echo ""

# Step 2: Redeploy Frontend with Features Disabled
echo "Step 2: Redeploying frontend with features disabled..."

# Set environment variables for build
export FEATURE_COMMENTS_ENABLED=false
export FEATURE_MESSAGES_ENABLED=false
export FEATURE_PROFILES_ENABLED=false

# Build frontend
echo "  - Building frontend..."
npm run build > /dev/null 2>&1

# Deploy based on hosting provider
if command -v netlify &> /dev/null; then
  echo "  - Deploying to Netlify..."
  netlify deploy --prod > /dev/null 2>&1
elif command -v vercel &> /dev/null; then
  echo "  - Deploying to Vercel..."
  vercel --prod > /dev/null 2>&1
else
  echo "  - No deployment command found (netlify/vercel)"
  echo "    Please deploy manually to your hosting provider"
fi

echo "  ✓ Frontend redeployed"
echo ""

# Step 3: Optional - Revert CloudFormation Stacks
echo "Step 3: CloudFormation stack reversion (optional)"
read -p "Do you want to revert CloudFormation stacks? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "  - Reverting API Gateway stack..."
  aws cloudformation delete-stack \
    --stack-name "hold-that-thought-api-$ENVIRONMENT" \
    --region us-east-1 \
    2>&1 | grep -v "does not exist" || true

  echo "  - Reverting Monitoring stack..."
  aws cloudformation delete-stack \
    --stack-name "hold-that-thought-monitoring-$ENVIRONMENT" \
    --region us-east-1 \
    2>&1 | grep -v "does not exist" || true

  echo "  ✓ Stack deletion initiated (check AWS Console for status)"
  echo "    Note: DynamoDB tables are NOT deleted to preserve data"
else
  echo "  - Skipping CloudFormation stack reversion"
fi

echo ""

# Step 4: Optional - Restore DynamoDB from Backup
echo "Step 4: DynamoDB restoration (optional)"
read -p "Do you need to restore DynamoDB from backup? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "  Please restore DynamoDB tables manually via AWS Console:"
  echo "  1. Go to DynamoDB → Backups"
  echo "  2. Select the backup to restore"
  echo "  3. Click 'Restore backup'"
  echo "  4. Follow the prompts"
  echo ""
  echo "  Tables to restore:"
  echo "    - hold-that-thought-user-profiles"
  echo "    - hold-that-thought-comments"
  echo "    - hold-that-thought-comment-reactions"
  echo "    - hold-that-thought-messages"
  echo "    - hold-that-thought-conversation-members"
  echo ""
  read -p "Press Enter after completing DynamoDB restoration..."
else
  echo "  - Skipping DynamoDB restoration"
fi

echo ""
echo "========================================="
echo "Rollback Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Verify site is accessible: https://holdthatthought.family"
echo "2. Test critical functionality (login, view letters)"
echo "3. Check CloudWatch Dashboard for errors"
echo "4. Notify team of rollback"
echo "5. Investigate root cause of issue"
echo ""
echo "To re-enable features after fixes:"
echo "  ./scripts/deploy-production.sh $ENVIRONMENT"
echo ""
