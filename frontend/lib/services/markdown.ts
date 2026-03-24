import { authStore } from '$lib/auth/auth-store'
import { refreshSession } from '$lib/auth/auth-utils'
import { getApiBaseUrl } from '$lib/utils/api-url'
import { get } from 'svelte/store'

const API_BASE = getApiBaseUrl()

function extractFrontmatter(content: string) {
  const match = content.match(/^---([\s\S]*?)---([\s\S]*)$/)
  if (!match)
    return { frontmatter: '', content }
  return {
    frontmatter: match[1].trim(),
    content: match[2].trim(),
  }
}

function combineFrontmatterAndContent(frontmatter: string, content: string) {
  return `---\n${frontmatter}\n---\n\n${content}`
}

async function checkAuthentication(): Promise<{ authenticated: boolean, token?: string }> {
  const auth = get(authStore)

  if (!auth.isAuthenticated || !auth.tokens) {
    try {
      await refreshSession()
      const newAuth = get(authStore)
      if (!newAuth.isAuthenticated || !newAuth.tokens) {
        return { authenticated: false }
      }
      return { authenticated: true, token: newAuth.tokens.idToken }
    }
    catch (error) {
      console.warn('Session refresh failed:', error)
      return { authenticated: false }
    }
  }

  return { authenticated: true, token: auth.tokens.idToken }
}

export async function getMarkdownContent(letterPath: string): Promise<string> {
  const response = await fetch(`/api/markdown?path=${encodeURIComponent(letterPath)}`)

  if (!response.ok) {
    throw new Error(`Failed to load markdown: ${response.status}`)
  }

  const data = await response.json()
  const { content } = extractFrontmatter(data.content)
  return content
}

export async function saveMarkdownContent(path: string, content: string): Promise<boolean> {
  const response = await fetch(`/api/markdown?path=${encodeURIComponent(path)}`)
  if (!response.ok) {
    throw new Error('Failed to get original content')
  }
  const data = await response.json()
  const { frontmatter } = extractFrontmatter(data.content)

  const fullContent = combineFrontmatterAndContent(frontmatter, content.trim())

  const localResponse = await fetch('/api/markdown', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path,
      content: fullContent,
    }),
  })

  if (!localResponse.ok) {
    throw new Error(`Failed to save locally: ${localResponse.status}`)
  }

  try {
    const { authenticated, token } = await checkAuthentication()

    if (!authenticated) {
      return true
    }

    const s3Payload = {
      type: 'markdown',
      key: path,
      content: fullContent,
    }

    await fetch(`${API_BASE}/pdf-download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(s3Payload),
    })
  }
  catch {
    // S3 backup failure is non-fatal
  }

  return true
}
