import type {
  ConversationApiResponse,
  CreateConversationRequest,
  MessageApiResponse,
  SendMessageRequest,
  UploadAttachmentResponse,
} from '$lib/types/message'
import { apiClient } from '$lib/auth/api-client'

export async function getConversations(
  limit: number = 50,
  lastKey?: string,
): Promise<ConversationApiResponse> {
  try {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (lastKey) {
      params.set('lastEvaluatedKey', lastKey)
    }

    const data = await apiClient.get<Record<string, unknown>>(
      `/messages/conversations?${params}`,
    )

    return {
      success: true,
      data: data.conversations || data.items || data,
      lastEvaluatedKey: data.lastEvaluatedKey as string | undefined,
    }
  }
  catch (error) {
    console.error('Error fetching conversations:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch conversations',
    }
  }
}

export async function getMessages(
  conversationId: string,
  limit: number = 50,
  lastKey?: string,
): Promise<MessageApiResponse> {
  try {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (lastKey) {
      params.set('lastEvaluatedKey', lastKey)
    }

    const data = await apiClient.get<Record<string, unknown>>(
      `/messages/${encodeURIComponent(conversationId)}?${params}`,
    )

    return {
      success: true,
      data: data.messages || data.items || data,
      lastEvaluatedKey: data.lastEvaluatedKey as string | undefined,
      creatorId: data.creatorId as string | undefined,
      conversationTitle: data.conversationTitle as string | undefined,
    }
  }
  catch (error) {
    console.error('Error fetching messages:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch messages',
    }
  }
}

export async function createConversation(
  participantIds: string[],
  messageText: string,
  conversationTitle?: string,
): Promise<ConversationApiResponse> {
  try {
    const body: CreateConversationRequest = {
      participantIds,
      messageText,
      conversationTitle,
    }

    const data = await apiClient.post(
      '/messages/conversations',
      body as unknown as Record<string, unknown>,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error creating conversation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create conversation',
    }
  }
}

export async function sendMessage(
  conversationId: string,
  messageText: string,
  attachments?: Array<{ s3Key: string, filename: string, contentType: string, size: number }>,
): Promise<MessageApiResponse> {
  try {
    const body: SendMessageRequest = {
      messageText,
      attachments,
    }

    const data = await apiClient.post(
      `/messages/${encodeURIComponent(conversationId)}`,
      body as unknown as Record<string, unknown>,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error sending message:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    }
  }
}

export async function markAsRead(conversationId: string): Promise<ConversationApiResponse> {
  try {
    const data = await apiClient.put(
      `/messages/${encodeURIComponent(conversationId)}/read`,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error marking conversation as read:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark as read',
    }
  }
}

export async function deleteMessage(
  conversationId: string,
  messageId: string,
): Promise<MessageApiResponse> {
  try {
    const data = await apiClient.delete(
      `/messages/${encodeURIComponent(conversationId)}/${encodeURIComponent(messageId)}`,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error deleting message:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete message',
    }
  }
}

export async function deleteConversation(
  conversationId: string,
): Promise<ConversationApiResponse> {
  try {
    const data = await apiClient.delete(
      `/messages/${encodeURIComponent(conversationId)}`,
    )

    return {
      success: true,
      data,
    }
  }
  catch (error) {
    console.error('Error deleting conversation:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete conversation',
    }
  }
}

export async function uploadAttachment(file: File): Promise<UploadAttachmentResponse> {
  try {
    // Step 1: Get presigned URL from backend
    const data = await apiClient.post<{ uploadUrl: string, s3Key: string }>(
      '/messages/attachments/upload-url',
      {
        filename: file.name,
        contentType: file.type,
        size: file.size,
      },
    )

    // Step 2: Upload file to S3 using presigned URL
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
        error: 'Failed to upload file to S3',
      }
    }

    return {
      success: true,
      data: {
        uploadUrl: data.uploadUrl,
        s3Key: data.s3Key,
      },
    }
  }
  catch (error) {
    console.error('Error uploading attachment:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload attachment',
    }
  }
}
