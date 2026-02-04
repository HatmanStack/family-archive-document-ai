<script lang='ts'>
  import type { UserProfile } from '$lib/types/profile'
  import { page } from '$app/stores'
  import { currentUser } from '$lib/auth/auth-store'
  import CommentHistory from '$lib/components/profile/CommentHistory.svelte'
  import ProfileCard from '$lib/components/profile/ProfileCard.svelte'
  import { getProfile } from '$lib/services/profile-service'
  import { onMount } from 'svelte'

  let profile: UserProfile | null = null
  let loading = true
  let error = ''

  $: userId = $page.params.userId ?? ''
  $: isOwner = $currentUser?.sub === userId
  $: isAdmin = $currentUser?.['cognito:groups']?.includes('Admins') || false

  /**
   * Load profile data
   */
  async function loadProfile() {
    loading = true
    error = ''
    profile = null

    const result = await getProfile(userId)

    if (result.success && result.data) {
      profile = result.data as UserProfile
    }
    else {
      error = result.error || 'Failed to load profile'
    }

    loading = false
  }

  // Load profile when component mounts or userId changes
  $: if (userId) {
    loadProfile()
  }

  onMount(() => {
    loadProfile()
  })
</script>

<svelte:head>
  <title>{profile ? `${profile.displayName}'s Profile` : 'Profile'} | Family Archive</title>
</svelte:head>

<div class='mx-auto px-4 py-8 max-w-5xl'>
  {#if loading}
    <!-- Loading skeleton -->
    <div class='space-y-6'>
      <div class='card bg-base-100 shadow-xl'>
        <div class='card-body'>
          <div class='animate-pulse'>
            <div class='flex flex-col sm:flex-row gap-4 items-center sm:items-start mb-4'>
              <div class='w-24 h-24 bg-base-300 rounded-full'></div>
              <div class='flex-1 space-y-2'>
                <div class='h-8 bg-base-300 rounded w-1/3'></div>
                <div class='h-4 bg-base-300 rounded w-1/2'></div>
              </div>
            </div>
            <div class='space-y-2'>
              <div class='h-4 bg-base-300 rounded w-full'></div>
              <div class='h-4 bg-base-300 rounded w-5/6'></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  {:else if error}
    <!-- Error state -->
    <div class='card bg-base-100 shadow-xl'>
      <div class='card-body items-center text-center'>
        <div class='alert alert-error max-w-md'>
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
          <div>
            <h3 class='font-bold'>Error Loading Profile</h3>
            <div class='text-sm'>{error}</div>
          </div>
        </div>
        <a href='/' class='btn btn-primary mt-4'>Go Home</a>
      </div>
    </div>
  {:else if profile}
    <!-- Profile content -->
    <div class='space-y-6'>
      <ProfileCard {profile} {isOwner} {isAdmin} />

      {#if !profile.isProfilePrivate || isOwner || isAdmin}
        <CommentHistory {userId} />
      {/if}
    </div>
  {/if}
</div>
