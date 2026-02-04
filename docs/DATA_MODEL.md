# Data Model

## DynamoDB Single-Table Design

**Table:** `{StackName}-Table` (configurable via `TABLE_NAME` parameter, defaults to stack name + "-Table")

### Key Patterns

| Entity | PK | SK | GSI1PK | GSI1SK |
|--------|----|----|--------|--------|
| User Profile | `USER#{userId}` | `PROFILE` | `USERS` | `USER#{userId}` |
| User Conversation | `USER#{userId}` | `CONV#{convId}` | - | - |
| Rate Limit | `USER#{userId}` | `RATE#{action}` | - | - |
| Comment | `COMMENT#{itemId}` | `{timestamp}#{commentId}` | `USER#{userId}` | `COMMENT#{timestamp}` |
| Reaction | `COMMENT#{itemId}` | `REACTION#{commentId}#{userId}` | `USER#{userId}` | `REACTION#{timestamp}` |
| Conversation Meta | `CONV#{convId}` | `META` | - | - |
| Message | `CONV#{convId}` | `MSG#{timestamp}#{msgId}` | - | - |
| Letter | `LETTER#{date}` | `CURRENT` | `LETTERS` | `{date}` |
| Letter Version | `LETTER#{date}` | `VERSION#{timestamp}` | - | - |
| Draft | `DRAFT#{draftId}` | `METADATA` | - | - |

### Prefixes

```javascript
{
  USER: 'USER#',
  COMMENT: 'COMMENT#',
  CONV: 'CONV#',
  MSG: 'MSG#',
  REACTION: 'REACTION#',
  RATE: 'RATE#',
  LETTER: 'LETTER#',
  VERSION: 'VERSION#',
  DRAFT: 'DRAFT#'
}
```

### Access Patterns

| Pattern | Query | Index |
|---------|-------|-------|
| Get user profile | PK = `USER#{userId}`, SK = `PROFILE` | Table |
| List user conversations | PK = `USER#{userId}`, SK begins_with `CONV#` | Table |
| List comments on item | PK = `COMMENT#{itemId}`, SK begins_with `{timestamp}` | Table |
| Get user's comments | GSI1PK = `USER#{userId}`, GSI1SK begins_with `COMMENT#` | GSI1 |
| Get user's reactions | GSI1PK = `USER#{userId}`, GSI1SK begins_with `REACTION#` | GSI1 |
| List all letters | GSI1PK = `LETTERS`, GSI1SK descending | GSI1 |
| Get letter versions | PK = `LETTER#{date}`, SK begins_with `VERSION#` | Table |
| Get conversation messages | PK = `CONV#{convId}`, SK begins_with `MSG#` | Table |
| List all users | GSI1PK = `USERS` | GSI1 |

---

## S3 Bucket Structure

**Bucket:** Configurable via `ARCHIVE_BUCKET`

| Prefix | Purpose | Access |
|--------|---------|--------|
| `letters/` | Letter PDFs and metadata | Public read via presigned URLs |
| `media/pictures/` | User-uploaded images | Presigned URLs |
| `media/videos/` | User-uploaded videos | Presigned URLs |
| `media/documents/` | User-uploaded PDFs | Presigned URLs |
| `profile-photos/` | User profile images | Presigned URLs |
| `temp/` | Temporary upload staging | Short TTL |
| `messages/` | Message attachments | Presigned URLs |

---

## Entity Schemas

### User Profile
```typescript
{
  PK: string           // USER#{userId}
  SK: 'PROFILE'
  GSI1PK: 'USERS'      // For listing all users
  GSI1SK: string       // USER#{userId}
  entityType: 'USER_PROFILE'
  userId: string
  email: string
  displayName: string
  bio?: string
  profilePhotoUrl?: string
  familyRelationship?: string
  generation?: string
  familyBranch?: string
  isProfilePrivate: boolean
  contactEmail?: string
  notifyOnMessage: boolean
  notifyOnComment: boolean
  theme?: string
  familyRelationships?: object
  mediaUploadCount: number
  joinedDate: string   // ISO8601
  lastActive: string   // ISO8601
  commentCount: number
  status: 'active' | 'inactive' | 'deleted'  // listUsers filters non-active
  groups: string[]
  createdAt: string    // ISO8601
  updatedAt: string    // ISO8601
}
```

