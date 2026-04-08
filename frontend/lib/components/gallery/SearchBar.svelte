<script lang='ts'>
  import { createEventDispatcher } from 'svelte'

  export let value: string
  export let isSearching = false
  export let searchError = ''
  export let isSearchMode = false
  export let resultCount = 0
  export let totalResults = 0

  const dispatch = createEventDispatcher<{
    input: string
    search: string
    clear: void
  }>()

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement
    value = target.value
    dispatch('input', value)
    if (!value.trim()) {
      dispatch('clear')
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && value.trim()) {
      dispatch('search', value)
    }
  }

  function clear() {
    value = ''
    dispatch('clear')
  }
</script>

<div class='max-w-2xl mx-auto mb-8'>
  <div class='relative'>
    <input
      type='text'
      placeholder='Search photos, videos, and documents...'
      class='input input-bordered w-full pl-12 pr-12 text-lg'
      {value}
      on:input={handleInput}
      on:keydown={handleKeydown}
    />
    <div class='absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none'>
      {#if isSearching}
        <span class='loading loading-spinner loading-sm text-primary'></span>
      {:else}
        <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 text-base-content/50' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' />
        </svg>
      {/if}
    </div>
    {#if value}
      <button
        class='absolute inset-y-0 right-0 flex items-center pr-4 text-base-content/50 hover:text-base-content'
        on:click={clear}
      >
        <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
        </svg>
      </button>
    {/if}
  </div>
  {#if searchError}
    <div class='alert alert-error mt-2'>
      <span>{searchError}</span>
    </div>
  {/if}
  {#if isSearchMode && !isSearching}
    <div class='text-sm text-base-content/60 mt-2 text-center'>
      {#if resultCount > 0}
        Found {resultCount} item{resultCount !== 1 ? 's' : ''} for "{value}"
      {:else if totalResults > 0}
        No gallery items match "{value}"
      {/if}
    </div>
  {/if}
</div>
