<script lang='ts'>
  import type { MediaItem } from '$lib/services/media-service'
  import type { GallerySection } from '$lib/stores/gallery'
  import CommentSection from '$lib/components/comments/CommentSection.svelte'
  import { formatDate, formatFileSize, stripTimestampPrefix } from '$lib/stores/gallery'
  import { createEventDispatcher } from 'svelte'

  export let item: MediaItem
  export let section: GallerySection
  export let canNavigate = false

  const dispatch = createEventDispatcher<{
    close: void
    navigate: 'prev' | 'next'
  }>()

  function close() {
    dispatch('close')
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class='modal modal-open' on:click|self={close}>
  <div class='modal-box max-w-5xl w-[85vw] max-h-[90vh] overflow-y-auto relative'>
    {#if canNavigate}
      <button
        class='btn btn-circle btn-sm md:btn-lg bg-base-200/80 hover:bg-base-200 border-base-300 absolute left-1 md:left-4 top-1/3 z-10'
        on:click|stopPropagation={() => dispatch('navigate', 'prev')}
        aria-label='Previous item'
      >
        <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 md:h-6 md:w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M15 19l-7-7 7-7' />
        </svg>
      </button>
      <button
        class='btn btn-circle btn-sm md:btn-lg bg-base-200/80 hover:bg-base-200 border-base-300 absolute right-1 md:right-4 top-1/3 z-10'
        on:click|stopPropagation={() => dispatch('navigate', 'next')}
        aria-label='Next item'
      >
        <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 md:h-6 md:w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M9 5l7 7-7 7' />
        </svg>
      </button>
    {/if}

    <div class='flex justify-between items-start mb-4'>
      <div>
        <h3 class='font-bold text-lg'>{stripTimestampPrefix(item.title)}</h3>
        <p class='text-sm text-base-content/70'>{stripTimestampPrefix(item.filename)}</p>
      </div>
      <button class='btn btn-sm btn-circle btn-ghost' on:click={close}>✕</button>
    </div>

    <div class='mb-4'>
      {#if section === 'pictures'}
        <img src={item.signedUrl} alt={item.title} class='w-full object-contain rounded-lg max-h-[50vh]' loading='lazy' />
      {:else if section === 'videos'}
        {#key item.id}
          <video controls class='w-full max-h-[50vh] rounded-lg'>
            <source src={item.signedUrl} type={item.contentType}>
            Your browser does not support the video tag.
          </video>
        {/key}
      {:else}
        <div class='bg-base-200 rounded-lg p-8 text-center'>
          <div class='text-6xl mb-4'>
            {#if item.contentType.includes('pdf')}📄
            {:else if item.contentType.includes('word')}📝
            {:else if item.contentType.includes('text')}📃
            {:else}📄{/if}
          </div>
          <p class='text-lg font-semibold mb-2'>{item.title}</p>
          <p class='text-sm text-base-content/70 mb-4'>
            {item.contentType}{#if item.fileSize} • {formatFileSize(item.fileSize)}{/if}
          </p>
          <a href={item.signedUrl} target='_blank' class='btn btn-primary'>
            Download & View
          </a>
        </div>
      {/if}
    </div>

    {#if item.description}
      <div class='mb-4'>
        <h4 class='font-semibold mb-2'>Description</h4>
        <p class='text-sm text-base-content/80'>{item.description}</p>
      </div>
    {/if}

    <div class='grid gap-4 text-sm mb-4 grid-cols-2'>
      <div>
        <span class='font-semibold'>Upload Date:</span>
        <span class='text-base-content/70'>{formatDate(item.uploadDate)}</span>
      </div>
      {#if item.fileSize}
        <div>
          <span class='font-semibold'>File Size:</span>
          <span class='text-base-content/70'>{formatFileSize(item.fileSize)}</span>
        </div>
      {/if}
    </div>

    {#key item.id}
      <CommentSection
        itemId={item.id}
        itemType='media'
        itemTitle={item.title}
      />
    {/key}

    <div class='modal-action'>
      <button class='btn' on:click={close}>Close</button>
      <a href={item.signedUrl} target='_blank' class='btn btn-primary'>
        {#if section === 'documents'}
          Download
        {:else}
          Open Full Size
        {/if}
      </a>
    </div>
  </div>
</div>
