import { apiClient } from '$lib/auth/api-client'

export interface ParsedData {
  date?: string
  title?: string
  author?: string
  content?: string
  tags?: string[]
  summary?: string
}

export interface Draft {
  PK: string
  SK: string
  entityType: 'DRAFT_LETTER'
  status: 'PROCESSING' | 'REVIEW' | 'ERROR'
  s3Key: string
  parsedData?: ParsedData
  createdAt: string
  requesterId?: string
  error?: string
}

export interface DraftListResponse {
  drafts: Draft[]
}

export interface PublishData {
  date: string
  title: string
  content: string
  author?: string
  tags?: string[]
  description?: string
  ragstackDocumentId?: string
}

export interface PublishResponse {
  message: string
  path: string
}

export function extractDraftId(pk: string): string {
  return pk.replace('DRAFT#', '')
}

export async function listDrafts(_authToken: string): Promise<Draft[]> {
  const data = await apiClient.get<DraftListResponse>('/admin/drafts')
  return data.drafts
}

export async function getDraft(draftId: string, _authToken: string): Promise<Draft> {
  return apiClient.get<Draft>(`/admin/drafts/${encodeURIComponent(draftId)}`)
}

export async function deleteDraft(draftId: string, _authToken: string): Promise<void> {
  await apiClient.delete(`/admin/drafts/${encodeURIComponent(draftId)}`)
}

export async function publishDraft(draftId: string, finalData: PublishData, _authToken: string): Promise<PublishResponse> {
  return apiClient.post<PublishResponse>(
    `/admin/drafts/${encodeURIComponent(draftId)}/publish`,
    { finalData } as unknown as Record<string, unknown>,
  )
}

export async function getDraftPdfUrl(s3Key: string, _authToken: string): Promise<string> {
  const data = await apiClient.get<{ downloadUrl: string }>(
    `/download/presigned-url?key=${encodeURIComponent(s3Key)}`,
  )
  return data.downloadUrl
}

export function formatDraftStatus(status: Draft['status']): { label: string, color: string } {
  switch (status) {
    case 'PROCESSING':
      return { label: 'Processing', color: 'warning' }
    case 'REVIEW':
      return { label: 'Ready for Review', color: 'success' }
    case 'ERROR':
      return { label: 'Error', color: 'error' }
    default:
      return { label: status, color: 'neutral' }
  }
}
