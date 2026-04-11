import type {
  CommentHistoryItem,
  CommentHistoryResponse,
  ProfileApiResponse,
  UpdateProfileRequest,
  UserProfile,
} from '$lib/types/profile'
import { apiClient, ApiError } from '$lib/auth/api-client'

interface CommentHistoryApiResponse {
  comments?: CommentHistoryItem[]
  items?: CommentHistoryItem[]
  lastEvaluatedKey?: string
}

interface UsersApiResponse {
  users?: UserProfile[]
  items?: UserProfile[]
}

export async function getProfile(userId: string): Promise<ProfileApiResponse> {
  console.warn('[profile-service] getProfile called with userId:', userId)
  try {
    const data = await apiClient.get<UserProfile>(`/profile/${encodeURIComponent(userId)}`)
    console.warn('[profile-service] getProfile response:', {
      userId: data?.userId,
      displayName: data?.displayName,
      email: data?.email,
      hasRelationships: Array.isArray(data?.familyRelationships),
      relationshipsLength: data?.familyRelationships?.length,
      commentCount: data?.commentCount,
      keys: data ? Object.keys(data) : 'null',
    })

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('[profile-service] getProfile error:', error)

    if (error instanceof ApiError) {
      console.error('[profile-service] ApiError status:', error.status, 'message:', error.message)
      if (error.status === 403) {
        return { success: false, error: 'This profile is private' }
      }
      if (error.status === 404) {
        return { success: false, error: 'Profile not found' }
      }
    }

    const message = error instanceof Error ? error.message : 'Failed to fetch profile'
    return { success: false, error: message }
  }
}

export async function updateProfile(updates: UpdateProfileRequest): Promise<ProfileApiResponse> {
  try {
    const data = await apiClient.put<UserProfile>(
      '/profile',
      updates as unknown as Record<string, unknown>,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error updating profile:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update profile',
    }
  }
}

export async function getCommentHistory(
  userId: string,
  limit: number = 50,
  lastKey?: string,
): Promise<CommentHistoryResponse> {
  try {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (lastKey) {
      params.set('lastEvaluatedKey', lastKey)
    }

    const data = await apiClient.get<CommentHistoryApiResponse>(
      `/profile/${encodeURIComponent(userId)}/comments?${params}`,
    )
    console.warn('[profile-service] getCommentHistory response:', {
      hasComments: !!data?.comments,
      hasItems: !!data?.items,
      commentsLength: data?.comments?.length,
      itemsLength: data?.items?.length,
      lastEvaluatedKey: data?.lastEvaluatedKey,
      rawKeys: data ? Object.keys(data) : 'null',
    })

    return {
      success: true,
      data: data.comments ?? data.items ?? [],
      lastEvaluatedKey: data.lastEvaluatedKey,
    }
  }
  catch (error) {
    console.error('[profile-service] getCommentHistory error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch comment history',
    }
  }
}

export async function getAllUsers(): Promise<ProfileApiResponse> {
  try {
    const data = await apiClient.get<UsersApiResponse>('/users')

    return {
      success: true,
      data: data.users ?? data.items ?? [],
    }
  }
  catch (error) {
    console.error('Error fetching users:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch users',
    }
  }
}

export async function uploadProfilePhoto(file: File): Promise<{ success: boolean, url?: string, error?: string }> {
  try {
    // Validate file
    const validTypes = ['image/jpeg', 'image/png', 'image/gif']
    const maxSize = 5 * 1024 * 1024 // 5MB

    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Invalid file type. Please use JPG, PNG, or GIF.',
      }
    }

    if (file.size > maxSize) {
      return {
        success: false,
        error: 'File too large. Maximum size is 5MB.',
      }
    }

    // Get presigned URL from backend
    const data = await apiClient.post<{ uploadUrl: string, photoUrl: string }>(
      '/profile/photo/upload-url',
      {
        filename: file.name,
        contentType: file.type,
      },
    )

    // Upload file to S3 using presigned URL
    const uploadResponse = await fetch(data.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type,
      },
      body: file,
    })

    if (!uploadResponse.ok) {
      return {
        success: false,
        error: 'Failed to upload photo to S3',
      }
    }

    return {
      success: true,
      url: data.photoUrl,
    }
  }
  catch (error) {
    console.error('Error uploading profile photo:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload photo',
    }
  }
}
