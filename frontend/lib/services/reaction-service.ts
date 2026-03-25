import type { Reaction, ReactionApiResponse } from '$lib/types/comment'
import { apiClient } from '$lib/auth/api-client'

export async function getReactions(commentId: string): Promise<ReactionApiResponse> {
  try {
    const data = await apiClient.get<Record<string, unknown>>(
      `/reactions/${encodeURIComponent(commentId)}`,
    )

    return {
      success: true,
      data: (data.items || data) as Reaction[],
    }
  }
  catch (error) {
    console.error('Error fetching reactions:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch reactions',
    }
  }
}

export async function toggleReaction(commentId: string, itemId: string): Promise<ReactionApiResponse> {
  try {
    const data = await apiClient.post<Reaction>(
      `/reactions/${encodeURIComponent(commentId)}`,
      { itemId, reactionType: 'like' },
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error toggling reaction:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle reaction',
    }
  }
}
