<img align="center" src="htt_banner_1.jpg" alt="Family Archive - Document AI">

<p align="center">
<a href="https://github.com/HatmanStack/family-archive-document-ai/actions"><img src="https://github.com/HatmanStack/family-archive-document-ai/workflows/CI/badge.svg" alt="CI Status" /></a>
<a href="https://www.apache.org/licenses/LICENSE-2.0.html"><img src="https://img.shields.io/badge/license-Apache2.0-blue" alt="Apache 2.0 License" /></a>
</p>

<p align="center">
<a href="https://kit.svelte.dev"><img src="https://img.shields.io/badge/SvelteKit-2.x-orange" alt="SvelteKit" /></a>
<a href="https://svelte.dev"><img src="https://img.shields.io/badge/Svelte-4.x-FF3E00" alt="Svelte 4" /></a>
<a href="https://vitest.dev"><img src="https://img.shields.io/badge/Vitest-2.x-yellow" alt="Vitest" /></a>
<a href="https://docs.aws.amazon.com/lambda/"><img src="https://img.shields.io/badge/AWS-Lambda-FF9900" alt="AWS Lambda" /></a>
<a href="https://aws.amazon.com/dynamodb/"><img src="https://img.shields.io/badge/AWS-DynamoDB-4053D6" alt="AWS DynamoDB" /></a>
<a href="https://aws.amazon.com/cognito/"><img src="https://img.shields.io/badge/AWS-Cognito-DD344C" alt="AWS Cognito" /></a>
<a href="https://aws.amazon.com/s3/"><img src="https://img.shields.io/badge/AWS-S3-569A31" alt="AWS S3" /></a>
</p>

<p align="center">
<b>Preserving family memories with AI</b>
</p>

A private family platform for sharing letters, photos, and memories. Upload scanned letters with AI-powered transcription, browse a shared media gallery, and engage with family content through comments and reactions.

## Features

- **Letter Archive** - Upload scanned letters (PDF/images), AI transcription via Google Gemini
- **Media Gallery** - Photos, videos, and documents with categories and presigned URL access
- **Comments & Reactions** - Threaded comments on letters and media with like reactions
- **Direct Messaging** - Private conversations between family members with file attachments
- **User Profiles** - Customizable profiles with family relationships and activity history
- **Version History** - Track letter edits with full version history and revert capability
- **Rate Limiting** - Atomic DynamoDB-based rate limiting with fail-open behavior
- **RAGStack Integration** - Optional AI-powered semantic search and chat

## Live Demo

** THIS REPO IS IN ACTIVE DEVELOPMENT AND WILL CHANGE OFTEN **

| Environment | URL | Access |
|-------------|-----|--------|
| **Showcase** | [showcase-htt.hatstack.fun](https://showcase-htt.hatstack.fun) | Login as guest |
| **One Click** | [Template](https://us-east-1.console.aws.amazon.com/cloudformation/home?region=us-east-1#/stacks/quickcreate?templateURL=https://hold-that-thought-quicklaunch-public-631094035453.s3.us-east-1.amazonaws.com/hold-that-thought-template.yaml) | Sign into AWS |

## Architecture

```
Frontend (SvelteKit)          Backend (AWS Lambda)
       │                              │
       ├── Auth ──────────────► Cognito (JWT)
       │                              │
       ├── API ───────────────► API Gateway ──► Lambda
       │                              │              │
       │                              │         ┌────┴────┐
       │                              │         │         │
       │                         DynamoDB    S3 Buckets
       │                      (single-table)  (media/letters)
       │                              │
       └── RAGStack ──────────► AppSync (optional)
```

**Key Components:**
- **Frontend**: SvelteKit 2.x + Svelte 4, DaisyUI components, TailwindCSS
- **Backend**: Consolidated API Lambda with route-based handlers
- **Database**: DynamoDB single-table design with GSI for queries
- **Storage**: S3 with presigned URLs for secure media access
- **Auth**: Cognito User Pool with JWT tokens and user groups

## Quick Start

### Prerequisites

- Node.js v24 LTS (via nvm)
- AWS CLI configured with credentials
- AWS SAM CLI for deployment

### Installation

```bash
# Clone and install
git clone https://github.com/HatmanStack/hold-that-thought.git
cd hold-that-thought
npm install
cd frontend && npm install && cd ..

# Configure environment
cp .env.example .env
# Edit .env with your Cognito and API settings

# Start development server
npm run dev
```

### Deploy Backend

```bash
npm run deploy
```

The deploy script prompts for configuration and creates all AWS resources.

## Project Structure

```
hold-that-thought/
├── frontend/                 # SvelteKit application
│   ├── routes/              # File-based routing
│   │   ├── auth/           # Login, signup, password reset
│   │   ├── gallery/        # Media gallery
│   │   ├── letters/        # Letter viewing and editing
│   │   ├── messages/       # Direct messaging
│   │   └── profile/        # User profiles
│   └── lib/
│       ├── auth/           # Cognito authentication
│       ├── components/     # Reusable Svelte components
│       ├── services/       # API service modules
│       └── types/          # TypeScript definitions
│
├── backend/                  # AWS SAM application
│   ├── template.yaml        # SAM infrastructure definition
│   └── lambdas/
│       ├── api/            # Consolidated REST API
│       │   └── src/
│       │       ├── routes/     # Route handlers
│       │       ├── lib/        # Shared utilities
│       │       └── types/      # TypeScript types
│       ├── letter-processor/   # PDF merge + Gemini AI
│       ├── activity-aggregator/# DynamoDB stream processor
│       └── notification-processor/ # Email notifications
│
├── tests/                    # Centralized test suites
│   ├── unit/                # Vitest unit tests
│   ├── integration/         # API integration tests
│   ├── e2e/                 # Playwright browser tests
│   └── load/                # Artillery load tests
│
└── docs/                     # Documentation
```

## Scripts

```bash
# Development
npm run dev                   # Start SvelteKit dev server
npm run build                 # Production build

# Testing
npm test                      # Run unit tests (Vitest)
npm run test:e2e              # Playwright E2E tests
npm run test:load             # Artillery load tests

# Quality
npm run lint                  # ESLint + type check
npm run check                 # Run all checks (lint + tests)

# Deployment
npm run deploy                # Deploy backend via SAM
```

## RAGStack Integration

Optional AI-powered search and chat. Deploy [RAGStack-Lambda](https://github.com/HatmanStack/RAGStack-Lambda) and configure:

```bash
PUBLIC_RAGSTACK_CHAT_URL=https://<cloudfront>/ragstack-chat.js
PUBLIC_RAGSTACK_GRAPHQL_URL=https://<appsync-id>.appsync-api.<region>.amazonaws.com/graphql
PUBLIC_RAGSTACK_API_KEY=<appsync-api-key>
```

**Features enabled:**
- Chat widget on homepage (AI assistant for family content)
- Semantic search across indexed media
- Auto-indexing of gallery uploads to knowledge base

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - System design, components, data flows
- [Authentication](docs/AUTHENTICATION.md) - Cognito setup, user groups, JWT handling
- [API Reference](docs/API_REFERENCE.md) - REST API endpoints and examples
- [Data Model](docs/DATA_MODEL.md) - DynamoDB schema and access patterns
- [Frontend Guide](docs/FRONTEND.md) - SvelteKit structure, services, components
- [Deployment](docs/DEPLOYMENT.md) - AWS deployment and configuration
- [Development](docs/DEVELOPMENT.md) - Local setup, testing, contributing
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Common issues and solutions

## License

Apache License 2.0
