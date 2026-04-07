/**
 * Core type definitions for Family Archive - Document AI API
 */

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
  profilePhotoUrl?: string
  profilePhotoKey?: string
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

// ============================================================================
// API Types
// ============================================================================

export interface PaginatedResult<T> {
  items: T[]
  lastEvaluatedKey: string | null
  count: number
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
