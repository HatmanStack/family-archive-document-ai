<script lang='ts'>
  import type { FamilyRelationship, UserProfile } from '$lib/types/profile'
  import { goto } from '$app/navigation'
  import { currentUser, isAuthenticated } from '$lib/auth/auth-store'
  import { getProfile, updateProfile, uploadProfilePhoto } from '$lib/services/profile-service'
  import { RELATIONSHIP_TYPES } from '$lib/types/profile'
  import { onMount } from 'svelte'

  let profile: UserProfile | null = null
  let loading = true
  let saving = false
  let error = ''
  let successMessage = ''

  // Form fields
  let displayName = ''
  let bio = ''
  let familyRelationship = ''
  let generation = ''
  let familyBranch = ''
  let isProfilePrivate = false

  // Family relationships (for chat context)
  let familyRelationships: FamilyRelationship[] = []
  const RELATIONSHIP_LIMIT_WARNING = 10

  // Notification settings
  let contactEmail = ''
  let notifyOnMessage = true
  let notifyOnComment = true

  // Photo upload
  let photoFile: File | null = null
  let previewUrl = ''
  let uploading = false
  let uploadError = ''

  $: bioLength = bio.length

  /**
   * Generate a UUID for new relationships
   */
  function generateId(): string {
    return crypto.randomUUID()
  }

  /**
   * Add a new empty relationship
   */
  function addRelationship() {
    familyRelationships = [
      ...familyRelationships,
      {
        id: generateId(),
        type: '',
        name: '',
        createdAt: new Date().toISOString(),
      },
    ]
  }

  /**
   * Remove a relationship by ID
   */
  function removeRelationship(id: string) {
    familyRelationships = familyRelationships.filter(r => r.id !== id)
  }

  /**
   * Load current user's profile
   */
  async function loadProfile() {
    if (!$currentUser?.sub) {
      goto('/login')
      return
    }

    loading = true
    error = ''

    const result = await getProfile($currentUser.sub)

    if (result.success && result.data) {
      profile = result.data as UserProfile

      // Populate form fields
      displayName = profile.displayName || ''
      bio = profile.bio || ''
      familyRelationship = profile.familyRelationship || ''
      generation = profile.generation || ''
      familyBranch = profile.familyBranch || ''
      isProfilePrivate = profile.isProfilePrivate || false
      previewUrl = profile.profilePhotoUrl || ''

      // Notification settings
      contactEmail = profile.contactEmail || ''
      notifyOnMessage = profile.notifyOnMessage !== false
      notifyOnComment = profile.notifyOnComment !== false

      // Family relationships for chat context
      familyRelationships = profile.familyRelationships || []
    }
    else {
      error = result.error || 'Failed to load profile'
    }

    loading = false
  }

  /**
   * Handle photo file selection
   */
  function handleFileSelect(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]

    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/gif']
      if (!validTypes.includes(file.type)) {
        uploadError = 'Invalid file type. Please use JPG, PNG, or GIF.'
        return
      }

      // Validate file size (5MB max)
      const maxSize = 5 * 1024 * 1024
      if (file.size > maxSize) {
        uploadError = 'File too large. Maximum size is 5MB.'
        return
      }

      photoFile = file
      uploadError = ''

      // Create preview URL
      const reader = new FileReader()
      reader.onload = (e) => {
        previewUrl = e.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  }

  /**
   * Remove selected photo
   */
  function removePhoto() {
    photoFile = null
    previewUrl = profile?.profilePhotoUrl || ''
    uploadError = ''

    // Reset file input
    const fileInput = document.getElementById('photo-input') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
  }

  /**
   * Save profile changes
   */
  async function handleSave() {
    if (!$currentUser?.sub) {
      goto('/login')
      return
    }

    // Validate
    if (!displayName.trim()) {
      error = 'Display name is required'
      return
    }

    saving = true
    error = ''
    successMessage = ''

    try {
      // Upload photo if changed
      let photoUrl: string | undefined

      if (photoFile) {
        uploading = true
        const uploadResult = await uploadProfilePhoto(photoFile)

        if (uploadResult.success && uploadResult.url) {
          photoUrl = uploadResult.url
        }
        else {
          error = uploadResult.error || 'Failed to upload photo'
          saving = false
          uploading = false
          return
        }
        uploading = false
      }

      // Filter out incomplete relationships (missing type or name)
      const validRelationships = familyRelationships.filter(
        r => r.type && r.name.trim(),
      )

      // Update profile
      const result = await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        familyRelationship: familyRelationship.trim() || undefined,
        generation: generation.trim() || undefined,
        familyBranch: familyBranch.trim() || undefined,
        isProfilePrivate,
        contactEmail: contactEmail.trim() || undefined,
        notifyOnMessage,
        notifyOnComment,
        familyRelationships: validRelationships,
        ...(photoUrl && { profilePhotoUrl: photoUrl }),
      })

      if (result.success) {
        successMessage = 'Profile updated successfully!'

        // Redirect to profile page after short delay
        setTimeout(() => {
          goto(`/profile/${$currentUser?.sub}`)
        }, 1500)
      }
      else {
        error = result.error || 'Failed to update profile'
      }
    }
    catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update profile'
    }

    saving = false
  }

  /**
   * Cancel editing and go back to profile
   */
  function handleCancel() {
    if ($currentUser?.sub) {
      goto(`/profile/${$currentUser.sub}`)
    }
    else {
      goto('/')
    }
  }

  onMount(() => {
    // Check authentication
    if (!$isAuthenticated) {
      goto('/login')
      return
    }

    loadProfile()
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

  {#if loading}
    <!-- Loading skeleton -->
    <div class='card bg-base-100 shadow-xl'>
      <div class='card-body'>
        <div class='animate-pulse space-y-4'>
          <div class='h-4 bg-base-300 rounded w-1/4'></div>
          <div class='h-10 bg-base-300 rounded'></div>
          <div class='h-4 bg-base-300 rounded w-1/4'></div>
          <div class='h-24 bg-base-300 rounded'></div>
        </div>
      </div>
    </div>
  {:else if error && !profile}
    <!-- Error loading profile -->
    <div class='alert alert-error'>
      <svg
        xmlns='http://www.w3.org/2000/svg'
        class='stroke-current shrink-0 h-6 w-6'
        fill='none'
        viewBox='0 0 24 24'
      >
        <path
          stroke-linecap='round'
          stroke-linejoin='round'
          stroke-width='2'
          d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
        />
      </svg>
      <span>{error}</span>
    </div>
  {:else}
    <!-- Settings form -->
    <form on:submit|preventDefault={handleSave}>
      <div class='card bg-base-100 shadow-xl'>
        <div class='card-body space-y-6'>
          <!-- Success message -->
          {#if successMessage}
            <div class='alert alert-success'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                class='stroke-current shrink-0 h-6 w-6'
                fill='none'
                viewBox='0 0 24 24'
              >
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              <span>{successMessage}</span>
            </div>
          {/if}

          <!-- Error message -->
          {#if error}
            <div class='alert alert-error'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                class='stroke-current shrink-0 h-6 w-6'
                fill='none'
                viewBox='0 0 24 24'
              >
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
                />
              </svg>
              <span>{error}</span>
            </div>
          {/if}

          <!-- Profile Photo -->
          <div class='form-control'>
            <label class='label' for='photo-input'>
              <span class='label-text font-semibold'>Profile Photo</span>
            </label>
            <div class='flex items-center gap-4'>
              <!-- Preview -->
              <div class='avatar'>
                {#if previewUrl}
                  <div class='w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2'>
                    <img src={previewUrl} alt='Preview' />
                  </div>
                {:else}
                  <div class='placeholder'>
                    <div class='bg-neutral text-neutral-content rounded-full w-24'>
                      <span class='text-3xl'>{displayName.charAt(0).toUpperCase() || 'U'}</span>
                    </div>
                  </div>
                {/if}
              </div>

              <!-- Upload controls -->
              <div class='flex-1'>
                <input
                  id='photo-input'
                  type='file'
                  accept='image/jpeg,image/png,image/gif'
                  class='w-full max-w-xs file-input file-input-bordered file-input-sm'
                  on:change={handleFileSelect}
                  disabled={saving || uploading}
                />
                {#if photoFile}
                  <button
                    type='button'
                    class='btn btn-ghost btn-sm mt-2'
                    on:click={removePhoto}
                    disabled={saving || uploading}
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

          <div class='divider'></div>

          <!-- Display Name -->
          <div class='form-control'>
            <label class='label' for='displayName'>
              <span class='label-text font-semibold'>Display Name *</span>
            </label>
            <input
              id='displayName'
              type='text'
              class='input input-bordered'
              bind:value={displayName}
              disabled={saving}
              required
              maxlength='100'
            />
          </div>

          <!-- Bio -->
          <div class='form-control'>
            <label class='label' for='bio'>
              <span class='label-text font-semibold'>About</span>
              <span class='label-text-alt'>{bioLength.toLocaleString()} characters</span>
            </label>
            <textarea
              id='bio'
              class='textarea textarea-bordered min-h-48'
              bind:value={bio}
              disabled={saving}
              placeholder='Tell your family about yourself... Write as much as you want!'
            />
          </div>

          <div class='divider'>Family Information</div>

          <!-- Family Relationship -->
          <div class='form-control'>
            <label class='label' for='familyRelationship'>
              <span class='label-text font-semibold'>Family Relationship</span>
            </label>
            <input
              id='familyRelationship'
              type='text'
              class='input input-bordered'
              bind:value={familyRelationship}
              disabled={saving}
              maxlength='100'
              placeholder='e.g., Father, Mother, Son, Daughter, Grandparent'
            />
          </div>

          <!-- Generation -->
          <div class='form-control'>
            <label class='label' for='generation'>
              <span class='label-text font-semibold'>Generation</span>
            </label>
            <input
              id='generation'
              type='text'
              class='input input-bordered'
              bind:value={generation}
              disabled={saving}
              maxlength='50'
              placeholder='e.g., Gen 1, Gen 2, Founder'
            />
          </div>

          <!-- Family Branch -->
          <div class='form-control'>
            <label class='label' for='familyBranch'>
              <span class='label-text font-semibold'>Family Branch</span>
            </label>
            <input
              id='familyBranch'
              type='text'
              class='input input-bordered'
              bind:value={familyBranch}
              disabled={saving}
              maxlength='100'
              placeholder='e.g., Smith Family, Jones Branch'
            />
          </div>

          <div class='divider'>My Family Relationships</div>

          <!-- Family Relationships Section -->
          <div class='space-y-4'>
            <p class='text-sm text-base-content/70'>
              Define your family relationships. This helps the chat feature understand context
              when you ask questions like "What did my grandmother write about?"
            </p>

            <!-- Warning when exceeding limit -->
            {#if familyRelationships.length > RELATIONSHIP_LIMIT_WARNING}
              <div class='alert alert-warning'>
                <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-5 w-5' fill='none' viewBox='0 0 24 24'>
                  <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' />
                </svg>
                <span class='text-sm'>
                  Having more than {RELATIONSHIP_LIMIT_WARNING} relationships may affect chat quality.
                  Consider keeping only your closest family connections.
                </span>
              </div>
            {/if}

            <!-- Relationship List -->
            {#each familyRelationships as relationship (relationship.id)}
              <div class='flex gap-2 items-start p-3 bg-base-200 rounded-lg'>
                <div class='flex-1 grid grid-cols-1 md:grid-cols-2 gap-2'>
                  <!-- Relationship Type -->
                  <div class='form-control'>
                    <label class='label py-1' for='rel-type-{relationship.id}'>
                      <span class='label-text text-xs'>Relationship</span>
                    </label>
                    <select
                      id='rel-type-{relationship.id}'
                      class='select select-bordered select-sm'
                      bind:value={relationship.type}
                      disabled={saving}
                    >
                      <option value=''>Select type...</option>
                      {#each RELATIONSHIP_TYPES as type}
                        <option value={type}>{type}</option>
                      {/each}
                    </select>
                  </div>

                  <!-- Custom Type (only shown when "Other" is selected) -->
                  {#if relationship.type === 'Other'}
                    <div class='form-control'>
                      <label class='label py-1' for='rel-custom-{relationship.id}'>
                        <span class='label-text text-xs'>Custom Type</span>
                      </label>
                      <input
                        id='rel-custom-{relationship.id}'
                        type='text'
                        class='input input-bordered input-sm'
                        bind:value={relationship.customType}
                        disabled={saving}
                        maxlength='100'
                        placeholder="e.g., Mom's cousin"
                      />
                    </div>
                  {/if}

                  <!-- Person's Name -->
                  <div class='form-control' class:md:col-span-2={relationship.type !== 'Other'}>
                    <label class='label py-1' for='rel-name-{relationship.id}'>
                      <span class='label-text text-xs'>Person's Name</span>
                    </label>
                    <input
                      id='rel-name-{relationship.id}'
                      type='text'
                      class='input input-bordered input-sm'
                      bind:value={relationship.name}
                      disabled={saving}
                      maxlength='200'
                      placeholder='e.g., Mary Smith'
                    />
                  </div>
                </div>

                <!-- Delete button -->
                <button
                  type='button'
                  class='btn btn-ghost btn-sm btn-square mt-6'
                  on:click={() => removeRelationship(relationship.id)}
                  disabled={saving}
                  aria-label='Remove relationship'
                >
                  <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                    <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
                  </svg>
                </button>
              </div>
            {/each}

            <!-- Add Relationship Button -->
            <button
              type='button'
              class='btn btn-outline btn-sm'
              on:click={addRelationship}
              disabled={saving}
            >
              <svg xmlns='http://www.w3.org/2000/svg' class='h-4 w-4 mr-1' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 4v16m8-8H4' />
              </svg>
              Add Relationship
            </button>
          </div>

          <div class='divider'>Notifications</div>

          <!-- Contact Email -->
          <div class='form-control'>
            <label class='label' for='contactEmail'>
              <span class='label-text font-semibold'>Contact Email (optional)</span>
            </label>
            <input
              id='contactEmail'
              type='email'
              class='input input-bordered'
              bind:value={contactEmail}
              disabled={saving}
              placeholder={profile?.email || 'Use your account email'}
            />
            <label class='label'>
              <span class='label-text-alt text-base-content/60'>
                Leave blank to use your account email for notifications
              </span>
            </label>
          </div>

          <!-- Message Notifications Toggle -->
          <div class='form-control'>
            <label class='label cursor-pointer gap-4 justify-start'>
              <input
                type='checkbox'
                class='toggle toggle-primary'
                bind:checked={notifyOnMessage}
                disabled={saving}
              />
              <div>
                <span class='label-text font-semibold'>Message notifications</span>
                <p class='text-xs text-base-content/60 mt-1'>
                  Get notified when someone sends you a message
                </p>
              </div>
            </label>
          </div>

          <!-- Comment Notifications Toggle -->
          <div class='form-control'>
            <label class='label cursor-pointer gap-4 justify-start'>
              <input
                type='checkbox'
                class='toggle toggle-primary'
                bind:checked={notifyOnComment}
                disabled={saving}
              />
              <div>
                <span class='label-text font-semibold'>Comment notifications</span>
                <p class='text-xs text-base-content/60 mt-1'>
                  Get notified when someone comments on items you've commented on
                </p>
              </div>
            </label>
          </div>

          <div class='divider'>Privacy</div>

          <!-- Privacy Toggle -->
          <div class='form-control'>
            <label class='label cursor-pointer gap-4 justify-start'>
              <input
                type='checkbox'
                class='toggle toggle-primary'
                bind:checked={isProfilePrivate}
                disabled={saving}
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

      <!-- Action buttons -->
      <div class='flex gap-3 mt-6 justify-end'>
        <button
          type='button'
          class='btn btn-ghost'
          on:click={handleCancel}
          disabled={saving || uploading}
        >
          Cancel
        </button>
        <button
          type='submit'
          class='btn btn-primary'
          class:loading={saving || uploading}
          disabled={saving || uploading || !displayName.trim()}
        >
          {#if uploading}
            Uploading...
          {:else if saving}
            Saving...
          {:else}
            Save Changes
          {/if}
        </button>
      </div>
    </form>
  {/if}
</div>
