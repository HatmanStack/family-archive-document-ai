<script lang='ts'>
  import { goto } from '$app/navigation'
  import { currentUser } from '$lib/auth/auth-store'
  import ConversationList from '$lib/components/messages/ConversationList.svelte'
  import { onMount } from 'svelte'

  /**
   * Handle conversation selection
   */
  function handleConversationSelected(event: CustomEvent) {
    goto(`/messages/${event.detail.conversationId}`)
  }

  /**
   * Handle new message button
   */
  function handleNewMessage() {
    goto('/messages/new')
  }

  onMount(() => {
    // Redirect to login if not authenticated
    if (!$currentUser) {
      goto('/auth/login')
    }
  })
</script>

<svelte:head>
  <title>Messages - Family Archive</title>
</svelte:head>

<div class='container mx-auto px-4 py-8 max-w-4xl'>
  {#if $currentUser}
    <ConversationList
      on:conversationSelected={handleConversationSelected}
      on:newMessage={handleNewMessage}
    />
  {:else}
    <div class='text-center py-8'>
      <p class='text-base-content/60'>Redirecting to login...</p>
    </div>
  {/if}
</div>
