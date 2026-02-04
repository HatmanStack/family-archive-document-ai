import { PUBLIC_RAGSTACK_API_KEY, PUBLIC_RAGSTACK_GRAPHQL_URL } from '$env/static/public'
import { authStore } from '$lib/auth/auth-store'
import { getApiBaseUrl } from '$lib/utils/api-url'
import { get } from 'svelte/store'

export interface MediaItem {
  id: string
  filename: string
  title: string
  description?: string
  uploadDate: string
  fileSize: number
  contentType: string
  thumbnailUrl?: string
  signedUrl?: string
  category: 'pictures' | 'videos' | 'documents'
}

export interface MediaPage {
  items: MediaItem[]
  hasMore: boolean
}

interface RagImage {
  imageId: string
  filename: string
  s3Uri: string
  thumbnailUrl?: string
  caption?: string
  contentType?: string
  fileSize?: number
  createdAt: string
}

interface RagDocument {
  documentId: string
  filename: string
  type: string
  mediaType?: string
  inputS3Uri: string
  previewUrl?: string
  status: string
  createdAt: string
}

// Unified cache structure
interface MediaCache {
  pictures: { items: MediaItem[], nextToken: string | null } | null
  documents: RagDocument[] | null
}

const cache: MediaCache = {
  pictures: null,
  documents: null,
}

const API_URL = getApiBaseUrl()
const PAGE_SIZE = 50

async function ragstackQuery(query: string, variables: Record<string, unknown> = {}): Promise<unknown> {
  if (!PUBLIC_RAGSTACK_GRAPHQL_URL || !PUBLIC_RAGSTACK_API_KEY) {
    throw new Error('RAGStack not configured')
  }

  const response = await fetch(PUBLIC_RAGSTACK_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': PUBLIC_RAGSTACK_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`RAGStack request failed: ${response.status}`)
  }

  const json = await response.json()
  if (json.errors) {
    throw new Error(json.errors[0]?.message || 'GraphQL error')
  }
  return json.data
}

/**
 * Extract S3 key from an s3:// URI
 */
function s3UriToKey(s3Uri: string): string {
  const match = s3Uri.match(/^s3:\/\/[^/]+\/(.+)$/)
  return match ? match[1] : s3Uri
}

/**
 * Get a presigned download URL for a RAGStack S3 key via the backend proxy
 */
async function getPresignedUrl(s3Key: string): Promise<string> {
  const auth = get(authStore)
  if (!auth.isAuthenticated || !auth.tokens) {
    throw new Error('User is not authenticated')
  }

  const response = await fetch(
    `${API_URL}/download/presigned-url?key=${encodeURIComponent(s3Key)}&bucket=ragstack`,
    {
      headers: { Authorization: `Bearer ${auth.tokens.idToken}` },
    },
  )

  if (!response.ok) {
    throw new Error('Failed to get download URL')
  }

  const data = await response.json()
  return data.downloadUrl
}

/**
 * Determine content type from filename extension
 */
function inferContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    txt: 'text/plain',
    md: 'text/markdown',
  }
  return map[ext] || 'application/octet-stream'
}

function imageToMediaItem(img: RagImage): MediaItem {
  return {
    id: img.imageId,
    filename: img.filename,
    title: img.filename,
    description: img.caption || undefined,
    uploadDate: img.createdAt,
    fileSize: img.fileSize || 0,
    contentType: img.contentType || inferContentType(img.filename),
    thumbnailUrl: img.thumbnailUrl || undefined,
    signedUrl: img.thumbnailUrl || undefined,
    category: 'pictures',
  }
}

function documentToMediaItem(doc: RagDocument, category: 'videos' | 'documents'): MediaItem {
  return {
    id: doc.documentId,
    filename: doc.filename,
    title: doc.filename,
    uploadDate: doc.createdAt,
    fileSize: 0,
    contentType: inferContentType(doc.filename),
    signedUrl: '',
    category,
  }
}

