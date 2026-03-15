# Unified Audit Remediation Plan

## Feature Overview

This plan remediates findings from three concurrent audits of the Family Archive - Document AI codebase: a tech debt health audit (25 findings), a 12-pillar evaluation (across 4 evaluator personas), and a documentation drift audit (37 findings across 7 categories). The audits identified 3 critical operational issues (CORS mishandling, unvalidated pagination cursors, unguarded JSON parsing), significant structural debt (14 legacy JS files shadowing TypeScript source), and pervasive documentation drift (14 doc-code mismatches).

The remediation follows a strict ordering: subtractive cleanup first (remove dead code, unused files, build artifacts), then structural code fixes (architecture, error handling, performance), then additive guardrails (pre-commit hooks, stricter linting, type enforcement), and finally documentation repairs and prevention tooling. This ordering ensures each phase works on a progressively cleaner codebase.

The plan consolidates overlapping findings across the three audits into single tasks. For example, the legacy JS files appear in the health audit (finding #4), the evaluation (Problem-Solution Fit remediation), and the doc audit (gap #4) -- these are addressed once in Phase 1.

## Prerequisites

- Node.js (version used by project -- check `package.json` engines or CI config)
- npm (workspaces support required)
- AWS SDK mock library (`aws-sdk-client-mock` -- already in devDependencies)
- Vitest (already in devDependencies)
- Git

## Phase Summary

| Phase | Tag | Goal | Token Estimate |
|-------|-----|------|----------------|
| 0 | -- | Foundation: ADRs, testing strategy, conventions | ~5,000 |
| 1 | [HYGIENIST] | Dead code removal, file cleanup, dependency pruning | ~12,000 |
| 2 | [IMPLEMENTER] | Critical fixes: CORS, pagination validation, JSON parsing, error handling | ~25,000 |
| 3 | [IMPLEMENTER] | Architecture improvements: repository extraction, S3 client consolidation, performance | ~30,000 |
| 4 | [FORTIFIER] | Guardrails: pre-commit hooks, gitignore hardening, lint rules | ~10,000 |
| 5 | [DOC-ENGINEER] | Documentation repairs: drift fixes, gap fills, stale removal, config docs | ~15,000 |

## Navigation

- [Phase-0.md](./Phase-0.md) -- Foundation (applies to all phases)
- [Phase-1.md](./Phase-1.md) -- [HYGIENIST] Subtractive Cleanup
- [Phase-2.md](./Phase-2.md) -- [IMPLEMENTER] Critical Code Fixes
- [Phase-3.md](./Phase-3.md) -- [IMPLEMENTER] Architecture & Performance
- [Phase-4.md](./Phase-4.md) -- [FORTIFIER] Guardrails & Enforcement
- [Phase-5.md](./Phase-5.md) -- [DOC-ENGINEER] Documentation Remediation
- [feedback.md](./feedback.md) -- Review feedback tracking
