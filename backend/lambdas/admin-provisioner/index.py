"""Admin Provisioner - Creates initial admin user with custom welcome email"""
import json
import logging
import os
import secrets
import string

import boto3
from botocore.exceptions import ClientError
from crhelper import CfnResource

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))

helper = CfnResource(json_logging=True, log_level="INFO")
cognito = boto3.client("cognito-idp")
ses = boto3.client("ses")


def generate_temp_password(length=12):
    """Generate a secure temporary password."""
    chars = string.ascii_letters + string.digits + "!@#$%"
    # Ensure at least one of each required type
    password = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%"),
    ]
    password += [secrets.choice(chars) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(password)
    return "".join(password)


def send_welcome_email(email, temp_password, amplify_url, ses_from_email):
    """Send custom welcome email with Amplify URL."""
    subject = "Welcome to Family Archive - Document AI"

    html_body = f"""
    <h2>Welcome to Family Archive - Document AI</h2>
    <p>You've been invited to join your family's archive platform.</p>
    <p><strong>Sign in at:</strong> <a href="https://{amplify_url}">https://{amplify_url}</a></p>
    <p>Your username is: <strong>{email}</strong></p>
    <p>Your temporary password is: <strong>{temp_password}</strong></p>
    <p>Please log in and change your password on first sign-in.</p>
    """

    text_body = f"""
    Welcome to Family Archive - Document AI

    You've been invited to join your family's archive platform.

    Sign in at: https://{amplify_url}

    Your username is: {email}
    Your temporary password is: {temp_password}

    Please log in and change your password on first sign-in.
    """

    ses.send_email(
        Source=ses_from_email,
        Destination={"ToAddresses": [email]},
        Message={
            "Subject": {"Data": subject},
            "Body": {
                "Html": {"Data": html_body},
                "Text": {"Data": text_body},
            },
        },
    )
    logger.info(f"Sent welcome email to {email}")


@helper.create
def create(event, context):
    """Create admin user and send custom welcome email."""
    props = event.get("ResourceProperties", {})
    user_pool_id = props["UserPoolId"]
    admin_email = props["AdminEmail"]
    amplify_url = props["AmplifyUrl"]
    ses_from_email = props.get("SesFromEmail", "")

    if not admin_email or admin_email == "placeholder@example.com":
        logger.info("No admin email provided, skipping user creation")
        helper.Data["UserId"] = "skipped"
        return

    temp_password = generate_temp_password()

    try:
        # Create the admin user with suppressed invite (we send our own)
        response = cognito.admin_create_user(
            UserPoolId=user_pool_id,
            Username=admin_email,
            UserAttributes=[
                {"Name": "email", "Value": admin_email},
                {"Name": "email_verified", "Value": "true"},
            ],
            TemporaryPassword=temp_password,
            MessageAction="SUPPRESS",  # Don't send default email
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

        # Send custom welcome email with Amplify URL
        if ses_from_email:
            try:
                send_welcome_email(admin_email, temp_password, amplify_url, ses_from_email)
            except ClientError as e:
                logger.warning(f"Failed to send welcome email via SES: {e}")
                logger.info("User created but email not sent - SES may not be configured")
        else:
            logger.info("No SES from email configured - skipping welcome email")

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
