<script lang='ts'>
  import type { LetterListItem } from '$lib/services/letters-service'
  import { authTokens, isAuthenticated } from '$lib/auth/auth-store'
import { listLetters } from '$lib/services/letters-service'
  import { title as storedTitle } from '$lib/stores/title'
  import { onMount, tick } from 'svelte'
  import { fly } from 'svelte/transition'

  storedTitle.set('')

  let letters: LetterListItem[] = []
  let nextCursor: string | null = null
  let loadingMore = false
  let error = ''

  function formatDate(dateStr: string): string {
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  async function loadLetters() {
    if (!$authTokens?.idToken) {
      return
    }

    try {
      const result = await listLetters($authTokens.idToken, 15)
      nextCursor = result.nextCursor

      // Wait for DOM to update, then set letters so in:fly animations trigger
      await tick()
      letters = result.items
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load letters'
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore || !$authTokens?.idToken)
      return

    loadingMore = true
    try {
      const result = await listLetters($authTokens.idToken, 15, nextCursor)
      letters = [...letters, ...result.items]
      nextCursor = result.nextCursor
    }
    catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load more letters'
    }
    loadingMore = false
  }

  onMount(() => {
    loadLetters()
  })
</script>

<div class='flex flex-col flex-nowrap justify-center xl:flex-row xl:flex-wrap'>
  <div class='flex-none w-full max-w-screen-md mx-auto xl:mx-0'>
    {#if !$isAuthenticated}
      <div class='card bg-base-100 rounded-none md:rounded-box md:shadow-xl overflow-hidden z-10 md:mb-8'>
        <div class='card-body'>
          <div class='alert alert-warning'>
            <span>Please log in to view the family letters.</span>
          </div>
        </div>
      </div>
    {:else if error}
      <div class='card bg-base-100 rounded-none md:rounded-box md:shadow-xl overflow-hidden z-10 md:mb-8'>
        <div class='card-body'>
          <div class='alert alert-error'>
            <span>{error}</span>
          </div>
        </div>
      </div>
    {:else}
      <!-- Add Letter Button -->
      <div class='mb-6 flex justify-center' in:fly={{ delay: 300, duration: 300, y: -20 }}>
        <a href='/letters/upload' class='btn btn-primary gap-2'>
          <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 4v16m8-8H4' />
          </svg>
          Add Letter
        </a>
      </div>

      <main class='flex flex-col relative bg-base-100 md:bg-transparent md:gap-8 z-10'>
        {#each letters as letter, index (letter.date)}
          <div
            class='rounded-box transition-all duration-500 ease-in-out hover:z-30 hover:shadow-lg md:shadow-xl md:hover:shadow-2xl md:hover:-translate-y-0.5'
            in:fly={{ delay: 500 + (index % 15) * 50, duration: 300, x: index % 2 ? 100 : -100 }}
            out:fly={{ duration: 300, x: index % 2 ? -100 : 100 }}
          >
            <a
              href='/letters/{letter.date}'
              class='card bg-base-100 rounded-none md:rounded-box overflow-hidden group'
            >
              <div class='card-body'>
                <div class='flex justify-between items-start gap-4'>
                  <h2 class='card-title text-xl mr-auto bg-[length:100%_0%] bg-[position:0_88%] underline decoration-transparent group-hover:decoration-primary bg-gradient-to-t from-primary to-primary bg-no-repeat transition-all ease-in-out duration-300 decoration-2'>
                    {letter.title}
                  </h2>
                  <span class='text-sm opacity-70 whitespace-nowrap'>
                    {formatDate(letter.date)}
                  </span>
                </div>
                {#if letter.description}
                  <p class='text-sm opacity-70 line-clamp-2'>
                    {letter.description}
                  </p>
                {/if}
                {#if letter.author}
                  <span class='text-sm opacity-50'>{letter.author}</span>
                {/if}
              </div>
            </a>
          </div>
        {/each}
      </main>

      {#if nextCursor}
        <div
          class='flex justify-center my-8'
          in:fly={{ delay: 500, duration: 300, y: 50 }}
        >
          <button
            class='btn btn-primary btn-lg gap-2'
            on:click={loadMore}
            disabled={loadingMore}
          >
            {#if loadingMore}
              <span class='loading loading-spinner loading-sm'></span>
              Loading...
            {:else}
              <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 14l-7 7m0 0l-7-7m7 7V3' />
              </svg>
              Load More Letters
            {/if}
          </button>
        </div>
      {:else if letters.length > 0}
        <div
          class='text-center my-8 p-6 bg-base-200 rounded-lg'
          in:fly={{ delay: 500, duration: 300, y: 50 }}
        >
          <div class='text-base-content/60'>
            <svg xmlns='http://www.w3.org/2000/svg' class='h-8 w-8 mx-auto mb-2' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' />
            </svg>
            <p class='font-medium'>You've reached the end!</p>
            <p class='text-sm mt-1'>All {letters.length} letters loaded.</p>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
