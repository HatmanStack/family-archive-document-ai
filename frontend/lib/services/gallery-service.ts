import { apiClient } from '$lib/auth/api-client'

export interface GalleryItem {
  id: string
  filename: string
  title: string
  description?: string
  uploadDate: string
  fileSize: number
  contentType: string
  thumbnailUrl?: string
  signedUrl: string
  category: 'pictures' | 'videos' | 'documents'
}

// Get gallery items by calling API Gateway endpoint
export async function getGalleryItems(
  category: 'pictures' | 'videos' | 'documents',
  _userId: string,
  _authToken: string,
): Promise<GalleryItem[]> {
  try {
    const data = await apiClient.get<Record<string, unknown>>(`/gallery/${category}`)
    return (data.items || []) as GalleryItem[]
  }
  catch (error) {
    console.error(`Error fetching ${category} from API Gateway:`, error)
    throw new Error(`Failed to load ${category} from gallery: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// Health check function to verify API Gateway connection
export async function checkAPIGatewayConnection(_authToken: string): Promise<boolean> {
  try {
    await apiClient.get('/gallery/health')
    return true
  }
  catch (error) {
    console.error('API Gateway connection check failed:', error)
    return false
  }
}

// Download letter function using API Gateway
export async function downloadLetter(_title: string, _authToken: string): Promise<{ downloadUrl: string, fileNameSuggestion: string }> {
  try {
    const encodedTitle = encodeURIComponent(_title)
    const data = await apiClient.get<Record<string, unknown>>(`/gallery/letters/${encodedTitle}`)

    if (!data.downloadUrl) {
      throw new Error('No download URL received from server')
    }

    return {
      downloadUrl: data.downloadUrl as string,
      fileNameSuggestion: (data.fileNameSuggestion as string) || `${_title}.pdf`,
    }
  }
  catch (error) {
    console.error('Error downloading letter:', error)
    throw new Error(`Failed to download letter: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
