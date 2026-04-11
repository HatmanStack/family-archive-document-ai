<script lang='ts'>
  import { browser, dev } from '$app/environment'
  import { authTokens, currentUser, isAuthenticated } from '$lib/auth/auth-store'
  import UserMenu from '$lib/components/auth/UserMenu.svelte'
  import Nav from '$lib/components/header_nav.svelte'
  import Search from '$lib/components/header_search.svelte'
  import { header as headerConfig, theme } from '$lib/config/general'
  import { getProfile, updateProfile } from '$lib/services/profile-service'
  import { title as storedTitle } from '$lib/stores/title'
  import { hslToHex } from '$lib/utils/color'
  import { ChevronUp, Icon, MagnifyingGlass, Swatch, XMark } from 'svelte-hero-icons'
  import { fly } from 'svelte/transition'

  export let path: string
  let title: string
  let currentTheme: string
  let currentThemeColor: string
  let search: boolean = false
  let pin: boolean = true
  let percent: number
  let showThemePicker = false
  let [scrollY, lastY] = [0, 0]
  let profileThemeLoaded = false

  storedTitle.subscribe(storedTitle => (title = storedTitle as string))

  // Check if user is approved (in ApprovedUsers group)
  $: isUserApproved = $isAuthenticated && $currentUser
    && ($currentUser['cognito:groups']?.includes('ApprovedUsers') || false)

  // Hide scroll-to-top button on messages pages (they have their own scroll container)
  $: isMessagesPage = path?.startsWith('/messages/')

  // Load theme from profile when user logs in
  $: if (browser && $isAuthenticated && $currentUser?.sub && $authTokens?.idToken && !profileThemeLoaded) {
    profileThemeLoaded = true
    loadThemeFromProfile($currentUser.sub)
  }

  async function loadThemeFromProfile(userId: string) {
    try {
      const result = await getProfile(userId)
      if (result.success && result.data && !Array.isArray(result.data) && result.data.theme) {
        currentTheme = result.data.theme
        localStorage.setItem('theme', result.data.theme)
      }
    }
    catch (e) {
      console.error('Failed to load theme from profile:', e)
    }
  }

  async function saveThemeToProfile(themeName: string) {
    if (!$isAuthenticated || !$authTokens?.idToken)
      return
    try {
      await updateProfile({ theme: themeName })
    }
    catch (e) {
      console.error('Failed to save theme to profile:', e)
    }
  }

  $: if (browser && currentTheme) {
    document.documentElement.setAttribute('data-theme', currentTheme)
    currentThemeColor = hslToHex(
      ...(getComputedStyle(document.documentElement)
        .getPropertyValue('--b1')
        .slice(dev ? 1 : 0)
        .replaceAll('%', '')
        .split(' ')
        .map(Number) as [number, number, number]),
    )
  }

  $: if (scrollY) {
    pin = !!(lastY - scrollY > 0 || scrollY === 0)
    lastY = scrollY
    if (browser) {
      percent
        = Math.round((scrollY / (document.documentElement.scrollHeight - document.documentElement.clientHeight)) * 10000) / 100
    }
  }

  if (browser) {
    currentTheme
      = localStorage.getItem('theme')
      ?? 'retro' // Default to retro theme
  }
</script>

<svelte:head>
  <meta content={currentThemeColor} name='theme-color' />
</svelte:head>

<svelte:window bind:scrollY />

