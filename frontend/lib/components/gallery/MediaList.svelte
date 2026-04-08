<script lang='ts'>
  import type { MediaItem } from '$lib/services/media-service'
  import type { SearchResult } from '$lib/services/search-service'
  import type { GallerySection } from '$lib/stores/gallery'
  import { createMediaItemFromSearch, getImageById } from '$lib/services/media-service'
  import { formatDate, formatFileSize, stripTimestampPrefix } from '$lib/stores/gallery'
  import { createEventDispatcher } from 'svelte'

  export let section: GallerySection
  export let items: MediaItem[] = []
  export let hasMore = false
  export let loading = false
  export let loadingMore = false
  export let error = ''
  export let isSearchMode = false
  export let searchResults: SearchResult[] = []

  const dispatch = createEventDispatcher<{
    open: MediaItem
    openSearchResult: SearchResult
    retry: void
    loadMore: void
  }>()

  // Cache of thumbnails loaded for search results
  const searchThumbnails = new Map<string, string>()

  function searchResultToMediaItem(result: SearchResult): MediaItem {
    return createMediaItemFromSearch(
      result.id,
      result.filename,
      result.s3Key,
      result.category,
      result.content ? result.content.substring(0, 200) : undefined,
    )
  }

  async function loadSearchThumbnail(result: SearchResult): Promise<string | undefined> {
    if (searchThumbnails.has(result.id)) {
      return searchThumbnails.get(result.id)
    }
    if (result.category === 'pictures') {
      const image = await getImageById(result.id)
      if (image?.thumbnailUrl) {
        searchThumbnails.set(result.id, image.thumbnailUrl)
        return image.thumbnailUrl
      }
    }
    return undefined
  }
</script>

