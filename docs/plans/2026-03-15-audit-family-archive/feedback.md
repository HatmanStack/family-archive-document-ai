# Feedback — 2026-03-15 Audit Remediation

## Active Feedback

<!-- Items added by reviewers. Format:
### FB-{NNN} [{SOURCE}] {Title}
- **Phase/Task:** Phase-N, Task M
- **Severity:** BLOCKING | SUGGESTION
- **Detail:** ...
-->

## Resolved Feedback

<!-- Moved here after resolution. Add:
- **Resolution:** Description of what was done
- **Resolved in:** Phase-N, Task M (or commit ref)
-->

### FB-002 [CODE_REVIEW] ESLint brace-style violation in media-service.ts ragstackQuery
- **Phase/Task:** Phase-3, Task 3
- **Severity:** BLOCKING
- **Detail:** `frontend/lib/services/media-service.ts` line 88 has `} finally {` on the same line, violating the `style/brace-style` ESLint rule. The project's ESLint config requires the closing brace and subsequent block keyword to be on separate lines (as correctly done in `getImageById` at lines 409-410 with `}\n  catch`). This causes `npm run lint` to fail with 1 error, which is a Phase 3 success criterion violation. Fix: change line 88 from `} finally {` to `}\n  finally {` to match the project's brace style convention.
- **Resolution:** Split `} finally {` onto separate lines in `ragstackQuery()` at line 88 of `media-service.ts`, placing `finally {` on its own line to match the project's brace-style convention. ESLint now passes with zero errors and zero warnings.
- **Resolved in:** Phase-3, Task 3

### FB-001 [CODE_REVIEW] media.ts and contact.ts still missing requestOrigin in all response calls
- **Phase/Task:** Phase-2, Tasks 1-4 (CORS fixes)
- **Severity:** BLOCKING
- **Detail:** The Phase 2 verification criteria states: "Search all route handler files for `successResponse(` without `requestOrigin` — should find NONE" and "errorResponse(` without `requestOrigin` — should find NONE." However, `media.ts` (15 response calls) and `contact.ts` (8 response calls) were not included in Tasks 1-4 and still have every `successResponse()` and `errorResponse()` call missing the `requestOrigin` parameter. Both files were touched during Phase 2 (media.ts in commit d87af31 for toError, contact.ts in commit 1f6725b for escapeHtml), so the CORS gap should have been noticed and addressed. Should `requestOrigin` not be destructured from context and threaded through these two route handlers the same way it was done for messages, comments, reactions, and drafts?
- **Resolution:** Destructured `requestOrigin` from `RequestContext` in both `media.ts` and `contact.ts`. Threaded `requestOrigin` through all internal functions and passed it as the last argument to every `successResponse()` and `errorResponse()` call in both files. In `media.ts`: destructured in `handle()`, threaded to `getDownloadUrl()`, applied to all 15 response calls. In `contact.ts`: changed `_context` to `context`, destructured `requestOrigin`, applied to all 8 response calls.
- **Resolved in:** Phase-2, Tasks 1-4 (CORS fix follow-up)
