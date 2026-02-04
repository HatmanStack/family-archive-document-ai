<script lang='ts'>
  import { site } from '$lib/config/site'

  export let post: undefined | Urara.Post
  export let page: undefined | Urara.Page

  const defaultOgImage = '/og-image.jpg'
  const ogImageUrl = site.protocol + site.domain + defaultOgImage
</script>

<svelte:head>
  <meta content={site.title} property='og:site_name' />
  <meta content={site.lang} property='og:locale' />
  <!-- Twitter meta tags -->
  <meta name='twitter:site' content='@familyarchiveai' />
  {#if post}
    <meta content='article' property='og:type' />
    <meta content={post.title ?? post.summary ?? post.path.slice(1)} property='og:title' />
    <meta name='twitter:title' content={post.title ?? post.summary ?? post.path.slice(1)} />
    {#if post.summary}
      <meta content={post.summary} property='og:description' />
      <meta name='twitter:description' content={post.summary} />
    {/if}
    {#if post?.author}
      <meta property='article:author' content={post.author} />
    {:else}
      <meta property='article:author' content={site.author.name} />
    {/if}
    {#if post.image}
      <meta content={(post.image.startsWith('http') ? '' : site.protocol + site.domain) + post.image} property='og:image' />
      <meta content='2419' property='og:image:width' />
      <meta content='1133' property='og:image:height' />
      <meta content='summary_large_image' name='twitter:card' />
      <meta name='twitter:image' content={(post.image.startsWith('http') ? '' : site.protocol + site.domain) + post.image} />
    {:else}
      <meta content={ogImageUrl} property='og:image' />
      <meta content='2419' property='og:image:width' />
      <meta content='1133' property='og:image:height' />
      <meta content='summary_large_image' name='twitter:card' />
      <meta name='twitter:image' content={ogImageUrl} />
    {/if}
    {#if post.tags}
      {#each post.tags as tag}
        <meta content={tag} property='article:tag' />
      {/each}
    {/if}
    <meta content={site.protocol + site.domain + post.path} property='og:url' />
    <meta content={site.author.name} property='article:author' />
    <meta content={post.published ?? post.created} property='article:published_time' />
    <meta content={post.updated ?? post.published ?? post.created} property='article:modified_time' />
  {:else}
    <meta content='website' property='og:type' />
    <meta content={ogImageUrl} property='og:image' />
    <meta content='2419' property='og:image:width' />
    <meta content='1133' property='og:image:height' />
    <meta content={site.description} property='og:description' />
    <meta content='summary_large_image' name='twitter:card' />
    <meta name='twitter:image' content={ogImageUrl} />
    <meta name='twitter:description' content={site.description} />
    {#if page}
      <meta content={page.title ?? page.path.slice(1)} property='og:title' />
      <meta name='twitter:title' content={page.title ?? page.path.slice(1)} />
      <meta content={site.protocol + site.domain + page.path} property='og:url' />
    {:else}
      <meta content={site.title} property='og:title' />
      <meta name='twitter:title' content={site.title} />
      <meta content={site.protocol + site.domain} property='og:url' />
    {/if}
  {/if}
</svelte:head>
