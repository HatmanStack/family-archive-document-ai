<script lang='ts'>
  import { goto } from '$app/navigation'
  import { currentUser } from '$lib/auth/auth-store'
  import NewConversation from '$lib/components/messages/NewConversation.svelte'
  import { onMount } from 'svelte'

  /**
   * Handle conversation created
   */
  function handleConversationCreated(event: CustomEvent) {
    goto(`/messages/${event.detail.conversationId}`)
  }

  /**
   * Handle cancel
   */
  function handleCancel() {
    goto('/messages')
  }

  onMount(() => {
    // Redirect to login if not authenticated
    if (!$currentUser) {
      goto('/auth/login')
    }
  })
</script>

<svelte:head>
  <title>New Message - Family Archive</title>
</svelte:head>

<div class='container mx-auto px-4 py-8'>
  {#if $currentUser}
    <NewConversation
      on:conversationCreated={handleConversationCreated}
      on:cancel={handleCancel}
    />
  {:else}
    <div class='text-center py-8'>
      <p class='text-base-content/60'>Redirecting to login...</p>
    </div>
  {/if}
</div>
