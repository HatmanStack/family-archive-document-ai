# Phase 5 — Frontend God-Component Decomposition [IMPLEMENTER]

## Goal

Break apart the two god components flagged by the health audit
(`gallery/+page.svelte` 1075 LOC and `profile/settings/+page.svelte` 693 LOC)
into focused subcomponents with isolated state and unit-testable seams.

Estimated tokens: 35k.

## Prerequisites

- Phases 1–4 merged.
- Comfort with Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`).

## Task 5.1 — Decompose `gallery/+page.svelte`

**Goal:** Extract independent concerns into subcomponents under
`frontend/lib/components/gallery/`.

**Files:**

- `frontend/routes/gallery/+page.svelte`
- `frontend/lib/components/gallery/SectionTabs.svelte` (new)
- `frontend/lib/components/gallery/MediaList.svelte` (new)
- `frontend/lib/components/gallery/SearchBar.svelte` (new)
- `frontend/lib/components/gallery/UploadModal.svelte` (new)
- `frontend/lib/components/gallery/CaptionModal.svelte` (new)
- `frontend/lib/components/gallery/MediaPreview.svelte` (new)
- `frontend/lib/stores/gallery.ts` (new)

**Steps:**

1. Move all gallery state (selected section, search query, modal flags,
   preview URL lifecycle, all-items map cache, refresh timer) into
   `lib/stores/gallery.ts` using Svelte 5 runes-in-modules pattern.
1. Extract each visual concern into its own subcomponent. Pass props in,
   emit events out. No subcomponent should import the page directly.
1. The page becomes a thin layout: tabs, list, modals.
1. Move the preview-URL `URL.revokeObjectURL` cleanup into a single
   `$effect` inside `MediaPreview.svelte`.
1. Add component unit tests where feasible (Vitest + `@testing-library/svelte`).

**Verification checklist:**

- [ ] `+page.svelte` is under 250 LOC
- [ ] No `setInterval` or `URL.createObjectURL` in `+page.svelte`
- [ ] Each subcomponent has a single responsibility
- [ ] `npm run lint` and `npm test` green
- [ ] Manual smoke: upload, search, caption, modal, navigation all work

**Commit:** `refactor(gallery): decompose +page.svelte into focused subcomponents`

## Task 5.2 — Decompose `profile/settings/+page.svelte`

**Goal:** Extract profile form, family relationships CRUD, notification
settings, and photo upload into subcomponents.

**Files:**

- `frontend/routes/profile/settings/+page.svelte`
- `frontend/lib/components/profile/ProfileForm.svelte` (new)
- `frontend/lib/components/profile/RelationshipsEditor.svelte` (new)
- `frontend/lib/components/profile/NotificationSettings.svelte` (new)
- `frontend/lib/components/profile/PhotoUploader.svelte` (new)

**Steps:**

1. Same pattern as Task 5.1: extract independent concerns, push state into a
   store under `lib/stores/profile-settings.ts` if cross-component state is
   needed.
1. Photo upload becomes its own component with its own validation and progress
   state.
1. Relationships CRUD becomes its own component with its own save lifecycle.

**Verification checklist:**

- [ ] `+page.svelte` is under 200 LOC
- [ ] Each subcomponent owns its own validation
- [ ] `npm run lint` and `npm test` green
- [ ] Manual smoke: edit profile, add/remove relationship, upload photo,
      toggle notifications

**Commit:** `refactor(profile): decompose settings page into focused subcomponents`

## Phase Verification

1. `wc -l frontend/routes/gallery/+page.svelte frontend/routes/profile/settings/+page.svelte`
   confirms both are well under their previous sizes.
1. Lint and tests green.
