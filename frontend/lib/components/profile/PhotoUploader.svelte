<script lang='ts'>
  import { createEventDispatcher } from 'svelte'

  export let previewUrl = ''
  export let displayName = ''
  export let photoFile: File | null = null
  export let disabled = false

  let uploadError = ''

  const dispatch = createEventDispatcher<{
    fileSelected: File
    fileCleared: void
  }>()

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file)
      return

    const validTypes = ['image/jpeg', 'image/png', 'image/gif']
    if (!validTypes.includes(file.type)) {
      uploadError = 'Invalid file type. Please use JPG, PNG, or GIF.'
      return
    }
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      uploadError = 'File too large. Maximum size is 5MB.'
      return
    }

    uploadError = ''
    photoFile = file
    const reader = new FileReader()
    reader.onload = (e) => {
      previewUrl = e.target?.result as string
    }
    reader.readAsDataURL(file)
    dispatch('fileSelected', file)
  }

  function removePhoto() {
    photoFile = null
    uploadError = ''
    const fileInput = document.getElementById('photo-input') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
    dispatch('fileCleared')
  }
</script>

<div class='form-control'>
  <label class='label' for='photo-input'>
    <span class='label-text font-semibold'>Profile Photo</span>
  </label>
  <div class='flex items-center gap-4'>
    <div class='avatar'>
      {#if previewUrl}
        <div class='w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2'>
          <img src={previewUrl} alt='Preview' />
        </div>
      {:else}
        <div class='placeholder'>
          <div class='bg-neutral text-neutral-content rounded-full w-24'>
            <span class='text-3xl'>{(displayName ?? '').charAt(0).toUpperCase() || 'U'}</span>
          </div>
        </div>
      {/if}
    </div>

    <div class='flex-1'>
      <input
        id='photo-input'
        type='file'
        accept='image/jpeg,image/png,image/gif'
        class='w-full max-w-xs file-input file-input-bordered file-input-sm'
        on:change={handleFileSelect}
        {disabled}
      />
      {#if photoFile}
        <button
          type='button'
          class='btn btn-ghost btn-sm mt-2'
          on:click={removePhoto}
          {disabled}
        >
          Remove
        </button>
      {/if}
      {#if uploadError}
        <p class='text-error text-xs mt-1'>{uploadError}</p>
      {:else}
        <p class='text-xs text-base-content/60 mt-1'>JPG, PNG, or GIF (max 5MB)</p>
      {/if}
    </div>
  </div>
</div>
