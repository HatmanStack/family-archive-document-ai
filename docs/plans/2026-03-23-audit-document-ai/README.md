# Unified Audit Remediation Plan

## Overview

This plan addresses findings from three concurrent audits of the family-archive-document-ai codebase:
a **health audit** (30 tech-debt findings), a **12-pillar evaluation** (all pillars below target of 9/10),
and a **documentation audit** (30 drift/gap/stale findings). The work is organized into phases
ordered by the principle of *subtract before you add*: cleanup first, then structural code fixes,
then guardrails, and finally documentation.

Each phase is tagged with the role responsible for implementation and review:
**HYGIENIST** (subtractive cleanup), **IMPLEMENTER** (code fixes), **FORTIFIER** (guardrails),
or **DOC-ENGINEER** (documentation). This tag determines which implementer persona and reviewer
persona handle that phase.

## Prerequisites

- Node v24 LTS (via nvm, pinned in `.nvmrc`)
- Access to the repository with all dependencies installed (`npm install` at root and `cd frontend && npm install`)
- Familiarity with: SvelteKit, AWS Lambda (SAM), DynamoDB single-table design, Vitest, aws-sdk-client-mock
- Read `CLAUDE.md` at both root and project level before starting any phase

## Phase Summary

| Phase | Tag | Goal | Est. Tokens |
|-------|-----|------|-------------|
| 0 | -- | Foundation: ADRs, conventions, testing strategy | ~5,000 |
| 1 | HYGIENIST | Dead code removal, deduplication, unused dep cleanup | ~20,000 |
| 2 | IMPLEMENTER | Security fixes, defensive coding, error handling | ~30,000 |
| 3 | IMPLEMENTER | Performance caps, pagination guards, presigned URL batching | ~20,000 |
| 4 | IMPLEMENTER | Unit tests for untested route handlers | ~25,000 |
| 5 | FORTIFIER | Type rigor, API client typing, CORS hardening | ~20,000 |
| 6 | DOC-ENGINEER | Documentation drift fixes and prevention tooling | ~15,000 |

## Navigation

- [Phase-0.md](Phase-0.md) -- Foundation (ADRs, conventions, testing strategy)
- [Phase-1.md](Phase-1.md) -- [HYGIENIST] Cleanup and deduplication
- [Phase-2.md](Phase-2.md) -- [IMPLEMENTER] Security and defensive coding fixes
- [Phase-3.md](Phase-3.md) -- [IMPLEMENTER] Performance and pagination guards
- [Phase-4.md](Phase-4.md) -- [IMPLEMENTER] Test coverage for untested routes
- [Phase-5.md](Phase-5.md) -- [FORTIFIER] Type rigor and CORS hardening
- [Phase-6.md](Phase-6.md) -- [DOC-ENGINEER] Documentation fixes and drift prevention
- [feedback.md](feedback.md) -- Review feedback tracker
