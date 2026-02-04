"""Admin Provisioner - Creates initial admin user during stack deployment"""
import json
import logging
import os

import boto3
from botocore.exceptions import ClientError
from crhelper import CfnResource

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))

helper = CfnResource(json_logging=True, log_level="INFO")
cognito = boto3.client("cognito-idp")


def update_invite_template(user_pool_id, amplify_url):
    """Update UserPool invite email template with Amplify URL."""
    cognito.update_user_pool(
        UserPoolId=user_pool_id,
        AdminCreateUserConfig={
            "AllowAdminCreateUserOnly": False,
            "InviteMessageTemplate": {
                "EmailSubject": "Welcome to Family Archive - Document AI",
                "EmailMessage": f"""
<h2>Welcome to Family Archive - Document AI</h2>
<p>You've been invited to join your family's archive platform.</p>
<p><strong>Sign in at:</strong> <a href="https://{amplify_url}">https://{amplify_url}</a></p>
<p>Your username is: <strong>{{username}}</strong></p>
<p>Your temporary password is: <strong>{{####}}</strong></p>
<p>Please log in and change your password on first sign-in.</p>
""",
            },
        },
    )
    logger.info(f"Updated UserPool invite template with URL: {amplify_url}")


@helper.create
def create(event, context):
    """Create admin user with custom invite email containing Amplify URL."""
    props = event.get("ResourceProperties", {})
    user_pool_id = props["UserPoolId"]
    admin_email = props["AdminEmail"]
    amplify_url = props.get("AmplifyUrl", "")

    if not admin_email or admin_email == "placeholder@example.com":
        logger.info("No admin email provided, skipping user creation")
        helper.Data["UserId"] = "skipped"
        return

    try:
        # Update the invite template with Amplify URL before creating user
        if amplify_url:
            update_invite_template(user_pool_id, amplify_url)

        # Create the admin user - Cognito sends invite email with updated template
        response = cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=admin_email,
            UserAttributes=[
                {"Name": "email", "Value": admin_email},
                {"Name": "email_verified", "Value": "true"},
            ],
            DesiredDeliveryMediums=["EMAIL"],
        )
        user_sub = response["User"]["Username"]
        logger.info(f"Created admin user: {admin_email}")

        # Add to Admins group
        cognito.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=admin_email,
            GroupName="Admins",
        )
        logger.info(f"Added {admin_email} to Admins group")

        # Add to ApprovedUsers group
        cognito.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=admin_email,
            GroupName="ApprovedUsers",
        )
        logger.info(f"Added {admin_email} to ApprovedUsers group")

        helper.Data["UserId"] = user_sub
        helper.Data["Email"] = admin_email

    except ClientError as e:
        if e.response["Error"]["Code"] == "UsernameExistsException":
            logger.info(f"User {admin_email} already exists, skipping creation")
            helper.Data["UserId"] = "existing"
            helper.Data["Email"] = admin_email
        else:
            raise


@helper.update
def update(event, context):
    """No action on update."""
    logger.info("Update - no action required")
    helper.Data["UserId"] = "unchanged"


@helper.delete
def delete(event, context):
    """No action on delete - preserve users."""
    logger.info("Delete - no action required (users preserved)")


def lambda_handler(event, context):
    logger.info(f"Event: {json.dumps(event, default=str)}")
    return helper(event, context)
