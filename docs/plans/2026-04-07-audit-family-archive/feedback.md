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

### 2026-04-07 Phase-7 Task-7.5

**Issue:** Markdownlint produces ~80+ legacy-formatting violations across docs
beyond the audit findings (MD012/MD022/MD029/MD031/MD032/MD060 — multiple
blank lines, missing blank lines around lists/tables/fences, sequential
ordered-list numbering, table column padding). Fixing them all in this commit
would touch nearly every doc file and far exceed Phase 7's audit-finding
scope.

**Context:** The CI markdownlint job currently ships with these rules
disabled in `.markdownlint.jsonc`. Phase-0's "blank lines surround headings,
lists, and code blocks" rule is therefore not enforced. The MD040
(fence-language) and MD026 (no heading punctuation) rules from Phase 0 are
enforced and clean.

**Proposed resolution:** Schedule a follow-up doc-formatting pass that
re-enables MD012/MD022/MD031/MD032 and runs `markdownlint-cli2 --fix` across
the repo, plus a manual pass for MD029 and MD060. Track as a separate
"docs: enforce strict markdown formatting" task.

## Resolved Feedback

<!-- Move resolved items here with the resolution noted. -->
