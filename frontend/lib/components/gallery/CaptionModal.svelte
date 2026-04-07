<script lang='ts'>
  import { createEventDispatcher, onDestroy } from 'svelte'

  export let file: File
  export let caption = ''
  export let extractText = false

  const dispatch = createEventDispatcher<{
    cancel: void
    submit: { caption: string, extractText: boolean }
  }>()

  let previewUrl: string | null = null

  // Own the preview URL lifecycle for the pending upload file.
  $: {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      previewUrl = null
    }
    if (file && file.type.startsWith('image/')) {
      previewUrl = URL.createObjectURL(file)
    }
  }

  onDestroy(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
  })

  function cancel() {
    dispatch('cancel')
  }

  function submit() {
    dispatch('submit', { caption, extractText })
  }
</script>

<div class='modal modal-open'>
  <div class='modal-box'>
    <h3 class='font-bold text-lg mb-4'>Add a Caption</h3>

    <div class='mb-4'>
      <p class='text-sm text-base-content/70 mb-2'>
        File: {file.name}
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
        bind:value={caption}
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
      <button class='btn' on:click={cancel}>Cancel</button>
      <button class='btn btn-primary' on:click={submit}>
        Upload
      </button>
    </div>
  </div>
</div>
