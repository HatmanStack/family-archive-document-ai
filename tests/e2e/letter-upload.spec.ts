import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { clearAuth, setupAuth, TEST_USERS, waitForAuthInit } from './auth-helpers'

/**
 * Smoke test for the letter upload pipeline.
 *
 * Logs in as the seeded test user, opens the gallery upload modal, uploads a
 * tiny fixture PDF, and polls the letters list until the new letter shows up.
 *
 * Polling timeout is configurable via env vars:
 *   LETTER_UPLOAD_TIMEOUT_MS (default 60000)
 *   LETTER_UPLOAD_POLL_MS    (default 2000)
 *
 * The test skips cleanly when RAGSTACK_* env vars are unset, since the
 * Gemini parse step requires real RAGStack credentials to round-trip the
 * title and date.
 */

const TIMEOUT_MS = Number(process.env.LETTER_UPLOAD_TIMEOUT_MS || 60000)
const POLL_MS = Number(process.env.LETTER_UPLOAD_POLL_MS || 2000)

// Minimal valid 1-page PDF (text "ok"). Generated once and inlined to avoid
// shipping binary fixtures with the repo.
const TINY_PDF_BASE64
  = 'JVBERi0xLjEKJcKlwrHDqwoKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2'
    + 'VzIDIgMCBSCiAgPj4KZW5kb2JqCgoyIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2VzCiAgICAgL0tp'
    + 'ZHMgWzMgMCBSXQogICAgIC9Db3VudCAxCiAgICAgL01lZGlhQm94IFswIDAgMzAwIDE0NF0KIC'
    + 'A+PgplbmRvYmoKCjMgMCBvYmoKICA8PCAgL1R5cGUgL1BhZ2UKICAgICAgL1BhcmVudCAyIDAg'
    + 'UgogICAgICAvUmVzb3VyY2VzCiAgICAgICA8PCAvRm9udAogICAgICAgICAgIDw8IC9GMQogIC'
    + 'AgICAgICAgICAgICA8PCAvVHlwZSAvRm9udAogICAgICAgICAgICAgICAgICAvU3VidHlwZSAv'
    + 'VHlwZTEKICAgICAgICAgICAgICAgICAgL0Jhc2VGb250IC9UaW1lcy1Sb21hbgogICAgICAgIC'
    + 'AgICAgID4+CiAgICAgICAgICAgPj4KICAgICAgID4+CiAgICAgIC9Db250ZW50cyA0IDAgUgog'
    + 'ID4+CmVuZG9iagoKNCAwIG9iagogIDw8IC9MZW5ndGggNTUgPj4Kc3RyZWFtCiAgQlQKICAgIC'
    + '9GMSAxOCBUZgogICAgMCAwIFRkCiAgICAob2spIFRqCiAgRVQKZW5kc3RyZWFtCmVuZG9iagoK'
    + 'eHJlZgowIDUKMDAwMDAwMDAwMCA2NTUzNSBmCjAwMDAwMDAwMTggMDAwMDAgbgowMDAwMDAwMD'
    + 'c3IDAwMDAwIG4KMDAwMDAwMDE3OCAwMDAwMCBuCjAwMDAwMDA0NTcgMDAwMDAgbgp0cmFpbGVy'
    + 'CiAgPDwgIC9Sb290IDEgMCBSCiAgICAgIC9TaXplIDUKICA+PgpzdGFydHhyZWYKNTY1CiUlRU'
    + '9G'

test.describe('Letter Upload Pipeline Smoke', () => {
  test.skip(
    !process.env.PUBLIC_RAGSTACK_API_KEY && !process.env.RAGSTACK_API_KEY,
    'Requires RAGSTACK_* env vars; skipping in mock mode',
  )

  test.beforeEach(async ({ page }) => {
    await setupAuth(page, TEST_USERS.adminUser)
  })

  test.afterEach(async ({ page }) => {
    await clearAuth(page)
  })

  test('uploads a PDF and the letter appears in the list', async ({ page }) => {
    await page.goto('/gallery')
    await waitForAuthInit(page)

    // Open upload modal. Selectors intentionally tolerant.
    await page.getByRole('button', { name: /upload/i }).first().click()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'smoke-test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(TINY_PDF_BASE64, 'base64'),
    })

    await page.getByRole('button', { name: /upload|submit|start/i }).last().click()

    // Poll the letters list until the smoke test letter shows up. The Gemini
    // parse step round-trips title and date from the PDF content.
    const deadline = Date.now() + TIMEOUT_MS
    let appeared = false
    let lastTitle: string | null = null
    let lastDate: string | null = null

    while (Date.now() < deadline) {
      const response = await page.request.get('/api/letters?limit=20')
      if (response.ok()) {
        const body = await response.json()
        const items = (body.items || []) as Array<{ title: string; date: string }>
        const match = items.find(
          item => /smoke|ok/i.test(item.title || '') || /\d{4}-\d{2}-\d{2}/.test(item.date || ''),
        )
        if (match) {
          appeared = true
          lastTitle = match.title
          lastDate = match.date
          break
        }
      }
      await page.waitForTimeout(POLL_MS)
    }

    expect(appeared, `Letter did not appear within ${TIMEOUT_MS}ms`).toBe(true)
    expect(lastTitle).toBeTruthy()
    expect(lastDate).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })
})
