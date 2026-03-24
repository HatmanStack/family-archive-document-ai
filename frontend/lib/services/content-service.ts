import { apiClient } from '$lib/auth/api-client'
import { refreshSession } from '$lib/auth/client'

interface ContentListItem {
  key: string
  lastModified: string
  size: number
  isDirectory: boolean
}

export class ContentService {
  async getContent(path: string): Promise<string> {
    let s3Key = path

    if (s3Key.startsWith('/')) {
      s3Key = s3Key.substring(1)
    }

    if (!s3Key.startsWith('letters/')) {
      s3Key = `letters/${s3Key}`
    }
    if (!s3Key.endsWith('/+page.svelte.md')) {
      s3Key = `${s3Key}/+page.svelte.md`
    }

    // getContent uses no auth (public endpoint)
    const data = await apiClient.post<Record<string, unknown>>(
      '/pdf-download',
      { key: s3Key, type: 'markdown' },
      { requireAuth: false },
    )

    return (data.content || data.body || data) as string
  }

  async saveContent(path: string, content: string): Promise<boolean> {
    let s3Key = path

    if (s3Key.startsWith('/')) {
      s3Key = s3Key.substring(1)
    }

    if (!s3Key.startsWith('letters/')) {
      s3Key = `letters/${s3Key}`
    }
    if (!s3Key.endsWith('/+page.svelte.md')) {
      s3Key = `${s3Key}/+page.svelte.md`
    }

    try {
      await apiClient.post(
        '/pdf-download',
        { type: 'markdown', key: s3Key, content },
      )
      return true
    }
    catch {
      // Try refreshing session and retry
      try {
        await refreshSession()
        await apiClient.post(
          '/pdf-download',
          { type: 'markdown', key: s3Key, content },
        )
        return true
      }
      catch (error) {
        throw new Error(`Failed to save content: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }
  }

  async listContent(_prefix: string = ''): Promise<ContentListItem[]> {
    return []
  }

  async deleteContent(_path: string): Promise<boolean> {
    throw new Error('Delete functionality not implemented')
  }

  async contentExists(path: string): Promise<boolean> {
    try {
      await this.getContent(path)
      return true
    }
    catch (error) {
      console.warn('Content does not exist:', path, error)
      return false
    }
  }
}

export const contentService = new ContentService()
