/**
 * Letter Processor Lambda
 *
 * Processes uploaded letter files by:
 * 1. Downloading files from S3 temp location
 * 2. Merging PDFs and images into a single PDF
 * 3. Parsing the letter with Gemini AI
 * 4. Saving the draft to DynamoDB
 */
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { Readable } from 'stream'
import { mergeFiles } from './pdf-utils'
import { parseLetter } from './gemini'
import type { ProcessorEvent, ProcessorResult, FileInput } from './types'

const s3 = new S3Client({})
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

const TABLE_NAME = process.env.TABLE_NAME
const ARCHIVE_BUCKET = process.env.ARCHIVE_BUCKET

// Resource limits to prevent OOM and excessive processing time
const MAX_FILES = 20 // Maximum number of files per upload
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB per file
const MAX_TOTAL_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB total

/**
 * Convert a readable stream to a Buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks)))
  })
}

/**
 * Determine MIME type from file key/extension
 */
function getMimeType(key: string): string {
  const lowerKey = key.toLowerCase()
  if (lowerKey.endsWith('.pdf')) return 'application/pdf'
  if (lowerKey.endsWith('.jpg') || lowerKey.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerKey.endsWith('.png')) return 'image/png'
  return 'application/octet-stream'
}

/**
 * Main Lambda handler
 */
// Supported MIME types for letter processing
const SUPPORTED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export async function handler(event: ProcessorEvent): Promise<ProcessorResult> {
  // Fail fast: validate required environment variables
  if (!TABLE_NAME) {
    throw new Error('Missing required environment variable: TABLE_NAME')
  }
  if (!ARCHIVE_BUCKET) {
    throw new Error('Missing required environment variable: ARCHIVE_BUCKET')
  }

  const { uploadId, requesterId } = event

  if (!uploadId) throw new Error('Missing uploadId')

  try {
    // 1. List files in temp location
    const prefix = `temp/${uploadId}/`
    const listRes = await s3.send(
      new ListObjectsV2Command({
        Bucket: ARCHIVE_BUCKET,
        Prefix: prefix,
      })
    )

    if (!listRes.Contents || listRes.Contents.length === 0) {
      throw new Error(`No files found at ${prefix}`)
    }

    // Filter out combined.pdf and sort by numeric filename
    const objects = listRes.Contents.filter(
      obj => obj.Key && !obj.Key.endsWith('combined.pdf')
    ).sort((a, b) => {
      const idxA = parseInt(a.Key!.split('/').pop()!.split('.')[0], 10)
      const idxB = parseInt(b.Key!.split('/').pop()!.split('.')[0], 10)
      if (Number.isNaN(idxA) && Number.isNaN(idxB)) return 0
      if (Number.isNaN(idxA)) return 1
      if (Number.isNaN(idxB)) return -1
      return idxA - idxB
    })

    // Validate file count limit
    if (objects.length > MAX_FILES) {
      throw new Error(
        `Too many files: ${objects.length} exceeds limit of ${MAX_FILES}. ` +
          'Please reduce the number of files and try again.'
      )
    }

    // 2. Download files with size tracking
    const files: FileInput[] = []
    let totalSize = 0

    for (const obj of objects) {
      const res = await s3.send(
        new GetObjectCommand({ Bucket: ARCHIVE_BUCKET, Key: obj.Key })
      )

      if (!res.Body) {
        throw new Error(`Empty body for object: ${ARCHIVE_BUCKET}/${obj.Key}`)
      }

      const buffer = await streamToBuffer(res.Body as Readable)

      // Validate individual file size
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2)
        const limitMB = (MAX_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)
        throw new Error(
          `File ${obj.Key} is too large: ${sizeMB} MB exceeds ${limitMB} MB limit. ` +
            'Please reduce the file size and try again.'
        )
      }

      // Track cumulative size
      totalSize += buffer.length
      if (totalSize > MAX_TOTAL_SIZE_BYTES) {
        const totalMB = (totalSize / (1024 * 1024)).toFixed(2)
        const limitMB = (MAX_TOTAL_SIZE_BYTES / (1024 * 1024)).toFixed(0)
        throw new Error(
          `Total upload size ${totalMB} MB exceeds ${limitMB} MB limit. ` +
            'Please reduce the total file size and try again.'
        )
      }

      const type = getMimeType(obj.Key!)

      // Reject unsupported file types early rather than silently dropping
      if (!SUPPORTED_MIME_TYPES.includes(type)) {
        throw new Error(
          `Unsupported file type for ${obj.Key}: ${type}. ` +
            `Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`
        )
      }

      files.push({ buffer, type })
    }

    // 3. Merge into single PDF
    const combinedPdf = await mergeFiles(files)

    // 4. Upload combined PDF
    const combinedKey = `temp/${uploadId}/combined.pdf`
    await s3.send(
      new PutObjectCommand({
        Bucket: ARCHIVE_BUCKET,
        Key: combinedKey,
        Body: combinedPdf,
        ContentType: 'application/pdf',
      })
    )

    // 5. Parse with Gemini AI
    const parsedData = await parseLetter(Buffer.from(combinedPdf))

    // 6. Save draft to DynamoDB
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `DRAFT#${uploadId}`,
          SK: 'METADATA',
          GSI1PK: 'DRAFTS',
          GSI1SK: `DRAFT#${uploadId}`,
          entityType: 'DRAFT_LETTER',
          status: 'REVIEW',
          createdAt: new Date().toISOString(),
          requesterId,
          s3Key: combinedKey,
          parsedData,
        },
      })
    )

    return { status: 'success', uploadId }
  } catch (error) {
    console.error('Processing failed:', error)

    // Try to save error status to DynamoDB, but don't mask the original error
    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: `DRAFT#${uploadId}`,
            SK: 'METADATA',
            GSI1PK: 'DRAFTS',
            GSI1SK: `DRAFT#${uploadId}`,
            entityType: 'DRAFT_LETTER',
            status: 'ERROR',
            error: (error as Error).message,
            createdAt: new Date().toISOString(),
            requesterId,
          },
        })
      )
    } catch (ddbError) {
      // Log DynamoDB failure but don't mask the original processing error
      console.error('Failed to record error status in DynamoDB:', ddbError)
    }

    // Always rethrow the original error
    throw error
  }
}
