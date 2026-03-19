// Message and Conversation type definitions for the messaging system

export interface Message {
  conversationId: string
  messageId: string
  senderId: string
  senderName: string
  senderPhotoUrl?: string
  messageText: string
  attachments?: Attachment[]
  createdAt: string
  conversationType: 'direct' | 'group'
  participants: string[]
}

export interface Conversation {
  conversationId: string
  conversationType: 'direct' | 'group'
  participantIds: string[]
  participantNames: string[]
  lastMessageAt: string
  unreadCount: number
  conversationTitle?: string // For groups
  lastMessagePreview?: string // For display in conversation list
  creatorId?: string
}

export interface Attachment {
  s3Key: string
  filename: string
  contentType: string
  size: number
  url?: string // Presigned download URL
  thumbnailUrl?: string // For images
}

// ============================================================================
// Discriminated Union Response Types
// ============================================================================

/**
 * Response when fetching a list of messages
 */
export interface MessageListResponse {
  success: true
  data: Message[]
  lastEvaluatedKey?: string
  creatorId?: string
  conversationTitle?: string
  error?: undefined
}

/**
 * Response when sending a message (returns the sent message)
 */
export interface MessageSingleResponse {
  success: true
  data: Message
  lastEvaluatedKey?: undefined
  creatorId?: undefined
  conversationTitle?: undefined
  error?: undefined
}

/**
 * Response when an error occurs
 */
export interface MessageErrorResponse {
  success: false
  error: string
  data?: undefined
  lastEvaluatedKey?: undefined
  creatorId?: undefined
  conversationTitle?: undefined
}

/**
 * Union type for all message API responses
 */
export type MessageApiResponse
  = | MessageListResponse
  | MessageSingleResponse
  | MessageErrorResponse

/**
 * Response when fetching a list of conversations
 */
export interface ConversationListResponse {
  success: true
  data: Conversation[]
  lastEvaluatedKey?: string
  error?: undefined
}

/**
 * Response when creating a conversation
 */
export interface ConversationSingleResponse {
  success: true
  data: Conversation
  lastEvaluatedKey?: undefined
  error?: undefined
}

/**
 * Response when an error occurs
 */
export interface ConversationErrorResponse {
  success: false
  error: string
  data?: undefined
  lastEvaluatedKey?: undefined
}

/**
 * Union type for all conversation API responses
 */
export type ConversationApiResponse
  = | ConversationListResponse
  | ConversationSingleResponse
  | ConversationErrorResponse

// ============================================================================
// Type Guards
// ============================================================================

export function isMessageList(
  response: MessageApiResponse,
): response is MessageListResponse {
  return response.success && Array.isArray((response as MessageListResponse).data)
}

export function isMessageSingle(
  response: MessageApiResponse,
): response is MessageSingleResponse {
  return response.success && !Array.isArray((response as MessageSingleResponse).data)
}

export function isConversationList(
  response: ConversationApiResponse,
): response is ConversationListResponse {
  return response.success && Array.isArray((response as ConversationListResponse).data)
}

export function isConversationSingle(
  response: ConversationApiResponse,
): response is ConversationSingleResponse {
  return response.success && !Array.isArray((response as ConversationSingleResponse).data)
}

export interface CreateConversationRequest {
  participantIds: string[]
  messageText: string
  conversationTitle?: string // Optional for groups
}

export interface SendMessageRequest {
  messageText: string
  attachments?: Attachment[]
}

// ============================================================================
// Attachment Upload Response Types
// ============================================================================

export interface UploadAttachmentData {
  uploadUrl: string // Presigned URL for upload
  s3Key: string // S3 key for reference
}

export interface UploadAttachmentSuccessResponse {
  success: true
  data: UploadAttachmentData
  error?: undefined
}

export interface UploadAttachmentErrorResponse {
  success: false
  error: string
  data?: undefined
}

export type UploadAttachmentResponse
  = | UploadAttachmentSuccessResponse
  | UploadAttachmentErrorResponse
