/**
 * Comment repository - encapsulates all comment-related database operations
 */
import { v4 as uuidv4 } from 'uuid'
import { BaseRepository } from './base-repository'
import { keys, PREFIX } from '../lib/keys'
import type { Comment, PaginatedResult } from '../types'

interface CreateCommentInput {
  itemId: string
  content: string
  authorId: string
  authorEmail?: string
}

interface ListCommentsOptions {
  limit?: number
  lastEvaluatedKey?: string | null
}

class CommentRepository extends BaseRepository {
  /**
   * List comments for an item
   */
  async listByItemId(
    itemId: string,
    options: ListCommentsOptions = {}
  ): Promise<PaginatedResult<Comment>> {
    // Try multiple storage formats for backwards compatibility
    const itemIdVariants = [itemId, encodeURIComponent(itemId)]

    for (const tryItemId of itemIdVariants) {
      const result = await this.query<Comment>({
        keyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        filterExpression:
          'entityType = :entityType AND (attribute_not_exists(isDeleted) OR isDeleted = :false)',
        expressionAttributeValues: {
          ':pk': `${PREFIX.COMMENT}${tryItemId}`,
          ':skPrefix': '20', // Year prefix for timestamp-based sort keys
          ':entityType': 'COMMENT',
          ':false': false,
        },
        limit: options.limit || 50,
        lastEvaluatedKey: options.lastEvaluatedKey,
        scanIndexForward: true,
      })

      if (result.items.length > 0) {
        return result
      }
    }

    return { items: [], lastEvaluatedKey: null, count: 0 }
  }

  /**
   * Get a single comment by ID
   */
  async getById(itemId: string, commentId: string): Promise<Comment | null> {
    const key = keys.comment(itemId, commentId)
    return this.getItem<Comment>(key)
  }

  /**
   * Create a new comment
   */
  async create(input: CreateCommentInput): Promise<Comment> {
    const { itemId, content, authorId, authorEmail } = input
    const timestamp = new Date().toISOString()
    const commentId = `${timestamp}#${uuidv4()}`

    const comment: Comment = {
      PK: `${PREFIX.COMMENT}${itemId}`,
      SK: commentId,
      commentId,
      itemId,
      content,
      authorId,
      authorEmail,
      createdAt: timestamp,
      entityType: 'COMMENT',
    }

    await this.putItem(comment)
    return comment
  }

  /**
   * Update a comment's content
   */
  async updateContent(
    itemId: string,
    commentId: string,
    newContent: string,
    previousContent?: string
  ): Promise<Comment> {
    const key = keys.comment(itemId, commentId)
    const timestamp = new Date().toISOString()

    const updateExpression = previousContent
      ? 'SET content = :content, updatedAt = :updatedAt, isEdited = :true, previousContent = :previousContent'
      : 'SET content = :content, updatedAt = :updatedAt, isEdited = :true'

    const expressionAttributeValues: Record<string, unknown> = {
      ':content': newContent,
      ':updatedAt': timestamp,
      ':true': true,
    }

    if (previousContent) {
      expressionAttributeValues[':previousContent'] = previousContent
    }

    return this.updateItem<Comment>(key, updateExpression, expressionAttributeValues)
  }

  /**
   * Soft delete a comment
   */
  async softDelete(itemId: string, commentId: string): Promise<Comment> {
    const key = keys.comment(itemId, commentId)
    const timestamp = new Date().toISOString()

    return this.updateItem<Comment>(
      key,
      'SET isDeleted = :true, deletedAt = :deletedAt',
      { ':true': true, ':deletedAt': timestamp }
    )
  }

  /**
   * Hard delete a comment (admin only)
   */
  async hardDelete(itemId: string, commentId: string): Promise<void> {
    const key = keys.comment(itemId, commentId)
    await this.deleteItem(key)
  }

  /**
   * Get comments by user ID (via GSI)
   */
  async listByUserId(
    userId: string,
    options: ListCommentsOptions = {}
  ): Promise<PaginatedResult<Comment>> {
    return this.query<Comment>({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk AND begins_with(GSI1SK, :prefix)',
      expressionAttributeValues: {
        ':gsi1pk': `${PREFIX.USER}${userId}`,
        ':prefix': `${PREFIX.COMMENT}`,
      },
      limit: options.limit || 50,
      lastEvaluatedKey: options.lastEvaluatedKey,
      scanIndexForward: false, // Most recent first
    })
  }
}

// Singleton instance
export const commentRepository = new CommentRepository()
