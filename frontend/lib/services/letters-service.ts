import { apiClient } from '$lib/auth/api-client'

export interface Letter {
  date: string
  title: string
  description?: string
  author?: string
  tags?: string[]
  content: string
  pdfKey?: string
  ragstackDocumentId?: string
  createdAt: string
  updatedAt: string
  lastEditedBy?: string
  versionCount: number
}

export interface LetterListItem {
  date: string
  title: string
  description?: string
  author?: string
  updatedAt: string
}

export interface LetterVersion {
  timestamp: string
  versionNumber: number
  editedBy: string
  editedAt: string
}

export interface LettersListResponse {
  items: LetterListItem[]
  nextCursor: string | null
}

export interface VersionsResponse {
  versions: LetterVersion[]
}

export interface PdfUrlResponse {
  downloadUrl: string
  filename: string
}

export async function listLetters(
  _authToken: string,
  limit = 50,
  cursor?: string,
): Promise<LettersListResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor)
    params.set('cursor', cursor)

  return apiClient.get<LettersListResponse>(`/letters?${params}`)
}

export async function getLetter(date: string, _authToken: string): Promise<Letter> {
  return apiClient.get<Letter>(`/letters/${encodeURIComponent(date)}`)
}

export interface UpdateLetterData {
  content: string
  title?: string
  author?: string
  description?: string
  date?: string
}

export async function updateLetter(
  date: string,
  data: UpdateLetterData,
  _authToken: string,
): Promise<Letter> {
  return apiClient.put<Letter>(
    `/letters/${encodeURIComponent(date)}`,
    data as unknown as Record<string, unknown>,
  )
}

export async function getVersions(date: string, _authToken: string): Promise<LetterVersion[]> {
  const data = await apiClient.get<VersionsResponse>(
    `/letters/${encodeURIComponent(date)}/versions`,
  )
  return data.versions
}

export async function revertToVersion(
  date: string,
  versionTimestamp: string,
  _authToken: string,
): Promise<void> {
  await apiClient.post(
    `/letters/${encodeURIComponent(date)}/revert`,
    { versionTimestamp },
  )
}

export async function getPdfUrl(date: string, _authToken: string): Promise<string> {
  const data = await apiClient.get<PdfUrlResponse>(
    `/letters/${encodeURIComponent(date)}/pdf`,
  )
  return data.downloadUrl
}

export interface AdjacentLetters {
  prev: LetterListItem | null
  next: LetterListItem | null
}

export async function getAdjacentLetters(
  currentDate: string,
  authToken: string,
): Promise<AdjacentLetters> {
  // Fetch all letters to find adjacent ones
  const { items } = await listLetters(authToken, 100)

  const currentIndex = items.findIndex(item => item.date === currentDate)

  if (currentIndex === -1) {
    return { prev: null, next: null }
  }

  // Letters are sorted newest first
  // prev = older = higher index
  // next = newer = lower index
  return {
    prev: currentIndex < items.length - 1 ? items[currentIndex + 1] : null,
    next: currentIndex > 0 ? items[currentIndex - 1] : null,
  }
}
