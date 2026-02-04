<script lang='ts'>
  import { goto } from '$app/navigation'
  import { authStore, currentUser } from '$lib/auth/auth-store'
  import { onMount } from 'svelte'

  let userEmail = ''
  let timeWaiting = 0
  let intervalId: ReturnType<typeof setInterval>

  onMount(() => {
    // Get user email from auth store
    const unsubscribe = currentUser.subscribe((user) => {
      if (user) {
        userEmail = user.email
      }
      else {
        // If no user, redirect to login
        goto('/auth/login')
      }
    })

    // Start timer to show how long they've been waiting
    intervalId = setInterval(() => {
      timeWaiting += 1
    }, 60000) // Update every minute

    return () => {
      unsubscribe()
      if (intervalId)
        clearInterval(intervalId)
    }
  })

  async function handleLogout() {
    try {
      // Import the necessary modules
      const { googleOAuth } = await import('$lib/auth/google-oauth')

      // Since users on this page came through Google OAuth, use hosted UI logout
      // This properly clears the Cognito session on the server side
      // Use the default logout URL which is configured in Cognito
      googleOAuth.logoutViaHostedUI()
    }
    catch (error) {
      console.error('Logout error:', error)
      // Fallback to local logout if hosted UI logout fails
      authStore.clearAuth()
      goto('/auth/login')
    }
  }

  function formatWaitTime(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`
    }
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (remainingMinutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`
    }
    return `${hours} hour${hours !== 1 ? 's' : ''} and ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`
  }
</script>

<svelte:head>
  <title>Pending Approval - Family Archive</title>
  <meta name='description' content='Your account is pending approval. Please wait for family administrator approval.' />
</svelte:head>

<div class='min-h-screen flex items-center justify-center bg-base-200 px-4'>
  <div class='card w-full mx-auto bg-base-100 shadow-xl max-w-lg'>
    <div class='card-body text-center'>
      <!-- Pending Icon -->
      <div class='text-6xl mb-4 text-warning'>⏳</div>

      <h1 class='card-title justify-center text-2xl mb-4'>Account Pending Approval</h1>

      <div class='space-y-4'>
        <!-- User Info -->
        <div class='bg-base-200 rounded-lg p-4'>
          <p class='text-sm text-base-content/70 mb-1'>Signed in as:</p>
          <p class='font-semibold'>{userEmail}</p>
        </div>

        <!-- Status Message -->
        <div class='alert alert-warning'>
          <svg xmlns='http://www.w3.org/2000/svg' class='stroke-current shrink-0 h-6 w-6' fill='none' viewBox='0 0 24 24'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z' />
          </svg>
          <div class='text-left'>
            <h3 class='font-bold'>Waiting for Family Administrator Approval</h3>
            <p class='text-sm mt-1'>Your account has been created but needs to be approved by a family administrator before you can access the letters and memories.</p>
          </div>
        </div>

        <!-- Wait Time -->
        {#if timeWaiting > 0}
          <div class='text-sm text-base-content/60'>
            You've been waiting for {formatWaitTime(timeWaiting)}
          </div>
        {/if}

        <!-- Instructions -->
        <div class='border rounded-lg p-4 text-left bg-info/10 border-info/20'>
          <h3 class='font-semibold mb-2 text-info'>What happens next?</h3>
          <ul class='text-sm space-y-2 text-base-content/80'>
            <li class='flex items-start gap-2'>
              <span class='text-info mt-0.5'>1.</span>
              <span>A family administrator will review your request</span>
            </li>
            <li class='flex items-start gap-2'>
              <span class='text-info mt-0.5'>2.</span>
              <span>You'll receive access once approved (usually within a few hours)</span>
            </li>
            <li class='flex items-start gap-2'>
              <span class='text-info mt-0.5'>3.</span>
              <span><strong>Important:</strong> After being approved, you'll need to sign out and sign back in for your new access to take effect</span>
            </li>
            <li class='flex items-start gap-2'>
              <span class='text-info mt-0.5'>4.</span>
              <span>You can then explore family letters and memories</span>
            </li>
          </ul>
        </div>

        <!-- Contact Info -->
        <div class='bg-base-200 rounded-lg p-4'>
          <h3 class='font-semibold mb-2'>Need Help?</h3>
          <p class='text-sm text-base-content/80 mb-3'>
            If you haven't been approved after 2 hours, please contact your family administrator or reach out to us directly.
          </p>
          <div class='space-y-3'>
            <div class='text-center'>
              <p class='text-xs text-base-content/60 mb-3'>
                💡 Right-click to copy email address
              </p>
            </div>

            <div class='flex flex-col sm:flex-row gap-2 justify-center'>
              <a href='mailto:gemenielabs@gmail.com' class='btn btn-sm btn-outline'>
                📧 Send Email
              </a>
              <a href='/about' class='btn btn-sm btn-ghost'>
                ℹ️ Learn More
              </a>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class='divider'>Account Actions</div>
        <div class='flex justify-center'>
          <button class='btn btn-ghost btn-sm' on:click={handleLogout}>
            🚪 Sign Out
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
