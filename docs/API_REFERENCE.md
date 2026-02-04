# API Reference

## Authentication
All endpoints require Cognito JWT in `Authorization` header.
Groups: `Admins`, `ApprovedUsers`

---

## Comments

### GET /comments/{itemId}
List comments on an item.

**Signature:** `GET /comments/{itemId}?limit=20&lastEvaluatedKey=`
**Auth:** Any authenticated user
**Dependencies:** DynamoDB

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| itemId | string | Yes | Item identifier (base64url or plain) |
| limit | number | No | Max 100, default 50 |
| lastEvaluatedKey | string | No | Pagination cursor |

**Response:**
```json
{
  "items": [{
    "itemId": "string",
    "commentId": "string",
    "userId": "string",
    "userName": "string",
    "userPhotoUrl": "string",
    "content": "string",
    "createdAt": "ISO8601",
    "reactionCount": "number"
  }],
  "lastEvaluatedKey": "string|null"
}
```

---

### POST /comments/{itemId}
Create comment.

**Signature:** `POST /comments/{itemId}`
**Auth:** Any authenticated user
**Rate Limit:** 20/min

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| itemId | string | Yes | Path param (base64url or plain) |
| content | string | Yes | Body, 1-10000 chars |
| itemType | string | No | Content type identifier |
| itemTitle | string | No | Content title |

**Response:** 201
```json
{
  "itemId": "string",
  "commentId": "string",
  "userId": "string",
  "userName": "string",
  "userPhotoUrl": "string",
  "content": "string",
  "createdAt": "ISO8601",
  "reactionCount": 0
}
```

---

### PUT /comments/{itemId}/{commentId}
Edit own comment.

**Signature:** `PUT /comments/{itemId}/{commentId}`
**Auth:** Comment owner only

| Parameter | Type | Required |
|-----------|------|----------|
| content | string | Yes |

**Response:** 200 - Updated comment object

---

### DELETE /comments/{itemId}/{commentId}
Delete own comment.

**Signature:** `DELETE /comments/{itemId}/{commentId}`
**Auth:** Comment owner only
**Response:** 200 `{ "message": "Comment deleted" }`

---

### DELETE /admin/comments/{commentId}
Admin delete any comment.

**Signature:** `DELETE /admin/comments/{commentId}`
**Auth:** Admins only

| Parameter | Type | Required |
|-----------|------|----------|
| itemId | string | Yes (body) |

**Response:** 200 `{ "message": "Comment deleted" }`

---

## Reactions

### POST /reactions/{commentId}
Toggle reaction on comment.

**Signature:** `POST /reactions/{commentId}`
**Auth:** Any authenticated user
**Dependencies:** DynamoDB TransactWrite

| Parameter | Type | Required |
|-----------|------|----------|
| itemId | string | Yes (body) |
| reactionType | string | No (default: "like") |

**Response:**
```json
{
  "liked": true,
  "message": "Reaction added"
}
```

---

### DELETE /reactions/{commentId}
Remove reaction (same as POST toggle).

**Signature:** `DELETE /reactions/{commentId}`
**Auth:** Any authenticated user

| Parameter | Type | Required |
|-----------|------|----------|
| itemId | string | Yes (body) |
| reactionType | string | No (default: "like") |

**Response:**
```json
{
  "liked": false,
  "message": "Reaction removed"
}
```

---

### GET /reactions/{commentId}
Get reaction details.

**Signature:** `GET /reactions/{commentId}?itemId=`
**Auth:** Any authenticated user

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| itemId | string | Yes | Query param, item identifier |

**Response:**
```json
{
  "commentId": "string",
  "itemId": "string",
  "count": "number",
  "reactions": [{
    "userId": "string",
    "reactionType": "string",
    "createdAt": "ISO8601"
  }]
}
```

---

## Messages

### GET /messages/conversations
List user's conversations.

**Signature:** `GET /messages/conversations`
**Auth:** Any authenticated user

**Response:**
```json
{
  "conversations": [{
    "conversationId": "string",
    "conversationType": "string",
    "participantIds": ["string"],
    "lastMessageAt": "ISO8601",
    "unreadCount": "number"
  }]
}
```

---

### POST /messages/conversations
Create conversation.

**Signature:** `POST /messages/conversations`
**Auth:** Any authenticated user

| Parameter | Type | Required |
|-----------|------|----------|
| participantIds | string[] | Yes |
| messageText | string | Yes |
| conversationTitle | string | No |

**Response:** 201
```json
{
  "conversationId": "string",
  "conversationType": "string",
  "participantIds": ["string"],
  "message": { ... }
}
```

---

### GET /messages/{conversationId}
Get messages in conversation.

