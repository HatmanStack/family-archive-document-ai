<script lang='ts'>
  import type { AdjacentLetters, Letter, LetterVersion } from '$lib/services/letters-service'
  import { authTokens, isAuthenticated } from '$lib/auth/auth-store'
  import CommentSection from '$lib/components/comments/CommentSection.svelte'
  import VersionHistory from '$lib/components/VersionHistory.svelte'
import { getAdjacentLetters, getLetter, getPdfUrl, getVersions, revertToVersion } from '$lib/services/letters-service'
  import { title as storedTitle } from '$lib/stores/title'
  import DOMPurify from 'isomorphic-dompurify'
  import { marked } from 'marked'
  import { onMount } from 'svelte'
  import { fly } from 'svelte/transition'

  export let data: { date: string }

  let letter: Letter | null = null
  let loading = true
  let error = ''
  let pdfLoading = false

  let versions: LetterVersion[] = []
  let versionsLoading = false
  let showVersions = false

  let adjacent: AdjacentLetters = { prev: null, next: null }

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  async function loadLetter() {
    if (!$authTokens?.idToken) {
      loading = false
      return
    }

    try {
      letter = await getLetter(data.date, $authTokens.idToken)
      if (letter) {
        storedTitle.set('')
        // Load adjacent letters for navigation only if letter found
        adjacent = await getAdjacentLetters(data.date, $authTokens.idToken)
      }
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Letter not found'
    }
    loading = false
  }

  async function loadVersions() {
    if (!$authTokens?.idToken || !letter || letter.versionCount === 0)
      return

    versionsLoading = true
    try {
      versions = await getVersions(letter.date, $authTokens.idToken)
    }
    catch (e) {
      console.error('Failed to load versions:', e)
    }
    versionsLoading = false
  }

  async function downloadPdf() {
    if (!$authTokens?.idToken || !letter)
      return

    pdfLoading = true
    try {
      const url = await getPdfUrl(letter.date, $authTokens.idToken)
      window.open(url, '_blank')
    }
    catch (e) {
      console.error('Failed to get PDF URL:', e)
    }
    pdfLoading = false
  }

  async function handleRevert(event: CustomEvent<{ timestamp: string }>) {
    if (!$authTokens?.idToken || !letter)
      return

    try {
      await revertToVersion(letter.date, event.detail.timestamp, $authTokens.idToken)
      // Reload letter and versions
      letter = await getLetter(letter.date, $authTokens.idToken)
      versions = await getVersions(letter.date, $authTokens.idToken)
    }
    catch (e) {
      console.error('Failed to revert:', e)
    }
  }

  function toggleVersions() {
    showVersions = !showVersions
    if (showVersions && versions.length === 0) {
      loadVersions()
    }
  }

  onMount(() => {
    loadLetter()
  })

  // Reload when date changes (navigation between letters)
  $: if (data.date && $authTokens?.idToken) {
    // Reset state and reload
    letter = null
    error = ''
    versions = []
    showVersions = false
    loading = true
    loadLetter()
  }

  // Sanitize HTML to prevent XSS
  // Use breaks: true to preserve single line breaks from the original letter
  $: htmlContent = letter
    ? DOMPurify.sanitize(marked(letter.content, { breaks: true }) as string, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'blockquote', 'pre', 'code', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class'],
      })
    : ''
</script>

