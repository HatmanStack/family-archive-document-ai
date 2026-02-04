#!/usr/bin/env node
/**
 * Bulk upload pictures to Family Archive - Document AI
 * Follows the same logic as the frontend gallery upload
 *
 * Usage: node bulk-upload-pictures.cjs [--dry-run]
 */

const fs = require('fs')
const path = require('path')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

// Configuration (can be overridden with env vars)
const CAPTIONS_FILE = process.env.CAPTIONS_FILE || path.join(process.env.HOME, 'war/family/captions.json')
const PICTURES_DIR = process.env.PICTURES_DIR || path.join(process.env.HOME, 'war/family/Renamed_Enhanced_Pictures')
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET || 'hatstack-family-archive-bucket'
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'

// RAGStack config
const RAGSTACK_GRAPHQL_URL = process.env.PUBLIC_RAGSTACK_GRAPHQL_URL || ''
const RAGSTACK_API_KEY = process.env.PUBLIC_RAGSTACK_API_KEY || ''

const s3Client = new S3Client({ region: AWS_REGION })

// Parse args
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const START_FROM = args.find(a => a.startsWith('--start-from='))?.split('=')[1] || null

const CREATE_IMAGE_UPLOAD_URL = `mutation CreateImageUploadUrl($filename: String!, $autoProcess: Boolean, $userCaption: String) {
  createImageUploadUrl(filename: $filename, autoProcess: $autoProcess, userCaption: $userCaption) {
    uploadUrl
    imageId
    fields
  }
}`

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase()
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }
  return map[ext] || 'image/jpeg'
}

// Upload to S3 (same as media-service.ts uploadMedia)
async function uploadToS3(filePath, filename) {
  const fileContent = fs.readFileSync(filePath)
  const contentType = getContentType(filename)
  const timestamp = Date.now()
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
  const key = `media/pictures/${timestamp}-${safeFilename}`

  const command = new PutObjectCommand({
    Bucket: ARCHIVE_BUCKET,
    Key: key,
    Body: fileContent,
    ContentType: contentType,
  })

  await s3Client.send(command)
  return key
}

