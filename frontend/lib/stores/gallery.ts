// Gallery shared state, types, and helpers.
//
// The gallery page decomposes into focused subcomponents under
// lib/components/gallery/. This module owns:
// 1. Pure formatting/section helpers
// 2. Writable stores backing gallery UI state
// 3. Action functions that mutate those stores (loadMediaItems, performUpload,
//    performSearch, modal navigation). The page becomes a thin layout that
//    binds stores to subcomponents and dispatches actions.

import type { MediaItem } from '$lib/services/media-service'
import type { SearchResult } from '$lib/services/search-service'
import { createMediaItemFromSearch, getImageById, getMediaItems, getPresignedUrlForKey, invalidateMediaCache, resolveSignedUrl } from '$lib/services/media-service'
import { uploadToRagstack } from '$lib/services/ragstack-upload-service'
import { filterResultsByCategory, searchKnowledgeBase } from '$lib/services/search-service'
import { writable } from 'svelte/store'

export type GallerySection = 'pictures' | 'videos' | 'documents'

// --- formatting helpers ---

export function formatFileSize(bytes: number): string {
  if (bytes === 0)
    return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function stripTimestampPrefix(filename: string): string {
  const match = filename.match(/^\d+-(.+)$/)
  return match ? match[1] : filename
}

export function sectionForFile(file: File): GallerySection {
  if (file.type.startsWith('image/')) {
    return 'pictures'
  }
  if (file.type.startsWith('video/') || /\.(?:mp4|webm|mov|avi|mkv)$/i.test(file.name)) {
    return 'videos'
  }
  return 'documents'
}

export function searchResultToMediaItem(result: SearchResult): MediaItem {
  return createMediaItemFromSearch(
    result.id,
    result.filename,
    result.s3Key,
    result.category,
    result.content ? result.content.substring(0, 200) : undefined,
  )
}

// --- stores ---

export const selectedSection = writable<GallerySection>('pictures')
export const mediaItems = writable<MediaItem[]>([])
export const hasMore = writable(false)
export const loading = writable(false)
export const loadingMore = writable(false)
export const error = writable('')

export const selectedItem = writable<MediaItem | null>(null)
export const showModal = writable(false)

export const uploading = writable(false)
export const uploadError = writable('')
export const uploadSuccess = writable('')

export const searchQuery = writable('')
export const searchResults = writable<SearchResult[]>([])
export const isSearching = writable(false)
export const searchError = writable('')
export const isSearchMode = writable(false)

const pendingRefreshTimeouts = new Set<ReturnType<typeof setTimeout>>()
let allMediaItemsLoaded = false

// --- store helpers ---

function get<T>(store: { subscribe: (run: (v: T) => void) => () => void }): T {
  let value: T
  store.subscribe((v) => {
    value = v
  })()

  return value!
}

// --- actions ---

export function clearPendingRefreshTimeouts(): void {
  for (const id of pendingRefreshTimeouts) {
    clearTimeout(id)
  }
  pendingRefreshTimeouts.clear()
}

export async function loadMediaItems(section: GallerySection, loadMore = false): Promise<void> {
  if (loadMore) {
    loadingMore.set(true)
  }
  else if (get(mediaItems).length === 0) {
    loading.set(true)
  }
  error.set('')

  try {
    const pageData = await getMediaItems(section, loadMore, {
      onFreshData: (freshPage) => {
        mediaItems.set(freshPage.items)
        hasMore.set(freshPage.hasMore)
      },
    })
    mediaItems.set(pageData.items)
    hasMore.set(pageData.hasMore)
  }
  catch (err) {
    error.set(err instanceof Error ? err.message : `Failed to load ${section}`)
    if (!loadMore)
      mediaItems.set([])
  }
  finally {
    loading.set(false)
    loadingMore.set(false)
  }
}

export async function performUpload(file: File, caption?: string, shouldExtractText = false): Promise<void> {
  uploading.set(true)
  uploadError.set('')
  uploadSuccess.set('')

  const targetSection = sectionForFile(file)

  try {
    await uploadToRagstack(file, caption, shouldExtractText)
    uploadSuccess.set(`"${file.name}" uploaded successfully`)

    if (get(selectedSection) !== targetSection) {
      selectedSection.set(targetSection)
    }

    allMediaItemsLoaded = false
    invalidateMediaCache()
    await loadMediaItems(targetSection)

    const delays = [5000, 15000, 30000]
    for (const delay of delays) {
      const timerId = setTimeout(async () => {
        pendingRefreshTimeouts.delete(timerId)
        try {
          invalidateMediaCache()
          await loadMediaItems(get(selectedSection))
        }
        catch (err) {
          console.warn('Background refresh failed', { err, section: get(selectedSection) })
        }
      }, delay)
      pendingRefreshTimeouts.add(timerId)
    }

    setTimeout(() => {
      uploadSuccess.set('')
    }, 5000)
  }
  catch (err) {
    uploadError.set(err instanceof Error ? err.message : 'Upload failed')
  }
  finally {
    uploading.set(false)
  }
}

async function loadAllMediaItems(): Promise<void> {
  if (allMediaItemsLoaded)
    return
  try {
    await Promise.all([
      getMediaItems('pictures'),
      getMediaItems('videos'),
      getMediaItems('documents'),
    ])
    allMediaItemsLoaded = true
  }
  catch {
    // Media items load for search failed
  }
}

export async function performSearch(query: string): Promise<void> {
  if (!query.trim()) {
    clearSearch()
    return
  }
  isSearching.set(true)
  searchError.set('')
  isSearchMode.set(true)
  try {
    await loadAllMediaItems()
    const response = await searchKnowledgeBase(query, 50)
    searchResults.set(response.results)
  }
  catch (err) {
    searchError.set(err instanceof Error ? err.message : 'Search failed')
    searchResults.set([])
  }
  finally {
    isSearching.set(false)
  }
}

export function clearSearch(): void {
  searchQuery.set('')
  searchResults.set([])
  isSearchMode.set(false)
  searchError.set('')
}

export async function openMediaItem(item: MediaItem): Promise<void> {
  selectedItem.set(item)
  showModal.set(true)

  if (!item.signedUrl && (item.category === 'videos' || item.category === 'documents')) {
    try {
      const url = await resolveSignedUrl(item)
      item.signedUrl = url
      selectedItem.set({ ...item })
    }
    catch {
      // Signed URL resolution failed
    }
  }
}

export async function openSearchResultItem(result: SearchResult): Promise<void> {
  const item = searchResultToMediaItem(result)
  selectedItem.set(item)
  showModal.set(true)

  try {
    if (result.category === 'pictures') {
      const image = await getImageById(result.id)
      if (image?.thumbnailUrl) {
        item.signedUrl = image.thumbnailUrl
        item.thumbnailUrl = image.thumbnailUrl
        selectedItem.set({ ...item })
      }
    }
    else {
      const url = await getPresignedUrlForKey(result.s3Key)
      item.signedUrl = url
      selectedItem.set({ ...item })
    }
  }
  catch {
    // URL resolution for search result failed
  }
}

export function closeModal(): void {
  selectedItem.set(null)
  showModal.set(false)
}

export function getFilteredSearchResults(): SearchResult[] {
  const all = get(searchResults)
  const seen = new Set<string>()
  const deduped = all.filter((r) => {
    if (seen.has(r.id))
      return false
    seen.add(r.id)
    return true
  })
  return get(isSearchMode) ? filterResultsByCategory(deduped, get(selectedSection)) : []
}

export async function navigateModal(direction: 'prev' | 'next'): Promise<void> {
  const current = get(selectedItem)
  if (!current)
    return

  let items: MediaItem[]
  let filtered: SearchResult[] = []
  if (get(isSearchMode)) {
    filtered = getFilteredSearchResults()
    items = filtered.map(r => searchResultToMediaItem(r))
  }
  else {
    items = get(mediaItems)
  }
  if (items.length === 0)
    return

  const currentIndex = items.findIndex(i => i.id === current.id)
  if (currentIndex === -1)
    return

  const newIndex = direction === 'prev'
    ? (currentIndex === 0 ? items.length - 1 : currentIndex - 1)
    : (currentIndex === items.length - 1 ? 0 : currentIndex + 1)

  const newItem = items[newIndex]
  selectedItem.set(newItem)

  if (get(isSearchMode) && !newItem.signedUrl) {
    const result = filtered[newIndex]
    if (result) {
      try {
        if (result.category === 'pictures') {
          const image = await getImageById(result.id)
          if (image?.thumbnailUrl) {
            newItem.signedUrl = image.thumbnailUrl
            newItem.thumbnailUrl = image.thumbnailUrl
            selectedItem.set({ ...newItem })
          }
        }
        else {
          const url = await getPresignedUrlForKey(result.s3Key)
          newItem.signedUrl = url
          selectedItem.set({ ...newItem })
        }
      }
      catch {
        // URL resolution for navigated item failed
      }
    }
  }
}
