/**
 * Integration tests for Drafts (admin) API
 *
 * Covers GET list, GET by id, DELETE, and POST publish error paths.
 * Requires deployed infrastructure and a valid Cognito test user with
 * admin privileges.
 */
const { apiRequest } = require('./setup')

describe('drafts API Integration Tests', () => {
  it('gET /admin/drafts returns a page of drafts', async () => {
    const { status, data } = await apiRequest('GET', '/admin/drafts?limit=5')

    // Non-admins receive 403; admins receive 200.
    expect([200, 403]).toContain(status)
    if (status === 200) {
      expect(data).toHaveProperty('drafts')
      expect(Array.isArray(data.drafts)).toBe(true)
      expect(data).toHaveProperty('nextCursor')
    }
  })

  it('gET /admin/drafts rejects invalid pagination cursor', async () => {
    const { status, data } = await apiRequest('GET', '/admin/drafts?cursor=not-base64')

    expect([400, 403]).toContain(status)
    if (status === 400) {
      expect(data).toHaveProperty('error')
    }
  })

  it('gET /admin/drafts/{draftId} returns 404 for unknown draft', async () => {
    const { status } = await apiRequest('GET', '/admin/drafts/does-not-exist-draft')

    expect([404, 403]).toContain(status)
  })

  it('dELETE /admin/drafts/{draftId} accepts unknown draft (idempotent)', async () => {
    const { status } = await apiRequest('DELETE', '/admin/drafts/does-not-exist-draft')

    // DynamoDB DeleteItem is idempotent; non-admin gets 403.
    expect([200, 403]).toContain(status)
  })

  it('pOST /admin/drafts/{draftId}/publish rejects missing finalData fields', async () => {
    const { status, data } = await apiRequest(
      'POST',
      '/admin/drafts/does-not-exist-draft/publish',
      { finalData: { date: '2099-01-01' } },
    )

    expect([400, 403]).toContain(status)
    if (status === 400) {
      expect(data).toHaveProperty('error')
    }
  })

  it('pOST /admin/drafts/{draftId}/publish returns 404 for unknown draft', async () => {
    const { status } = await apiRequest(
      'POST',
      '/admin/drafts/does-not-exist-draft/publish',
      {
        finalData: {
          date: '2099-01-01',
          title: 'Nope',
          content: 'Nope',
        },
      },
    )

    expect([404, 403]).toContain(status)
  })
})
