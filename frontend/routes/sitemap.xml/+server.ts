import type { RequestHandler } from './$types'
import { site } from '$lib/config/site'

import { genPosts } from '$lib/utils/posts'

const staticPages = ['/about', '/gallery', '/letters']

function render(): string {
  return `<?xml version='1.0' encoding='utf-8'?>
  <urlset
    xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
    xmlns:xhtml="http://www.w3.org/1999/xhtml"
    xmlns:mobile="http://www.google.com/schemas/sitemap-mobile/1.0"
    xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
    xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
    xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
    <url>
      <loc>${site.protocol + site.domain}</loc>
      <priority>1.0</priority>
    </url>
    ${staticPages
      .map(
        page => `
        <url>
            <loc>${site.protocol + site.domain + page}</loc>
            <priority>0.8</priority>
        </url>`,
      )
      .join('')}
    ${genPosts()
      .map(
        post => `
        <url>
            <loc>${site.protocol + site.domain + post.path}</loc>
            <lastmod>${new Date(post.updated ?? post.published ?? post.created).toISOString()}</lastmod>
            <priority>0.5</priority>
        </url>`,
      )
      .join('')}
  </urlset>`.trim()
}

export const prerender = true
export const trailingSlash = 'never'
export const GET: RequestHandler = async () =>
  new Response(render(), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
    },
  })
