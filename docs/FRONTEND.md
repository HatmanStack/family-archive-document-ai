# Frontend Guide

The frontend is built with SvelteKit 2.x and Svelte 4, using DaisyUI components and TailwindCSS for styling.

## Stack

| Technology | Purpose |
|------------|---------|
| SvelteKit 2 | Full-stack framework with file-based routing |
| Svelte 4 | Reactive component framework |
| DaisyUI | Component library (buttons, forms, modals) |
| TailwindCSS | Utility-first CSS |
| MDSvex | Markdown rendering for letters |
| TypeScript | Type safety |

## Project Structure

```
frontend/
├── routes/                  # SvelteKit file-based routing
│   ├── +layout.svelte      # Root layout with nav
│   ├── +page.svelte        # Homepage
│   ├── auth/               # Authentication pages
│   │   ├── login/
│   │   ├── signup/
│   │   ├── callback/
│   │   ├── forgot-password/
│   │   └── reset-password/
│   ├── gallery/            # Media gallery
│   ├── letters/            # Letter viewing and editing
│   │   ├── [date]/        # Individual letter
│   │   └── drafts/        # Draft management
│   ├── messages/           # Direct messaging
│   │   ├── +page.svelte   # Conversation list
│   │   └── [id]/          # Conversation view
│   ├── profile/            # User profiles
│   │   ├── [userId]/      # View profile
│   │   └── settings/      # Edit profile
│   └── about/              # About page
│
├── lib/
│   ├── auth/               # Authentication utilities
│   │   ├── client.ts      # Cognito client
│   │   └── auth-store.ts  # Auth state store
│   ├── components/         # Reusable components
│   │   ├── comments/      # Comment system
│   │   ├── messages/      # Messaging components
│   │   ├── profile/       # Profile components
│   │   └── letters/       # Letter components
│   ├── services/           # API service modules
│   │   ├── comment-service.ts        # Comment CRUD
│   │   ├── content-service.ts        # Content transformation
│   │   ├── draft-service.ts          # Draft management
│   │   ├── gallery-service.ts        # RAGStack gallery integration
│   │   ├── letter-upload-service.ts  # Multi-file upload
│   │   ├── letters-service.ts        # Letter CRUD, versions
│   │   ├── markdown.ts               # Markdown rendering
│   │   ├── media-service.ts          # Media download, presigned URLs
│   │   ├── message-service.ts        # Conversations, messages
│   │   ├── profile-service.ts        # Profile CRUD, photos
│   │   ├── ragstack-upload-service.ts # RAGStack document indexing
│   │   ├── reaction-service.ts       # Reaction toggle, counts
│   │   └── search-service.ts         # RAGStack semantic search
│   ├── stores/             # Svelte stores
│   └── types/              # TypeScript definitions
│
├── static/                  # Static assets
├── app.html                # HTML template
├── app.pcss                # Global styles
└── svelte.config.js        # SvelteKit config
```

## Services

All API communication goes through service modules in `lib/services/`. Each service handles:
- API requests with authentication
- Error handling
- Response typing

### Profile Service

```typescript
// lib/services/profile-service.ts
import { getProfile, updateProfile, getAllUsers } from '$lib/services/profile-service'

// Get user profile
const profile = await getProfile(userId)

// Update own profile
await updateProfile({
  displayName: 'New Name',
  bio: 'About me...',
  isProfilePrivate: false
})

// List all users
const users = await getAllUsers()
```

### Comment Service

```typescript
// lib/services/comment-service.ts
import { getComments, createComment, updateComment, deleteComment } from '$lib/services/comment-service'

// Get comments on an item
const { items, lastEvaluatedKey } = await getComments(itemId, limit)

// Create comment
await createComment(itemId, text, itemType, itemTitle)

// Edit comment
await updateComment(itemId, commentId, newText)

// Delete comment
await deleteComment(itemId, commentId)
```

### Message Service

```typescript
// lib/services/message-service.ts
import {
  getConversations,
  getMessages,
  createConversation,
  sendMessage,
  markAsRead,
  uploadAttachment
} from '$lib/services/message-service'

// List conversations
const conversations = await getConversations()

// Get messages in conversation
const { messages, lastEvaluatedKey } = await getMessages(conversationId)

// Create conversation
const { conversationId } = await createConversation(participantIds, messageText, title)

// Send message with attachment
const attachment = await uploadAttachment(file)
await sendMessage(conversationId, text, [attachment])
```

### Letters Service

```typescript
// lib/services/letters-service.ts
import {
  listLetters,
  getLetter,
  updateLetter,
  getVersions,
  revertToVersion,
  getPdfUrl
} from '$lib/services/letters-service'

// List all letters
const { items, nextCursor } = await listLetters(authToken, limit, cursor)

// Get single letter
const letter = await getLetter(date, authToken)

// Update letter content
await updateLetter(date, { content, title, author }, authToken)

// Get version history
const versions = await getVersions(date, authToken)

// Revert to previous version
await revertToVersion(date, versionTimestamp, authToken)

// Get PDF download URL
const pdfUrl = await getPdfUrl(date, authToken)
```

## Stores

Svelte stores manage application state:

### Auth Store

```typescript
// lib/auth/auth-store.ts
import { authStore } from '$lib/auth/auth-store'

// Subscribe to auth state
$: isAuthenticated = $authStore?.accessToken != null
$: userId = $authStore?.userId

// Update auth state
authStore.set({
  accessToken: '...',
  refreshToken: '...',
  idToken: '...',
  userId: '...',
  email: '...'
})

// Clear auth (logout)
authStore.set(null)
```

