<script lang='ts'>
  import type { Draft, PublishData } from '$lib/services/draft-service'
  import type { PageData } from './$types'
  import { goto } from '$app/navigation'
  import { authTokens } from '$lib/auth/auth-store'
  import AuthGuard from '$lib/components/auth/AuthGuard.svelte'
  import DraftReviewModal from '$lib/components/letters/DraftReviewModal.svelte'
import {
    deleteDraft,

    getDraft,
    getDraftPdfUrl,

    publishDraft,
  } from '$lib/services/draft-service'
  import { uploadDocumentToRagstack } from '$lib/services/ragstack-upload-service'
  import { onMount } from 'svelte'

  export let data: PageData

  let draft: Draft | null = null
  let pdfUrl = ''
  let loading = true
  let error = ''
  let publishing = false
  let deleting = false

  onMount(async () => {
    await loadDraft()
  })

  async function loadDraft() {
    if (!$authTokens?.idToken) {
      error = 'Not authenticated'
      loading = false
      return
    }

    loading = true
    error = ''
    try {
      draft = await getDraft(data.draftId, $authTokens.idToken)

      // Try to get PDF URL if available
      if (draft.s3Key) {
        try {
          pdfUrl = await getDraftPdfUrl(draft.s3Key, $authTokens.idToken)
        }
        catch {
          // PDF preview not available, that's okay
          console.warn('Could not load PDF preview')
        }
      }
    }
    catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load draft'
    }
    finally {
      loading = false
    }
  }

  async function handlePublish(event: CustomEvent<PublishData>) {
    if (!draft || !$authTokens?.idToken)
      return

    publishing = true
    error = ''

    try {
      // Upload combined PDF to RAGStack for search indexing and as source document for chat
      let ragstackDocumentId: string | undefined
      if (pdfUrl) {
        try {
          const pdfResponse = await fetch(pdfUrl)
          const pdfBlob = await pdfResponse.blob()
          const pdfFile = new File([pdfBlob], `letter-${event.detail.date}.pdf`, { type: 'application/pdf' })
          ragstackDocumentId = await uploadDocumentToRagstack(pdfFile)
        }
        catch (pdfErr) {
          console.warn('RAGStack PDF upload failed:', pdfErr)
        }
      }

      const publishData = { ...event.detail, ragstackDocumentId }
      const result = await publishDraft(data.draftId, publishData, $authTokens.idToken)

      // Redirect to the published letter
      goto(result.path)
    }
    catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish draft'
      // Check for date collision error
      if (message.includes('already exists')) {
        error = `${message}. Please choose a different date or edit the existing letter.`
      }
      else {
        error = message
      }
      publishing = false
    }
  }

  async function handleDiscard() {
    if (!$authTokens?.idToken)
      return

    deleting = true
    error = ''

    try {
      await deleteDraft(data.draftId, $authTokens.idToken)
      goto('/letters/drafts')
    }
    catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete draft'
      deleting = false
    }
  }

  function handleClose() {
    goto('/letters/drafts')
  }
</script>

<svelte:head>
  <title>Review Draft</title>
</svelte:head>

<AuthGuard>
  <div class='h-screen flex flex-col bg-base-100'>
    {#if loading}
      <div class='flex-1 flex items-center justify-center'>
        <div class='text-center'>
          <div class='loading loading-spinner loading-lg mb-4'></div>
          <p class='text-base-content/70'>Loading draft...</p>
        </div>
      </div>
    {:else if error && !draft}
      <div class='flex-1 flex items-center justify-center'>
        <div class='text-center max-w-md'>
          <svg xmlns='http://www.w3.org/2000/svg' class='h-16 w-16 mx-auto mb-4 text-error' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
          </svg>
          <h2 class='text-xl font-bold mb-2'>Error Loading Draft</h2>
          <p class='text-base-content/70 mb-4'>{error}</p>
          <div class='flex gap-2 justify-center'>
            <button class='btn btn-outline' on:click={loadDraft}>Retry</button>
            <a href='/letters/drafts' class='btn'>Back to Drafts</a>
          </div>
        </div>
      </div>
    {:else if draft}
      {#if draft.status !== 'REVIEW'}
        <div class='flex-1 flex items-center justify-center'>
          <div class='text-center max-w-md'>
            {#if draft.status === 'PROCESSING'}
              <div class='loading loading-spinner loading-lg mb-4'></div>
              <h2 class='text-xl font-bold mb-2'>Still Processing</h2>
              <p class='text-base-content/70 mb-4'>
                This draft is still being processed. Please wait a moment and try again.
              </p>
            {:else if draft.status === 'ERROR'}
              <svg xmlns='http://www.w3.org/2000/svg' class='h-16 w-16 mx-auto mb-4 text-error' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
              </svg>
              <h2 class='text-xl font-bold mb-2'>Processing Error</h2>
              <p class='text-base-content/70 mb-4'>
                {draft.error || 'An error occurred while processing this letter.'}
              </p>
            {/if}
            <div class='flex gap-2 justify-center'>
              <button class='btn btn-outline' on:click={loadDraft}>Refresh</button>
              <a href='/letters/drafts' class='btn'>Back to Drafts</a>
            </div>
          </div>
        </div>
      {:else}
        {#if error}
          <div class='alert alert-error m-4'>
            <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
            </svg>
            <span>{error}</span>
          </div>
        {/if}
        <div class='flex-1 overflow-hidden'>
          <DraftReviewModal
            {draft}
            {pdfUrl}
            {publishing}
            {deleting}
            on:publish={handlePublish}
            on:discard={handleDiscard}
            on:close={handleClose}
          />
        </div>
      {/if}
    {/if}
  </div>
</AuthGuard>
