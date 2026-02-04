# Changelog

All notable changes to Family Archive - Document AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-02-04

### Added
- Auto-provision Cognito ApprovedUsers and Admins groups during stack deployment
- Auto-create initial admin user with branded welcome email containing Amplify URL
- RAGStack integration guide documentation

### Fixed
- Admin provisioner updates UserPool invite template before creating user
- Cognito environment variable names in documentation (matched to actual .env)
- ApprovedUsers requirement documentation
- One-click deployment tutorial accuracy

### Changed
- Removed legacy migration infrastructure
- Cleaned up stale documentation references

## [1.0.0] - 2026-02-04

### Added
- Initial public release of Family Archive - Document AI
- AI-powered letter transcription using Google Gemini
- Private family collaboration with comments, reactions, and messaging
- Media gallery with support for photos, videos, and documents
- Semantic search via optional RAGStack integration
- User authentication with Amazon Cognito
- Cost-optimized serverless architecture on AWS
- Admin dashboard with content moderation
- Draft management for letters
- Guest access for showcases
- RAGStack Admin Dashboard URL in CloudFormation outputs
- CodeBuild-based frontend build during stack creation
- RAGStack build control parameters
- EventBridge integration for deployment automation

### Changed
- Rebranded from "Hold That Thought" to "Family Archive - Document AI"
- Updated all package names and references
- Improved frontend build process with Amplify integration
- Enhanced security based on code review findings

### Fixed
- Package-lock.json sync issues for CI/CD
- RAGStack build parameters in CloudFormation parameter groups
- Lambda self-permission for EventBridge integration
- Frontend build environment variable configuration
- CodeBuild artifacts directory structure
- Missing optional dependencies in lockfile
- CloudFormation resource references in Amplify configuration

### Security
- Addressed code review findings from security audit
- Implemented secure authentication with Amazon Cognito
- Added proper IAM permissions for all Lambda functions

## Project Information

**Repository**: https://github.com/HatmanStack/family-archive-document-ai
**License**: Apache 2.0
**AWS Marketplace**: Available with limited visibility
**Demo**: https://showcase-htt.hatstack.fun (guest access available)