function sortByDate(items: MediaItem[]): MediaItem[] {
  return items.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime())
}

/**
 * Check if two arrays of media items have different IDs (new items added)
 */
function hasNewItems(oldItems: MediaItem[], newItems: MediaItem[]): boolean {
  if (newItems.length !== oldItems.length) return true
  const oldIds = new Set(oldItems.map(i => i.id))
  return newItems.some(i => !oldIds.has(i.id))
}

/**
 * Fetch images from RAGStack
 */
async function fetchImages(nextToken: string | null = null): Promise<{ items: RagImage[], nextToken: string | null }> {
  const data = await ragstackQuery(`query ListImages($limit: Int, $nextToken: String) {
    listImages(limit: $limit, nextToken: $nextToken) {
      items { imageId filename s3Uri thumbnailUrl caption contentType fileSize createdAt }
      nextToken
    }
  }`, {
    limit: PAGE_SIZE,
    nextToken,
  }) as { listImages: { items: RagImage[], nextToken: string | null } }

  return {
    items: data.listImages.items || [],
    nextToken: data.listImages.nextToken,
  }
}

/**
 * Fetch documents from RAGStack (filters to INDEXED status, excludes letter files)
 */
async function fetchDocuments(): Promise<RagDocument[]> {
  const data = await ragstackQuery(`query {
    listDocuments {
      items { documentId filename type mediaType inputS3Uri previewUrl status createdAt }
    }
  }`) as { listDocuments: { items: RagDocument[] } }

  const allItems = data.listDocuments.items || []
  return allItems.filter(d =>
    d.status === 'INDEXED'
    && !/^\d{4}-\d{2}-\d{2}(?:[_\-.].+)?\.(?:md|pdf)$/.test(d.filename),
  )
}

/**
 * Build MediaPage for videos from document list
 */
function buildVideosPage(docs: RagDocument[]): MediaPage {
  const videos = docs.filter(d =>
    (d.type === 'media' && d.mediaType === 'video')
    || /\.(?:mp4|webm|mov|avi|mkv)$/i.test(d.filename),
  )
  return {
    items: sortByDate(videos.map(d => documentToMediaItem(d, 'videos'))),
    hasMore: false,
  }
}

/**
 * Build MediaPage for documents from document list
 */
function buildDocumentsPage(docs: RagDocument[]): MediaPage {
  const documents = docs.filter(d =>
    d.type === 'document'
    && !d.mediaType
    && !/\.(?:mp4|webm|mov|avi|mkv)$/i.test(d.filename),
  )
  return {
    items: sortByDate(documents.map(d => documentToMediaItem(d, 'documents'))),
    hasMore: false,
  }
}

export interface GetMediaOptions {
  loadMore?: boolean
  /** Callback when fresh data differs from cached - enables stale-while-revalidate */
  onFreshData?: (page: MediaPage) => void
}

/**
 * Get media items with stale-while-revalidate caching.
 * Returns cached data immediately, then fetches fresh data in background.
 * If fresh data has new items, calls onFreshData callback for smooth UI update.
 */
