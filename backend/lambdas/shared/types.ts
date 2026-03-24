/**
 * Shared types for cross-Lambda use
 */

/** DynamoDB Stream new-image attribute shapes (unmarshalled) */
export interface StreamMessageImage {
  conversationId: { S: string }
  senderId: { S: string }
  senderName?: { S: string }
  messageText?: { S: string }
  participants?: { SS: string[] }
  entityType: { S: string }
}

export interface StreamCommentImage {
  itemId?: { S: string }
  itemType?: { S: string }
  userId?: { S: string }
  userName?: { S: string }
  commentText?: { S: string }
  itemTitle?: { S: string }
  previousCommenters?: { L: Array<{ S: string }> }
  entityType: { S: string }
}

export interface StreamReactionImage {
  userId?: { S: string }
  entityType: { S: string }
}

/** Entity type constants */
export const ENTITY_TYPES = {
  MESSAGE: 'MESSAGE',
  COMMENT: 'COMMENT',
  REACTION: 'REACTION',
  USER_PROFILE: 'USER_PROFILE',
  CONVERSATION_MEMBER: 'CONVERSATION_MEMBER',
  CONVERSATION_META: 'CONVERSATION_META',
} as const

/** DynamoDB key prefixes (subset needed by background processors) */
export const SHARED_PREFIX = {
  USER: 'USER#',
} as const
