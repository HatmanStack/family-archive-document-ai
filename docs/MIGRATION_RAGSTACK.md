# Migration Guide: Archive Bucket to RAGStack

This documents the migration strategy for existing Family Archive - Document AI deployments transitioning from the archive S3 bucket to RAGStack for media and letter storage.

## Background

Previously, media and letter PDFs were stored in the HTT archive bucket (`ARCHIVE_BUCKET`) and optionally duplicated to RAGStack for search indexing. The new architecture routes all media/letter uploads exclusively through RAGStack's GraphQL API, with HTT retaining a local bucket only for profile photos, message attachments, and temporary letter processing files.

## Challenge

Existing deployments have:
- **Letters** in DynamoDB with `pdfKey` pointing to `letters/{date}/{date}.pdf` in the archive bucket
- **Letters already OCR'd in RAGStack** — uploaded during the dual-upload era, tracked by RAGStack's `documentId`
- **Media files** in the archive bucket under `media/pictures/`, `media/videos/`, `media/documents/`

The migration must match HTT's DynamoDB records to their existing RAGStack counterparts so the new serving path (`ragstackDocumentId` -> RAGStack bucket) works.

## Migration Steps

### 1. Match Letters to RAGStack Documents

Letters were already uploaded to RAGStack during publishing (as markdown files). Match them by filename:

```
1. Call RAGStack GraphQL: listDocuments
2. For each document, extract filename (e.g., "letter-2024-01-15.md")
3. Parse date from filename
4. Look up corresponding HTT DynamoDB letter record by date
5. Update DynamoDB: set ragstackDocumentId = document.documentId
6. Keep pdfKey as fallback (backend checks ragstackDocumentId first, falls back to pdfKey)
```

### 2. Match Media to RAGStack Content

Images and documents were uploaded to RAGStack during gallery upload. Match by filename:

```
1. Call RAGStack GraphQL: listImages (paginated) and listDocuments
2. For each item, note the filename and documentId/imageId
3. Match against archive bucket S3 keys by filename
4. No DynamoDB update needed — gallery listing will migrate to RAGStack GraphQL queries
```

### 3. Handle Unmatched Content

Some content may exist only in the archive bucket (e.g., videos that were skipped before RAGStack video support):

```
1. List archive bucket objects under media/videos/
2. Upload each to RAGStack via createUploadUrl mutation
3. Original archive copies can be retained or cleaned up after verification
```

## Backend Fallback

The backend `getPdfUrl()` in `letters.ts` supports both paths:
- If `ragstackDocumentId` exists: generates presigned URL from RAGStack bucket
- If only `pdfKey` exists: generates presigned URL from archive bucket (legacy)

This allows gradual migration without downtime.

## Running the Migration Script

The script is at `backend/scripts/migrate-to-ragstack.cjs`.

### Prerequisites

Source your deployment environment or set these variables:

```bash
export TABLE_NAME=HoldThatThought       # HTT DynamoDB table
export HTT_REGION=us-west-2             # HTT stack region
export ARCHIVE_BUCKET=my-archive-bucket # HTT archive S3 bucket
export RAGSTACK_DATA_BUCKET=my-rag-data # RAGStack data S3 bucket
export RAGSTACK_REGION=us-east-1        # RAGStack region

# Option A: GraphQL API (default)
export RAGSTACK_GRAPHQL_URL=https://xxxxx.appsync-api.us-east-1.amazonaws.com/graphql
export RAGSTACK_API_KEY=da2-xxxxxxxxxx

# Option B: Tracking table (use when API key lacks listDocuments access)
export RAGSTACK_TRACKING_TABLE=my-rag-tracking-table
```

These values are in your `.env.deploy` and frontend `.env` files after deployment.

### Step 1: Dry run (preview only)

```bash
node backend/scripts/migrate-to-ragstack.cjs --dry-run
```

Scans DynamoDB letters and RAGStack documents, prints matches, and checks which PDFs need copying to the RAGStack data bucket. Writes nothing.

### Step 2: Execute migration

```bash
node backend/scripts/migrate-to-ragstack.cjs
```

For each matched letter:
1. Copies the PDF from `letters/{date}/{date}.pdf` in the archive bucket to `input/{documentId}/{date}.pdf` in the RAGStack data bucket (skips if already present)
2. Updates the DynamoDB record with `ragstackDocumentId` and `pdfFilename`

The `pdfKey` field is preserved as a fallback.

### Step 3: Scan archive media (optional)

```bash
node backend/scripts/migrate-to-ragstack.cjs --scan-media
```

Lists archive bucket objects under `media/` and reports which files are already in RAGStack vs which need uploading.

### Using the tracking table

For RAGStack stacks where the API key doesn't have `listDocuments` access, read documents directly from RAGStack's DynamoDB tracking table:

```bash
node backend/scripts/migrate-to-ragstack.cjs --use-tracking-table --dry-run
```

### Flags

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview matches and PDF copies without writing |
| `--scan-media` | Also scan archive bucket for unmatched media files |
| `--use-tracking-table` | Read RAGStack docs from tracking DynamoDB table instead of GraphQL |

## Post-Migration

After migration is complete and verified:
1. Confirm all letters have `ragstackDocumentId` in DynamoDB
2. Verify gallery listing works via RAGStack GraphQL queries
3. The archive bucket `media/` and `letters/` prefixes can be cleaned up
4. The legacy fallback in `getPdfUrl()` can be removed in a future release
