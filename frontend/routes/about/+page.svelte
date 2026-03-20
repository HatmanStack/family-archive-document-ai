<script lang='ts'>
  import Head from '$lib/components/head.svelte'
  import { getApiBaseUrl } from '$lib/utils/api-url'

  const API_BASE = getApiBaseUrl()

  // Contact form state
  let showContactModal = false
  let contactEmail = ''
  let contactMessage = ''
  let sending = false
  let sendError = ''
  let sendSuccess = false

  function openContactModal() {
    showContactModal = true
    sendError = ''
    sendSuccess = false
  }

  function closeContactModal() {
    showContactModal = false
    contactEmail = ''
    contactMessage = ''
    sendError = ''
    sendSuccess = false
  }

  async function sendContactMessage() {
    if (!contactEmail || !contactMessage) {
      sendError = 'Please fill in both fields'
      return
    }

    sending = true
    sendError = ''

    try {
      const response = await fetch(`${API_BASE}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contactEmail, message: contactMessage }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send message')
      }

      sendSuccess = true
      contactEmail = ''
      contactMessage = ''
    }
    catch (err) {
      sendError = err instanceof Error ? err.message : 'Failed to send message'
    }
    finally {
      sending = false
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeContactModal()
    }
  }
</script>

<Head />

<svelte:head>
  <title>About Us</title>
  <meta name='description' content='Learn more about our mission to preserve family letters and memories.' />
</svelte:head>

<div class='mx-auto px-4 py-8 max-w-4xl container'>
  <div class='prose mx-auto prose-lg'>
    <h1 class='text-4xl font-bold text-center mb-8'>About Us</h1>

    <div class='text-center mb-12'>
      <p class='text-xl text-base-content/80'>
        A family archive preserving how our parents, grandparents, and great-grandparents communicated.
      </p>
    </div>

    <div class='grid gap-8 md:gap-12'>

      <!-- How It Works Section -->
      <section>
        <h2 class='text-2xl font-semibold mb-4'>How It Works</h2>
        <div class='bg-base-100 border border-base-300 rounded-lg p-6 mb-4'>
          <h3 class='font-semibold mb-3'>💭 Chat With Your Family Archive</h3>
          <p class='text-base-content/80 mb-3'>
            On the home page, you can have a conversation with your entire family archive—letters, photos, documents, and ancestry records.
            Ask questions like "What did Grandma write about her garden?" or "When was John Smith born?"
          </p>
          <p class='text-base-content/80 mb-3'>
            The chat assistant searches through everything to find answers, and provides links directly to the original files so you can view the full context.
            As new content is added to the archive, it automatically becomes part of the conversation.
          </p>
          <p class='text-sm text-base-content/60'>
            Think of it as having a helpful family historian who knows every letter, photo, document, and family tree branch—and can point you right to the source.
          </p>
        </div>

        <div class='bg-base-100 border border-base-300 rounded-lg p-6 mb-4'>
          <h3 class='font-semibold mb-3'>📤 Upload Letters</h3>
          <p class='text-base-content/80 mb-3'>Upload scanned letters or photos of handwritten correspondence:</p>
          <ul class='text-sm text-base-content/80 space-y-1 list-disc list-inside'>
            <li>Multiple images or PDFs for multi-page letters</li>
            <li>Access to original document files</li>
            <li>Automatic AI-powered transcription</li>
          </ul>
        </div>

        <div class='bg-base-100 border border-base-300 rounded-lg p-6 mb-4'>
          <h3 class='font-semibold mb-3'>🤖 AI Transcription</h3>
          <p class='text-base-content/80 mb-3'>
            Letters are automatically transcribed using AI, but handwriting can be challenging to read perfectly.
          </p>
          <p class='text-base-content/80 mb-3'>You can improve transcriptions by:</p>
          <ul class='list-disc list-inside text-sm text-base-content/80 space-y-1'>
            <li>Correcting OCR errors</li>
            <li>Adding context or notes</li>
            <li>Editing metadata (dates, authors)</li>
          </ul>
        </div>

        <div class='bg-base-100 border border-base-300 rounded-lg p-6 mb-4'>
          <h3 class='font-semibold mb-3'>💬 Comments & Reactions</h3>
          <p class='text-base-content/80'>
            Family members can comment on letters, share memories, and react to content.
            Private messaging is also available for more personal conversations.
          </p>
        </div>

        <div class='bg-base-100 border border-base-300 rounded-lg p-6'>
          <h3 class='font-semibold mb-3'>📬 Email Notifications</h3>
          <p class='text-base-content/80 mb-3'>
            You'll receive email notifications when someone comments on your content or sends you a message.
          </p>
          <p class='text-base-content/80 mb-3'>
            <strong>Note:</strong> These emails may land in your spam folder. To ensure you receive them, create a filter in your email client to always allow messages from our notification address.
          </p>
        </div>
      </section>

      <!-- Contact Section -->
      <section class='text-center'>
        <h2 class='text-2xl font-semibold mb-4'>Get In Touch</h2>

        <div class='flex flex-col sm:flex-row gap-4 justify-center'>
          <button on:click={openContactModal} class='btn btn-primary'>
            📧 Contact Us
          </button>
          <a href='/letters' class='btn btn-outline'>
            📜 Browse Letters
          </a>
        </div>
      </section>
    </div>
  </div>
</div>

<!-- Contact Modal -->
{#if showContactModal}
  <div
    class='fixed inset-0 bg-black flex items-center justify-center z-50 p-4 w-full h-full border-none bg-opacity-50 cursor-default'
    role='button'
    tabindex='0'
    on:click={closeContactModal}
    on:keydown={handleKeydown}
    aria-label='Close contact form'
  >
    <div
      class='bg-base-100 rounded-lg shadow-xl max-w-md w-full p-6'
      role='dialog'
      aria-modal='true'
      on:click|stopPropagation={() => {}}
      on:keydown|stopPropagation={() => {}}
    >
      <div class='flex justify-between items-center mb-4'>
        <h3 class='text-xl font-semibold'>Contact Us</h3>
        <button
          class='btn btn-sm btn-circle btn-ghost'
          on:click={closeContactModal}
          aria-label='Close'
        >
          <svg xmlns='http://www.w3.org/2000/svg' class='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
            <path stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M6 18L18 6M6 6l12 12' />
          </svg>
        </button>
      </div>

      {#if sendSuccess}
        <div class='text-center py-8'>
          <div class='text-4xl mb-4'>✅</div>
          <p class='text-lg font-medium mb-2'>Message Sent!</p>
          <p class='text-base-content/70 mb-4'>We'll get back to you soon.</p>
          <button class='btn btn-primary' on:click={closeContactModal}>Close</button>
        </div>
      {:else}
        <div class='space-y-4'>
          <div class='form-control'>
            <label class='label' for='contact-email'>
              <span class='label-text'>Your Email</span>
            </label>
            <input
              id='contact-email'
              type='email'
              class='input input-bordered w-full'
              placeholder='you@example.com'
              bind:value={contactEmail}
              disabled={sending}
            />
          </div>

          <div class='form-control'>
            <label class='label' for='contact-message'>
              <span class='label-text'>Message</span>
            </label>
            <textarea
              id='contact-message'
              class='textarea textarea-bordered w-full h-32'
              placeholder='How can we help?'
              bind:value={contactMessage}
              disabled={sending}
            />
          </div>

          {#if sendError}
            <div class='alert alert-error text-sm'>
              <span>{sendError}</span>
            </div>
          {/if}

          <div class='flex gap-2 justify-end'>
            <button class='btn btn-ghost' on:click={closeContactModal} disabled={sending}>
              Cancel
            </button>
            <button class='btn btn-primary' on:click={sendContactMessage} disabled={sending}>
              {#if sending}
                <span class='loading loading-spinner loading-sm'></span>
                Sending...
              {:else}
                Send Message
              {/if}
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<svelte:window on:keydown={handleKeydown} />
