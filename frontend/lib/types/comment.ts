// Comment and Reaction type definitions for the commenting system

export interface Comment {
  itemId: string
  commentId: string
  authorId: string
  authorEmail?: string
  content: string
  createdAt: string
  updatedAt?: string
  isEdited?: boolean
  reactionCount?: number
  userHasReacted?: boolean
}

export interface Reaction {
  commentId: string
  userId: string
  reactionType: 'like'
  createdAt: string
}

// ============================================================================
// Discriminated Union Response Types
// ============================================================================

/**
 * Response when fetching a list of comments
 */
export interface CommentListResponse {
  success: true
  data: Comment[]
  lastEvaluatedKey?: string
  error?: undefined // Explicit for TypeScript narrowing
}

/**
 * Response when creating or updating a single comment
 */
export interface CommentSingleResponse {
  success: true
  data: Comment
  lastEvaluatedKey?: undefined
  error?: undefined
}

/**
 * Response when an error occurs
 */
export interface CommentErrorResponse {
  success: false
  error: string
  data?: undefined
  lastEvaluatedKey?: undefined
}

/**
 * Union type for all comment API responses.
 * Use type guards (isCommentList, isCommentSingle) to narrow the type.
 */
export type CommentApiResponse
  = | CommentListResponse
  | CommentSingleResponse
  | CommentErrorResponse

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if response contains a comment list
 */
export function isCommentList(
  response: CommentApiResponse,
): response is CommentListResponse {
  return response.success && Array.isArray((response as CommentListResponse).data)
}

/**
 * Type guard to check if response contains a single comment
 */
export function isCommentSingle(
  response: CommentApiResponse,
): response is CommentSingleResponse {
  return response.success && !Array.isArray((response as CommentSingleResponse).data)
}

/**
 * Type guard to check if response is an error
 */
export function isCommentError(
  response: CommentApiResponse,
): response is CommentErrorResponse {
  return !response.success
}

// ============================================================================
// Reaction Response Types
// ============================================================================

export interface ReactionListResponse {
  success: true
  data: Reaction[]
}

export interface ReactionSingleResponse {
  success: true
  data: Reaction
}

export interface ReactionErrorResponse {
  success: false
  error: string
}

export type ReactionApiResponse
  = | ReactionListResponse
  | ReactionSingleResponse
  | ReactionErrorResponse

// ============================================================================
// Request Types
// ============================================================================

export interface CreateCommentRequest {
  content: string
  itemType: 'letter' | 'media'
  itemTitle: string
}

export interface UpdateCommentRequest {
  content: string
}
