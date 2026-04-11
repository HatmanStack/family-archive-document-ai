<script lang='ts'>
  import type { Comment } from '$lib/types/comment'
  import { createComment } from '$lib/services/comment-service'
  import { createEventDispatcher } from 'svelte'

  export let itemId: string
  export let itemType: 'letter' | 'media'
  export let itemTitle: string

  const dispatch = createEventDispatcher<{ commentCreated: Comment }>()

  let commentText = ''
  let loading = false
  let error = ''

  const MAX_CHARS = 2000

  $: charCount = commentText.length
  $: isOverLimit = charCount > MAX_CHARS
  $: isEmpty = commentText.trim().length === 0
  $: canSubmit = !isEmpty && !isOverLimit && !loading

  async function handleSubmit() {
    if (!canSubmit)
      return

    loading = true
    error = ''

    const result = await createComment(itemId, commentText.trim(), itemType, itemTitle)

    if (result.success && result.data) {
      // Emit event with new comment
      dispatch('commentCreated', result.data as Comment)
      // Clear textarea
      commentText = ''
    }
    else {
      error = result.error || 'Failed to create comment'
    }

    loading = false
  }

  function handleKeydown(event: KeyboardEvent) {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      handleSubmit()
    }
  }
</script>

<div class='comment-form flex flex-col items-center w-full max-w-2xl mx-auto'>
  {#if error}
    <div class='alert alert-error mb-4'>
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
  {/if}

  <div class='form-control w-full'>
    <textarea
      id='comment-input'
      class='textarea textarea-bordered mx-auto w-full'
      class:textarea-error={isOverLimit}
      placeholder='Share your thoughts...'
      rows='4'
      bind:value={commentText}
      on:keydown={handleKeydown}
      disabled={loading}
      aria-label='Write a comment'
      aria-describedby='char-count'
    />
    <div class='flex flex-col items-center gap-1 py-2'>
      <span class='font-semibold text-sm'>Add a comment</span>
      <span
        class='text-xs text-base-content/60'
        class:text-error={isOverLimit}
        aria-live='polite'
        aria-atomic='true'
      >
        {charCount}/{MAX_CHARS}
      </span>
    </div>
    <label for='comment-input' class='label'>
      <span id='char-count' class='label-text-alt text-base-content/60'>
        {#if !isEmpty}
          Press Ctrl+Enter to submit
        {:else}
          &nbsp;
        {/if}
      </span>
    </label>
  </div>

  <div class='mt-4'>
    <button
      class='btn btn-primary'
      class:loading={loading}
      disabled={!canSubmit}
      on:click={handleSubmit}
      aria-label='Submit comment'
    >
      {#if loading}
        <span class='loading loading-spinner loading-sm'></span>
        Posting...
      {:else}
        Post Comment
      {/if}
    </button>
  </div>
</div>

<style>
  .textarea {
    resize: vertical;
    min-height: 100px;
  }
</style>
