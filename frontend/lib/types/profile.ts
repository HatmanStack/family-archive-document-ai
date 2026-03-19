// Profile type definitions for the user profile system

export interface FamilyRelationship {
  id: string // UUID for stable identification
  type: string // Predefined type or "Other"
  customType?: string // Only used when type === "Other"
  name: string // Person's name as it appears in archive
  createdAt: string // ISO timestamp
}

export const RELATIONSHIP_TYPES = [
  // Immediate family
  'Mother',
  'Father',
  'Sibling',
  'Spouse/Partner',
  'Child',
  // Grandparents
  'Grandmother (maternal)',
  'Grandfather (maternal)',
  'Grandmother (paternal)',
  'Grandfather (paternal)',
  // Extended family
  'Aunt',
  'Uncle',
  'Cousin',
  'Niece',
  'Nephew',
  // Great-grandparents
  'Great-grandmother (maternal)',
  'Great-grandfather (maternal)',
  'Great-grandmother (paternal)',
  'Great-grandfather (paternal)',
  // Custom option
  'Other',
] as const

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number]

export interface UserProfile {
  userId: string
  email: string
  displayName: string
  profilePhotoUrl?: string
  bio?: string
  familyRelationship?: string
  generation?: string
  familyBranch?: string
  joinedDate: string
  isProfilePrivate: boolean
  commentCount: number
  mediaUploadCount: number
  lastActive: string
  createdAt?: string
  updatedAt?: string
  contactEmail?: string
  notifyOnMessage?: boolean
  notifyOnComment?: boolean
  theme?: string
  familyRelationships?: FamilyRelationship[]
}

// ============================================================================
// Discriminated Union Response Types
// ============================================================================

/**
 * Response when fetching a list of profiles
 */
export interface ProfileListResponse {
  success: true
  data: UserProfile[]
  lastEvaluatedKey?: string
  error?: undefined
}

/**
 * Response when fetching or updating a single profile
 */
export interface ProfileSingleResponse {
  success: true
  data: UserProfile
  lastEvaluatedKey?: undefined
  error?: undefined
}

/**
 * Response when an error occurs
 */
export interface ProfileErrorResponse {
  success: false
  error: string
  data?: undefined
  lastEvaluatedKey?: undefined
}

/**
 * Union type for all profile API responses.
 * Use type guards to narrow the type.
 */
export type ProfileApiResponse
  = | ProfileListResponse
  | ProfileSingleResponse
  | ProfileErrorResponse

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if response contains a profile list
 */
export function isProfileList(
  response: ProfileApiResponse,
): response is ProfileListResponse {
  return response.success && Array.isArray((response as ProfileListResponse).data)
}

/**
 * Type guard to check if response contains a single profile
 */
export function isProfileSingle(
  response: ProfileApiResponse,
): response is ProfileSingleResponse {
  return response.success && !Array.isArray((response as ProfileSingleResponse).data)
}

/**
 * Type guard to check if response is an error
 */
export function isProfileError(
  response: ProfileApiResponse,
): response is ProfileErrorResponse {
  return !response.success
}

export interface UpdateProfileRequest {
  displayName?: string
  bio?: string
  familyRelationship?: string
  generation?: string
  familyBranch?: string
  isProfilePrivate?: boolean
  profilePhotoUrl?: string
  contactEmail?: string
  notifyOnMessage?: boolean
  notifyOnComment?: boolean
  theme?: string
  familyRelationships?: FamilyRelationship[]
}

export interface CommentHistoryItem {
  itemId: string
  commentId: string
  content: string
  itemTitle: string
  itemType: 'letter' | 'media'
  createdAt: string
  reactionCount: number
}

// ============================================================================
// Comment History Response Types
// ============================================================================

export interface CommentHistorySuccessResponse {
  success: true
  data: CommentHistoryItem[]
  lastEvaluatedKey?: string
  error?: undefined
}

export interface CommentHistoryErrorResponse {
  success: false
  error: string
  data?: undefined
  lastEvaluatedKey?: undefined
}

export type CommentHistoryResponse
  = | CommentHistorySuccessResponse
  | CommentHistoryErrorResponse
