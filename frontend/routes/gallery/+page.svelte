<script lang='ts'>
  import type { PageData } from './$types'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { authLoading, currentUser, isAuthenticated } from '$lib/auth/auth-store'
  import CommentSection from '$lib/components/comments/CommentSection.svelte'
  import Head from '$lib/components/head.svelte'
  import { createMediaItemFromSearch, getImageById, getMediaItems, getPresignedUrlForKey, invalidateMediaCache, type MediaItem, resetPagination, resolveSignedUrl } from '$lib/services/media-service'
  import { uploadToRagstack } from '$lib/services/ragstack-upload-service'
  import { filterResultsByCategory, searchKnowledgeBase, type SearchResult } from '$lib/services/search-service'
  import { onDestroy, onMount } from 'svelte'

  export let data: PageData

  let selectedSection: 'pictures' | 'videos' | 'documents' = 'pictures'
  let mediaItems: MediaItem[] = []
  let hasMore = false
  let loadingMore = false
  let loading = false
  let error = ''
  let selectedItem: MediaItem | null = null
  let showModal = false
  let uploading = false
  let uploadError = ''
  let uploadSuccess = ''

  // Caption modal state
  let showCaptionModal = false
  let pendingUploadFile: File | null = null
  let userCaption = ''
  let extractText = false
  let previewUrl: string | null = null

  // Create/revoke preview URL when pendingUploadFile changes
  $: {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      previewUrl = null
    }
    if (pendingUploadFile && pendingUploadFile.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(pendingUploadFile)
    }
  }

  // Cleanup preview URL on component destroy
  onDestroy(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
  })

  // Search state
  let searchQuery = ''
  let searchResults: SearchResult[] = []
  let isSearching = false
  let searchError = ''
  let isSearchMode = false

  // All media items cache for search matching
  const allMediaItems: Map<string, MediaItem> = new Map()
  let mediaItemsLoaded = false

  // Load media items for the selected section
  async function loadMediaItems(section: 'pictures' | 'videos' | 'documents', loadMore = false) {
    if (loadMore) {
      loadingMore = true
    }
    else {
      loading = true
      resetPagination()
    }
    error = ''

    try {
      const page = await getMediaItems(section, loadMore)
      mediaItems = page.items
      hasMore = page.hasMore

      // Check for item query param to auto-open
      if (!loadMore)
        checkForItemParam()
    }
    catch (err) {
      console.error(`Error loading ${section}:`, err)
      error = err instanceof Error ? err.message : `Failed to load ${section}`
      if (!loadMore)
        mediaItems = []
    }
    finally {
      loading = false
      loadingMore = false
    }
  }

  // Check URL for item param and open modal if found
  function checkForItemParam() {
    const itemParam = $page.url.searchParams.get('item')
    if (!itemParam)
      return

    // Determine section from itemId (e.g., "media/pictures/..." -> "pictures")
    const match = itemParam.match(/^media\/(pictures|videos|documents)\//)
    if (match) {
      const section = match[1] as 'pictures' | 'videos' | 'documents'
      if (section !== selectedSection) {
        selectedSection = section
        loadMediaItems(section)
        return
      }
    }

    // Find and open the item
    const item = mediaItems.find(m => m.id === itemParam)
    if (item) {
      openMediaItem(item)
      // Clear the query param so it doesn't reopen on section change
      goto('/gallery', { replaceState: true })
    }
  }

  // Handle file selection
  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement
    if (!input.files?.length)
      return

    const file = input.files[0]

    // Validate file size (300MB limit)
    if (file.size > 300 * 1024 * 1024) {
      uploadError = 'File size cannot exceed 300MB'
      input.value = ''
      return
    }

    // For images/videos, show caption modal
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      pendingUploadFile = file
      userCaption = ''
      extractText = false
      showCaptionModal = true
      input.value = ''
    }
    else {
      // Documents upload directly
      performUpload(file)
      input.value = ''
    }
  }

  // Close caption modal
  function closeCaptionModal() {
    showCaptionModal = false
    pendingUploadFile = null
    userCaption = ''
  }

  // Submit upload with caption
  async function submitWithCaption() {
    if (!pendingUploadFile)
      return
    showCaptionModal = false
    await performUpload(pendingUploadFile, userCaption, extractText)
    pendingUploadFile = null
    userCaption = ''
    extractText = false
  }

  // Perform the actual upload
  async function performUpload(file: File, caption?: string, shouldExtractText = false) {
    uploading = true
    uploadError = ''
    uploadSuccess = ''

    try {
      // Upload to RAGStack (handles indexing and storage)
      await uploadToRagstack(file, caption, shouldExtractText)

      // Show success message immediately
      uploadSuccess = `"${file.name}" uploaded successfully`

      // Clear media items cache so next search will reload
      mediaItemsLoaded = false
      allMediaItems.clear()
      invalidateMediaCache()

      // Silently poll for the new item without showing loading state
      // RAGStack processes asynchronously, so the item may not appear immediately
      const maxAttempts = 3
      const pollDelay = 1500
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, pollDelay))
        }
        try {
          resetPagination()
          const page = await getMediaItems(selectedSection, false, { bypassCache: true })
          // Update items silently (no loading state)
          mediaItems = page.items
          hasMore = page.hasMore
        }
        catch (err) {
          console.error('Error refreshing media after upload:', err)
        }
      }

      // Auto-clear success message after 5 seconds
      setTimeout(() => {
        uploadSuccess = ''
      }, 5000)
    }
    catch (err) {
      console.error('Upload error:', err)
      uploadError = err instanceof Error ? err.message : 'Upload failed'
    }
    finally {
      uploading = false
    }
  }

  // Handle section change
  function changeSection(section: 'pictures' | 'videos' | 'documents') {
    selectedSection = section
    loadMediaItems(section)
  }

  // Open media item in modal, resolving signed URL if needed
  async function openMediaItem(item: MediaItem) {
    selectedItem = item
    showModal = true

    // Videos and documents need a presigned URL resolved via the backend
    if (!item.signedUrl && (item.category === 'videos' || item.category === 'documents')) {
      try {
        const url = await resolveSignedUrl(item)
        item.signedUrl = url
        selectedItem = { ...item }
      }
      catch (err) {
        console.error('Failed to resolve signed URL:', err)
      }
    }
  }

  // Open a search result item in modal
  async function openSearchResultItem(result: SearchResult) {
    const item = searchResultToMediaItem(result)
    selectedItem = item
    showModal = true

    // Get the proper URL for this item
    try {
      if (result.category === 'pictures') {
        const image = await getImageById(result.id)
        if (image?.thumbnailUrl) {
          item.signedUrl = image.thumbnailUrl
          item.thumbnailUrl = image.thumbnailUrl
          selectedItem = { ...item }
        }
      }
      else {
        // Videos and documents need presigned URL from backend
        const url = await getPresignedUrlForKey(result.s3Key)
        item.signedUrl = url
        selectedItem = { ...item }
      }
    }
    catch (err) {
      console.error('Failed to resolve URL for search result:', err)
    }
  }

  // Close modal
  function closeModal() {
    selectedItem = null
    showModal = false
  }

  // Get current items list (search results or regular media items)
  function getCurrentItemsList(): MediaItem[] {
    if (isSearchMode) {
      return filteredSearchResults
        .map(r => searchResultToMediaItem(r))
        .filter((item): item is MediaItem => item !== undefined)
    }
    return mediaItems
  }

  // Navigate to previous/next item in modal (infinite loop)
  async function navigateModal(direction: 'prev' | 'next') {
    if (!selectedItem)
      return
    const items = getCurrentItemsList()
    if (items.length === 0)
      return
    const currentIndex = items.findIndex(item => item.id === selectedItem?.id)
    if (currentIndex === -1)
      return

    let newIndex: number
    if (direction === 'prev') {
      newIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1
    }
    else {
      newIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1
    }

    const newItem = items[newIndex]
    selectedItem = newItem

    // In search mode, we need to fetch the signed URL for the new item
    if (isSearchMode && !newItem.signedUrl) {
      const result = filteredSearchResults[newIndex]
      if (result) {
        try {
          if (result.category === 'pictures') {
            const image = await getImageById(result.id)
            if (image?.thumbnailUrl) {
              newItem.signedUrl = image.thumbnailUrl
              newItem.thumbnailUrl = image.thumbnailUrl
              selectedItem = { ...newItem }
            }
          }
          else {
            const url = await getPresignedUrlForKey(result.s3Key)
            newItem.signedUrl = url
            selectedItem = { ...newItem }
          }
        }
        catch (err) {
          console.error('Failed to resolve URL for navigated item:', err)
        }
      }
    }
  }

  // Check if navigation is possible (always true if more than 1 item)
  $: canNavigate = (() => {
    if (!selectedItem)
      return false
    const items = getCurrentItemsList()
    return items.length > 1
  })()

  // Handle keyboard navigation in modal
  function handleKeydown(event: KeyboardEvent) {
    if (!showModal)
      return
    if (event.key === 'ArrowLeft') {
      navigateModal('prev')
    }
    else if (event.key === 'ArrowRight') {
      navigateModal('next')
    }
    else if (event.key === 'Escape') {
      closeModal()
    }
  }

  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0)
      return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }

  // Format date
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Strip timestamp prefix from filename (e.g., "1766429419834-resume.pdf" → "resume.pdf")
  function stripTimestampPrefix(filename: string): string {
    const match = filename.match(/^\d+-(.+)$/)
    return match ? match[1] : filename
  }

  // Load all media items into cache for search matching
  async function loadAllMediaItems() {
    if (mediaItemsLoaded)
return

    try {
      const [picturesPage, videosPage, documentsPage] = await Promise.all([
        getMediaItems('pictures'),
        getMediaItems('videos'),
        getMediaItems('documents'),
      ])

      // Index by filename without timestamp prefix (lowercase for case-insensitive matching)
      const all = [...picturesPage.items, ...videosPage.items, ...documentsPage.items]
      for (const item of all) {
        const normalizedFilename = stripTimestampPrefix(item.filename).toLowerCase()
        allMediaItems.set(normalizedFilename, item)
      }
      mediaItemsLoaded = true
    }
 catch (err) {
      console.error('Failed to load media items for search:', err)
    }
  }

  // Cache of thumbnails loaded for search results
  const searchThumbnails = new Map<string, string>()

  // Create a MediaItem directly from a search result
  function searchResultToMediaItem(result: SearchResult): MediaItem {
    return createMediaItemFromSearch(
      result.id,
      result.filename,
      result.s3Key,
      result.category,
      result.content ? result.content.substring(0, 200) : undefined,
    )
  }

  // Load thumbnail URL for a search result image
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

  // Search functions
  async function performSearch(query: string) {
    if (!query.trim()) {
      clearSearch()
      return
    }

    isSearching = true
    searchError = ''
    isSearchMode = true

    try {
      // Load all media items first for matching
      await loadAllMediaItems()

      const response = await searchKnowledgeBase(query, 50)
      searchResults = response.results
    }
 catch (err) {
      console.error('Search error:', err)
      searchError = err instanceof Error ? err.message : 'Search failed'
      searchResults = []
    }
 finally {
      isSearching = false
    }
  }

  function handleSearchInput(event: Event) {
    const target = event.target as HTMLInputElement
    searchQuery = target.value

    if (!searchQuery.trim()) {
      clearSearch()
    }
  }

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && searchQuery.trim()) {
      performSearch(searchQuery)
    }
  }

  function clearSearch() {
    searchQuery = ''
    searchResults = []
    isSearchMode = false
    searchError = ''
  }

  // Deduplicate search results by ID
  $: deduplicatedSearchResults = (() => {
    const seen = new Set<string>()
    return searchResults.filter((r) => {
      if (seen.has(r.id))
        return false
      seen.add(r.id)
      return true
    })
  })()

  $: filteredSearchResults = isSearchMode
    ? filterResultsByCategory(deduplicatedSearchResults, selectedSection)
    : []

  $: searchCounts = {
    pictures: filterResultsByCategory(deduplicatedSearchResults, 'pictures').length,
    videos: filterResultsByCategory(deduplicatedSearchResults, 'videos').length,
    documents: filterResultsByCategory(deduplicatedSearchResults, 'documents').length,
  }

  // Load initial data
  onMount(() => {
    if (browser) {
      // If Cognito is not configured, show content in development mode
      if (!data.cognitoConfigured) {
        console.warn('⚠️  Cognito not configured - running in development mode')
        // In development mode, still try to load media but handle auth errors gracefully
        loadMediaItems(selectedSection).catch((err) => {
          console.warn('Failed to load media in development mode:', err)
          error = 'Gallery requires authentication to be configured'
        })
        return
      }

      // Cognito is configured - check authentication and approval
      const unsubscribe = isAuthenticated.subscribe((authenticated) => {
        if (!$authLoading && !authenticated) {
          goto('/auth/login')
          return
        }

        // Check if user is authenticated and approved
        if (authenticated) {
          // Check user's groups from the auth store
          const userUnsubscribe = currentUser.subscribe((user) => {
            if (user) {
              const isApproved = user['cognito:groups']?.includes('ApprovedUsers') || false

              if (!isApproved) {
                // User is authenticated but not approved
                goto('/auth/pending-approval')
                return
              }

              // User is approved - load gallery content
              loadMediaItems(selectedSection)
            }
          })

          return userUnsubscribe
        }
      })

      return unsubscribe
    }
  })