**Signature:** `GET /messages/{conversationId}?limit=50&lastEvaluatedKey=`
**Auth:** Conversation participant only

**Response:**
```json
{
  "messages": [{
    "messageId": "string",
    "senderId": "string",
    "senderName": "string",
    "senderPhotoUrl": "string",
    "messageText": "string",
    "attachments": [],
    "createdAt": "ISO8601"
  }],
  "creatorId": "string",
  "conversationTitle": "string",
  "lastEvaluatedKey": "string|null"
}
```

---

### POST /messages/{conversationId}
Send message.

**Signature:** `POST /messages/{conversationId}`
**Auth:** Conversation participant only
**Rate Limit:** 30/min

| Parameter | Type | Required |
|-----------|------|----------|
| messageText | string | Yes |
| attachments | object[] | No |

**Response:** 201 - Message object

---

### POST /messages/{conversationId}/upload-url
Get presigned URL for attachment.

**Signature:** `POST /messages/{conversationId}/upload-url`

| Parameter | Type | Required |
|-----------|------|----------|
| fileName | string | Yes |
| contentType | string | Yes |

**Response:**
```json
{
  "uploadUrl": "string",
  "s3Key": "string",
  "fileName": "string",
  "contentType": "string"
}
```

---

### PUT /messages/{conversationId}/read
Mark messages as read.

**Signature:** `PUT /messages/{conversationId}/read`
**Response:** 200 `{ "message": "Marked as read" }`

---

### DELETE /messages/{conversationId}
Delete conversation.

**Signature:** `DELETE /messages/{conversationId}`
**Auth:** Conversation creator only
**Response:** 200

---

### DELETE /messages/{conversationId}/{messageId}
Delete specific message.

**Signature:** `DELETE /messages/{conversationId}/{messageId}`
**Auth:** Message sender only
**Response:** 200

---

## Profile

### GET /profile/{userId}
Get user profile.

**Signature:** `GET /profile/{userId}`

**Response:**
```json
{
  "userId": "string",
  "email": "string",
  "displayName": "string",
  "bio": "string",
  "profilePhotoUrl": "string (presigned)",
  "familyRelationship": "string",
  "generation": "string",
  "familyBranch": "string",
  "isProfilePrivate": "boolean",
  "mediaUploadCount": "number",
  "joinedDate": "ISO8601",
  "lastActive": "ISO8601",
  "commentCount": "number",
  "createdAt": "ISO8601"
}
```

---

### PUT /profile
Update own profile.

**Signature:** `PUT /profile`
**Rate Limit:** 100/min (default)

| Parameter | Type | Required |
|-----------|------|----------|
| displayName | string | No |
| bio | string | No |
| familyRelationship | string | No |
| generation | string | No |
| familyBranch | string | No |
| isProfilePrivate | boolean | No |
| contactEmail | string | No |
| notifyOnMessage | boolean | No |
| notifyOnComment | boolean | No |
| theme | string | No |
| familyRelationships | object | No |

**Response:** 200 - Updated profile

---

### GET /profile/{userId}/comments
Get user's comment history.

**Signature:** `GET /profile/{userId}/comments?limit=20&lastEvaluatedKey=`
**Auth:** Profile owner or public profile

**Response:**
```json
{
  "items": [{ ... }],
  "lastEvaluatedKey": "string|null"
}
```

---

### POST /profile/photo/upload-url
Get presigned URL for profile photo.

**Signature:** `POST /profile/photo/upload-url`
**Rate Limit:** 10/5min

| Parameter | Type | Required |
|-----------|------|----------|
| filename | string | Yes |
| contentType | string | Yes |

**Response:**
```json
{
  "uploadUrl": "string",
  "photoUrl": "string",
  "expiresIn": 3600
}
```

---

### GET /users
List all users.

**Signature:** `GET /users`
**Auth:** Any authenticated user

**Response:**
```json
{
  "items": [{
    "userId": "string",
    "displayName": "string",
    "profilePhotoUrl": "string"
  }]
}
```

---

## Letters

### GET /letters
List letters.

**Signature:** `GET /letters?limit=20&cursor=`

**Response:**
```json
{
  "items": [{
    "date": "YYYY-MM-DD",
    "title": "string",
    "author": "string",
    "description": "string"
  }],
  "nextCursor": "string|null"
}
```

---

### GET /letters/{date}
Get letter by date.

**Signature:** `GET /letters/{date}`

**Response:**
```json
{
  "date": "YYYY-MM-DD",
  "title": "string",
  "author": "string",
  "content": "string (markdown)",
  "description": "string",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "versionCount": "number"
}
```

---

### PUT /letters/{date}
Update letter.

**Signature:** `PUT /letters/{date}`
**Auth:** ApprovedUsers or Admins