### Comment
```typescript
{
  PK: string           // COMMENT#{itemId}
  SK: string           // {timestamp}#{commentId}
  GSI1PK: string       // USER#{userId}#COMMENT#{itemId}
  GSI1SK: string       // {timestamp}#{commentId}
  entityType: 'COMMENT'
  itemId: string
  commentId: string
  authorId: string     // User ID of comment author
  authorEmail?: string
  content: string      // Comment text content
  reactionCount: number
  isEdited?: boolean
  isDeleted?: boolean  // Soft delete flag
  deletedAt?: string   // ISO8601, when deleted
  previousContent?: string  // For edit history
  createdAt: string    // ISO8601
  updatedAt?: string   // ISO8601
}
```

### Reaction
```typescript
{
  PK: string           // REACTION#{commentId}
  SK: string           // {userId}
  GSI1PK: string       // USER#{userId}
  GSI1SK: string       // REACTION#{timestamp}
  entityType: 'REACTION'
  itemId: string
  commentId: string
  userId: string
  reactionType: string // 'like' or other types
  createdAt: string    // ISO8601
}
```

### Conversation Meta
```typescript
{
  PK: string           // CONV#{convId}
  SK: 'META'
  conversationId: string
  conversationType: string
  conversationTitle?: string
  creatorId: string
  participantIds: string[]
  createdAt: string
  lastMessageAt: string
}
```

### Conversation Member
```typescript
{
  PK: string           // USER#{userId}
  SK: string           // CONV#{convId}
  conversationId: string
  conversationType: string
  conversationTitle?: string
  lastReadAt?: string
  unreadCount: number
  lastMessageAt: string
}
```

### Message
```typescript
{
  PK: string           // CONV#{convId}
  SK: string           // MSG#{timestamp}#{msgId}
  entityType: 'MESSAGE'
  messageId: string
  conversationId: string
  conversationType: string  // 'direct' | 'group'
  senderId: string
  senderName: string
  senderPhotoUrl?: string
  messageText: string
  participants: string[]    // Array of user IDs
  attachments?: {
    s3Key: string
    fileName: string
    contentType: string
  }[]
  createdAt: string    // ISO8601
}
```

### Letter
```typescript
{
  PK: string           // LETTER#{date}
  SK: 'METADATA'
  GSI1PK: 'LETTERS'
  GSI1SK: string       // date (YYYY-MM-DD)
  entityType: 'LETTER'
  date: string         // YYYY-MM-DD
  title: string
  author?: string
  content: string      // markdown
  description?: string
  pdfKey?: string      // S3 key for PDF (legacy)
  ragstackDocumentId?: string  // RAGStack document ID
  tags?: string[]      // Array of tags
  versionCount: number
  createdAt: string    // ISO8601
  updatedAt: string    // ISO8601
  lastEditedBy: string // User ID of last editor
}
```

### Letter Version
```typescript
{
  PK: string           // LETTER#{date}
  SK: string           // VERSION#{timestamp}
  date: string
  title: string
  author?: string
  content: string
  description?: string
  timestamp: string
  updatedBy: string
}
```

### Draft
```typescript
{
  PK: string           // DRAFT#{draftId}
  SK: 'METADATA'
  GSI1PK: 'DRAFTS'     // For listing all drafts
  GSI1SK: string       // {timestamp}
  entityType: 'DRAFT'
  draftId: string
  status: 'PENDING' | 'PROCESSING' | 'REVIEW' | 'ERROR' | 'PUBLISHED'
  requesterId: string  // User ID who created the draft
  s3Key?: string       // S3 key for uploaded files
  parsedData?: {
    date?: string      // Extracted date
    author?: string    // Extracted author
    recipient?: string // Extracted recipient
    location?: string  // Extracted location
    transcription?: string  // Full text transcription
    summary?: string   // AI-generated summary
  }
  error?: string       // Error message if status is ERROR
  createdAt: string    // ISO8601
  updatedAt: string    // ISO8601
}
```

### Rate Limit
```typescript
{
  PK: string           // USER#{userId}
  SK: string           // RATE#{action}
  count: number
  windowStart: number  // epoch ms
  TTL: number          // epoch seconds for DynamoDB TTL
}
```
