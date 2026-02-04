/**
 * Core type definitions for Family Archive - Document AI API
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

// ============================================================================
// Request Context Types
// ============================================================================

export interface RequestContext {
  requesterId: string | undefined
  requesterEmail: string | undefined
  isAdmin: boolean
  isApprovedUser: boolean
  correlationId: string
  requestOrigin?: string
}

export interface AuthClaims {
  sub?: string
  email?: string
  'cognito:groups'?: string | string[]
  // Standard JWT claims
  iss?: string
  aud?: string
  exp?: number
  iat?: number
  auth_time?: number
  token_use?: string
  // Cognito-specific claims
  'cognito:username'?: string
  email_verified?: boolean
}

// ============================================================================
// Database Entity Types
// ============================================================================

export interface BaseEntity {
  PK: string
  SK: string
  entityType: string
  createdAt: string
  updatedAt?: string
}

export interface UserProfile extends BaseEntity {
  userId: string
  email?: string
  displayName?: string
  bio?: string
  photoUrl?: string
  photoKey?: string
  isPrivate?: boolean
  groups?: string
  GSI1PK?: string
  GSI1SK?: string
}

export interface Comment extends BaseEntity {
  commentId: string
  itemId: string
  content: string
  authorId: string
  authorEmail?: string
  isEdited?: boolean
  isDeleted?: boolean
  deletedAt?: string
  previousContent?: string
}

export interface Conversation extends BaseEntity {
  conversationId: string
  participants: string[]
  lastMessageAt?: string
  lastMessagePreview?: string
}

export interface Message extends BaseEntity {
  messageId: string
  conversationId: string
  senderId: string
  content: string
  attachmentKey?: string
  attachmentType?: string
  isDeleted?: boolean
  deletedAt?: string
}

export interface Reaction extends BaseEntity {
  itemId: string
  commentId: string
  userId: string
  emoji: string
}

export interface Letter extends BaseEntity {
  date: string
  title?: string
  content: string
  author?: string
  transcribedBy?: string
  s3Key?: string
  GSI1PK?: string
  GSI1SK?: string
}

export interface Draft extends BaseEntity {
  draftId: string
  status: 'PENDING' | 'PROCESSING' | 'REVIEW' | 'ERROR' | 'PUBLISHED'
  requesterId: string
  s3Key?: string
  parsedData?: ParsedLetterData
  error?: string
}

export interface ParsedLetterData {
  date?: string
  author?: string
  recipient?: string
  location?: string
  transcription?: string
  summary?: string
}

export interface RateLimitRecord extends BaseEntity {
  userId: string
  action: string
  count: number
  windowStart: string
  ttl: number
}

// ============================================================================
// API Types
// ============================================================================

export interface PaginatedResult<T> {
  items: T[]
  lastEvaluatedKey: string | null
  count: number
}

export interface ApiResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

// ============================================================================
// DynamoDB Key Types
// ============================================================================

export interface DynamoDBKey {
  PK: string
  SK: string
}

export interface DynamoDBKeyWithPrefix extends DynamoDBKey {
  SKPrefix?: string
}

// ============================================================================
// Route Handler Types
// ============================================================================

export type RouteHandler = (
  event: APIGatewayProxyEvent,
  context: RequestContext
) => Promise<APIGatewayProxyResult>

// ============================================================================
// Prefix Constants
// ============================================================================

export const PREFIX = {
  USER: 'USER#',
  COMMENT: 'COMMENT#',
  CONV: 'CONV#',
  MSG: 'MSG#',
  REACTION: 'REACTION#',
  RATE: 'RATE#',
  LETTER: 'LETTER#',
  VERSION: 'VERSION#',
  DRAFT: 'DRAFT#',
} as const

export type PrefixKey = keyof typeof PREFIX
export type PrefixValue = (typeof PREFIX)[PrefixKey]