| Parameter | Type | Required |
|-----------|------|----------|
| content | string | Yes |
| title | string | No |
| author | string | No |
| description | string | No |

**Response:** 200
```json
{
  "message": "Letter updated",
  "versionCount": "number"
}
```

---

### GET /letters/{date}/versions
Get version history.

**Signature:** `GET /letters/{date}/versions`

**Response:**
```json
{
  "versions": [{
    "timestamp": "ISO8601",
    "updatedBy": "string",
    "title": "string"
  }]
}
```

---

### POST /letters/{date}/revert
Revert to previous version.

**Signature:** `POST /letters/{date}/revert`
**Auth:** ApprovedUsers or Admins

| Parameter | Type | Required |
|-----------|------|----------|
| versionTimestamp | string | Yes |

**Response:**
```json
{
  "message": "Reverted",
  "date": "YYYY-MM-DD",
  "title": "string",
  "content": "string",
  "updatedAt": "ISO8601",
  "versionCount": "number",
  "revertedFrom": "ISO8601"
}
```

---

### GET /letters/{date}/pdf
Get PDF download URL.

**Signature:** `GET /letters/{date}/pdf`

**Response:**
```json
{
  "downloadUrl": "string (presigned)",
  "filename": "string"
}
```

---

## Drafts

### POST /letters/upload-request
Request upload URLs for draft files.

**Signature:** `POST /letters/upload-request`
**Auth:** ApprovedUsers or Admins

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| fileCount | number | Yes | Number of files (max 20) |
| fileTypes | string[] | Yes | MIME types |

**Response:**
```json
{
  "uploadId": "string",
  "urls": [{
    "url": "string",
    "key": "string",
    "index": "number"
  }]
}
```

---

### POST /letters/process/{uploadId}
Process uploaded draft.

**Signature:** `POST /letters/process/{uploadId}`
**Auth:** ApprovedUsers or Admins
**Response:** 202 - Async processing started

---

### GET /admin/drafts
List all drafts.

**Signature:** `GET /admin/drafts`
**Auth:** Admins only

**Response:**
```json
{
  "drafts": [{
    "draftId": "string",
    "status": "string",
    "createdAt": "ISO8601"
  }]
}
```

---

### GET /admin/drafts/{draftId}
Get draft details.

**Signature:** `GET /admin/drafts/{draftId}`
**Auth:** Admins only

---

### DELETE /admin/drafts/{draftId}
Delete draft.

**Signature:** `DELETE /admin/drafts/{draftId}`
**Auth:** Admins only
**Response:** 200

---

### POST /admin/drafts/{draftId}/publish
Publish draft as letter.

**Signature:** `POST /admin/drafts/{draftId}/publish`
**Auth:** Admins only

| Parameter | Type | Required |
|-----------|------|----------|
| finalData.date | string | Yes |
| finalData.title | string | Yes |
| finalData.content | string | Yes |
| finalData.author | string | No |
| finalData.description | string | No |
| finalData.ragstackDocumentId | string | No |

**Response:**
```json
{
  "message": "Published",
  "path": "/letters/YYYY-MM-DD"
}
```

---

## Media

### GET /download/presigned-url
Get download URL by S3 key.

**Signature:** `GET /download/presigned-url?key=&bucket=`
**Auth:** Any authenticated user

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| key | string | Yes | S3 object key |
| bucket | string | No | Bucket name: `archive` (default) or `ragstack` |

**Security:** Key must start with allowed prefix:
- Archive bucket: `media/`, `letters/`, `temp/`
- RAGStack bucket: `input/`, `content/`

**Response:**
```json
{
  "downloadUrl": "string",
  "filename": "string"
}
```

---

## Contact

### POST /contact
Send contact message.

**Signature:** `POST /contact`
**Dependencies:** AWS SES

| Parameter | Type | Required |
|-----------|------|----------|
| email | string | Yes |
| message | string | Yes |

**Response:** 200 `{ "message": "Message sent successfully" }`

---

## Error Responses

| Status | Body |
|--------|------|
| 400 | `{ "error": "Validation message" }` |
| 401 | `{ "error": "Unauthorized" }` |
| 403 | `{ "error": "Forbidden" }` |
| 404 | `{ "error": "Not found" }` |
| 429 | `{ "error": "Rate limit exceeded", "retryAfter": seconds }` |
| 500 | `{ "error": "Internal server error" }` |

---

## Rate Limits

| Action | Limit | Window |
|--------|-------|--------|
| createComment | 20 | 1 min |
| sendMessage | 30 | 1 min |
| toggleReaction | 60 | 1 min |
| upload | 10 | 5 min |
| default | 100 | 1 min |
