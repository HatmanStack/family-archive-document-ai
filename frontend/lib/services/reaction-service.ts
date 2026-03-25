import type { Reaction, ReactionApiResponse } from '$lib/types/comment'
import { apiClient } from '$lib/auth/api-client'

interface ReactionsApiResponse {
  items?: Reaction[]
  reactions?: Reaction[]
}

export async function getReactions(commentId: string): Promise<ReactionApiResponse> {
  try {
    const payload = await apiClient.get<ReactionsApiResponse | Reaction[]>(
      `/reactions/${encodeURIComponent(commentId)}`,
    )

    const reactions = Array.isArray(payload)
      ? payload
      : payload.items ?? payload.reactions ?? []

    return {
      success: true,
      data: reactions,
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