<header
  class="w-full fixed z-50 transition-all duration-500 ease-in-out border-b-2 border-transparent max-h-[4.125rem]{scrollY
    > 32 && 'backdrop-blur !border-base-content/10 bg-base-100/30 md:bg-base-200/30'}"
  class:-translate-y-32={!pin && scrollY > 0}
  id='header'>
  {#if !search}
    <div class='navbar max-w-screen-md mx-auto' in:fly={{ delay: 300, duration: 300, x: -50 }} out:fly={{ duration: 300, x: -50 }}>
      <div class='navbar-start'>
        {#if headerConfig.nav}
          <Nav nav={headerConfig.nav} {path} {pin} {scrollY} {title} />
        {/if}
        <a class='btn btn-ghost text-lg normal-case' href='/'>Home</a>

        <!-- Hide these links on small screens -->
        <div class='ml-4 hidden lg:flex space-x-2'>
          <a class='btn btn-ghost normal-case' href='/about' class:btn-active={path === '/about'}>About</a>
          {#if isUserApproved}
            <a class='btn btn-ghost normal-case' href='/letters' class:btn-active={path?.startsWith('/letters')}>Letters</a>
            <a class='btn btn-ghost normal-case' href='/gallery' class:btn-active={path === '/gallery'}>Gallery</a>
          {/if}
        </div>
      </div>
      <div class='navbar-end'>
        {#if headerConfig.search}
          <button aria-label='search' class='btn btn-ghost btn-square' onclick={() => (search = !search)} tabindex='0'>
            <Icon src={MagnifyingGlass} class='w-6 h-6' />
          </button>
        {/if}
        <div class='relative' id='change-theme'>
          <button class='btn btn-square btn-ghost' onclick={() => { showThemePicker = !showThemePicker }}>
            <Icon src={Swatch} class='w-6 h-6' />
          </button>
          {#if showThemePicker}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div class='absolute right-0 mt-3 z-[200] bg-base-100 rounded-box w-52 p-2 shadow-2xl overflow-y-auto max-h-[21.5rem] flex flex-col gap-2' onclick={e => e.stopPropagation()}>
              {#each theme as { name, text }}
                <button
                  class='btn btn-ghost w-full flex bg-base-100 p-2 transition-all rounded-lg hover:bg-primary group'
                  class:border-2={currentTheme === name}
                  class:border-primary={currentTheme === name}
                  data-theme={name}
                  onclick={() => {
                    currentTheme = name
                    localStorage.setItem('theme', name)
                    saveThemeToProfile(name)
                    showThemePicker = false
                  }}>
                  <p class='flex-1 text-base-content text-left group-hover:text-primary-content transition-color'>
                    {text ?? name}
                  </p>
                  <div class='grid m-auto grid-cols-4 gap-0.5'>
                    {#each ['bg-primary', 'bg-secondary', 'bg-accent', 'bg-neutral'] as bg}
                      <div class={`${bg} w-1 h-4 rounded-btn`} />
                    {/each}
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <UserMenu />
      </div>
    </div>
  {:else}
    <div class='navbar max-w-screen-md mx-auto' in:fly={{ delay: 300, duration: 300, x: 50 }} out:fly={{ duration: 300, x: 50 }}>
      <Search />
      <button class='btn btn-square btn-ghost' onclick={() => (search = !search)} tabindex='0'>
        <Icon src={XMark} class='w-6 h-6' />
      </button>
    </div>
  {/if}
</header>

<button
  aria-label='scroll to top'
  class="fixed grid group btn btn-circle btn-lg z-50 duration-500 ease-in-out border-none backdrop-blur bottom-6 right-6{percent
  > 95
    ? 'btn-accent shadow-lg'
    : 'btn-ghost bg-base-100/30 md:bg-base-200/30'}"
  class:opacity-100={scrollY && !isMessagesPage}
  class:translate-y-24={!pin || scrollY === 0 || isMessagesPage}
  class:hidden={isMessagesPage}
  id='totop'
  onclick={() => window.scrollTo(0, 0)}>
  <!-- https://daisyui.com/blog/how-to-update-daisyui-4/#3-all--focus-colors-are-removed -->
  <div
    class='transition-all duration-500 ease-in-out radial-progress text-accent group-hover:text-[color-mix(in_oklab,oklch(var(--a)),black_7%)] col-start-1 row-start-1'
    style={`--size:4rem; --thickness: 0.25rem; --value:${percent};`} />
  <div
    class='col-start-1 row-start-1 rounded-full w-full h-full grid duration-500 ease-in-out p-4 border-4 border-base-content/10 group-hover:border-transparent'
    class:border-transparent={percent > 95}>
    <Icon src={ChevronUp} solid class='w-6 h-6' />
  </div>
</button>
