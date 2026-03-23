# Feedback Tracker

## Active Feedback

*No active feedback items.*

## Resolved Feedback

### Phase 6 Review (CODE_REVIEW)

1. **CLAUDE.md line 37 -- stale auth route description.**
   **Resolution:** Updated auth route comment from "Login, signup, callback,
   password reset" to "Login, callback, forgot/reset-password, logout,
   pending-approval". Now matches the actual route directories on disk.

1. **FRONTEND.md lines 419-432 -- region inconsistency introduced.**
   **Resolution:** Updated all `us-east-1` references in the FRONTEND.md
   environment variables example block to `us-west-2`, matching `.env.example`,
   `docs/DEVELOPMENT.md`, and `docs/AUTHENTICATION.md`. Region references are
   now consistent across all documentation.