</script>

<Head />

<svelte:window on:keydown={handleKeydown} />

<svelte:head>
  <title>Gallery - Family Archive</title>
  <meta name='description' content='Explore our collection of preserved family letters, memories, and historical correspondence.' />
</svelte:head>

<div class='container mx-auto px-4 py-8'>
  <!-- Development Mode Banner -->
  {#if data.developmentMode}
    <div class='alert alert-warning mb-8'>
      <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z' />
      </svg>
      <div>
        <h3 class='font-bold'>Development Mode</h3>
        <div class='text-sm'>Gallery is in development mode. Authentication not configured. Visit <a href='/auth-status' class='link'>auth status</a> for setup instructions.</div>
      </div>
    </div>
  {/if}

  <div class='text-center mb-8'>
    <h1 class='text-4xl font-bold mb-4'>Family Gallery</h1>
  </div>

  <!-- Search Box -->
  <div class='max-w-2xl mx-auto mb-8'>
    <div class='relative'>
      <input
        type='text'
        placeholder='Search photos, videos, and documents...'
        class='input input-bordered w-full pl-12 pr-12 text-lg'
        value={searchQuery}
        on:input={handleSearchInput}
        on:keydown={handleSearchKeydown}
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
      {#if searchQuery}
        <button
          class='absolute inset-y-0 right-0 flex items-center pr-4 text-base-content/50 hover:text-base-content'
          on:click={clearSearch}
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
        {#if deduplicatedSearchResults.length > 0}
          Found {deduplicatedSearchResults.length} item{deduplicatedSearchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
        {:else if searchResults.length > 0}
          No gallery items match "{searchQuery}"
        {/if}
      </div>
    {/if}
  </div>

  <!-- Upload Section -->
  <div class='mb-8 text-center'>
    <input
      type='file'
      id='fileUpload'
      class='hidden'
      on:change={handleFileSelect}
      accept={selectedSection === 'pictures'
        ? 'image/*'
        : selectedSection === 'videos'
        ? 'video/*'
        : '.pdf,.doc,.docx,.txt'}
    />
    <label
      for='fileUpload'
      class='btn btn-primary'
      class:loading={uploading}
      class:disabled={uploading}
    >
      {uploading ? 'Uploading...' : `Upload ${selectedSection.slice(0, -1)}`}
    </label>

    {#if uploadError}
      <div class='alert alert-error mt-4'>
        <span>{uploadError}</span>
      </div>
    {/if}
    {#if uploadSuccess}
      <div class='alert alert-success mt-4'>
        <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' />
        </svg>
        <span>{uploadSuccess}</span>
      </div>
    {/if}
  </div>

  <!-- Section Tabs -->
  <div class='flex justify-center mb-8'>
    <div class='tabs tabs-boxed'>
      <button
        class='tab tab-lg gap-2'
        class:tab-active={selectedSection === 'pictures'}
        on:click={() => changeSection('pictures')}
      >
        📸 Pictures
        {#if isSearchMode}
          <span class='badge badge-sm' class:badge-primary={searchCounts.pictures > 0}>{searchCounts.pictures}</span>
        {/if}
      </button>
      <button
        class='tab tab-lg gap-2'
        class:tab-active={selectedSection === 'videos'}
        on:click={() => changeSection('videos')}
      >
        🎥 Videos
        {#if isSearchMode}
          <span class='badge badge-sm' class:badge-primary={searchCounts.videos > 0}>{searchCounts.videos}</span>
        {/if}
      </button>
      <button
        class='tab tab-lg gap-2'
        class:tab-active={selectedSection === 'documents'}
        on:click={() => changeSection('documents')}
      >
        📄 Documents
        {#if isSearchMode}
          <span class='badge badge-sm' class:badge-primary={searchCounts.documents > 0}>{searchCounts.documents}</span>
        {/if}
      </button>
    </div>
  </div>

  <!-- Search Results -->
  {#if isSearchMode}
    {#if filteredSearchResults.length === 0}
      <div class='text-center py-12'>
        <div class='text-6xl mb-4'>🔍</div>
        <h3 class='text-xl font-semibold mb-2'>No {selectedSection} match your search</h3>
        <p class='text-base-content/60'>Try different keywords or check other tabs.</p>
      </div>
    {:else}
      <div class='grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
        {#each filteredSearchResults as result, index (result.id + index)}
          {@const mediaItem = searchResultToMediaItem(result)}
          <button
            type='button'
            class='card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer text-left p-0 border-0 w-full'
            on:click={() => openSearchResultItem(result)}
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
  <!-- Loading State -->
  {:else if loading}
    <div class='flex justify-center items-center py-12'>
      <div class='loading loading-spinner loading-lg'></div>
      <span class='ml-4 text-lg'>Loading {selectedSection}...</span>
    </div>
  {:else if error}
    <!-- Error State -->
    <div class='alert alert-error max-w-md mx-auto'>
      <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' />
      </svg>
      <div>
        <h3 class='font-bold'>Error Loading {selectedSection}</h3>
        <div class='text-xs'>{error}</div>
      </div>
      <button class='btn btn-sm' on:click={() => loadMediaItems(selectedSection)}>
        Retry
      </button>
    </div>
  {:else if mediaItems.length === 0}
    <!-- Empty State -->
    <div class='text-center py-12'>
      <div class='text-6xl mb-4'>
        {#if selectedSection === 'pictures'}📸
        {:else if selectedSection === 'videos'}🎥
        {:else}📄{/if}
      </div>
      <h3 class='text-xl font-semibold mb-2'>No {selectedSection} found</h3>
      <p class='text-base-content/60'>Upload your first {selectedSection.slice(0, -1)} using the button above.</p>
    </div>
  {:else}
    <!-- Media Grid -->
    <div class='grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
      {#each mediaItems as item (item.id)}
        <button
          type='button'
          class='card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-300 cursor-pointer text-left p-0 border-0 w-full'
          on:click={() => openMediaItem(item)}
        >
          <figure class='aspect-square bg-base-200 relative overflow-hidden'>
            {#if selectedSection === 'pictures'}
              {#if item.thumbnailUrl}
                <img src={item.thumbnailUrl} alt={item.title} class='w-full h-full object-cover' loading='lazy' />
              {:else}
                <img src={item.signedUrl} alt={item.title} class='w-full h-full object-cover' loading='lazy' />
              {/if}
            {:else if selectedSection === 'videos'}
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

            <!-- File size badge -->
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
          on:click={() => loadMediaItems(selectedSection, true)}
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
</div>

<!-- Media Modal -->
{#if showModal && selectedItem}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class='modal modal-open' on:click|self={closeModal}>
    <div class='modal-box max-w-5xl w-[85vw] max-h-[90vh] overflow-y-auto relative'>
      <!-- Navigation buttons inside modal -->
      {#if canNavigate}
        <button
          class='btn btn-circle btn-sm md:btn-lg bg-base-200/80 hover:bg-base-200 border-base-300 absolute left-1 md:left-4 top-1/3 z-10'
          on:click|stopPropagation={() => navigateModal('prev')}
          aria-label='Previous item'
        >
          <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 md:h-6 md:w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 19l-7-7 7-7' />
          </svg>
        </button>
        <button
          class='btn btn-circle btn-sm md:btn-lg bg-base-200/80 hover:bg-base-200 border-base-300 absolute right-1 md:right-4 top-1/3 z-10'
          on:click|stopPropagation={() => navigateModal('next')}
          aria-label='Next item'
        >
          <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 md:h-6 md:w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M9 5l7 7-7 7' />
          </svg>
        </button>
      {/if}

      <div class='flex justify-between items-start mb-4'>
        <div>
          <h3 class='font-bold text-lg'>{stripTimestampPrefix(selectedItem.title)}</h3>
          <p class='text-sm text-base-content/70'>{stripTimestampPrefix(selectedItem.filename)}</p>
        </div>
        <button class='btn btn-sm btn-circle btn-ghost' on:click={closeModal}>✕</button>
      </div>

      <div class='mb-4'>
        {#if selectedSection === 'pictures'}
          <img src={selectedItem.signedUrl} alt={selectedItem.title} class='w-full object-contain rounded-lg max-h-[50vh]' loading='lazy' />
        {:else if selectedSection === 'videos'}
          {#key selectedItem.id}
            <video controls class='w-full max-h-[50vh] rounded-lg'>
              <source src={selectedItem.signedUrl} type={selectedItem.contentType}>
              Your browser does not support the video tag.
            </video>
          {/key}
        {:else}
          <div class='bg-base-200 rounded-lg p-8 text-center'>
            <div class='text-6xl mb-4'>
              {#if selectedItem.contentType.includes('pdf')}📄
              {:else if selectedItem.contentType.includes('word')}📝
              {:else if selectedItem.contentType.includes('text')}📃
              {:else}📄{/if}
            </div>
            <p class='text-lg font-semibold mb-2'>{selectedItem.title}</p>
            <p class='text-sm text-base-content/70 mb-4'>
              {selectedItem.contentType}{#if selectedItem.fileSize} • {formatFileSize(selectedItem.fileSize)}{/if}
            </p>
            <a href={selectedItem.signedUrl} target='_blank' class='btn btn-primary'>
              Download & View
            </a>
          </div>
        {/if}
      </div>

      {#if selectedItem.description}
        <div class='mb-4'>
          <h4 class='font-semibold mb-2'>Description</h4>
          <p class='text-sm text-base-content/80'>{selectedItem.description}</p>
        </div>
      {/if}

      <div class='grid gap-4 text-sm mb-4 grid-cols-2'>
        <div>
          <span class='font-semibold'>Upload Date:</span>
          <span class='text-base-content/70'>{formatDate(selectedItem.uploadDate)}</span>
        </div>
        {#if selectedItem.fileSize}
          <div>
            <span class='font-semibold'>File Size:</span>
            <span class='text-base-content/70'>{formatFileSize(selectedItem.fileSize)}</span>
          </div>
        {/if}
      </div>

      <!-- Comments Section -->
      {#key selectedItem.id}
        <CommentSection
          itemId={selectedItem.id}
          itemType='media'
          itemTitle={selectedItem.title}
        />
      {/key}

      <div class='modal-action'>
        <button class='btn' on:click={closeModal}>Close</button>
        <a href={selectedItem.signedUrl} target='_blank' class='btn btn-primary'>
          {#if selectedSection === 'documents'}
            Download
          {:else}
            Open Full Size
          {/if}
        </a>
      </div>
    </div>
  </div>
{/if}

<!-- Caption Modal -->
{#if showCaptionModal && pendingUploadFile}
  <div class='modal modal-open'>
    <div class='modal-box'>
      <h3 class='font-bold text-lg mb-4'>Add a Caption</h3>

      <div class='mb-4'>
        <p class='text-sm text-base-content/70 mb-2'>
          File: {pendingUploadFile.name}
        </p>
        {#if previewUrl}
          <img
            src={previewUrl}
            alt='Preview'
            class='w-full max-h-48 object-contain rounded-lg bg-base-200'
          />
        {/if}
      </div>

      <div class='form-control mb-4'>
        <label class='label' for='caption-input'>
          <span class='label-text'>Caption (optional)</span>
        </label>
        <textarea
          id='caption-input'
          class='textarea textarea-bordered h-24'
          placeholder='Describe this image...'
          bind:value={userCaption}
        ></textarea>
        <label class='label'>
          <span class='label-text-alt text-base-content/60'>AI will also generate a caption automatically</span>
        </label>
      </div>

      <div class='form-control mb-4'>
        <label class='label cursor-pointer justify-start gap-3'>
          <input type='checkbox' class='checkbox checkbox-sm' bind:checked={extractText} />
          <span class='label-text'>Extract text from image (OCR)</span>
        </label>
        <label class='label pt-0'>
          <span class='label-text-alt text-base-content/60'>Enable for images containing text you want searchable</span>
        </label>
      </div>

      <div class='modal-action'>
        <button class='btn' on:click={closeCaptionModal}>Cancel</button>
        <button class='btn btn-primary' on:click={submitWithCaption}>
          Upload
        </button>
      </div>
    </div>
  </div>
{/if}