{#if isSearchMode}
  {#if searchResults.length === 0}
    <div class='text-center py-12'>
      <div class='text-6xl mb-4'>🔍</div>
      <h3 class='text-xl font-semibold mb-2'>No {section} match your search</h3>
      <p class='text-base-content/60'>Try different keywords or check other tabs.</p>
    </div>
  {:else}
    <div class='grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
      {#each searchResults as result, index (result.id + index)}
        {@const mediaItem = searchResultToMediaItem(result)}
        <button
          type='button'
          class='card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer text-left p-0 border-0 w-full'
          on:click={() => dispatch('openSearchResult', result)}
        >
          <figure class='aspect-square bg-base-200 relative overflow-hidden'>
            {#if result.category === 'pictures'}
              {#await loadSearchThumbnail(result)}
                <div class='w-full h-full flex items-center justify-center text-base-content/40'>
                  <div class='loading loading-spinner'></div>
                </div>
              {:then thumbnailUrl}
                {#if thumbnailUrl}
                  <img src={thumbnailUrl} alt={mediaItem.title} class='w-full h-full object-cover' loading='lazy' />
                {:else}
                  <div class='w-full h-full flex items-center justify-center text-base-content/40'>
                    <div class='text-4xl'>📸</div>
                  </div>
                {/if}
              {/await}
            {:else if result.category === 'videos'}
              <div class='w-full h-full flex items-center justify-center text-base-content/40'>
                <div class='text-4xl'>🎥</div>
              </div>
            {:else}
              <div class='w-full h-full flex items-center justify-center text-base-content/40'>
                <div class='text-4xl'>📄</div>
              </div>
            {/if}
            <div class='absolute badge badge-sm text-white border-none right-2 top-2 bg-black/50'>
              {(result.score * 100).toFixed(0)}% match
            </div>
          </figure>
          <div class='card-body p-4'>
            <h3 class='card-title text-sm line-clamp-1'>{stripTimestampPrefix(mediaItem.title)}</h3>
            <p class='text-xs text-base-content/70 line-clamp-2'>{result.content || 'No description'}</p>
          </div>
        </button>
      {/each}
    </div>
  {/if}
{:else if loading}
  <div class='flex justify-center items-center py-12'>
    <div class='loading loading-spinner loading-lg'></div>
    <span class='ml-4 text-lg'>Loading {section}...</span>
  </div>
{:else if error}
  <div class='alert alert-error max-w-md mx-auto'>
    <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
      <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' />
    </svg>
    <div>
      <h3 class='font-bold'>Error Loading {section}</h3>
      <div class='text-xs'>{error}</div>
    </div>
    <button class='btn btn-sm' on:click={() => dispatch('retry')}>
      Retry
    </button>
  </div>
{:else if items.length === 0}
  <div class='text-center py-12'>
    <div class='text-6xl mb-4'>
      {#if section === 'pictures'}📸
      {:else if section === 'videos'}🎥
      {:else}📄{/if}
    </div>
    <h3 class='text-xl font-semibold mb-2'>No {section} found</h3>
    <p class='text-base-content/60'>Upload your first {section.slice(0, -1)} using the button above.</p>
  </div>
{:else}
  <div class='grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
    {#each items as item (item.id)}
      <button
        type='button'
        class='card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer text-left p-0 border-0 w-full'
        on:click={() => dispatch('open', item)}
      >
        <figure class='aspect-square bg-base-200 relative overflow-hidden'>
          {#if section === 'pictures'}
            {#if item.thumbnailUrl}
              <img src={item.thumbnailUrl} alt={item.title} class='w-full h-full object-cover' loading='lazy' />
            {:else}
              <img src={item.signedUrl} alt={item.title} class='w-full h-full object-cover' loading='lazy' />
            {/if}
          {:else if section === 'videos'}
            {#if item.thumbnailUrl}
              <div class='relative w-full h-full'>
                <img src={item.thumbnailUrl} alt={item.title} class='w-full h-full object-cover' loading='lazy' />
                <div class='absolute inset-0 flex items-center justify-center bg-black/20'>
                  <div class='rounded-full p-3 bg-white/90'>
                    <svg class='w-8 h-8 text-primary' fill='currentColor' viewBox='0 0 24 24'>
                      <path d='M8 5v14l11-7z' />
                    </svg>
                  </div>
                </div>
              </div>
            {:else}
              <div class='w-full h-full flex items-center justify-center text-base-content/40'>
                <div class='text-center'>
                  <div class='text-4xl mb-2'>🎥</div>
                  <div class='text-sm'>Video</div>
                </div>
              </div>
            {/if}
          {:else}
            <div class='w-full h-full flex items-center justify-center text-base-content/40'>
              <div class='text-center'>
                <div class='text-4xl mb-2'>
                  {#if item.contentType.includes('pdf')}📄
                  {:else if item.contentType.includes('word')}📝
                  {:else if item.contentType.includes('text')}📃
                  {:else}📄{/if}
                </div>
                <div class='text-sm'>{item.contentType.split('/')[1]?.toUpperCase() || 'DOC'}</div>
              </div>
            </div>
          {/if}

          {#if item.fileSize}
            <div class='absolute badge badge-sm text-white border-none right-2 top-2 bg-black/50'>
              {formatFileSize(item.fileSize)}
            </div>
          {/if}
        </figure>

        <div class='card-body p-4'>
          <h3 class='card-title text-sm line-clamp-2'>{stripTimestampPrefix(item.title)}</h3>
          {#if item.description}
            <p class='text-xs text-base-content/70 line-clamp-2'>{item.description}</p>
          {/if}
          <div class='text-xs text-base-content/60 mt-2'>
            {formatDate(item.uploadDate)}
          </div>
        </div>
      </button>
    {/each}
  </div>

  {#if hasMore}
    <div class='text-center mt-6'>
      <button
        class='btn btn-outline'
        class:loading={loadingMore}
        disabled={loadingMore}
        on:click={() => dispatch('loadMore')}
      >
        {#if loadingMore}
          Loading...
        {:else}
          Load More
        {/if}
      </button>
    </div>
  {/if}
{/if}
