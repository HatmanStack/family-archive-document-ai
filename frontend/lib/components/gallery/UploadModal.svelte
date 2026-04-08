<script lang='ts'>
  import type { GallerySection } from '$lib/stores/gallery'
  import { createEventDispatcher } from 'svelte'

  export let section: GallerySection
  export let uploading = false
  export let uploadError = ''
  export let uploadSuccess = ''

  const dispatch = createEventDispatcher<{ fileSelect: Event }>()

  function handleFileSelect(event: Event) {
    dispatch('fileSelect', event)
  }

  $: accept = section === 'pictures'
    ? 'image/*'
    : section === 'videos'
      ? 'video/*'
      : '.pdf,.doc,.docx,.txt'
</script>

<div class='mb-8 text-center'>
  <input
    type='file'
    id='fileUpload'
    class='hidden'
    on:change={handleFileSelect}
    {accept}
  />
  <label
    for='fileUpload'
    class='btn btn-primary'
    class:loading={uploading}
    class:disabled={uploading}
  >
    {uploading ? 'Uploading...' : `Upload ${section.slice(0, -1)}`}
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
