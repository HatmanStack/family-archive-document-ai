/**
 * HTML utility functions shared across Lambdas
 */

/**
 * Escape HTML special characters to prevent XSS in email templates.
 * Canonical implementation — imported by API validation and notification-processor.
 */
export function escapeHtml(text: string): string {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
