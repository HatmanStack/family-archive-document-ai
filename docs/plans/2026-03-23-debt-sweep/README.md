# Technical Debt Sweep - Implementation Plan

## Overview

This plan closes every item in the "Deferred Technical Debt" section of `docs/FEATURES_ROADMAP.md` in a single PR. The work covers six themes: TypeScript migration of the last two JavaScript Lambdas (activity-aggregator, notification-processor), type safety cleanup across entity types and unsafe casts, extraction of a `MessagingRepository` from the 765-line messages route, replacement of the if/else route dispatcher with an Express-like Router class, consolidation of 9 frontend service files onto the shared `apiClient`, and targeted performance fixes in the request path.

After completion, the only remaining item in the features roadmap will be the family tree visualization (a separate future feature). The backend will be fully TypeScript, all API routes will use declarative routing with middleware, the messages module will follow the repository pattern, and the frontend services will consistently use the `apiClient` singleton for API communication.

## Prerequisites

- Node.js 20+ (matches Lambda runtime)
- AWS SAM CLI (for template validation)
- pnpm (package manager used by the project)
- All existing tests passing (`npm test` from `frontend/`)
- Familiarity with DynamoDB single-table design patterns

## Phase Summary

| Phase | Goal | Token Estimate |
|-------|------|----------------|
| 0 | Foundation: architecture decisions, conventions, testing strategy | N/A (reference) |
| 1 | Shared infrastructure, type fixes, BaseRepository generic putItem, ensureProfile optimization, TS migration of JS Lambdas | ~40,000 |
| 2 | Router class, MessagingRepository extraction, frontend service consolidation onto apiClient, client.ts rename, documentation updates | ~60,000 |

## Navigation

- [Phase 0 - Foundation](./Phase-0.md)
- [Phase 1 - Backend](./Phase-1.md)
- [Phase 2 - Frontend and Documentation](./Phase-2.md)
- [Feedback](./feedback.md)
