<script lang='ts'>
  import type { UserProfile } from '$lib/types/profile'

  export let profile: UserProfile
  export let isOwner: boolean = false
  export let isAdmin: boolean = false

  /**
   * Format date as readable string (e.g., "January 15, 2024")
   */
  function formatDate(timestamp: string): string {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  /**
   * Format relative time for "last active" (e.g., "2 hours ago")
   */
  function formatRelativeTime(timestamp: string): string {
    const now = new Date()
    const then = new Date(timestamp)
    const diffMs = now.getTime() - then.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffSec < 60)
      return 'just now'
    if (diffMin < 60)
      return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
    if (diffHour < 24)
      return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
    if (diffDay < 7)
      return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
    if (diffDay < 30)
      return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) > 1 ? 's' : ''} ago`

    return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) > 1 ? 's' : ''} ago`
  }
</script>

{#if profile.isProfilePrivate && !isOwner && !isAdmin}
  <!-- Private profile view for non-owners -->
  <div class='card bg-base-100 shadow-xl'>
    <div class='card-body items-center text-center'>
      <div class='avatar placeholder mb-4'>
        <div class='bg-neutral text-neutral-content rounded-full w-24'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            class='h-12 w-12'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
          >
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
            />
          </svg>
        </div>
      </div>
      <h2 class='card-title'>Private Profile</h2>
      <p class='text-base-content/60'>This user's profile is set to private.</p>
    </div>
  </div>
{:else}
  <!-- Full profile view -->
  <div class='card bg-base-100 shadow-xl'>
    <div class='card-body'>
      <!-- Header Section -->
      <div class='flex flex-col sm:flex-row gap-4 items-center mb-4 sm:items-start'>
        <!-- Avatar -->
        <div class='avatar flex-shrink-0'>
          {#if profile.profilePhotoUrl}
            <div class='w-24 rounded-full ring ring-primary ring-offset-base-100 ring-offset-2'>
              <img src={profile.profilePhotoUrl} alt={profile.displayName} loading='lazy' />
            </div>
          {:else}
            <div class='placeholder'>
              <div class='bg-neutral text-neutral-content rounded-full w-24'>
                <span class='text-3xl'>{(profile.displayName ?? '').charAt(0).toUpperCase() || 'U'}</span>
              </div>
            </div>
          {/if}
        </div>

        <!-- Name and actions -->
        <div class='flex-1 text-center sm:text-left'>
          <h2 class='card-title text-2xl mb-1'>{profile.displayName}</h2>
          <p class='text-base-content/60 text-sm mb-3'>{profile.email}</p>

          {#if isOwner}
            <a href='/profile/settings' class='btn btn-primary btn-sm'>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                class='h-4 w-4'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  stroke-linecap='round'
                  stroke-linejoin='round'
                  stroke-width='2'
                  d='M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'
                />
              </svg>
              Edit Profile
            </a>
          {/if}
        </div>
      </div>

      <div class='divider my-2'></div>

      <!-- About Section -->
      {#if profile.bio}
        <div class='mb-4'>
          <h3 class='font-bold text-lg mb-2'>About</h3>
          <p class='whitespace-pre-wrap break-words text-base-content/80'>{profile.bio}</p>
        </div>
      {/if}

      <!-- Family Section -->
      {#if profile.familyRelationship || profile.generation || profile.familyBranch}
        <div class='mb-4'>
          <h3 class='font-bold text-lg mb-2'>Family</h3>
          <div class='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            {#if profile.familyRelationship}
              <div>
                <span class='text-base-content/60 text-sm'>Relationship:</span>
                <span class='ml-2 font-medium'>{profile.familyRelationship}</span>
              </div>
            {/if}
            {#if profile.generation}
              <div>
                <span class='text-base-content/60 text-sm'>Generation:</span>
                <span class='ml-2 font-medium'>{profile.generation}</span>
              </div>
            {/if}
            {#if profile.familyBranch}
              <div>
                <span class='text-base-content/60 text-sm'>Branch:</span>
                <span class='ml-2 font-medium'>{profile.familyBranch}</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <div class='divider my-2'></div>

      <!-- Activity Stats -->
      <div>
        <h3 class='font-bold text-lg mb-3'>Activity</h3>
        <div class='shadow w-full stats stats-vertical sm:stats-horizontal'>
          <div class='stat'>
            <div class='stat-title'>Comments</div>
            <div class='text-primary stat-value'>{profile.commentCount}</div>
          </div>

          <div class='stat'>
            <div class='stat-title'>Media Uploads</div>
            <div class='stat-value text-secondary'>{profile.mediaUploadCount}</div>
          </div>

          <div class='stat'>
            <div class='stat-title'>Member Since</div>
            <div class='stat-value text-sm'>{formatDate(profile.joinedDate)}</div>
            <div class='stat-desc'>Last active {formatRelativeTime(profile.lastActive)}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
