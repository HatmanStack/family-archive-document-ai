<script lang='ts'>
  import type { Message } from '$lib/types/message'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { currentUser } from '$lib/auth/auth-store'
  import MessageInput from '$lib/components/messages/MessageInput.svelte'
  import MessageThread from '$lib/components/messages/MessageThread.svelte'
  import { deleteConversation, getMessages } from '$lib/services/message-service'
  import { onDestroy, onMount } from 'svelte'

  $: conversationId = $page.params.conversationId ?? ''
  $: currentUserId = $currentUser?.sub || ''

  let messageThreadComponent: MessageThread
  let pollingInterval: number | null = null
  let lastMessageId: string | undefined
  let isCreator = false
  let isDeleting = false

  /**
   * Handle message sent
   */
  function handleMessageSent(event: CustomEvent<Message>) {
    const message = event.detail
    if (messageThreadComponent) {
      messageThreadComponent.addMessage(message)
    }
    lastMessageId = message.messageId
  }

  function handleConversationLoaded(event: CustomEvent<{ creatorId: string, title?: string }>) {
    const { creatorId } = event.detail
    isCreator = creatorId === currentUserId
  }

  async function handleDeleteConversation() {
    if (!confirm('Are you sure you want to delete this entire conversation? This action cannot be undone and will remove it for all participants.')) {
      return
    }

    isDeleting = true
    try {
      const result = await deleteConversation(conversationId)
      if (result.success) {
        goto('/messages')
      }
      else {
        alert(result.error || 'Failed to delete conversation')
      }
    }
    catch {
      alert('Failed to delete conversation')
    }
    finally {
      isDeleting = false
    }
  }

  /**
   * Poll for new messages
   */
  async function pollForNewMessages() {
    if (document.hidden)
      return // Don't poll when tab is hidden

    try {
      const result = await getMessages(conversationId, 10)

      if (result.success && result.data) {
        const messages = Array.isArray(result.data) ? result.data : [result.data]

        // Filter for only new messages (those created after our last known message)
        const newMessages = messages.filter((msg) => {
          if (!lastMessageId)
            return false
          return msg.messageId > lastMessageId
        })

        // Add new messages to the thread
        if (newMessages.length > 0 && messageThreadComponent) {
          newMessages.forEach((msg) => {
            messageThreadComponent.addMessage(msg)
            lastMessageId = msg.messageId
          })
        }
      }
    }
    catch (error) {
      console.error('Error polling for new messages:', error)
    }
  }

  onMount(() => {
    // Redirect to login if not authenticated
    if (!$currentUser) {
      goto('/auth/login')
      return
    }

    // Start polling for new messages every 30 seconds
    pollingInterval = window.setInterval(pollForNewMessages, 30000)
  })

  onDestroy(() => {
    // Clean up polling interval
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }
  })
</script>

<svelte:head>
  <title>Conversation - Family Archive</title>
</svelte:head>

<div class='flex flex-col h-[calc(100vh-4.125rem)] mt-[4.125rem]'>
  <!-- Header -->
  <div class='navbar bg-base-100 border-base-300 flex-shrink-0 border-b'>
    <div class='navbar-start'>
      <button class='btn btn-ghost btn-circle' on:click={() => goto('/messages')}>
        <svg
          xmlns='http://www.w3.org/2000/svg'
          class='h-6 w-6'
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
        >
          <path
            stroke-linecap='round'
            stroke-linejoin='round'
            stroke-width='2'
            d='M15 19l-7-7 7-7'
          />
        </svg>
      </button>
    </div>
    <div class='navbar-center'>
      <h1 class='text-xl font-semibold'>Conversation</h1>
    </div>
    <div class='navbar-end'>
      {#if isCreator}
        <button
          class='btn btn-ghost btn-circle text-error'
          title='Delete Conversation'
          disabled={isDeleting}
          on:click={handleDeleteConversation}
        >
          {#if isDeleting}
            <span class='loading loading-spinner loading-sm'></span>
          {:else}
            <svg xmlns='http://www.w3.org/2000/svg' class='h-6 w-6' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
              <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' />
            </svg>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if $currentUser}
    <!-- Message thread container -->
    <div class='flex-1 flex flex-col min-h-0'>
      <MessageThread
        bind:this={messageThreadComponent}
        {conversationId}
        {currentUserId}
        on:conversationLoaded={handleConversationLoaded}
      />
      <MessageInput
        {conversationId}
        on:messageSent={handleMessageSent}
      />
    </div>
  {:else}
    <div class='flex-1 flex items-center justify-center'>
      <p class='text-base-content/60'>Redirecting to login...</p>
    </div>
  {/if}
</div>
