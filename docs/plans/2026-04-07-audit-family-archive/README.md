# Audit Remediation Plan — Family Archive Document AI

Plan ID: `2026-04-07-audit-family-archive`

## Overview

Unified remediation plan consolidating findings from three audits:

- `health-audit.md` — tech debt (0 critical, 6 high, 8 medium, 6 low)
- `eval.md` — 12-pillar evaluation, gaps in Architecture, Performance, Type Rigor, Test Value
- `doc-audit.md` — 6 drift, 3 gaps, 2 stale, 2 stale code examples, 1 config drift

Phases run in strict order: subtractive cleanup, then code fixes, then guardrails, then docs.

## Prerequisites

- Node 24 LTS (nvm), npm
- Repo cloned, `npm ci` at root and in `frontend/`
- AWS SSO profile `dev` (only required if a phase touches deploy verification, which none do)
- Working in a worktree per user git rules

## Phase Summary

| Phase | Title | Tag | Est Tokens |
|---|---|---|---|
| 0 | Foundations, ADRs, Conventions | n/a | 8k |
| 1 | Subtractive Cleanup, Dead Code, Unused Exports, Vite CVE | [HYGIENIST] | 25k |
| 2 | Router Migration and Auth Middleware Consolidation | [IMPLEMENTER] | 40k |
| 3 | Performance, Error Handling, Type Rigor | [IMPLEMENTER] | 45k |
| 4 | Test Coverage Expansion | [IMPLEMENTER] | 30k |
| 5 | Frontend God-Component Decomposition | [IMPLEMENTER] | 35k |
| 6 | Guardrails, Lint, CI, Hooks, Type Strictness | [FORTIFIER] | 25k |
| 7 | Documentation Repair and Prevention Tooling | [DOC-ENGINEER] | 25k |

## Navigation

1. Start at `Phase-0.md` for ADRs and conventions.
1. Work phases sequentially. Do not skip.
1. Record blockers in `feedback.md` under Active Feedback.
1. Mark resolved items by moving to Resolved Feedback.

## Tag Legend

- `[HYGIENIST]` subtractive cleanup, deletes only
- `[IMPLEMENTER]` code changes, refactors, new logic
- `[FORTIFIER]` additive guardrails, no behavior changes
- `[DOC-ENGINEER]` documentation and doc-prevention tooling
