import { PUBLIC_RAGSTACK_API_KEY, PUBLIC_RAGSTACK_GRAPHQL_URL } from '$env/static/public'

export interface RagstackUploadResult {
  documentId?: string
  imageId?: string
}

const CREATE_UPLOAD_URL = `mutation CreateUploadUrl($filename: String!) {
  createUploadUrl(filename: $filename) {
    uploadUrl
    documentId
    fields
  }
}`

const CREATE_IMAGE_UPLOAD_URL = `mutation CreateImageUploadUrl($filename: String!, $autoProcess: Boolean, $userCaption: String) {
  createImageUploadUrl(filename: $filename, autoProcess: $autoProcess, userCaption: $userCaption) {
    uploadUrl
    imageId
    fields
  }
}`

const SUBMIT_IMAGE = `mutation SubmitImage($input: SubmitImageInput!) {
  submitImage(input: $input) {
    imageId
    status
  }
}`

async function graphqlRequest(query: string, variables: Record<string, unknown>) {
  if (!PUBLIC_RAGSTACK_GRAPHQL_URL || !PUBLIC_RAGSTACK_API_KEY) {
    throw new Error('RAGStack not configured')
  }

  const response = await fetch(PUBLIC_RAGSTACK_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': PUBLIC_RAGSTACK_API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`RAGStack request failed: ${response.status}`)
  }

  const json = await response.json()

  if (json.errors) {
    throw new Error(json.errors[0]?.message || 'GraphQL error')
  }

  return json.data
}

export async function uploadDocumentToRagstack(file: File): Promise<string> {
  const data = await graphqlRequest(CREATE_UPLOAD_URL, { filename: file.name })
  const { uploadUrl, documentId, fields } = data.createUploadUrl

  const form = new FormData()
  let parsedFields = JSON.parse(fields)
  if (typeof parsedFields === 'string') {
    parsedFields = JSON.parse(parsedFields)
  }

  Object.entries(parsedFields).forEach(([k, v]) => form.append(k, v as string))
  form.append('file', file)

  // Use no-cors: S3 presigned POSTs may not return CORS headers.
  // If fetch didn't throw, the upload was sent.
  await fetch(uploadUrl, { method: 'POST', body: form, mode: 'no-cors' })

  return documentId
}

export async function uploadImageToRagstack(
  file: File,
  userCaption?: string,
  extractText = false,
): Promise<string> {
  const data = await graphqlRequest(CREATE_IMAGE_UPLOAD_URL, {
    filename: file.name,
    autoProcess: true,
    userCaption: userCaption || '',
  })

  const { uploadUrl, imageId, fields } = data.createImageUploadUrl

  const form = new FormData()
  let parsedFields = JSON.parse(fields)
  if (typeof parsedFields === 'string') {
    parsedFields = JSON.parse(parsedFields)
  }

  Object.entries(parsedFields).forEach(([k, v]) => form.append(k, v as string))
  form.append('file', file)

  // Use no-cors: S3 presigned POSTs may not return CORS headers.
  await fetch(uploadUrl, { method: 'POST', body: form, mode: 'no-cors' })

  if (extractText) {
    try {
      await graphqlRequest(SUBMIT_IMAGE, {
        input: { imageId, extractText: true },
      })
    }
    catch {
      console.warn('Failed to request text extraction for image:', imageId)
    }
  }

  return imageId
}

export async function uploadToRagstack(file: File, userCaption?: string, extractText = false): Promise<RagstackUploadResult> {
  const isImage = file.type.startsWith('image/')

  if (isImage) {
    const imageId = await uploadImageToRagstack(file, userCaption, extractText)
    return { imageId }
  }
  else {
    // Documents, videos, and other files
    const documentId = await uploadDocumentToRagstack(file)
    return { documentId }
  }
}
