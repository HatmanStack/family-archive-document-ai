import type {
  CommentHistoryResponse,
  ProfileApiResponse,
  UpdateProfileRequest,
} from '$lib/types/profile'
import { apiClient } from '$lib/auth/api-client'

export async function getProfile(userId: string): Promise<ProfileApiResponse> {
  try {
    const data = await apiClient.get(`/profile/${encodeURIComponent(userId)}`)

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error fetching profile:', error)

    const message = error instanceof Error ? error.message : 'Failed to fetch profile'

    // Handle specific error cases from error message
    if (message.includes('403')) {
      return { success: false, error: 'This profile is private' }
    }
    if (message.includes('404')) {
      return { success: false, error: 'Profile not found' }
    }

    return { success: false, error: message }
  }
}

export async function updateProfile(updates: UpdateProfileRequest): Promise<ProfileApiResponse> {
  try {
    const data = await apiClient.put(
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

    const data = await apiClient.get<Record<string, unknown>>(
      `/profile/${encodeURIComponent(userId)}/comments?${params}`,
    )

    return {
      success: true,
      data: data.comments || data.items || [],
      lastEvaluatedKey: data.lastEvaluatedKey as string | undefined,
    }
  }
  catch (error) {
    console.error('Error fetching comment history:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch comment history',
    }
  }
}

export async function getAllUsers(): Promise<ProfileApiResponse> {
  try {
    const data = await apiClient.get<Record<string, unknown>>('/users')

    return {
      success: true,
      data: data.users || data.items || data,
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
