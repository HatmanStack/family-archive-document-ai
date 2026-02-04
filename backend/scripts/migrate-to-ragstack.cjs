#!/usr/bin/env node
/**
 * Migrate Family Archive - Document AI letters to RAGStack
 *
 * 1. Matches HTT DynamoDB letter records to RAGStack documents by date
 * 2. Copies missing letter PDFs from archive bucket to RAGStack data bucket
 * 3. Updates DynamoDB with ragstackDocumentId + pdfFilename
 * 4. Optionally scans archive media for unmatched files
 *
 * Supports two modes for reading RAGStack documents:
 *   - GraphQL API (default): uses listDocuments query
 *   - Tracking table (fallback): reads RAGStack's DynamoDB tracking table directly
 *     Use --use-tracking-table when the API key lacks listDocuments access
 *
 * Usage:
 *   # Dry run (preview only)
 *   node backend/scripts/migrate-to-ragstack.cjs --dry-run
 *
 *   # Execute migration
 *   node backend/scripts/migrate-to-ragstack.cjs
 *
 *   # Use tracking table instead of GraphQL (for stricter auth stacks)
 *   node backend/scripts/migrate-to-ragstack.cjs --use-tracking-table
 *
 *   # Also scan archive bucket for unmatched media
 *   node backend/scripts/migrate-to-ragstack.cjs --scan-media
 *
 * Environment variables:
 *   TABLE_NAME              - HTT DynamoDB table (default: HoldThatThought)
 *   HTT_REGION              - HTT stack region (default: us-west-2)
 *   ARCHIVE_BUCKET          - Archive S3 bucket name (required)
 *   RAGSTACK_DATA_BUCKET    - RAGStack data S3 bucket (required)
 *   RAGSTACK_REGION         - RAGStack region (default: us-east-1)
 *   RAGSTACK_TRACKING_TABLE - RAGStack tracking DynamoDB table (required for --use-tracking-table)
 *   RAGSTACK_GRAPHQL_URL    - RAGStack AppSync endpoint (required unless --use-tracking-table)
 *   RAGSTACK_API_KEY        - RAGStack AppSync API key (required unless --use-tracking-table)
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb')
const { S3Client, HeadObjectCommand, CopyObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3')

// --- Config ---

const TABLE_NAME = process.env.TABLE_NAME || 'HoldThatThought'
const HTT_REGION = process.env.HTT_REGION || process.env.AWS_REGION || 'us-west-2'
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET
const RAGSTACK_DATA_BUCKET = process.env.RAGSTACK_DATA_BUCKET
const RAGSTACK_REGION = process.env.RAGSTACK_REGION || 'us-east-1'
const RAGSTACK_TRACKING_TABLE = process.env.RAGSTACK_TRACKING_TABLE
const RAGSTACK_GRAPHQL_URL = process.env.RAGSTACK_GRAPHQL_URL
const RAGSTACK_API_KEY = process.env.RAGSTACK_API_KEY

const DRY_RUN = process.argv.includes('--dry-run')
const SCAN_MEDIA = process.argv.includes('--scan-media')
const USE_TRACKING_TABLE = process.argv.includes('--use-tracking-table')

const httDdb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: HTT_REGION }))
const ragDdb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: RAGSTACK_REGION }))
const archiveS3 = new S3Client({ region: HTT_REGION })
const ragstackS3 = new S3Client({ region: RAGSTACK_REGION })

// --- GraphQL helpers ---

async function graphqlQuery(query, variables = {}) {
  const response = await fetch(RAGSTACK_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': RAGSTACK_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  })
  const body = await response.json()
  if (body.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(body.errors)}`)
  }
  return body.data
}

async function listDocsViaGraphQL() {
  // listDocuments takes no args, returns all at once
  // Try with 'type' field first (newer RAGStack), fall back without it
  try {
    const query = `query { listDocuments { items { documentId filename status type inputS3Uri } } }`
    const data = await graphqlQuery(query)
    return (data.listDocuments.items || []).map(d => ({
      documentId: d.documentId,
      filename: d.filename,
      status: d.status,
      inputS3Uri: d.inputS3Uri,
    }))
  } catch (err) {
    if (err.message.includes('type')) {
      // Older schema without 'type' field
      const query = `query { listDocuments { items { documentId filename status inputS3Uri } } }`
      const data = await graphqlQuery(query)
      return (data.listDocuments.items || []).map(d => ({
        documentId: d.documentId,
        filename: d.filename,
        status: d.status,
        inputS3Uri: d.inputS3Uri,
      }))
    }
    throw err
  }
}

async function listImagesViaGraphQL() {
  const images = []
  let nextToken = null
  do {
    const query = `query ListImages($limit: Int, $nextToken: String) {
      listImages(limit: $limit, nextToken: $nextToken) {
        items { imageId filename status s3Uri }
        nextToken
      }
    }`
    const data = await graphqlQuery(query, { limit: 100, nextToken })
    images.push(...(data.listImages.items || []))
    nextToken = data.listImages.nextToken
  } while (nextToken)
  return images
}

// --- Tracking table helpers ---

async function listDocsViaTrackingTable() {
  const docs = []
  let lastKey
  do {
    const result = await ragDdb.send(new ScanCommand({
      TableName: RAGSTACK_TRACKING_TABLE,
      ExclusiveStartKey: lastKey,
    }))
    for (const item of result.Items || []) {
      docs.push({
        documentId: item.document_id,
        filename: item.filename,
        status: item.status,
        inputS3Uri: item.input_s3_uri,
      })
    }
    lastKey = result.LastEvaluatedKey
  } while (lastKey)
  return docs
}

// --- Unified document listing ---

async function listAllRagstackDocs() {
  if (USE_TRACKING_TABLE) {
    if (!RAGSTACK_TRACKING_TABLE) {
      throw new Error('RAGSTACK_TRACKING_TABLE is required with --use-tracking-table')
    }
    console.log(`  Source: tracking table (${RAGSTACK_TRACKING_TABLE})`)
    return listDocsViaTrackingTable()
  }
  if (!RAGSTACK_GRAPHQL_URL || !RAGSTACK_API_KEY) {
    throw new Error('RAGSTACK_GRAPHQL_URL and RAGSTACK_API_KEY are required (or use --use-tracking-table)')
  }
  console.log(`  Source: GraphQL API`)
  return listDocsViaGraphQL()
}

// --- HTT DynamoDB helpers ---

async function scanLetters() {
  const letters = []
  let lastKey
  do {
    const result = await httDdb.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'SK = :sk AND begins_with(PK, :pk)',
      ExpressionAttributeValues: { ':sk': 'CURRENT', ':pk': 'LETTER#' },
      ExclusiveStartKey: lastKey,
    }))
    letters.push(...(result.Items || []))
    lastKey = result.LastEvaluatedKey
  } while (lastKey)
  return letters
}

async function updateLetterWithRagstackId(letter, documentId, pdfFilename) {
  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would set ragstackDocumentId=${documentId}, pdfFilename=${pdfFilename}`)
    return
  }
  await httDdb.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: letter.PK, SK: letter.SK },
    UpdateExpression: 'SET ragstackDocumentId = :docId, pdfFilename = :fn',
    ExpressionAttributeValues: {
      ':docId': documentId,
      ':fn': pdfFilename,
    },
  }))
}

// --- S3 helpers ---

async function s3ObjectExists(bucket, key, client) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch {
    return false
  }
}

async function copyPdfToRagstack(date, documentId, pdfFilename) {
  const sourceKey = `letters/${date}/${pdfFilename}`
  const destKey = `input/${documentId}/${pdfFilename}`

  // Check if already exists in RAGStack bucket
  if (await s3ObjectExists(RAGSTACK_DATA_BUCKET, destKey, ragstackS3)) {
    return 'exists'
  }

  // Check source exists
  if (!await s3ObjectExists(ARCHIVE_BUCKET, sourceKey, archiveS3)) {
    return 'source_missing'
  }

  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would copy s3://${ARCHIVE_BUCKET}/${sourceKey} → s3://${RAGSTACK_DATA_BUCKET}/${destKey}`)
    return 'would_copy'
  }

  // Cross-region copy: source specified as bucket/key in CopySource
  await ragstackS3.send(new CopyObjectCommand({
    Bucket: RAGSTACK_DATA_BUCKET,
    Key: destKey,
    CopySource: `${ARCHIVE_BUCKET}/${sourceKey}`,
  }))
  return 'copied'
}

async function listArchiveObjects(prefix) {
  const objects = []
  let token
  do {
    const result = await archiveS3.send(new ListObjectsV2Command({
      Bucket: ARCHIVE_BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
    }))
    objects.push(...(result.Contents || []))
    token = result.NextContinuationToken
  } while (token)
  return objects
}

// --- Matching logic ---

function extractDateFromFilename(filename) {
  if (!filename) return null
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function extractDateFromLetterPK(pk) {
  return pk.replace('LETTER#', '')
}

// --- Main migration ---

async function migrateLetters() {
  console.log('\n=== Step 1: Match Letters to RAGStack Documents ===\n')

  const [letters, ragDocs] = await Promise.all([
    scanLetters(),
    listAllRagstackDocs(),
  ])

  console.log(`\n  HTT letters:       ${letters.length}`)
  console.log(`  RAGStack documents: ${ragDocs.length}\n`)

  // Build a map: date -> RAGStack document
  const ragDocsByDate = new Map()
  for (const doc of ragDocs) {
    const date = extractDateFromFilename(doc.filename)
    if (date) {
      // Prefer indexed docs; if multiple match same date, keep the indexed one
      const existing = ragDocsByDate.get(date)
      if (!existing || (doc.status || '').toLowerCase() === 'indexed') {
        ragDocsByDate.set(date, doc)
      }
    }
  }

  let matched = 0
  let alreadyMigrated = 0
  let unmatched = 0
  let copied = 0
  let alreadyInBucket = 0
  let sourceMissing = 0
  let copyErrors = 0

  for (const letter of letters) {
    const date = extractDateFromLetterPK(letter.PK)
    const title = letter.title || date

    if (letter.ragstackDocumentId) {
      alreadyMigrated++
      continue
    }

    const ragDoc = ragDocsByDate.get(date)
    if (!ragDoc) {
      console.log(`  NO MATCH: "${title}" (${date})`)
      unmatched++
      continue
    }

    const pdfFilename = letter.pdfKey
      ? letter.pdfKey.split('/').pop()
      : `${date}.pdf`

    console.log(`  MATCH: "${title}" (${date}) → ${ragDoc.documentId}`)

    // Step 1a: Copy PDF to RAGStack bucket if missing
    if (ARCHIVE_BUCKET && RAGSTACK_DATA_BUCKET) {
      try {
        const copyResult = await copyPdfToRagstack(date, ragDoc.documentId, pdfFilename)
        if (copyResult === 'copied') {
          console.log(`    Copied PDF → s3://${RAGSTACK_DATA_BUCKET}/input/${ragDoc.documentId}/${pdfFilename}`)
          copied++
        } else if (copyResult === 'would_copy') {
          copied++
        } else if (copyResult === 'exists') {
          console.log(`    PDF already in RAGStack bucket`)
          alreadyInBucket++
        } else if (copyResult === 'source_missing') {
          console.log(`    WARNING: source PDF not found in archive bucket`)
          sourceMissing++
        }
      } catch (err) {
        console.error(`    ERROR copying PDF: ${err.message}`)
        copyErrors++
      }
    }

    // Step 1b: Update DynamoDB
    try {
      await updateLetterWithRagstackId(letter, ragDoc.documentId, pdfFilename)
      matched++
    } catch (err) {
      console.error(`    ERROR updating DynamoDB: ${err.message}`)
      unmatched++
    }
  }

  console.log('\n--- Letter Summary ---')
  console.log(`Matched & updated:    ${matched}`)
  console.log(`Already migrated:     ${alreadyMigrated}`)
  console.log(`Unmatched:            ${unmatched}`)
  if (ARCHIVE_BUCKET && RAGSTACK_DATA_BUCKET) {
    console.log(`PDFs copied:          ${copied}`)
    console.log(`PDFs already present: ${alreadyInBucket}`)
    if (sourceMissing) console.log(`Source PDFs missing:  ${sourceMissing}`)
    if (copyErrors) console.log(`Copy errors:          ${copyErrors}`)
  }

  return { matched, alreadyMigrated, unmatched, copied }
}

async function scanMedia() {
  console.log('\n=== Step 2: Scan Archive Bucket Media ===\n')

  if (!ARCHIVE_BUCKET) {
    console.log('Skipping — ARCHIVE_BUCKET not set')
    return
  }

  let ragDocs, ragImages

  if (USE_TRACKING_TABLE) {
    ragDocs = await listDocsViaTrackingTable()
    ragImages = [] // tracking table doesn't distinguish images; they're in the same table
    // Images in tracking table have image-like filenames
    const allDocs = ragDocs
    ragImages = allDocs.filter(d => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(d.filename))
    ragDocs = allDocs.filter(d => !/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(d.filename))
  } else {
    ;[ragImages, ragDocs] = await Promise.all([
      listImagesViaGraphQL(),
      listDocsViaGraphQL(),
    ])
  }

  const archiveMedia = await Promise.all([
    listArchiveObjects('media/pictures/'),
    listArchiveObjects('media/videos/'),
    listArchiveObjects('media/documents/'),
  ]).then(results => results.flat())

  console.log(`Found ${archiveMedia.length} objects in archive bucket media/`)
  console.log(`Found ${ragImages.length} images in RAGStack`)
  console.log(`Found ${ragDocs.length} documents in RAGStack\n`)

  // Build sets of filenames already in RAGStack
  const ragFilenames = new Set()
  for (const img of ragImages) {
    ragFilenames.add(img.filename)
  }
  for (const doc of ragDocs) {
    ragFilenames.add(doc.filename)
  }

  const matched = []
  const unmatched = []

  for (const obj of archiveMedia) {
    const fullFilename = obj.Key.split('/').pop()
    const originalFilename = fullFilename.includes('_')
      ? fullFilename.substring(fullFilename.indexOf('_') + 1)
      : fullFilename

    const exactMatch = ragFilenames.has(fullFilename) || ragFilenames.has(originalFilename)
    const originalStem = originalFilename.replace(/\.[^.]+$/, '')
    const substringMatch = !exactMatch && [...ragFilenames].some(ragName => {
      const ragStem = ragName.replace(/\.[^.]+$/, '')
      return originalStem.includes(ragStem) || ragStem.includes(originalStem)
    })

    if (exactMatch || substringMatch) {
      matched.push({ key: obj.Key, matchType: exactMatch ? 'exact' : 'substring' })
    } else {
      unmatched.push(obj.Key)
    }
  }

  console.log(`Matched in RAGStack: ${matched.length}`)
  if (matched.length > 0) {
    for (const m of matched) {
      console.log(`  ✓ ${m.key} (${m.matchType})`)
    }
  }
  console.log(`NOT in RAGStack:     ${unmatched.length}`)

  if (unmatched.length > 0) {
    console.log('\nUnmatched files (need upload to RAGStack):')
    for (const key of unmatched) {
      console.log(`  ${key}`)
    }
  }

  return { matched: matched.length, unmatched: unmatched.length }
}

// --- Entry point ---

async function main() {
  console.log('=== Family Archive - Document AI → RAGStack Migration ===')
  console.log(`HTT Table:       ${TABLE_NAME} (${HTT_REGION})`)
  console.log(`Archive Bucket:  ${ARCHIVE_BUCKET || '(not set)'}`)
  console.log(`RAGStack Bucket: ${RAGSTACK_DATA_BUCKET || '(not set)'} (${RAGSTACK_REGION})`)
  console.log(`RAGStack Source: ${USE_TRACKING_TABLE ? `tracking table (${RAGSTACK_TRACKING_TABLE})` : `GraphQL API`}`)
  console.log(`Dry run:         ${DRY_RUN}`)

  if (!ARCHIVE_BUCKET || !RAGSTACK_DATA_BUCKET) {
    console.error('\nError: ARCHIVE_BUCKET and RAGSTACK_DATA_BUCKET are required.')
    process.exit(1)
  }

  if (!USE_TRACKING_TABLE && (!RAGSTACK_GRAPHQL_URL || !RAGSTACK_API_KEY)) {
    console.error('\nError: RAGSTACK_GRAPHQL_URL and RAGSTACK_API_KEY are required.')
    console.error('Or use --use-tracking-table with RAGSTACK_TRACKING_TABLE set.')
    process.exit(1)
  }

  await migrateLetters()

  if (SCAN_MEDIA) {
    await scanMedia()
  }

  console.log('\n=== Migration Complete ===')
  if (DRY_RUN) {
    console.log('This was a dry run. Re-run without --dry-run to apply changes.')
  }
}

main().catch(error => {
  console.error('\nMigration failed:', error)
  process.exit(1)
})