{#if loading}
  <div class='container mx-auto p-4 max-w-4xl'>
    <div class='flex justify-center p-8'>
      <span class='loading loading-spinner loading-lg'></span>
    </div>
  </div>
{:else if !$isAuthenticated}
  <div class='container mx-auto p-4 max-w-4xl'>
    <div class='alert alert-warning'>
      <span>Please log in to view this letter.</span>
    </div>
    <a href='/letters' class='btn mt-4 btn-link'>Back to letters</a>
  </div>
{:else if error || !letter}
  <div class='container mx-auto p-4 max-w-4xl'>
    <div class='alert alert-error mb-4'>
      <span>{error || 'Letter not found'}</span>
    </div>
    <a href='/letters' class='btn btn-link'>Back to letters</a>
  </div>
{:else}
  {#key letter.date}
    <div class='flex flex-col flex-nowrap justify-center xl:flex-row xl:flex-wrap'>
      <div class='flex-none w-full max-w-screen-md mx-auto xl:mx-0'>
        <article
          class='card bg-base-100 rounded-none md:rounded-box md:shadow-xl overflow-hidden z-10 md:mb-8 lg:mb-16'
          itemscope
          itemtype='https://schema.org/BlogPosting'
          in:fly={{ duration: 300, x: 100 }}>
        <div class='card-body gap-0'>
          <!-- Status/Date/Author -->
          <div class='flex flex-col gap-2'>
            <div class='flex flex-wrap items-center gap-2 text-sm opacity-70'>
              <time datetime={letter.date} itemprop='datePublished'>
                {formatDate(letter.date)}
              </time>
              {#if letter.author}
                <span>•</span>
                <span itemprop='author'>{letter.author}</span>
              {/if}
              {#if letter.versionCount > 0}
                <span>• Edited {letter.versionCount} {letter.versionCount === 1 ? 'time' : 'times'}</span>
              {/if}
            </div>

            <!-- Title -->
            <h1 class='card-title text-3xl mb-4' itemprop='name headline'>{letter.title}</h1>
          </div>

          <!-- Main Content -->
          <main class='prose max-w-none' itemprop='articleBody'>
            {@html htmlContent}
          </main>

          <!-- Action Buttons -->
          <div class='divider mt-4 mb-0' />
          <div class='mt-2 mb-4 flex flex-wrap items-center gap-2'>
            {#if letter.pdfKey || letter.ragstackDocumentId}
              <button
                class='btn btn-sm btn-outline gap-2'
                on:click={downloadPdf}
                disabled={pdfLoading}
              >
                {#if pdfLoading}
                  <span class='loading loading-spinner loading-xs'></span>
                {:else}
                  <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' />
                  </svg>
                {/if}
                Download Original Letter
              </button>
            {/if}

            {#if $isAuthenticated}
              <a href='/letters/{letter.date}/edit' class='btn btn-sm btn-outline gap-2'>
                <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'>
                  <path stroke-linecap='round' stroke-linejoin='round' d='M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' />
                </svg>
                Edit Letter
              </a>
            {/if}

            {#if $isAuthenticated && letter.versionCount > 0}
              <button
                class='btn btn-sm btn-ghost gap-2'
                on:click={toggleVersions}
              >
                <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'>
                  <path stroke-linecap='round' stroke-linejoin='round' d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' />
                </svg>
                {showVersions ? 'Hide' : 'Show'} History ({letter.versionCount})
              </button>
            {/if}
          </div>

          {#if showVersions && $isAuthenticated}
            <div class='mb-4'>
              <VersionHistory
                {versions}
                loading={versionsLoading}
                on:revert={handleRevert}
              />
            </div>
          {/if}

          <!-- Pagination/Navigation -->
          {#if adjacent.prev || adjacent.next}
            <nav class='flex flex-col md:flex-row flex-wrap justify-between gap-4 mt-4'>
              {#if adjacent.prev}
                <a
                  href='/letters/{adjacent.prev.date}'
                  class='flex-1 min-w-0 group flex items-center gap-2 p-4 rounded-box bg-base-200 hover:bg-base-300 transition-colors'
                >
                  <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'>
                    <path stroke-linecap='round' stroke-linejoin='round' d='M15 19l-7-7 7-7' />
                  </svg>
                  <div class='flex-1 min-w-0'>
                    <div class='text-xs text-base-content/60 mb-1'>Previous Letter</div>
                    <div class='font-semibold truncate transition-colors group-hover:text-primary'>
                      {adjacent.prev.title}
                    </div>
                  </div>
                </a>
              {:else}
                <div class='flex-1 min-w-0'></div>
              {/if}

              {#if adjacent.next}
                <a
                  href='/letters/{adjacent.next.date}'
                  class='flex-1 min-w-0 group flex items-center justify-end gap-2 p-4 rounded-box bg-base-200 hover:bg-base-300 transition-colors text-right'
                >
                  <div class='flex-1 min-w-0'>
                    <div class='text-xs text-base-content/60 mb-1'>Next Letter</div>
                    <div class='font-semibold truncate group-hover:text-primary transition-colors'>
                      {adjacent.next.title}
                    </div>
                  </div>
                  <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity' fill='none' viewBox='0 0 24 24' stroke='currentColor' stroke-width='2'>
                    <path stroke-linecap='round' stroke-linejoin='round' d='M9 5l7 7-7 7' />
                  </svg>
                </a>
              {:else}
                <div class='flex-1 min-w-0'></div>
              {/if}
            </nav>
          {/if}

          <!-- Comments Section -->
          {#if $isAuthenticated && letter}
            <CommentSection
              itemId={letter.date}
              itemType='letter'
              itemTitle={letter.title}
            />
          {/if}
        </div>
      </article>
      </div>
    </div>
  {/key}
{/if}
