import type {
  Comment,
  CommentApiResponse,
  CreateCommentRequest,
  UpdateCommentRequest,
} from '$lib/types/comment'
import { apiClient } from '$lib/auth/api-client'

function encodeItemId(itemId: string): string {
  // Decode first in case it's already URL-encoded, then base64
  let decoded: string
  try {
    decoded = decodeURIComponent(itemId)
  }
  catch {
    decoded = itemId // Use as-is if not URL-encoded
  }
  return btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function getComments(
  itemId: string,
  limit: number = 50,
  lastKey?: string,
): Promise<CommentApiResponse> {
  try {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (lastKey) {
      params.set('lastEvaluatedKey', lastKey)
    }

    const data = await apiClient.get<Record<string, unknown>>(
      `/comments/${encodeItemId(itemId)}?${params}`,
    )

    const comments = Array.isArray(data.comments) ? data.comments : (Array.isArray(data.items) ? data.items : [])
    return {
      success: true,
      data: comments,
      lastEvaluatedKey: data.lastEvaluatedKey as string | undefined,
    }
  }
  catch (error) {
    console.error('Error fetching comments:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch comments',
    }
  }
}

export async function createComment(
  itemId: string,
  text: string,
  itemType: 'letter' | 'media',
  itemTitle: string,
): Promise<CommentApiResponse> {
  try {
    const body: CreateCommentRequest = {
      content: text,
      itemType,
      itemTitle,
    }

    const data = await apiClient.post<Comment>(
      `/comments/${encodeItemId(itemId)}`,
      body as unknown as Record<string, unknown>,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error creating comment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create comment',
    }
  }
}

export async function updateComment(
  itemId: string,
  commentId: string,
  text: string,
): Promise<CommentApiResponse> {
  try {
    const body: UpdateCommentRequest = {
      content: text,
    }

    const data = await apiClient.put<Comment>(
      `/comments/${encodeItemId(itemId)}/${encodeURIComponent(commentId)}`,
      body as unknown as Record<string, unknown>,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error updating comment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update comment',
    }
  }
}

export async function deleteComment(
  itemId: string,
  commentId: string,
): Promise<CommentApiResponse> {
  try {
    const data = await apiClient.delete<Comment>(
      `/comments/${encodeItemId(itemId)}/${encodeURIComponent(commentId)}`,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error deleting comment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete comment',
    }
  }
}

export async function adminDeleteComment(commentId: string): Promise<CommentApiResponse> {
  try {
    const encodedCommentId = encodeURIComponent(commentId)
    const data = await apiClient.delete<Comment>(`/admin/comments/${encodedCommentId}`)

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error deleting comment (admin):', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete comment',
    }
  }
}
