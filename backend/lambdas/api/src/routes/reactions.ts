/**
 * Reactions route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { GetCommand, QueryCommand, DeleteCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '../lib/database'
import { keys, PREFIX } from '../lib/keys'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'

/**
 * Main reactions route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requesterId, requestOrigin } = context

  if (!requesterId) {
    return errorResponse(401, 'Unauthorized: Missing user context', requestOrigin)
  }

  const method = event.httpMethod
  const resource = event.resource
  const normalizedResource = resource.replace(/^\/v1/, '')

  if (method === 'POST' && normalizedResource === '/reactions/{commentId}') {
    return toggleReaction(event, requesterId, requestOrigin)
  }

  if (method === 'GET' && normalizedResource === '/reactions/{commentId}') {
    return getReactions(event, requestOrigin)
  }

  if (method === 'DELETE' && normalizedResource === '/reactions/{commentId}') {
    return toggleReaction(event, requesterId, requestOrigin)
  }

  return errorResponse(404, 'Route not found', requestOrigin)
}

async function toggleReaction(
  event: APIGatewayProxyEvent,
  userId: string,
  requestOrigin?: string
): Promise<APIGatewayProxyResult> {
  const rawCommentId = event.pathParameters?.commentId
  if (!rawCommentId) {
    return errorResponse(400, 'Missing commentId parameter', requestOrigin)
  }

  let commentId: string
  try {
    commentId = decodeURIComponent(rawCommentId)
  } catch {
    return errorResponse(400, 'Invalid commentId encoding', requestOrigin)
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }

  const { itemId: rawItemId, reactionType = 'like' } = body

  if (!rawItemId || typeof rawItemId !== 'string') {
    return errorResponse(400, 'Missing itemId in request body', requestOrigin)
  }

  let itemId: string
  try {
    itemId = decodeURIComponent(rawItemId)
  } catch {
    return errorResponse(400, 'Invalid itemId encoding', requestOrigin)
  }
  const itemIdVariants = [itemId, encodeURIComponent(itemId)]

  try {
    let foundComment: Record<string, unknown> | null = null
    let foundCommentKey: { PK: string; SK: string } | null = null

    // Find the comment first
    for (const tryItemId of itemIdVariants) {
      const tryKey = keys.comment(tryItemId, commentId)
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: tryKey,
      }))
      if (result.Item && result.Item.entityType === 'COMMENT') {
        foundComment = result.Item
        foundCommentKey = tryKey
        break
      }
    }

    if (!foundComment || !foundCommentKey) {
      return errorResponse(404, 'Comment not found', requestOrigin)
    }

    const actualItemId = (foundComment.itemId as string) || foundCommentKey.PK.replace(PREFIX.COMMENT, '')
    const reactionKey = keys.reaction(actualItemId, commentId, userId)

    // Check if reaction exists
    const existingReaction = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: reactionKey,
    }))

    if (existingReaction.Item) {
      // Remove reaction
      try {
        await docClient.send(new TransactWriteCommand({
          TransactItems: [
            {
              Delete: {
                TableName: TABLE_NAME,
                Key: reactionKey,
              },
            },
            {
              Update: {
                TableName: TABLE_NAME,
                Key: foundCommentKey,
                UpdateExpression: 'ADD reactionCount :decrement',
                ConditionExpression: 'attribute_exists(PK)',
                ExpressionAttributeValues: { ':decrement': -1 },
              },
            },
          ],
        }))
      } catch (error) {
        if ((error as Error).name === 'TransactionCanceledException') {
          await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: reactionKey,
          }))
        } else {
          throw error
        }
      }

      return successResponse({ liked: false, message: 'Reaction removed' }, 200, requestOrigin)
    } else {
      // Add reaction
      const now = new Date().toISOString()

      try {
        await docClient.send(new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE_NAME,
                Item: {
                  ...reactionKey,
                  entityType: 'REACTION',
                  commentId,
                  itemId: actualItemId,
                  userId,
                  reactionType,
                  createdAt: now,
                  GSI1PK: `${PREFIX.USER}${userId}`,
                  GSI1SK: `${PREFIX.REACTION}${now}`,
                },
              },
            },
            {
              Update: {
                TableName: TABLE_NAME,
                Key: foundCommentKey,
                UpdateExpression: 'ADD reactionCount :increment',
                ConditionExpression: 'attribute_exists(PK)',
                ExpressionAttributeValues: { ':increment': 1 },
              },
            },
          ],
        }))
      } catch (error) {
        if ((error as Error).name === 'TransactionCanceledException') {
          return errorResponse(404, 'Comment not found', requestOrigin)
        }
        throw error
      }

      return successResponse({ liked: true, message: 'Reaction added' }, 200, requestOrigin)
    }
  } catch (error) {
    log.error('toggle_reaction_error', { commentId, userId, error: (error as Error).message })
    return errorResponse(500, 'Failed to toggle reaction', requestOrigin)
  }
}

async function getReactions(event: APIGatewayProxyEvent, requestOrigin?: string): Promise<APIGatewayProxyResult> {
  const commentId = event.pathParameters?.commentId
  const itemId = event.queryStringParameters?.itemId

  if (!commentId) {
    return errorResponse(400, 'Missing commentId parameter', requestOrigin)
  }

  if (!itemId) {
    return errorResponse(400, 'Missing itemId query parameter', requestOrigin)
  }

  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `${PREFIX.COMMENT}${itemId}`,
        ':skPrefix': `${PREFIX.REACTION}${commentId}#`,
      },
    }))

    const reactions = (result.Items || [])
      .filter(item => item.entityType === 'REACTION')
      .map(r => ({
        userId: r.userId,
        reactionType: r.reactionType,
        createdAt: r.createdAt,
      }))

    return successResponse({
      commentId,
      itemId,
      count: reactions.length,
      reactions,
    }, 200, requestOrigin)
  } catch (error) {
    log.error('get_reactions_error', { commentId, itemId, error: (error as Error).message })
    return errorResponse(500, 'Failed to get reactions', requestOrigin)
  }
}
