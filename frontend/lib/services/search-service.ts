import { PUBLIC_RAGSTACK_API_KEY, PUBLIC_RAGSTACK_GRAPHQL_URL } from '$env/static/public'

export interface SearchResult {
  content: string
  source: string
  score: number
  filename: string
  category: 'pictures' | 'videos' | 'documents'
  // Extracted from source URI for creating MediaItem directly
  id: string
  s3Key: string
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  total: number
  error?: string
}

const SEARCH_QUERY = `query SearchKnowledgeBase($query: String!, $maxResults: Int) {
  searchKnowledgeBase(query: $query, maxResults: $maxResults) {
    results { content, source, score }
  }
}`

function extractFilename(source: string): string {
  // Handle s3:// URLs, regular URLs, or paths
  // s3://bucket/path/to/file.jpg → file.jpg
  // https://example.com/path/file.jpg → file.jpg
  // /path/to/file.jpg → file.jpg
  const parts = source.split('/')
  return parts.at(-1) || source
}

/**
 * Parse S3 URI to extract the key and document/image ID
 * Format: s3://bucket/content/{id}/{filename} or s3://bucket/input/{id}/{filename}
 */
function parseS3Uri(source: string): { id: string, s3Key: string } {
  // Remove s3://bucket/ prefix
  const match = source.match(/^s3:\/\/[^/]+\/(.+)$/)
  const s3Key = match ? match[1] : source

  // Extract ID from path like content/{id}/filename or input/{id}/filename
  const pathMatch = s3Key.match(/^(?:content|input)\/([^/]+)\//)
  const id = pathMatch ? pathMatch[1] : s3Key

  return { id, s3Key }
}

function categorizeResult(source: string): 'pictures' | 'videos' | 'documents' {
  const lowerSource = source.toLowerCase()

  if (/\.(?:jpg|jpeg|png|gif|webp|bmp|svg|heic|heif)(?:\?|$)/i.test(lowerSource)
    || lowerSource.includes('/pictures/')
    || lowerSource.includes('/images/')) {
    return 'pictures'
  }

  if (/\.(?:mp4|mov|avi|mkv|webm|m4v|wmv)(?:\?|$)/i.test(lowerSource)
    || lowerSource.includes('/videos/')) {
    return 'videos'
  }

  return 'documents'
}

export async function searchKnowledgeBase(
  query: string,
  maxResults: number = 20,
): Promise<SearchResponse> {
  if (!PUBLIC_RAGSTACK_GRAPHQL_URL) {
    throw new Error('RAGStack GraphQL URL not configured')
  }

  if (!query.trim()) {
    return { query: '', results: [], total: 0 }
  }

  const response = await fetch(PUBLIC_RAGSTACK_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': PUBLIC_RAGSTACK_API_KEY || '',
    },
    body: JSON.stringify({
      query: SEARCH_QUERY,
      variables: { query, maxResults },
    }),
  })

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`)
  }

  const json = await response.json()

  if (json.errors) {
    throw new Error(json.errors[0]?.message || 'GraphQL error')
  }

  const data = json.data?.searchKnowledgeBase
  const results = data?.results || []

  const categorizedResults = results.map((result: { content: string, source: string, score: number }) => {
    const { id, s3Key } = parseS3Uri(result.source)
    return {
      ...result,
      filename: extractFilename(result.source),
      category: categorizeResult(result.source),
      id,
      s3Key,
    }
  })

  return {
    query,
    results: categorizedResults,
    total: categorizedResults.length,
  }
}

export function filterResultsByCategory(
  results: SearchResult[],
  category: 'pictures' | 'videos' | 'documents',
): SearchResult[] {
  return results.filter(result => result.category === category)
}