export async function getMediaItems(
  category: 'pictures' | 'videos' | 'documents',
  loadMore = false,
  options: GetMediaOptions = {},
): Promise<MediaPage> {
  const { onFreshData } = options

  if (category === 'pictures') {
    // For loadMore, always fetch next page
    if (loadMore && cache.pictures) {
      const { items: freshImages, nextToken } = await fetchImages(cache.pictures.nextToken)
      const newItems = freshImages.map(imageToMediaItem)
      cache.pictures = {
        items: [...cache.pictures.items, ...newItems],
        nextToken,
      }
      return {
        items: sortByDate(cache.pictures.items),
        hasMore: !!nextToken,
      }
    }

    // Return cached immediately, refresh in background
    if (cache.pictures && onFreshData) {
      const cachedResult: MediaPage = {
        items: sortByDate(cache.pictures.items),
        hasMore: !!cache.pictures.nextToken,
      }

      // Background refresh
      fetchImages().then(({ items: freshImages, nextToken }) => {
        const freshItems = freshImages.map(imageToMediaItem)
        if (hasNewItems(cache.pictures?.items || [], freshItems)) {
          cache.pictures = { items: freshItems, nextToken }
          onFreshData({
            items: sortByDate(freshItems),
            hasMore: !!nextToken,
          })
        }
      }).catch(err => console.error('Background refresh failed:', err))

      return cachedResult
    }

    // No cache - fetch fresh
    const { items: freshImages, nextToken } = await fetchImages()
    const items = freshImages.map(imageToMediaItem)
    cache.pictures = { items, nextToken }
    return {
      items: sortByDate(items),
      hasMore: !!nextToken,
    }
  }

  // Videos and documents both use document cache
  if (cache.documents && onFreshData) {
    const cachedResult = category === 'videos'
      ? buildVideosPage(cache.documents)
      : buildDocumentsPage(cache.documents)

    // Background refresh
    fetchDocuments().then(freshDocs => {
      const freshPage = category === 'videos'
        ? buildVideosPage(freshDocs)
        : buildDocumentsPage(freshDocs)

      const cachedPage = category === 'videos'
        ? buildVideosPage(cache.documents || [])
        : buildDocumentsPage(cache.documents || [])

      if (hasNewItems(cachedPage.items, freshPage.items)) {
        cache.documents = freshDocs
        onFreshData(freshPage)
      }
    }).catch(err => console.error('Background refresh failed:', err))

    return cachedResult
  }

  // No cache - fetch fresh
  const freshDocs = await fetchDocuments()
  cache.documents = freshDocs

  return category === 'videos'
    ? buildVideosPage(freshDocs)
    : buildDocumentsPage(freshDocs)
}

/**
 * Invalidate all media caches (call after uploads)
 */
export function invalidateMediaCache() {
  cache.pictures = null
  cache.documents = null
}

/**
 * Reset pagination state (for pictures)
 */
export function resetPagination() {
  if (cache.pictures) {
    cache.pictures = null
  }
}

/**
 * Resolve the signedUrl for a media item that needs a backend-proxied presigned URL.
 */
export async function resolveSignedUrl(item: MediaItem): Promise<string> {
  if (item.signedUrl)
    return item.signedUrl

  const docs = cache.documents || await fetchDocuments()
  const doc = docs.find(d => d.documentId === item.id)
  if (!doc)
    throw new Error(`Document ${item.id} not found`)

  const key = s3UriToKey(doc.inputS3Uri)
  return getPresignedUrl(key)
}

/**
 * Get image info from RAGStack by ID (for search result thumbnails)
 */
export async function getImageById(imageId: string): Promise<RagImage | null> {
  try {
    const data = await ragstackQuery(`query GetImage($imageId: ID!) {
      getImage(imageId: $imageId) {
        imageId filename s3Uri thumbnailUrl caption contentType fileSize createdAt
      }
    }`, { imageId }) as { getImage: RagImage | null }
    return data.getImage
  }
  catch {
    return null
  }
}

/**
 * Get presigned URL for an S3 key via backend proxy
 */
export async function getPresignedUrlForKey(s3Key: string): Promise<string> {
  return getPresignedUrl(s3Key)
}

/**
 * Create a MediaItem from search result data (for direct search display)
 */
export function createMediaItemFromSearch(
  id: string,
  filename: string,
  s3Key: string,
  category: 'pictures' | 'videos' | 'documents',
  description?: string,
): MediaItem {
  return {
    id,
    filename,
    title: filename,
    description,
    uploadDate: new Date().toISOString(),
    fileSize: 0,
    contentType: inferContentType(filename),
    signedUrl: undefined,
    category,
  }
}
