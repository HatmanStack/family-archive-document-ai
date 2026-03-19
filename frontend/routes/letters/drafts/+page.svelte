<script lang='ts'>
  import type { Draft } from '$lib/services/draft-service'
  import { goto } from '$app/navigation'
  import { authTokens } from '$lib/auth/auth-store'
  import AuthGuard from '$lib/components/auth/AuthGuard.svelte'
import { deleteDraft, extractDraftId, formatDraftStatus, listDrafts } from '$lib/services/draft-service'
  import { onMount } from 'svelte'

  let drafts: Draft[] = []
  let loading = true
  let error = ''
  let deleting: string | null = null

  onMount(async () => {
    await loadDrafts()
  })

  async function loadDrafts() {
    if (!$authTokens?.idToken) {
      error = 'Not authenticated'
      loading = false
      return
    }

    loading = true
    error = ''
    try {
      drafts = await listDrafts($authTokens.idToken)
      // Sort by createdAt descending (newest first)
      drafts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load drafts'
    }
    finally {
      loading = false
    }
  }

  async function handleDelete(draft: Draft) {
    if (!$authTokens?.idToken)
      return

    const draftId = extractDraftId(draft.PK)
    if (!confirm('Are you sure you want to delete this draft?'))
      return

    deleting = draftId
    try {
      await deleteDraft(draftId, $authTokens.idToken)
      drafts = drafts.filter(d => d.PK !== draft.PK)
    }
    catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete draft'
    }
    finally {
      deleting = null
    }
  }

  function handleReview(draft: Draft) {
    const draftId = extractDraftId(draft.PK)
    goto(`/letters/drafts/${draftId}`)
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString()
  }
</script>

<svelte:head>
  <title>Letter Drafts</title>
</svelte:head>

<AuthGuard>
  <div class='container mx-auto px-4 py-8'>
    <div class='mb-8'>
      <nav class='text-sm breadcrumbs'>
        <ul>
          <li><a href='/letters' class='link link-hover'>Letters</a></li>
          <li>Drafts</li>
        </ul>
      </nav>
    </div>

    <div class='mb-8'>
      <h1 class='text-3xl font-bold'>Letter Drafts</h1>
      <p class='text-base-content/70 mt-1'>Review and publish uploaded letters</p>
    </div>

    {#if error}
      <div class='alert alert-error mb-6'>
        <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
        </svg>
        <span>{error}</span>
        <button class='btn btn-sm' on:click={loadDrafts}>Retry</button>
      </div>
    {/if}

    {#if loading}
      <div class='flex justify-center py-12'>
        <div class='loading loading-spinner loading-lg'></div>
      </div>
    {:else if drafts.length === 0}
      <div class='text-center py-12 bg-base-200 rounded-lg'>
        <svg xmlns='http://www.w3.org/2000/svg' class='h-16 w-16 mx-auto mb-4 text-base-content/40' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
        </svg>
        <h3 class='text-lg font-semibold mb-2'>No Drafts</h3>
        <p class='text-base-content/60'>No letters are waiting for review</p>
      </div>
    {:else}
      <div class='overflow-x-auto'>
        <table class='table table-zebra w-full'>
          <thead>
            <tr>
              <th>Status</th>
              <th>Title / Summary</th>
              <th>Created</th>
              <th class='text-right'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each drafts as draft}
              {@const draftId = extractDraftId(draft.PK)}
              {@const status = formatDraftStatus(draft.status)}
              <tr>
                <td>
                  <span class='badge badge-{status.color}'>{status.label}</span>
                </td>
                <td>
                  <div class='max-w-md'>
                    {#if draft.parsedData?.title}
                      <span class='font-medium'>{draft.parsedData.title}</span>
                    {:else if draft.parsedData?.summary}
                      <span class='text-sm text-base-content/70'>{draft.parsedData.summary.slice(0, 100)}...</span>
                    {:else if draft.status === 'PROCESSING'}
                      <span class='text-sm text-base-content/50 italic'>Processing...</span>
                    {:else if draft.status === 'ERROR'}
                      <span class='text-sm text-error'>{draft.error || 'Processing failed'}</span>
                    {:else}
                      <span class='text-sm text-base-content/50'>No content extracted</span>
                    {/if}
                  </div>
                </td>
                <td class='text-sm text-base-content/70'>
                  {formatDate(draft.createdAt)}
                </td>
                <td>
                  <div class='flex justify-end gap-2'>
                    {#if draft.status === 'REVIEW'}
                      <button
                        class='btn btn-sm btn-primary'
                        on:click={() => handleReview(draft)}
                      >
                        Review
                      </button>
                    {:else if draft.status === 'PROCESSING'}
                      <button class='btn btn-sm btn-ghost' on:click={loadDrafts}>
                        <span class='loading loading-spinner loading-xs mr-1'></span>
                        Refresh
                      </button>
                    {/if}
                    <button
                      class='btn btn-sm btn-ghost text-error'
                      on:click={() => handleDelete(draft)}
                      disabled={deleting === draftId}
                    >
                      {#if deleting === draftId}
                        <span class='loading loading-spinner loading-xs'></span>
                      {:else}
                        Delete
                      {/if}
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</AuthGuard>
