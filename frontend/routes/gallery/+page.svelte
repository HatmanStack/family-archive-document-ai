<script lang='ts'>
  import type { GallerySection } from '$lib/stores/gallery'
  import type { PageData } from './$types'
  import { browser } from '$app/environment'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { authLoading, currentUser, isAuthenticated } from '$lib/auth/auth-store'
  import CaptionModal from '$lib/components/gallery/CaptionModal.svelte'
  import MediaList from '$lib/components/gallery/MediaList.svelte'
  import MediaPreview from '$lib/components/gallery/MediaPreview.svelte'
  import SearchBar from '$lib/components/gallery/SearchBar.svelte'
  import SectionTabs from '$lib/components/gallery/SectionTabs.svelte'
  import UploadModal from '$lib/components/gallery/UploadModal.svelte'
  import Head from '$lib/components/head.svelte'
  import { filterResultsByCategory } from '$lib/services/search-service'
import {
    clearPendingRefreshTimeouts,
    clearSearch,
    closeModal,
    error,

    getFilteredSearchResults,
    hasMore,
    isSearching,
    isSearchMode,
    loading,
    loadingMore,
    loadMediaItems,
    mediaItems,
    navigateModal,
    openMediaItem,
    openSearchResultItem,
    performSearch,
    performUpload,
    searchError,
    searchQuery,
    searchResults,
    selectedItem,
    selectedSection,
    showModal,
    uploadError,
    uploading,
    uploadSuccess,
  } from '$lib/stores/gallery'
  import { onDestroy, onMount } from 'svelte'

  export let data: PageData

  // Caption modal state stays page-local since it is one-shot UI for a pending file.
  let showCaptionModal = false
  let pendingUploadFile: File | null = null
  let userCaption = ''
  let extractText = false

  onDestroy(() => {
    clearPendingRefreshTimeouts()
  })

  async function checkForItemParam() {
    const itemParam = $page.url.searchParams.get('item')
    if (!itemParam)
      return
    const match = itemParam.match(/^media\/(pictures|videos|documents)\//)
    if (match) {
      const section = match[1] as GallerySection
      if (section !== $selectedSection) {
        selectedSection.set(section)
        await loadMediaItems(section)
      }
    }
    const item = $mediaItems.find(m => m.id === itemParam)
    if (item) {
      openMediaItem(item)
      goto('/gallery', { replaceState: true })
    }
  }

  function handleFileSelect(event: CustomEvent<Event>) {
    const input = event.detail.target as HTMLInputElement
    if (!input.files?.length)
      return
    const file = input.files[0]
    if (file.size > 300 * 1024 * 1024) {
      uploadError.set('File size cannot exceed 300MB')
      input.value = ''
      return
    }
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      pendingUploadFile = file
      userCaption = ''
      extractText = false
      showCaptionModal = true
      input.value = ''
    }
    else {
      performUpload(file)
      input.value = ''
    }
  }

  function closeCaptionModal() {
    showCaptionModal = false
    pendingUploadFile = null
    userCaption = ''
  }

  async function submitWithCaption(event: CustomEvent<{ caption: string, extractText: boolean }>) {
    if (!pendingUploadFile)
      return
    const file = pendingUploadFile
    const { caption, extractText: shouldExtractText } = event.detail
    showCaptionModal = false
    await performUpload(file, caption, shouldExtractText)
    pendingUploadFile = null
    userCaption = ''
    extractText = false
  }

  function changeSection(event: CustomEvent<GallerySection>) {
    selectedSection.set(event.detail)
    loadMediaItems(event.detail).then(checkForItemParam)
  }

  function handleSearchInput(event: CustomEvent<string>) {
    searchQuery.set(event.detail)
  }

  function handleSearch(event: CustomEvent<string>) {
    performSearch(event.detail)
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!$showModal)
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

  $: deduplicatedSearchResults = (() => {
    const seen = new Set<string>()
    return $searchResults.filter((r) => {
      if (seen.has(r.id))
        return false
      seen.add(r.id)
      return true
    })
  })()

  $: filteredSearchResults = $isSearchMode
    ? filterResultsByCategory(deduplicatedSearchResults, $selectedSection)
    : []

  $: searchCounts = {
    pictures: filterResultsByCategory(deduplicatedSearchResults, 'pictures').length,
    videos: filterResultsByCategory(deduplicatedSearchResults, 'videos').length,
    documents: filterResultsByCategory(deduplicatedSearchResults, 'documents').length,
  }

  $: canNavigate = $selectedItem && (
    $isSearchMode ? getFilteredSearchResults().length > 1 : $mediaItems.length > 1
  )

  onMount(() => {
    if (!browser)
      return

    if (!data.cognitoConfigured) {
      loadMediaItems($selectedSection).then(checkForItemParam).catch((err) => {
        const isAuthError = (err instanceof Error && (
          err.message.includes('401') || err.message.includes('403')
          || err.message.includes('Unauthorized') || err.message.includes('not authenticated')
        )) || Number(err?.status) === 401 || Number(err?.status) === 403
        error.set(isAuthError
          ? 'Gallery requires authentication to be configured'
          : 'Failed to load gallery, please try again')
      })
      return
    }

    let userUnsubscribe: (() => void) | undefined
    const unsubscribe = isAuthenticated.subscribe((authenticated) => {
      // Svelte ignores return values from subscribe callbacks — track the
      // inner subscription explicitly so each auth-state change replaces the
      // previous currentUser subscriber instead of leaking it.
      userUnsubscribe?.()
      userUnsubscribe = undefined
      if (!$authLoading && !authenticated) {
        goto('/auth/login')
        return
      }
      if (authenticated) {
        userUnsubscribe = currentUser.subscribe((user) => {
          if (user) {
            const isApproved = user['cognito:groups']?.includes('ApprovedUsers') || false
            if (!isApproved) {
              goto('/auth/pending-approval')
              return
            }
            loadMediaItems($selectedSection).then(checkForItemParam)
          }
        })
      }
    })
    return () => {
      userUnsubscribe?.()
      unsubscribe()
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

  <SearchBar
    value={$searchQuery}
    isSearching={$isSearching}
    searchError={$searchError}
    isSearchMode={$isSearchMode}
    resultCount={deduplicatedSearchResults.length}
    totalResults={$searchResults.length}
    on:input={handleSearchInput}
    on:search={handleSearch}
    on:clear={clearSearch}
  />

  <UploadModal
    section={$selectedSection}
    uploading={$uploading}
    uploadError={$uploadError}
    uploadSuccess={$uploadSuccess}
    on:fileSelect={handleFileSelect}
  />

  <SectionTabs
    selected={$selectedSection}
    isSearchMode={$isSearchMode}
    counts={searchCounts}
    on:change={changeSection}
  />

  <MediaList
    section={$selectedSection}
    items={$mediaItems}
    hasMore={$hasMore}
    loading={$loading}
    loadingMore={$loadingMore}
    error={$error}
    isSearchMode={$isSearchMode}
    searchResults={filteredSearchResults}
    on:open={e => openMediaItem(e.detail)}
    on:openSearchResult={e => openSearchResultItem(e.detail)}
    on:retry={() => loadMediaItems($selectedSection)}
    on:loadMore={() => loadMediaItems($selectedSection, true)}
  />
</div>

{#if $showModal && $selectedItem}
  <MediaPreview
    item={$selectedItem}
    section={$selectedSection}
    canNavigate={!!canNavigate}
    on:close={closeModal}
    on:navigate={e => navigateModal(e.detail)}
  />
{/if}

{#if showCaptionModal && pendingUploadFile}
  <CaptionModal
    file={pendingUploadFile}
    bind:caption={userCaption}
    bind:extractText
    on:cancel={closeCaptionModal}
    on:submit={submitWithCaption}
  />
{/if}
