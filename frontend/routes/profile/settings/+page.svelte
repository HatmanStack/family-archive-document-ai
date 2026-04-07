<script lang='ts'>
  import { goto } from '$app/navigation'
  import { currentUser, isAuthenticated } from '$lib/auth/auth-store'
  import NotificationSettings from '$lib/components/profile/NotificationSettings.svelte'
  import PhotoUploader from '$lib/components/profile/PhotoUploader.svelte'
  import ProfileForm from '$lib/components/profile/ProfileForm.svelte'
  import RelationshipsEditor from '$lib/components/profile/RelationshipsEditor.svelte'
  import { bio, contactEmail, displayName, error, familyBranch, familyRelationship, familyRelationships, generation, isProfilePrivate, loading, loadProfileForUser, notifyOnComment, notifyOnMessage, photoFile, previewUrl, profile, resetState, saveProfile, saving, successMessage, uploading } from '$lib/stores/profile-settings'
  import { onDestroy, onMount } from 'svelte'

  function handlePhotoCleared() {
    previewUrl.set($profile?.profilePhotoUrl || '')
  }

  async function handleSave() {
    if (!$currentUser?.sub) {
      goto('/login')
      return
    }
    const ok = await saveProfile()
    if (ok) {
      setTimeout(() => {
        goto(`/profile/${$currentUser?.sub}`)
      }, 1500)
    }
  }

  function handleCancel() {
    if ($currentUser?.sub) {
      goto(`/profile/${$currentUser.sub}`)
    }
    else {
      goto('/')
    }
  }

  onMount(() => {
    if (!$isAuthenticated) {
      goto('/login')
      return
    }
    if (!$currentUser?.sub) {
      goto('/login')
      return
    }
    loadProfileForUser($currentUser.sub)
  })

  onDestroy(() => {
    resetState()
  })
</script>

<svelte:head>
  <title>Profile Settings | Family Archive</title>
</svelte:head>

<div class='mx-auto px-4 py-8 max-w-3xl'>
  <div class='mb-6'>
    <h1 class='text-3xl font-bold'>Profile Settings</h1>
    <p class='text-base-content/60 mt-2'>Update your profile information</p>
  </div>

  {#if $loading}
    <div class='card bg-base-100 shadow-xl'>
      <div class='card-body flex justify-center'>
        <span class='loading loading-spinner loading-lg'></span>
      </div>
    </div>
  {:else if $error && !$profile}
    <div class='alert alert-error'>
      <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
        <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' />
      </svg>
      <span>{$error}</span>
    </div>
  {:else}
    <form on:submit|preventDefault={handleSave}>
      <div class='card bg-base-100 shadow-xl'>
        <div class='card-body space-y-6'>
          {#if $successMessage}
            <div class='alert alert-success'>
              <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
                <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' />
              </svg>
              <span>{$successMessage}</span>
            </div>
          {/if}

          {#if $error}
            <div class='alert alert-error'>
              <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
                <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z' />
              </svg>
              <span>{$error}</span>
            </div>
          {/if}

          <PhotoUploader
            bind:previewUrl={$previewUrl}
            bind:photoFile={$photoFile}
            displayName={$displayName}
            disabled={$saving || $uploading}
            on:fileCleared={handlePhotoCleared}
          />

          <div class='divider'></div>

          <ProfileForm
            bind:displayName={$displayName}
            bind:bio={$bio}
            bind:familyRelationship={$familyRelationship}
            bind:generation={$generation}
            bind:familyBranch={$familyBranch}
            disabled={$saving}
          />

          <RelationshipsEditor
            bind:relationships={$familyRelationships}
            disabled={$saving}
          />

          <NotificationSettings
            bind:contactEmail={$contactEmail}
            bind:notifyOnMessage={$notifyOnMessage}
            bind:notifyOnComment={$notifyOnComment}
            placeholderEmail={$profile?.email || ''}
            disabled={$saving}
          />

          <div class='divider'>Privacy</div>

          <div class='form-control'>
            <label class='label cursor-pointer gap-4 justify-start'>
              <input
                type='checkbox'
                class='toggle toggle-primary'
                bind:checked={$isProfilePrivate}
                disabled={$saving}
              />
              <div>
                <span class='label-text font-semibold'>Make profile private</span>
                <p class='text-xs text-base-content/60 mt-1'>
                  Only you can view your profile when private
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div class='flex gap-3 mt-6 justify-end'>
        <button
          type='button'
          class='btn btn-ghost'
          on:click={handleCancel}
          disabled={$saving || $uploading}
        >
          Cancel
        </button>
        <button
          type='submit'
          class='btn btn-primary'
          class:loading={$saving || $uploading}
          disabled={$saving || $uploading || !$displayName.trim()}
        >
          {#if $uploading}
            Uploading...
          {:else if $saving}
            Saving...
          {:else}
            Save Changes
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>
