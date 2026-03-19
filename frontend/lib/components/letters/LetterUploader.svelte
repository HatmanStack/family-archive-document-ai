<script lang='ts'>
  import type { FileUploadState } from '$lib/services/letter-upload-service'
  import { goto } from '$app/navigation'
  import { getDraft } from '$lib/services/draft-service'
import {

    formatFileSize,
    LETTER_FILE_TYPES,
    uploadLetterFiles,
    validateLetterFile,
  } from '$lib/services/letter-upload-service'
  import { createEventDispatcher } from 'svelte'

  export let authToken: string

  const dispatch = createEventDispatcher<{
    uploadStart: { files: File[] }
    uploadComplete: { uploadId: string }
    uploadError: { error: string }
  }>()

  // State
  let fileInput: HTMLInputElement
  let dragActive = false
  let uploading = false
  let processing = false
  let selectedFiles: File[] = []
  let uploadStates: FileUploadState[] = []
  let errorMessage = ''
  let successMessage = ''

  $: acceptString = LETTER_FILE_TYPES.extensions.map(ext => `.${ext}`).join(',')
  $: totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0)

  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement
    if (target.files) {
      addFiles(Array.from(target.files))
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    dragActive = false
    if (event.dataTransfer?.files) {
      addFiles(Array.from(event.dataTransfer.files))
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    dragActive = true
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault()
    dragActive = false
  }

  function addFiles(files: File[]) {
    errorMessage = ''

    // Validate and add files
    const validFiles: File[] = []
    const errors: string[] = []

    for (const file of files) {
      const validation = validateLetterFile(file)
      if (!validation.valid) {
        errors.push(`${file.name}: ${validation.message}`)
      }
      else if (selectedFiles.some(f => f.name === file.name)) {
        errors.push(`${file.name}: Already selected`)
      }
      else {
        validFiles.push(file)
      }
    }

    if (errors.length > 0) {
      errorMessage = errors.join('\n')
    }

    selectedFiles = [...selectedFiles, ...validFiles]
    uploadStates = selectedFiles.map(file => ({
      file,
      progress: { loaded: 0, total: file.size, percentage: 0 },
      status: 'pending',
    }))
  }

  function removeFile(index: number) {
    selectedFiles = selectedFiles.filter((_, i) => i !== index)
    uploadStates = uploadStates.filter((_, i) => i !== index)
  }

  function clearAll() {
    selectedFiles = []
    uploadStates = []
    errorMessage = ''
    successMessage = ''
    if (fileInput) {
      fileInput.value = ''
    }
  }

  function triggerFileSelect() {
    if (!uploading) {
      fileInput?.click()
    }
  }

  async function waitForDraftReady(uploadId: string) {
    const maxAttempts = 30 // 30 attempts * 2 seconds = 60 seconds max
    const pollInterval = 2000 // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const draft = await getDraft(uploadId, authToken)

        if (draft.status === 'REVIEW') {
          successMessage = 'Processing complete! Redirecting to review...'
          setTimeout(goto, 1000, `/letters/drafts/${uploadId}`)
          return
        }

        if (draft.status === 'ERROR') {
          errorMessage = draft.error || 'Processing failed'
          processing = false
          return
        }

        // Still processing, update message and wait
        successMessage = `Processing with AI... (${attempt + 1}/${maxAttempts})`
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
      catch {
        // Draft might not exist yet, keep polling
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
    }

    // Timeout - redirect to drafts anyway
    processing = false
    successMessage = 'Processing is taking longer than expected. Redirecting to drafts...'
    setTimeout(goto, 1000, '/letters/drafts')
  }

  async function startUpload() {
    if (selectedFiles.length === 0 || uploading)
      return

    uploading = true
    errorMessage = ''
    successMessage = ''

    // Reset states to uploading
    uploadStates = selectedFiles.map(file => ({
      file,
      progress: { loaded: 0, total: file.size, percentage: 0 },
      status: 'uploading',
    }))

    dispatch('uploadStart', { files: selectedFiles })

    try {
      const result = await uploadLetterFiles(
        selectedFiles,
        authToken,
        (fileIndex, progress) => {
          uploadStates[fileIndex] = {
            ...uploadStates[fileIndex],
            progress,
            status: 'uploading',
          }
          uploadStates = [...uploadStates]
        },
        (fileIndex) => {
          uploadStates[fileIndex] = {
            ...uploadStates[fileIndex],
            status: 'complete',
            progress: { ...uploadStates[fileIndex].progress, percentage: 100 },
          }
          uploadStates = [...uploadStates]
        },
        (fileIndex, err) => {
          uploadStates[fileIndex] = {
            ...uploadStates[fileIndex],
            status: 'error',
            error: err,
          }
          uploadStates = [...uploadStates]
        },
      )

      if (result.success) {
        processing = true
        successMessage = 'Files uploaded successfully. Processing with AI...'
        dispatch('uploadComplete', { uploadId: result.uploadId })

        // Poll for draft completion
        await waitForDraftReady(result.uploadId)
      }
      else {
        errorMessage = result.errors.join('\n')
        dispatch('uploadError', { error: result.errors.join(', ') })
      }
    }
    catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Upload failed'
      dispatch('uploadError', { error: errorMessage })
    }
    finally {
      uploading = false
    }
  }
</script>

