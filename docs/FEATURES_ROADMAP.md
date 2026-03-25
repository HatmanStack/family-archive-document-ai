# Features Roadmap

Future feature ideas for the Family Archive platform.

## Future Features

### Interactive Family Tree Visualization

A person-centric, document-driven family tree. Instead of a static pedigree chart, the tree grows dynamically from the content in the archive. Each person is a node connected to letters, photos, and AI-extracted context. Clicking a person centers the view on them and surfaces everything the archive knows about them.

#### Existing Infrastructure

The codebase already has building blocks for this:

- **`FamilyRelationship` type** in `frontend/lib/types/profile.ts` — array of `{ id, type, name, customType?, createdAt }` on each user profile
- **Predefined relationship types** — Mother, Father, Sibling, Spouse, Child, Grandparent variants, Aunt, Uncle, Cousin, Niece, Nephew, Great-grandparent variants, custom "Other"
- **`/family/` route** at `frontend/routes/family/+page.svelte` — currently renders all users as a card grid
- **Profile API** — `GET /users` returns all users, `GET /profile/{userId}` returns profile with `familyRelationships` array
- **Letter processor** — Gemini already extracts `author`, `recipient`, `tags` from letters
- **RAGStack search** — `searchKnowledgeBase(query, maxResults)` via GraphQL, returns content + source + score

#### Core Concept: Person vs User

The tree needs a `PERSON#` entity separate from `USER#`. Most people in a family archive are historical — great-grandparents, ancestors in letters, people in old photos who will never have accounts. A Person can optionally link to a User (for living family members on the platform).

DynamoDB key pattern:

- `PK=PERSON#{personId}, SK=PROFILE` — name, birth/death dates, alternate names, linked userId (optional)
- `PK=PERSON#{personId}, SK=RELATION#{relationId}` — relationship to another person, type, confidence (explicit vs AI-inferred)
- `GSI1PK=PERSONS, GSI1SK=sortable` — list all persons for tree rendering

#### Build Phases

**Phase 1 — Person entity and manual tree (no AI)**

Backend:

- Add `PERSON#` prefix to DynamoDB single-table design
- New route handler `backend/lambdas/api/src/routes/tree.ts` with endpoints:
  - `GET /tree` — full graph (all persons + relationships)
  - `GET /tree/person/{personId}` — single person + adjacent relationships + linked documents
  - `POST /tree/person` — create person
  - `PUT /tree/person/{personId}` — update person
  - `POST /tree/relationship` — create bidirectional relationship
  - `DELETE /tree/relationship/{relationId}` — remove relationship
- Migration utility to convert existing `familyRelationships` arrays on User profiles into `PERSON#` entities

Frontend:

- Add a graph visualization library (vis-network or d3-dag) to `frontend/package.json`
- New route `frontend/routes/tree/+page.svelte` — interactive graph canvas
- New service `frontend/lib/services/family-tree-service.ts` — fetch graph data, build nodes/edges
- Components: `TreeVisualization.svelte`, `PersonNode.svelte`, `TreeControls.svelte` (zoom, pan, filter)
- Person-centric view: click a node to center on that person, show immediate family radiating outward
- Link to existing profile page for users who have accounts

**Phase 2 — Document linking and evidence**

- Tag letters and photos with `PERSON#` references (manual UI: "Who appears in this document?")
- Person detail panel shows a timeline of linked documents
- RAG-powered context panel: query `searchKnowledgeBase("documents mentioning {personName}")` to surface relevant letters, photos
- "What do we know about this person?" summary generated from linked content

**Phase 3 — AI-suggested relationships**

- Extend Gemini prompt in letter-processor to extract:
  - Named entities beyond author/recipient (people mentioned in the body)
  - Relationship hints ("my mother", "your cousin Jim", "grandfather's letter")
  - Life events (births, marriages, deaths, migrations)
- New `confidence` field on relationships: `explicit` (user-confirmed) vs `inferred` (AI-suggested)
- Suggestion UI: "This letter mentions 'Aunt Martha.' Is this the same Martha from the 1952 letter?"
- User confirms or dismisses — confirmed suggestions become explicit relationships

**Phase 4 — Advanced visualization**

- Generation/branch filtering (maternal side, paternal side, specific branch)
- Timeline slider — show the tree at a point in time (who was alive in 1943?)
- Multi-generation expand/collapse
- Relationship editing directly on the graph (drag to connect, right-click to set type)
- Export to GEDCOM format for interop with Ancestry.com, FamilySearch
- Import from GEDCOM to bootstrap tree from existing genealogy data

#### Visualization Library Decision

| Option | Pros | Cons |
|--------|------|------|
| vis-network | Simple API, built-in zoom/pan/drag, force-directed layout | Less customizable styling, ~500KB |
| d3-dag | Maximum control, handles complex trees (multiple marriages, adoptions) | Steep learning curve, manual interaction handling |
| SvelteFlow | Native Svelte, node-based graphs, good DX | More suited to flowcharts than genealogy |
| Custom SVG | Lightweight, full control | Manual layout algorithms, significant effort |

Recommendation: Start with vis-network for MVP (fastest to working prototype). Migrate to d3-dag if custom styling or complex layout needs arise.

#### Key Files to Reference

| Area | File | Why |
|------|------|-----|
| Relationship types | `frontend/lib/types/profile.ts` | Existing `FamilyRelationship` interface and `RELATIONSHIP_TYPES` |
| Profile service | `frontend/lib/services/profile-service.ts` | Pattern for API calls, `getAllUsers()`, `getProfile()` |
| Family page | `frontend/routes/family/+page.svelte` | Existing family member grid to complement with tree view |
| Letter processor | `backend/lambdas/letter-processor/src/gemini.ts` | Gemini prompt to extend for entity extraction |
| RAG search | `frontend/lib/services/search-service.ts` | `searchKnowledgeBase()` for person-context queries |
| Data model | `docs/DATA_MODEL.md` | Key prefix patterns for new `PERSON#` entity |
| API routing | `backend/lambdas/api/src/index.ts` | Pattern for adding new route handler |
| SAM template | `backend/template.yaml` | DynamoDB table config, Lambda definitions |
