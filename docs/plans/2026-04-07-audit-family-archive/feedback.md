# Plan Feedback

Plan ID: `2026-04-07-audit-family-archive`

## Active Feedback

<!-- Add blockers, ambiguities, or required clarifications here. Format:

### YYYY-MM-DD Phase-N Task-X

**Issue:** ...

**Context:** ...

**Proposed resolution:** ...
-->

### 2026-04-07 Phase-1 Task-1.4

**Issue:** Inline type duplications noted while deleting unused exported types from `backend/lambdas/api/src/types/index.ts`.

**Context:** The shared `Message`, `Conversation`, `Reaction`, `Letter`, `Draft`, `ParsedLetterData`, and `RateLimitRecord` interfaces were unused at the call sites. Equivalent inline shapes exist in:

- `backend/lambdas/api/src/repositories/messaging-repository.ts` (`MessageRecord`, `ConversationRecord` style locals)
- `backend/lambdas/letter-processor/src/types.ts` (`ParsedLetterData` declared independently)
- Route handlers under `backend/lambdas/api/src/routes/` for letters, drafts, reactions

**Proposed resolution:** Phase 3 should consolidate these duplicated shapes into a single source of truth (either shared types or repository-owned types) rather than re-introducing the deleted central definitions.

## Resolved Feedback

<!-- Move resolved items here with the resolution noted. -->
