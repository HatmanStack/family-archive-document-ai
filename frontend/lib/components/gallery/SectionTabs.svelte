<script lang='ts'>
  import type { GallerySection } from '$lib/stores/gallery'
  import { createEventDispatcher } from 'svelte'

  export let selected: GallerySection
  export let isSearchMode = false
  export let counts: { pictures: number, videos: number, documents: number } = {
    pictures: 0,
    videos: 0,
    documents: 0,
  }

  const dispatch = createEventDispatcher<{ change: GallerySection }>()

  function change(section: GallerySection) {
    dispatch('change', section)
  }
</script>

<div class='flex justify-center mb-8'>
  <div class='tabs tabs-boxed'>
    <button
      class='tab tab-lg gap-2'
      class:tab-active={selected === 'pictures'}
      on:click={() => change('pictures')}
    >
      📸 Pictures
      {#if isSearchMode}
        <span class='badge badge-sm' class:badge-primary={counts.pictures > 0}>{counts.pictures}</span>
      {/if}
    </button>
    <button
      class='tab tab-lg gap-2'
      class:tab-active={selected === 'videos'}
      on:click={() => change('videos')}
    >
      🎥 Videos
      {#if isSearchMode}
        <span class='badge badge-sm' class:badge-primary={counts.videos > 0}>{counts.videos}</span>
      {/if}
    </button>
    <button
      class='tab tab-lg gap-2'
      class:tab-active={selected === 'documents'}
      on:click={() => change('documents')}
    >
      📄 Documents
      {#if isSearchMode}
        <span class='badge badge-sm' class:badge-primary={counts.documents > 0}>{counts.documents}</span>
      {/if}
    </button>
  </div>
</div>
