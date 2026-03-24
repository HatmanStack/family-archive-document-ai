# Feedback - Technical Debt Sweep

## Active Feedback

<!-- No active feedback items -->

## Resolved Feedback

### PLAN_REVIEW - Iteration 2 - Phase 0 stale testing section

> **Issue:** Phase 0 "Test files for TS migration" section contradicts Phase 1 Task 10 by describing migration of nonexistent test files.

**Status:** RESOLVED
**Resolution:** Rewrote Phase 0 section "Test files for TS migration" → "Test files for background Lambdas". Now states no test files exist and new ones will be created in Phase 1 Task 10. Removed all bullet points about `require()` to `import` conversion.

---

### PLAN_REVIEW - Iteration 1 - Phase 1, Task 10

> **Consider:** Task 10 says "modify" test files that don't exist. No test files exist for activity-aggregator or notification-processor. The task must say "Create" and the implementation steps must be rewritten from scratch.

**Status:** RESOLVED
**Resolution:** Rewrote Task 10 entirely. Changed from "Migrate test files" to "Create test files for migrated Lambdas". Replaced "Files to modify" with "Files to create". Removed all references to converting existing tests. Added detailed implementation steps covering what to test for each Lambda (entity type handling, notification preferences, email sending, mock setup).

---

### PLAN_REVIEW - Iteration 1 - README Token Estimates

> **Consider:** README says Phase 1 is ~50,000 and Phase 2 is ~35,000 but Phase-1.md says ~40,000 and Phase-2.md says ~60,000. Both pairs must be reconciled.

**Status:** RESOLVED
**Resolution:** Updated README Phase Summary table to match the phase files: Phase 1 = ~40,000 tokens, Phase 2 = ~60,000 tokens. Phase files are authoritative.

---

### PLAN_REVIEW - Iteration 1 - Phase 2, Task 3

> **Consider:** The `rateLimitResponse` parameter order is not confirmed for a zero-context engineer.

**Status:** RESOLVED
**Resolution:** Added a "Reference signatures" section to Task 3 documenting the exact signatures of `checkRateLimit`, `getRetryAfter`, `rateLimitResponse`, and `errorResponse` with parameter types and source locations.

---

### PLAN_REVIEW - Iteration 1 - Phase 2, Task 9

> **Consider:** `search-service.ts` is listed in "Files to modify" but then the special cases section says "Leave as-is". This is contradictory.

**Status:** RESOLVED
**Resolution:** Removed `search-service.ts` from the "Files to modify" list. Updated the goal description to say "remaining 8 services" (not 9). Removed the search-service special case bullet since the file is no longer listed.

---

### PLAN_REVIEW - Iteration 1 - Phase 1, Tasks 8-9

> **Consider:** The delete step ordering for JS→TS migration could be clearer about files coexisting briefly.

**Status:** RESOLVED (no change needed)
**Resolution:** The steps already list "Read JS file" → "Create TS file" → "Delete JS file" in sequential order. The engineer follows steps in order, so files coexist only during the creation step. No ambiguity in practice.
