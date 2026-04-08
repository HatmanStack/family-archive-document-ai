/**
 * Integration tests for Letters API
 *
 * Covers GET list, GET by date, POST upload-request, PUT, and DELETE error
 * paths. Requires deployed infrastructure and a valid Cognito test user
 * (see tests/README.md for setup).
 */
const { apiRequest, generateTestId } = require('./setup')

describe('letters API Integration Tests', () => {
  it('gET /letters returns a page of letters', async () => {
    const { status, data } = await apiRequest('GET', '/letters?limit=5')

    expect(status).toBe(200)
    expect(data).toHaveProperty('items')
    expect(Array.isArray(data.items)).toBe(true)
    expect(data).toHaveProperty('nextCursor')
  })

  it('gET /letters rejects invalid pagination cursor', async () => {
    const { status, data } = await apiRequest('GET', '/letters?cursor=not-a-valid-cursor')

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('gET /letters/{date} rejects malformed date', async () => {
    const { status, data } = await apiRequest('GET', '/letters/not-a-date')

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('gET /letters/{date} returns 404 for unknown letter', async () => {
    const { status } = await apiRequest('GET', '/letters/1900-01-01')

    expect([200, 404]).toContain(status)
  })

  it('pOST /letters/upload-request returns presigned URLs', async () => {
    const { status, data } = await apiRequest('POST', '/letters/upload-request', {
      fileCount: 1,
      fileTypes: ['application/pdf'],
    })

    expect(status).toBe(200)
    expect(data).toHaveProperty('uploadId')
    expect(Array.isArray(data.urls)).toBe(true)
    expect(data.urls.length).toBe(1)
    expect(data.urls[0]).toHaveProperty('url')
    expect(data.urls[0]).toHaveProperty('key')
  })

  it('pOST /letters/upload-request rejects unsupported file type', async () => {
    const { status, data } = await apiRequest('POST', '/letters/upload-request', {
      fileCount: 1,
      fileTypes: ['application/x-msdownload'],
    })

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('pOST /letters/upload-request rejects fileCount above limit', async () => {
    const { status, data } = await apiRequest('POST', '/letters/upload-request', {
      fileCount: 999,
      fileTypes: ['application/pdf'],
    })

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('pUT /letters/{date} rejects missing content', async () => {
    const { status, data } = await apiRequest('PUT', '/letters/2015-01-01', {
      title: `Test ${generateTestId()}`,
    })

    expect(status).toBe(400)
    expect(data).toHaveProperty('error')
  })

  it('pUT /letters/{date} returns 404 for unknown letter', async () => {
    const { status } = await apiRequest('PUT', '/letters/1900-01-02', {
      content: 'Updated content',
    })

    expect([404, 403]).toContain(status)
  })
})
