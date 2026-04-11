<script lang='ts'>
  import { goto } from '$app/navigation'
  import { authService } from '$lib/auth/auth-service'
  import { currentUser, isAuthenticated } from '$lib/auth/auth-store'
  import { googleOAuth } from '$lib/auth/google-oauth'
  import { getProfile } from '$lib/services/profile-service'
  import { unreadCount, updateUnreadCount } from '$lib/stores/messages'
  import { onDestroy, onMount } from 'svelte'

  let showDropdown = false
  let updateInterval: number | null = null
  let userProfilePhotoUrl: string | null = null
  let lastFetchUserId: string | null = null

  // Reset state when user logs out
  $: if (!$isAuthenticated) {
    lastFetchUserId = null
    userProfilePhotoUrl = null
  }

  // Reactively fetch profile photo when currentUser becomes available or changes
  $: if ($isAuthenticated && $currentUser?.sub && lastFetchUserId !== $currentUser.sub) {
    lastFetchUserId = $currentUser.sub
    userProfilePhotoUrl = null // Clear old photo to prevent stale display
    fetchProfilePhoto($currentUser.sub)
  }

  async function fetchProfilePhoto(userId: string) {
    try {
      const result = await getProfile(userId)
      // Only update if the current user matches the one we fetched for
      if ($currentUser?.sub === userId) {
        if (result.success && result.data) {
          const profile = Array.isArray(result.data) ? result.data[0] : result.data
          if (profile?.profilePhotoUrl) {
            userProfilePhotoUrl = profile.profilePhotoUrl
          }
        }
      }
    }
    catch (e) {
      console.error('Error fetching profile photo:', e)
    }
  }

  async function handleSignOut() {
    try {
      // Check if user was authenticated via OAuth (has picture or identities claim)
      const isOAuthUser = $currentUser?.picture || $currentUser?.identities

      if (isOAuthUser) {
        // For OAuth users, use hosted UI logout
        googleOAuth.logoutViaHostedUI()
      }
      else {
        // For regular users, use standard logout
        await authService.signOut()
        goto('/')
      }
    }
    catch (error) {
      console.error('Sign out error:', error)
      // Fallback to local logout
      await authService.signOut()
      goto('/')
    }
  }

  function closeDropdown() {
    showDropdown = false
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (showDropdown && !(event.target as Element)?.closest('.user-menu-container')) {
      closeDropdown()
    }
  }

  onMount(() => {
    document.addEventListener('click', handleClickOutside)

    // Update unread count immediately
    if ($isAuthenticated) {
      updateUnreadCount()

      // Update every 60 seconds
      updateInterval = window.setInterval(() => {
        if ($isAuthenticated) {
          updateUnreadCount()
        }
      }, 60000)
    }
  })

  onDestroy(() => {
    document.removeEventListener('click', handleClickOutside)
    if (updateInterval) {
      clearInterval(updateInterval)
    }
  })
</script>

{#if $isAuthenticated && $currentUser}
  <div class='relative user-menu-container'>
    <button class='btn btn-ghost avatar btn-circle' onclick={() => { showDropdown = !showDropdown }}>
      <div class='w-10 rounded-full overflow-hidden'>
        {#if userProfilePhotoUrl}
          <img src={userProfilePhotoUrl} alt='Profile' class='w-full h-full object-cover' />
        {:else if $currentUser.picture}
          <img src={$currentUser.picture} alt='Profile' class='w-full h-full object-cover' />
        {:else}
          <div class='w-full h-full flex items-center justify-center bg-primary text-primary-content'>
            <span class='text-sm font-medium'>
              {$currentUser.email?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
        {/if}
      </div>
    </button>
    {#if showDropdown}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div class='absolute right-0 mt-3 z-[200] bg-base-100 p-3 shadow-lg rounded-box w-52 flex flex-col' onclick={e => e.stopPropagation()}>
        <div class='text-xs text-base-content/60 truncate px-2 pb-2 border-b border-base-200'>{$currentUser.email}</div>
        <button type='button' class='block px-2 py-2 rounded hover:bg-base-200 text-sm w-full text-left cursor-pointer relative z-[300]' onclick={() => {
          closeDropdown()
          goto(`/profile/${$currentUser?.sub}`)
        }}>
          My Profile
        </button>
        <button type='button' class='block px-2 py-2 rounded hover:bg-base-200 text-sm w-full text-left cursor-pointer relative z-[300]' onclick={() => {
          closeDropdown()
          goto('/messages')
        }}>
          Messages
          {#if $unreadCount > 0}
            <span class='badge badge-primary badge-sm'>{$unreadCount}</span>
          {/if}
        </button>
        <button type='button' class='block px-2 py-2 rounded hover:bg-base-200 text-sm w-full text-left cursor-pointer relative z-[300]' onclick={() => {
          closeDropdown()
          goto('/family')
        }}>
          Family
        </button>
        <button type='button' class='block px-2 py-2 rounded hover:bg-base-200 text-sm w-full text-left cursor-pointer relative z-[300]' onclick={() => {
          closeDropdown()
          goto('/profile/settings')
        }}>
          Settings
        </button>
        <div class='border-t border-base-200 my-1'></div>
        <button type='button' class='flex items-center gap-2 px-2 py-2 rounded hover:bg-base-200 text-sm text-error w-full text-left' onclick={() => {
          closeDropdown()
          handleSignOut()
        }}>
          Sign Out
        </button>
      </div>
    {/if}
  </div>
{:else}
  <!-- No buttons shown for unauthenticated users since they'll be redirected to login -->
{/if}