## Components

### Comment Component

```svelte
<!-- lib/components/comments/Comment.svelte -->
<script lang="ts">
  import type { Comment } from '$lib/types/comment'
  export let comment: Comment
  export let onEdit: (commentId: string, text: string) => void
  export let onDelete: (commentId: string) => void
</script>

<div class="comment">
  <p>{comment.content}</p>
  <button on:click={() => onEdit(comment.commentId, comment.content)}>Edit</button>
  <button on:click={() => onDelete(comment.commentId)}>Delete</button>
</div>
```

### Profile Card

```svelte
<!-- lib/components/profile/ProfileCard.svelte -->
<script lang="ts">
  import type { UserProfile } from '$lib/types/profile'
  export let profile: UserProfile
</script>

<div class="card">
  <img src={profile.profilePhotoUrl} alt={profile.displayName} />
  <h2>{profile.displayName}</h2>
  <p>{profile.bio}</p>
</div>
```

## Type Definitions

### Profile Types

```typescript
// lib/types/profile.ts
interface UserProfile {
  userId: string
  email: string
  displayName: string
  profilePhotoUrl?: string
  bio?: string
  familyRelationship?: string
  generation?: string
  familyBranch?: string
  isProfilePrivate: boolean
  joinedDate: string
  commentCount: number
  mediaUploadCount: number
  lastActive: string
}

interface FamilyRelationship {
  id: string
  type: string
  customType?: string
  name: string
  createdAt: string
}
```

### Comment Types

```typescript
// lib/types/comment.ts
interface Comment {
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
```

### Message Types

```typescript
// lib/types/message.ts
interface Message {
  conversationId: string
  messageId: string
  senderId: string
  senderName: string
  senderPhotoUrl?: string
  messageText: string
  attachments?: Attachment[]
  createdAt: string
}

interface Conversation {
  conversationId: string
  conversationType: 'direct' | 'group'
  participantIds: string[]
  participantNames: string[]
  lastMessageAt: string
  unreadCount: number
  conversationTitle?: string
  lastMessagePreview?: string
}

interface Attachment {
  s3Key: string
  filename: string
  contentType: string
  size: number
  url?: string
}
```

## Routing

SvelteKit uses file-based routing:

| Path | File | Description |
|------|------|-------------|
| `/` | `routes/+page.svelte` | Homepage |
| `/auth/login` | `routes/auth/login/+page.svelte` | Login |
| `/gallery` | `routes/gallery/+page.svelte` | Media gallery |
| `/letters` | `routes/letters/+page.svelte` | Letter list |
| `/letters/2024-01-15` | `routes/letters/[date]/+page.svelte` | Single letter |
| `/messages` | `routes/messages/+page.svelte` | Conversations |
| `/messages/abc123` | `routes/messages/[id]/+page.svelte` | Conversation |
| `/profile/user-id` | `routes/profile/[userId]/+page.svelte` | View profile |
| `/profile/settings` | `routes/profile/settings/+page.svelte` | Edit profile |

## Styling

### DaisyUI Components

```svelte
<!-- Button variants -->
<button class="btn btn-primary">Primary</button>
<button class="btn btn-secondary">Secondary</button>
<button class="btn btn-ghost">Ghost</button>

<!-- Form inputs -->
<input type="text" class="input input-bordered" />
<textarea class="textarea textarea-bordered"></textarea>

<!-- Cards -->
<div class="card bg-base-100 shadow-xl">
  <div class="card-body">
    <h2 class="card-title">Title</h2>
    <p>Content</p>
  </div>
</div>

<!-- Modals -->
<dialog class="modal" bind:open={showModal}>
  <div class="modal-box">
    <h3 class="font-bold text-lg">Modal Title</h3>
    <p>Content</p>
  </div>
</dialog>
```

### TailwindCSS Utilities

```svelte
<div class="flex items-center justify-between p-4">
  <span class="text-lg font-semibold">Title</span>
  <button class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
    Action
  </button>
</div>
```

## Environment Variables

Frontend environment variables (must be prefixed with `PUBLIC_`):

```bash
# API
PUBLIC_API_GATEWAY_URL=https://xxx.execute-api.us-east-1.amazonaws.com

# Cognito
PUBLIC_AWS_REGION=us-east-1
PUBLIC_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
PUBLIC_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxx
PUBLIC_COGNITO_IDENTITY_POOL_ID=us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PUBLIC_COGNITO_HOSTED_UI_URL=https://your-app.auth.us-east-1.amazoncognito.com
PUBLIC_COGNITO_HOSTED_UI_DOMAIN=your-app

# RAGStack (optional)
PUBLIC_RAGSTACK_CHAT_URL=https://xxx.cloudfront.net/ragstack-chat.js
PUBLIC_RAGSTACK_GRAPHQL_URL=https://xxx.appsync-api.us-east-1.amazonaws.com/graphql
PUBLIC_RAGSTACK_API_KEY=da2-xxxxxxxxxxxxxxxxxxxxx
```

## Build & Deploy

### Development

```bash
cd frontend
npm run dev     # Start dev server at localhost:5173
```

### Production Build

```bash
npm run build   # Creates optimized build in build/
npm run preview # Preview production build locally
```

### Static Hosting

The built frontend can be deployed to any static hosting:
- AWS S3 + CloudFront
- Vercel
- Netlify
- GitHub Pages

## Testing

### Unit Tests (Vitest)

```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- path/to/test   # Run specific test
```

### E2E Tests (Playwright)

```bash
npm run test:e2e           # Run E2E tests
npm run test:e2e -- --ui   # Interactive mode
```
