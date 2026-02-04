"""Frontend Builder - Triggers CodeBuild to build frontend with stack-specific env vars"""
import json
import logging
import os
import time

import boto3
from crhelper import CfnResource

logger = logging.getLogger(__name__)
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))

helper = CfnResource(json_logging=True, log_level="INFO")
codebuild = boto3.client("codebuild")
s3 = boto3.client("s3")


@helper.create
@helper.update
def create_or_update(event, context):
    """Trigger CodeBuild to build frontend with environment variables."""
    props = event.get("ResourceProperties", {})
    project_name = props["ProjectName"]
    env_vars = props.get("EnvironmentVariables", [])

    logger.info(f"Starting CodeBuild project: {project_name}")

    # Convert env vars format from CloudFormation to CodeBuild
    env_overrides = [
        {"name": env["Name"], "value": env["Value"], "type": "PLAINTEXT"}
        for env in env_vars
    ]

    # Start build
    response = codebuild.start_build(
        projectName=project_name,
        environmentVariablesOverride=env_overrides
    )

    build_id = response["build"]["id"]
    logger.info(f"Build started: {build_id}")

    helper.Data["BuildId"] = build_id
    helper.Data["ProjectName"] = project_name


@helper.poll_create
@helper.poll_update
def poll(event, context):
    """Poll CodeBuild until build completes."""
    data = event.get("CrHelperData", {})
    build_id = data["BuildId"]

    response = codebuild.batch_get_builds(ids=[build_id])
    build = response["builds"][0]
    status = build["buildStatus"]

    logger.info(f"Build status: {status}")

    if status == "SUCCEEDED":
        # Get artifact location
        artifacts = build.get("artifacts", {})
        location = artifacts.get("location", "")
        helper.Data["ArtifactLocation"] = location
        return True
    elif status in ("IN_PROGRESS", "PENDING"):
        return None  # Keep polling
    else:
        logs = build.get("logs", {})
        log_url = logs.get("deepLink", "No logs available")
        raise RuntimeError(f"Build failed with status {status}. Logs: {log_url}")


@helper.delete
def delete(event, context):
    """No action needed on delete."""
    logger.info("Delete - no action required")


def lambda_handler(event, context):
    logger.info(f"Event: {json.dumps(event, default=str)}")
    return helper(event, context)
