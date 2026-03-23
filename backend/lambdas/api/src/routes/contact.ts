/**
 * Contact form route handler
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { RequestContext } from '../types'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { successResponse, errorResponse } from '../lib/responses'
import { log } from '../lib/logger'
import { escapeHtml } from '../lib/validation'
import { toError } from '../lib/errors'

const sesClient = new SESClient({})
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL || ''
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ''

/**
 * Main contact route handler
 */
export async function handle(
  event: APIGatewayProxyEvent,
  context: RequestContext
): Promise<APIGatewayProxyResult> {
  const { requestOrigin } = context
  const { httpMethod } = event

  if (httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', requestOrigin)
  }

  let body: { email?: string; message?: string }
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return errorResponse(400, 'Invalid JSON body', requestOrigin)
  }

  const { email, message } = body

  if (!email || !message) {
    return errorResponse(400, 'Email and message are required', requestOrigin)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse(400, 'Invalid email format', requestOrigin)
  }

  if (message.length > 5000) {
    return errorResponse(400, 'Message too long (max 5000 characters)', requestOrigin)
  }

  try {
    if (!ADMIN_EMAIL || !SES_FROM_EMAIL) {
      const missing = [!ADMIN_EMAIL && 'ADMIN_EMAIL', !SES_FROM_EMAIL && 'SES_FROM_EMAIL'].filter(Boolean)
      log.error('contact_not_configured', { missing })
      return errorResponse(500, 'Contact form not configured', requestOrigin)
    }

    const subject = `Contact Form: Message from ${email}`

    const bodyHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">New Contact Form Submission</h2>
        <p><strong>From:</strong> ${escapeHtml(email)}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
        <div style="background: #f5f5f5; padding: 16px; border-radius: 8px;">
          <p style="margin: 0; white-space: pre-wrap;">${escapeHtml(message)}</p>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 16px 0;" />
        <p style="color: #888; font-size: 12px;">
          This message was sent via the Family Archive - Document AI contact form.
        </p>
      </div>
    `

    await sesClient.send(new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [ADMIN_EMAIL] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: bodyHtml } },
      },
      ReplyToAddresses: [email],
    }))

    log.info('contact_sent', { from: email })
    return successResponse({ message: 'Message sent successfully' }, 200, requestOrigin)
  } catch (err) {
    log.error('contact_error', { error: toError(err).message })
    return errorResponse(500, 'Failed to send message', requestOrigin)
  }
}
