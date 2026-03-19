import { authStore } from '$lib/auth/auth-store'
import { refreshSession } from '$lib/auth/client'
import { getApiBaseUrl } from '$lib/utils/api-url'
import { get } from 'svelte/store'

const API_BASE = getApiBaseUrl()

async function ensureAuthenticated() {
  const auth = get(authStore)

  // If we have a valid token, use it
  if (auth.isAuthenticated && auth.tokens) {
    return auth.tokens.idToken
  }

  // Try to refresh if not authenticated
  try {
    await refreshSession()
    const newAuth = get(authStore)
    if (newAuth.isAuthenticated && newAuth.tokens) {
      return newAuth.tokens.idToken
    }
  }
  catch (refreshError) {
    console.warn('Token refresh failed:', refreshError)
  }

  // If we still don't have a valid token, throw error
  throw new Error('Authentication required')
}

export async function getMarkdownContent(letterPath: string): Promise<string> {
  try {
    // Use the API endpoint without requiring authentication for reading
    const response = await fetch(`/api/markdown?path=${encodeURIComponent(letterPath)}`)

    if (!response.ok) {
      throw new Error(`Failed to load markdown: ${response.status}`)
    }

    const data = await response.json()
    return data.content
  }
  catch (error) {
    console.error('Error loading markdown content:', error)
    throw error
  }
}

export async function saveMarkdownContent(content: string): Promise<boolean> {
  const currentUrl = new URL(window.location.href)
  const sanitizedTitle = decodeURIComponent(currentUrl.pathname)

  try {
    // Save locally first
    const localResponse = await fetch('/api/markdown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        path: sanitizedTitle,
        content,
      }),
    })

    if (!localResponse.ok) {
      throw new Error(`Failed to save locally: ${localResponse.status}`)
    }
    // Try to save to S3 as backup
    try {
      const token = await ensureAuthenticated()

      const s3Response = await fetch(`${API_BASE}/pdf-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'markdown',
          key: sanitizedTitle,
          content,
        }),
      })

      if (!s3Response.ok) {
        const errorText = await s3Response.text()
        console.warn('S3 backup failed:', {
          status: s3Response.status,
          error: errorText,
        })
      }
      else {
        await s3Response.text()
      }
    }
    catch (s3Error) {
      console.warn('S3 backup failed:', s3Error)
      // Don't fail the save operation for S3 backup failure
    }

    // Trigger rebuild to update the site
    try {
      const rebuildResponse = await fetch('/api/rebuild', {
        method: 'POST',
      })
      if (!rebuildResponse.ok) {
        console.warn('Rebuild request failed:', rebuildResponse.status)
      }
    }
    catch (rebuildError) {
      console.warn('Rebuild failed:', rebuildError)
    }

    return true
  }
  catch (error) {
    console.error('Error saving markdown content:', error)
    throw error
  }
}

export async function downloadSourcePdf(): Promise<void> {
  const currentUrl = new URL(window.location.href)
  const sanitizedTitle = decodeURIComponent(currentUrl.pathname)

  try {
    const token = await ensureAuthenticated()

    const response = await fetch(`${API_BASE}/pdf-download`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'pdf',
        key: sanitizedTitle,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('PDF download error response:', errorText)
      throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    }

    // Check if response is base64 encoded PDF
    const contentType = response.headers.get('content-type')
    let pdfBlob

    if (contentType === 'application/pdf') {
      // Lambda returns base64 encoded PDF, convert to blob
      const responseText = await response.text()

      // Check if response is JSON wrapped
      let base64Data
      try {
        const jsonResponse = JSON.parse(responseText)
        base64Data = jsonResponse.body || jsonResponse
      }
      catch {
        base64Data = responseText
      }

      // Ensure base64Data is a string and clean it
      base64Data = String(base64Data).replace(/\s/g, '')

      try {
        const binaryString = atob(base64Data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        pdfBlob = new Blob([bytes], { type: 'application/pdf' })
      }
      catch (error) {
        console.error('Base64 decode error:', error)
        console.error('Base64 data type:', typeof base64Data)
        console.error('Base64 data length:', base64Data.length)
        console.error('Base64 data sample:', base64Data.substring(0, 100))
        throw new Error('Failed to decode PDF data')
      }
    }
    else {
      // Fallback to blob response
      pdfBlob = await response.blob()
    }

    const blobUrl = URL.createObjectURL(pdfBlob)

    const pathParts = sanitizedTitle.split('/').filter(Boolean)
    const filename = pathParts.length > 0
      ? `${pathParts.at(-1)}.pdf`
      : 'letter.pdf'
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()

    setTimeout(() => {
      URL.revokeObjectURL(blobUrl)
      document.body.removeChild(link)
    }, 200)
  }
  catch (error) {
    console.error('Error downloading PDF:', error)
    throw error
  }
}

export async function addLetterLambda(files: File | File[]): Promise<string> {
  try {
    const token = await ensureAuthenticated()

    const filesArray = Array.isArray(files) ? files : [files]
    const filePromises = filesArray.map(async (file) => {
      const base64 = await fileToBase64(file)
      return {
        fileName: file.name,
        contentType: file.type,
        fileData: base64,
        size: Math.round(file.size / 1024),
      }
    })

    const fileData = await Promise.all(filePromises)
    const payload = {
      type: 'create',
      files: fileData,
    }

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const responseData = await response.json()
    return responseData.message || 'Upload successful'
  }
  catch (error) {
    console.error('Error uploading files:', error)
    throw error
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const base64String = reader.result as string
      const base64Content = base64String.split(',')[1]
      resolve(base64Content)
    }
    reader.onerror = error => reject(error)
  })
}
