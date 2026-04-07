/**
 * Integration tests for Media (download) API
 *
 * Covers presigned download URL happy path and the validation guardrails
 * (allowed prefixes, path traversal). Requires deployed infrastructure and
 * a valid Cognito test user.
 */
const { apiRequest } = require('./setup')

describe('media API Integration Tests', () => {
  it('gET /download/presigned-url returns a URL for an allowed prefix', async () => {
    const key = encodeURIComponent('media/test/example.jpg')
    const { status, data } = await apiRequest('GET', `/download/presigned-url?key=${key}`)

    expect(status).toBe(200)
    expect(data).toHaveProperty('downloadUrl')
    expect(typeof data.downloadUrl).toBe('string')
    expect(data.downloadUrl.startsWith('https://')).toBe(true)
    expect(data).toHaveProperty('filename', 'example.jpg')
  })

  it('gET /download/presigned-url rejects missing key', async () => {
    const { status, data } = await apiRequest('GET', '/download/presigned-url')

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('gET /download/presigned-url rejects keys outside allowed prefixes', async () => {
    const key = encodeURIComponent('secret/credentials.json')
    const { status, data } = await apiRequest('GET', `/download/presigned-url?key=${key}`)

    expect(status).toBe(403)
    expect(data).toHaveProperty('error')
  })

  it('gET /download/presigned-url rejects path traversal attempts', async () => {
    const key = encodeURIComponent('media/../secret.txt')
    const { status, data } = await apiRequest('GET', `/download/presigned-url?key=${key}`)

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })
})
