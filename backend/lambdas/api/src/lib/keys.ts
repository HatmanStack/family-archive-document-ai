/**
 * DynamoDB key builders for single-table design
 */
import { PREFIX, type DynamoDBKey, type DynamoDBKeyWithPrefix } from '../types'

export const keys = {
  // User profile: PK=USER#<userId>, SK=PROFILE
  userProfile: (userId: string): DynamoDBKey => ({
    PK: `${PREFIX.USER}${userId}`,
    SK: 'PROFILE',
  }),

  // User profile GSI1 keys (for listing all users)
  userProfileGSI1: (userId: string): { GSI1PK: string; GSI1SK: string } => ({
    GSI1PK: 'USERS',
    GSI1SK: `${PREFIX.USER}${userId}`,
  }),

  // User's conversation membership: PK=USER#<userId>, SK=CONV#<convId>
  userConversation: (userId: string, convId: string): DynamoDBKey => ({
    PK: `${PREFIX.USER}${userId}`,
    SK: `${PREFIX.CONV}${convId}`,
  }),

  // Rate limit: PK=USER#<userId>, SK=RATE#<action>
  rateLimit: (userId: string, action: string): DynamoDBKey => ({
    PK: `${PREFIX.USER}${userId}`,
    SK: `${PREFIX.RATE}${action}`,
  }),

  // Comment: PK=COMMENT#<itemId>, SK=<timestamp>#<commentId>
  comment: (itemId: string, commentId: string): DynamoDBKey => ({
    PK: `${PREFIX.COMMENT}${itemId}`,
    SK: commentId, // Already includes timestamp
  }),

  // Comments on item (for queries): PK=COMMENT#<itemId>
  commentsOnItem: (itemId: string): { PK: string } => ({
    PK: `${PREFIX.COMMENT}${itemId}`,
  }),

  // Reaction: PK=COMMENT#<itemId>, SK=REACTION#<commentId>#<userId>
  reaction: (itemId: string, commentId: string, userId: string): DynamoDBKey => ({
    PK: `${PREFIX.COMMENT}${itemId}`,
    SK: `${PREFIX.REACTION}${commentId}#${userId}`,
  }),

  // Reactions on comment (for queries): prefix REACTION#<commentId>
  reactionsOnComment: (itemId: string, commentId: string): DynamoDBKeyWithPrefix => ({
    PK: `${PREFIX.COMMENT}${itemId}`,
    SK: '',
    SKPrefix: `${PREFIX.REACTION}${commentId}#`,
  }),

  // Conversation metadata: PK=CONV#<convId>, SK=META
  conversationMeta: (convId: string): DynamoDBKey => ({
    PK: `${PREFIX.CONV}${convId}`,
    SK: 'META',
  }),

  // Message: PK=CONV#<convId>, SK=MSG#<timestamp>#<msgId>
  message: (convId: string, msgId: string): DynamoDBKey => ({
    PK: `${PREFIX.CONV}${convId}`,
    SK: `${PREFIX.MSG}${msgId}`,
  }),

  // Messages in conversation (for queries): PK=CONV#<convId>, SK begins with MSG#
  messagesInConversation: (convId: string): DynamoDBKeyWithPrefix => ({
    PK: `${PREFIX.CONV}${convId}`,
    SK: '',
    SKPrefix: PREFIX.MSG,
  }),

  // Letter: PK=LETTER#<date>, SK=CURRENT
  letter: (date: string): DynamoDBKey => ({
    PK: `${PREFIX.LETTER}${date}`,
    SK: 'CURRENT',
  }),

  // Letter versions: PK=LETTER#<date>, SK=VERSION#<timestamp>
  letterVersion: (date: string, timestamp: string): DynamoDBKey => ({
    PK: `${PREFIX.LETTER}${date}`,
    SK: `${PREFIX.VERSION}${timestamp}`,
  }),

  // Query all versions: PK=LETTER#<date>, SK begins_with VERSION#
  letterVersions: (date: string): DynamoDBKeyWithPrefix => ({
    PK: `${PREFIX.LETTER}${date}`,
    SK: '',
    SKPrefix: PREFIX.VERSION,
  }),

  // Draft: PK=DRAFT#<draftId>, SK=METADATA
  draft: (draftId: string): DynamoDBKey => ({
    PK: `${PREFIX.DRAFT}${draftId}`,
    SK: 'METADATA',
  }),

  // Draft GSI1 keys (for listing all drafts)
  draftGSI1: (draftId: string): { GSI1PK: string; GSI1SK: string } => ({
    GSI1PK: 'DRAFTS',
    GSI1SK: `${PREFIX.DRAFT}${draftId}`,
  }),
}

// Re-export PREFIX for convenience
export { PREFIX }
