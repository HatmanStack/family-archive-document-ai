<script lang='ts'>
  import type { CommentHistoryItem } from '$lib/types/profile'
  import { goto } from '$app/navigation'
  import { getCommentHistory } from '$lib/services/profile-service'
  import { onMount } from 'svelte'

  export let userId: string

  /**
   * Convert stored itemId to navigable path
   * Media items: "media/pictures/foo.jpg" -> "/gallery?item=media/pictures/foo.jpg"
   * Letters: "2024-12-10" -> "/letters/2024-12-10"
   */
  function itemIdToPath(itemId: string | null | undefined, itemType?: string): string {
    if (!itemId)
      return '/'
    const id = String(itemId)
    if (id.startsWith('media/')) {
      return `/gallery?item=${encodeURIComponent(id)}`
    }
    // Letter dates are stored as just "2024-12-10"
    if (itemType === 'letter' || /^\d{4}-\d{2}-\d{2}$/.test(id)) {
      return `/letters/${id}`
    }
    // Ensure path starts with /
    if (id.startsWith('/')) {
      return id
    }
    return `/${id}`
  }

  let comments: CommentHistoryItem[] = []
  let loading = true
  let error = ''
  let lastEvaluatedKey: string | undefined
  let loadingMore = false
  let hasMore = false

  /**
   * Format timestamp as relative time (e.g., "2 hours ago")
   */
  function formatRelativeTime(timestamp: string): string {
    const now = new Date()
    const then = new Date(timestamp)
    const diffMs = now.getTime() - then.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60)
      return 'just now'
    if (diffMin < 60)
      return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
    if (diffHour < 24)
      return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
    if (diffDay < 30)
      return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`

    return then.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  /**
   * Truncate comment text to snippet length
   */
  function truncateComment(text: string | null | undefined, maxLength: number = 150): string {
    if (!text)
      return ''
    const str = String(text)
    if (str.length <= maxLength)
      return str
    return `${str.substring(0, maxLength).trim()}...`
  }

  /**
   * Navigate to item page and scroll to comment
   */
  function navigateToComment(itemId: string, commentId: string, itemType?: string) {
    const path = itemIdToPath(itemId, itemType)
    goto(`${path}#comment-${commentId}`)
  }

  /**
   * Load initial comments
   */
  async function loadComments() {
    loading = true
    error = ''

    const result = await getCommentHistory(userId, 20)

    if (result.success && result.data) {
      comments = result.data
      lastEvaluatedKey = result.lastEvaluatedKey
      hasMore = !!result.lastEvaluatedKey
    }
    else {
      error = result.error || 'Failed to load comment history'
    }

    loading = false
  }

  /**
   * Load more comments (pagination)
   */
  async function loadMoreComments() {
    if (!lastEvaluatedKey || loadingMore)
      return

    loadingMore = true
    error = ''

    const result = await getCommentHistory(userId, 20, lastEvaluatedKey)

    if (result.success && result.data) {
      comments = [...comments, ...result.data]
      lastEvaluatedKey = result.lastEvaluatedKey
      hasMore = !!result.lastEvaluatedKey
    }
    else {
      error = result.error || 'Failed to load more comments'
    }

    loadingMore = false
  }

  onMount(() => {
    loadComments()
  })
</script>

<div class='card bg-base-100 shadow-xl'>
  <div class='card-body'>
    <h3 class='card-title mb-4'>Comment History</h3>

    {#if loading}
      <!-- Loading skeleton -->
      <div class='space-y-4'>
        {#each Array.from({ length: 3 }) as _}
          <div class='animate-pulse'>
            <div class='h-4 bg-base-300 rounded mb-2 w-3/4'></div>
            <div class='h-3 bg-base-300 rounded w-full mb-1'></div>
            <div class='h-3 bg-base-300 rounded w-5/6'></div>
          </div>
        {/each}
      </div>
    {:else if error}
      <!-- Error state -->
      <div class='alert alert-error'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          class='stroke-current shrink-0 h-6 w-6'
          fill='none'
          viewBox='0 0 24 24'
        >
          <path
            stroke-linecap='round'
            stroke-linejoin='round'
            stroke-width='2'
            d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
          />
        </svg>
        <span>{error}</span>
      </div>
    {:else if (comments ?? []).length === 0}
      <!-- Empty state -->
      <div class='text-center py-8'>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          class='h-16 w-16 mx-auto mb-4 text-base-content/20'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
        >
          <path
            stroke-linecap='round'
            stroke-linejoin='round'
            stroke-width='2'
            d='M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
          />
        </svg>
        <p class='text-base-content/60'>No comments yet</p>
      </div>
    {:else}
      <!-- Comments list -->
      <div class='space-y-4'>
        {#each comments ?? [] as comment}
          <div class='border-l-4 py-2 hover:bg-base-200 transition-colors border-primary pl-4'>
            <button
              class='text-left w-full'
              on:click={() => navigateToComment(comment.itemId, comment.commentId, comment.itemType)}
            >
              <!-- Item title -->
              <h4 class='font-semibold text-primary hover:underline mb-1'>
                {comment.itemTitle || 'Untitled Item'}
              </h4>

              <!-- Comment snippet -->
              <p class='text-sm mb-2 text-base-content/80'>
                {truncateComment(comment.content)}
              </p>

              <!-- Metadata -->
              <div class='flex items-center gap-3 text-xs text-base-content/60'>
                <span>{formatRelativeTime(comment.createdAt)}</span>

                {#if comment.reactionCount > 0}
                  <span class='flex items-center gap-1'>
                    <svg
                      xmlns='http://www.w3.org/2000/svg'
                      class='h-3 w-3'
                      fill='currentColor'
                      viewBox='0 0 24 24'
                      stroke='currentColor'
                    >
                      <path
                        stroke-linecap='round'
                        stroke-linejoin='round'
                        stroke-width='2'
                        d='M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z'
                      />
                    </svg>
                    {comment.reactionCount}
                  </span>
                {/if}

                <span class='badge badge-xs badge-ghost'>{comment.itemType}</span>
              </div>
            </button>
          </div>
        {/each}
      </div>

      <!-- Load more button -->
      {#if hasMore}
        <div class='text-center mt-4'>
          <button
            class='btn btn-outline btn-sm'
            class:loading={loadingMore}
            on:click={loadMoreComments}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>