// Upload to RAGStack (same as ragstack-upload-service.ts uploadImageToRagstack)
async function uploadToRagstack(filePath, filename, caption) {
  if (!RAGSTACK_GRAPHQL_URL || !RAGSTACK_API_KEY) {
    return { success: false, error: 'RAGStack not configured' }
  }

  try {
    // Step 1: Get presigned URL from RAGStack GraphQL
    const graphqlResponse = await fetch(RAGSTACK_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': RAGSTACK_API_KEY,
      },
      body: JSON.stringify({
        query: CREATE_IMAGE_UPLOAD_URL,
        variables: {
          filename,
          autoProcess: true,
          userCaption: caption || '',
        },
      }),
    })

    if (!graphqlResponse.ok) {
      return { success: false, error: `GraphQL failed: ${graphqlResponse.status}` }
    }

    const graphqlResult = await graphqlResponse.json()
    if (graphqlResult.errors) {
      return { success: false, error: graphqlResult.errors[0]?.message || 'GraphQL error' }
    }

    const { uploadUrl, fields } = graphqlResult.data.createImageUploadUrl

    // Step 2: Parse fields and upload to S3 presigned URL
    let parsedFields = JSON.parse(fields)
    if (typeof parsedFields === 'string') {
      parsedFields = JSON.parse(parsedFields)
    }

    // Build multipart form data manually
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2)
    const fileContent = fs.readFileSync(filePath)
    const contentType = getContentType(filename)

    let body = ''

    // Add form fields
    for (const [key, value] of Object.entries(parsedFields)) {
      body += `--${boundary}\r\n`
      body += `Content-Disposition: form-data; name="${key}"\r\n\r\n`
      body += `${value}\r\n`
    }

    // Add file field
    body += `--${boundary}\r\n`
    body += `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`
    body += `Content-Type: ${contentType}\r\n\r\n`

    // Combine text parts with binary file content
    const textEncoder = new TextEncoder()
    const preamble = textEncoder.encode(body)
    const epilogue = textEncoder.encode(`\r\n--${boundary}--\r\n`)

    const fullBody = Buffer.concat([
      Buffer.from(preamble),
      fileContent,
      Buffer.from(epilogue)
    ])

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: fullBody,
    })

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      return { success: false, error: `S3 upload failed: ${uploadResponse.status} - ${errorText.substring(0, 100)}` }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('=== Bulk Picture Upload ===')
  console.log(`Bucket: ${ARCHIVE_BUCKET}`)
  console.log(`Region: ${AWS_REGION}`)
  console.log(`RAGStack: ${RAGSTACK_GRAPHQL_URL ? 'ENABLED' : 'DISABLED'}`)
  console.log(`Dry run: ${DRY_RUN}`)
  console.log('')

  // Load captions
  if (!fs.existsSync(CAPTIONS_FILE)) {
    console.error(`Captions file not found: ${CAPTIONS_FILE}`)
    process.exit(1)
  }

  const captions = JSON.parse(fs.readFileSync(CAPTIONS_FILE, 'utf8'))
  const captionCount = Object.keys(captions).length
  console.log(`Found ${captionCount} captions`)

  // Check pictures directory
  if (!fs.existsSync(PICTURES_DIR)) {
    console.error(`Pictures directory not found: ${PICTURES_DIR}`)
    process.exit(1)
  }

  const files = fs.readdirSync(PICTURES_DIR).filter(f =>
    /\.(jpg|jpeg|png|gif|webp)$/i.test(f)
  )
  console.log(`Found ${files.length} image files`)
  console.log('')

  let uploaded = 0
  let skipped = 0
  let errors = 0
  let ragstackFailed = 0
  let startFound = !START_FROM // If no start-from, start immediately

  // Pre-compute total files to process (with captions, after START_FROM)
  let countStarted = !START_FROM
  const totalToProcess = files.filter(f => {
    if (!countStarted) {
      if (f === START_FROM) countStarted = true
      else return false
    }
    return !!captions[f]
  }).length

  if (START_FROM) {
    console.log(`Resuming from: ${START_FROM}`)
    console.log('')
  }

  for (const filename of files) {
    // Skip until we find the start-from file
    if (!startFound) {
      if (filename === START_FROM) {
        startFound = true
      } else {
        continue
      }
    }

    const caption = captions[filename]

    if (!caption) {
      console.log(`SKIP: ${filename} (no caption)`)
      skipped++
      continue
    }

    const filePath = path.join(PICTURES_DIR, filename)

    if (DRY_RUN) {
      console.log(`DRY: ${filename} → "${caption.substring(0, 50)}..."`)
      uploaded++
      continue
    }

    try {
      process.stdout.write(`[${uploaded + 1}/${totalToProcess}] ${filename.substring(0, 35).padEnd(35)}`)

      // Upload to S3 (family archive)
      await uploadToS3(filePath, filename)

      // Upload to RAGStack (with caption for AI search)
      const ragResult = await uploadToRagstack(filePath, filename, caption)

      if (ragResult.success) {
        console.log(' ✓')
      } else {
        console.log(` ✓ (RAG: ${ragResult.error})`)
        ragstackFailed++
      }

      uploaded++

      // Longer delay between uploads to respect Bedrock rate limits
      await sleep(3000)

      // Pause every 5 uploads to avoid exceeding 10 concurrent ingestion requests
      if (uploaded % 5 === 0) {
        console.log(`\n--- Pausing 60s after ${uploaded} uploads (Bedrock rate limit) ---\n`)
        await sleep(60000)
      }
    } catch (error) {
      console.log(` ✗ ${error.message}`)
      errors++
    }
  }

  console.log('')
  console.log('=== Summary ===')
  console.log(`Uploaded to S3: ${uploaded}`)
  console.log(`RAGStack failed: ${ragstackFailed}`)
  console.log(`Skipped (no caption): ${skipped}`)
  console.log(`Errors: ${errors}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