<div class='letter-uploader'>
  <!-- Hidden file input -->
  <input
    bind:this={fileInput}
    type='file'
    accept={acceptString}
    multiple
    class='hidden'
    on:change={handleFileSelect}
    disabled={uploading}
  />

  <!-- Drop zone -->
  <div
    class='drop-zone border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200'
    class:border-primary={dragActive}
    class:bg-primary-10={dragActive}
    class:border-base-300={!dragActive}
    class:cursor-pointer={!uploading}
    class:opacity-50={uploading}
    on:drop={handleDrop}
    on:dragover={handleDragOver}
    on:dragleave={handleDragLeave}
    on:click={triggerFileSelect}
    role='button'
    tabindex='0'
    on:keydown={e => e.key === 'Enter' && triggerFileSelect()}
  >
    {#if processing}
      <div class='text-success'>
        <div class='loading loading-spinner loading-lg mb-4'></div>
        <h3 class='text-lg font-semibold mb-2'>Processing Letter...</h3>
        <p class='text-sm text-base-content/70'>
          The letter is being analyzed. You'll be redirected to the drafts page.
        </p>
      </div>
    {:else if uploading}
      <div class='text-primary'>
        <div class='loading loading-spinner loading-lg mb-4'></div>
        <h3 class='text-lg font-semibold mb-2'>Uploading Files...</h3>
        <p class='text-sm text-base-content/70'>
          {uploadStates.filter(s => s.status === 'complete').length} of {uploadStates.length} files uploaded
        </p>
      </div>
    {:else}
      <div class='text-base-content/70'>
        <svg xmlns='http://www.w3.org/2000/svg' class='h-12 w-12 mx-auto mb-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
          <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12' />
        </svg>
        <h3 class='text-lg font-semibold mb-2'>Upload Letter Scans</h3>
        <p class='text-sm mb-4'>
          Drag and drop PDF or image files here, or click to select
        </p>
        <div class='text-xs space-y-1'>
          <p><strong>Accepted:</strong> PDF, JPG, PNG</p>
          <p><strong>Max size:</strong> 50MB per file</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Error message -->
  {#if errorMessage}
    <div class='mt-4 p-4 bg-error/10 border border-error rounded-lg'>
      <h4 class='font-semibold text-error mb-2'>Upload Error</h4>
      <pre class='text-sm text-error whitespace-pre-wrap'>{errorMessage}</pre>
    </div>
  {/if}

  <!-- Success message -->
  {#if successMessage}
    <div class='mt-4 p-4 bg-success/10 border border-success rounded-lg'>
      <h4 class='font-semibold text-success'>{successMessage}</h4>
    </div>
  {/if}

  <!-- Selected files list -->
  {#if selectedFiles.length > 0 && !processing}
    <div class='mt-6'>
      <div class='flex items-center justify-between mb-4'>
        <h4 class='font-semibold'>Selected Files ({selectedFiles.length})</h4>
        <span class='text-sm text-base-content/60'>Total: {formatFileSize(totalSize)}</span>
      </div>

      <div class='space-y-3'>
        {#each uploadStates as state, index}
          <div class='bg-base-200 rounded-lg p-4'>
            <div class='flex items-center justify-between mb-2'>
              <span class='text-sm font-medium truncate flex-1 mr-4'>{state.file.name}</span>
              <div class='flex items-center gap-2'>
                <span class='text-xs text-base-content/60'>{formatFileSize(state.file.size)}</span>
                {#if !uploading && state.status === 'pending'}
                  <button
                    type='button'
                    class='btn btn-xs btn-ghost btn-circle'
                    on:click|stopPropagation={() => removeFile(index)}
                    aria-label='Remove file'
                  >
                    <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
                    </svg>
                  </button>
                {/if}
              </div>
            </div>

            {#if state.status !== 'pending'}
              <div class='flex items-center gap-3'>
                <div class='flex-1'>
                  <div class='w-full bg-base-300 rounded-full h-2'>
                    <div
                      class='h-2 rounded-full transition-all duration-300'
                      class:bg-primary={state.status === 'uploading'}
                      class:bg-success={state.status === 'complete'}
                      class:bg-error={state.status === 'error'}
                      style='width: {state.progress.percentage}%'
                    ></div>
                  </div>
                </div>

                <div class='text-xs text-base-content/60 min-w-[3rem] text-right'>
                  {state.progress.percentage}%
                </div>

                <div class='min-w-[1.5rem]'>
                  {#if state.status === 'complete'}
                    <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 text-success' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M5 13l4 4L19 7' />
                    </svg>
                  {:else if state.status === 'error'}
                    <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5 text-error' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                      <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
                    </svg>
                  {:else}
                    <div class='loading loading-spinner loading-xs'></div>
                  {/if}
                </div>
              </div>
            {/if}

            {#if state.error}
              <div class='mt-2 text-xs text-error'>{state.error}</div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Actions -->
      <div class='mt-6 flex gap-3'>
        <button
          type='button'
          class='btn btn-primary'
          on:click={startUpload}
          disabled={uploading || selectedFiles.length === 0}
        >
          {#if uploading}
            <span class='loading loading-spinner loading-sm'></span>
            Uploading...
          {:else}
            Upload & Process
          {/if}
        </button>

        <button
          type='button'
          class='btn btn-outline'
          on:click={clearAll}
          disabled={uploading}
        >
          Clear All
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .drop-zone {
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bg-primary-10 {
    background-color: oklch(var(--p) / 0.1);
  }
</style>
