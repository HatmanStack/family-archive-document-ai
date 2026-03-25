/**
 * Base repository with common DynamoDB operations
 */
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  type PutCommandInput,
  type UpdateCommandInput,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb'
import { docClient, TABLE_NAME } from '../lib/database'
import { validatePaginationKey } from '../lib/validation'
import { ValidationError } from '../lib/errors'
import type { DynamoDBKey, PaginatedResult } from '../types'

export interface QueryOptions {
  limit?: number
  lastEvaluatedKey?: string | null
  scanIndexForward?: boolean
  indexName?: string
}

export interface QueryParams {
  keyConditionExpression: string
  expressionAttributeValues: Record<string, unknown>
  expressionAttributeNames?: Record<string, string>
  filterExpression?: string
  limit?: number
  lastEvaluatedKey?: string | null
  scanIndexForward?: boolean
  indexName?: string
}

export interface PutOptions {
  conditionExpression?: string
  expressionAttributeValues?: Record<string, unknown>
}

export interface UpdateOptions {
  returnValues?: 'ALL_NEW' | 'ALL_OLD' | 'UPDATED_NEW' | 'UPDATED_OLD' | 'NONE'
  conditionExpression?: string
  expressionAttributeNames?: Record<string, string>
}

export class BaseRepository {
  protected tableName: string
  protected docClient: typeof docClient

  constructor(tableName: string = TABLE_NAME) {
    this.tableName = tableName
    this.docClient = docClient
  }

  /**
   * Get a single item by primary key
   */
  async getItem<T>(key: DynamoDBKey): Promise<T | null> {
    const result = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
      })
    )
    return (result.Item as T) || null
  }

  /**
   * Put an item (create or replace)
   */
  async putItem<T extends Record<string, unknown>>(
    item: T,
    options: PutOptions = {}
  ): Promise<void> {
    const params: PutCommandInput = {
      TableName: this.tableName,
      Item: item,
    }

    if (options.conditionExpression) {
      params.ConditionExpression = options.conditionExpression
      params.ExpressionAttributeValues = options.expressionAttributeValues
    }

    await this.docClient.send(new PutCommand(params))
  }

  /**
   * Update an item with an update expression
   */
  async updateItem<T>(
    key: DynamoDBKey,
    updateExpression: string,
    expressionAttributeValues: Record<string, unknown>,
    options: UpdateOptions = {}
  ): Promise<T> {
    const params: UpdateCommandInput = {
      TableName: this.tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: options.returnValues || 'ALL_NEW',
    }

    if (options.conditionExpression) {
      params.ConditionExpression = options.conditionExpression
    }

    if (options.expressionAttributeNames) {
      params.ExpressionAttributeNames = options.expressionAttributeNames
    }

    const result = await this.docClient.send(new UpdateCommand(params))
    return result.Attributes as T
  }

  /**
   * Delete an item
   */
  async deleteItem(key: DynamoDBKey): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: key,
      })
    )
  }

  /**
   * Query items by partition key
   */
  async queryByPK<T>(
    pkValue: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<T>> {
    return this.query<T>({
      keyConditionExpression: 'PK = :pk',
      expressionAttributeValues: { ':pk': pkValue },
      ...options,
    })
  }

  /**
   * Query items with sort key prefix
   */
  async queryByPKAndSKPrefix<T>(
    pkValue: string,
    skPrefix: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<T>> {
    return this.query<T>({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      expressionAttributeValues: { ':pk': pkValue, ':skPrefix': skPrefix },
      ...options,
    })
  }

  /**
   * Execute a query with full options
   */
  async query<T>(params: QueryParams): Promise<PaginatedResult<T>> {
    const {
      keyConditionExpression,
      expressionAttributeValues,
      expressionAttributeNames,
      filterExpression,
      limit = 50,
      lastEvaluatedKey,
      scanIndexForward = true,
      indexName,
    } = params

    const queryParams: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: keyConditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit,
      ScanIndexForward: scanIndexForward,
    }

    if (indexName) {
      queryParams.IndexName = indexName
    }

    if (expressionAttributeNames) {
      queryParams.ExpressionAttributeNames = expressionAttributeNames
    }

    if (filterExpression) {
      queryParams.FilterExpression = filterExpression
    }

    if (lastEvaluatedKey) {
      const paginationResult = validatePaginationKey(lastEvaluatedKey)
      if (!paginationResult.valid) {
        throw new ValidationError(paginationResult.error || 'Invalid pagination key')
      }
      if (paginationResult.key) {
        // Reject cursors whose partition key does not match the current query.
        // Handles both primary table (PK) and GSI (GSI1PK) queries by checking
        // whichever key attribute the cursor and query share.
        const pkAttr = indexName ? 'GSI1PK' : 'PK'
        const expectedPK = expressionAttributeValues[':pk'] as string | undefined
          ?? expressionAttributeValues[':gsi1pk'] as string | undefined
        const cursorPK = paginationResult.key[pkAttr] as string | undefined
        if (expectedPK && cursorPK && cursorPK !== expectedPK) {
          throw new ValidationError('Invalid pagination key: partition key mismatch')
        }
        queryParams.ExclusiveStartKey = paginationResult.key
      }
    }

    const result = await this.docClient.send(new QueryCommand(queryParams))

    return {
      items: (result.Items as T[]) || [],
      lastEvaluatedKey: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null,
      count: result.Count || 0,
    }
  }

  /**
   * Batch get multiple items
   */
  async batchGetItems<T>(keys: DynamoDBKey[]): Promise<T[]> {
    if (keys.length === 0) return []

    // DynamoDB batch limit is 100 items
    const chunks: DynamoDBKey[][] = []
    for (let i = 0; i < keys.length; i += 100) {
      chunks.push(keys.slice(i, i + 100))
    }

    const results: T[] = []
    for (const chunk of chunks) {
      const result = await this.docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [this.tableName]: {
              Keys: chunk,
            },
          },
        })
      )

      if (result.Responses?.[this.tableName]) {
        results.push(...(result.Responses[this.tableName] as T[]))
      }
    }

    return results
  }
}
