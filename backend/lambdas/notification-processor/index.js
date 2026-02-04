const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb')

const dynamoClient = new DynamoDBClient({})
const docClient = DynamoDBDocumentClient.from(dynamoClient)
const sesClient = new SESClient({})

const TABLE_NAME = process.env.TABLE_NAME
const SES_FROM_EMAIL = process.env.SES_FROM_EMAIL
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'

const PREFIX = {
  USER: 'USER#',
}
const SK_PROFILE = 'PROFILE'

exports.handler = async (event) => {
  for (const record of event.Records) {
    try {
      if (record.eventName === 'INSERT') {
        await processInsertEvent(record)
      }
    }
    catch (err) {
      console.error(`Error processing record: ${err.message}`)
    }
  }

  return { statusCode: 200, body: 'Notifications processed' }
}

async function processInsertEvent(record) {
  const newImage = record.dynamodb.NewImage
  const entityType = newImage.entityType?.S

  if (entityType === 'MESSAGE') {
    await processMessageNotification(newImage)
  }
  else if (entityType === 'COMMENT') {
    await processCommentNotification(newImage)
  }
}

async function getUserProfile(userId) {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: `${PREFIX.USER}${userId}`,
        SK: SK_PROFILE,
      },
    }))
    return result.Item
  }
  catch (err) {
    console.error(`Error fetching user profile for ${userId}: ${err.message}`)
    return null
  }
}

function getNotificationEmail(profile) {
  return profile?.contactEmail || profile?.email
}

async function processMessageNotification(newImage) {
  const conversationId = newImage.conversationId?.S
  const senderId = newImage.senderId?.S
  const senderName = newImage.senderName?.S || 'Someone'
  const messageText = newImage.messageText?.S || ''
  const participants = newImage.participants?.SS || []

  if (!senderId || participants.length === 0) {
    return
  }

  // Get recipients (all participants except sender)
  const recipientIds = participants.filter(id => id !== senderId)

  for (const recipientId of recipientIds) {
    try {
      const profile = await getUserProfile(recipientId)

      if (!profile) {
        continue
      }

      // Check notification preference
      if (profile.notifyOnMessage === false) {
        continue
      }

      const email = getNotificationEmail(profile)
      if (!email) {
        continue
      }

      // Send notification email
      const subject = `New message from ${senderName} on Family Archive`
      const preview = messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText
      const conversationUrl = `${BASE_URL}/messages/${conversationId}`

      const bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Message from ${escapeHtml(senderName)}</h2>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0; color: #555;">${escapeHtml(preview)}</p>
          </div>
          <p>
            <a href="${conversationUrl}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Conversation
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #888; font-size: 12px;">
            You received this email because you have message notifications enabled.
            <a href="${BASE_URL}/profile/settings" style="color: #888;">Manage notification settings</a>
          </p>
        </div>
      `

      await sendEmail(email, subject, bodyHtml)
    }
    catch (err) {
      console.error(`Error sending message notification to ${recipientId}: ${err.message}`)
    }
  }
}

async function processCommentNotification(newImage) {
  const itemId = newImage.itemId?.S
  const itemType = newImage.itemType?.S || 'letter'
  const commenterId = newImage.userId?.S
  const commenterName = newImage.userName?.S || 'Someone'
  const commentText = newImage.commentText?.S || ''
  const itemTitle = newImage.itemTitle?.S || 'an item'

  // Get list of previous commenters from the comment record
  const previousCommenters = newImage.previousCommenters?.L?.map(item => item.S) || []

  if (!commenterId) {
    return
  }

  if (previousCommenters.length === 0) {
    return
  }

  const notifiedUsers = new Set()

  // Build the item URL based on type
  const itemUrl = itemType === 'media'
    ? `${BASE_URL}/gallery`
    : `${BASE_URL}/letters/${itemId}`

  // Notify all previous commenters
  for (const previousUserId of previousCommenters) {
    // Skip if already notified or if it's the commenter themselves
    if (previousUserId === commenterId || notifiedUsers.has(previousUserId)) {
      continue
    }

    try {
      const profile = await getUserProfile(previousUserId)

      if (!profile) {
        continue
      }

      if (profile.notifyOnComment === false) {
        continue
      }

      const email = getNotificationEmail(profile)
      if (!email) {
        continue
      }

      const subject = `New comment on "${itemTitle}"`
      const preview = commentText.length > 100 ? commentText.substring(0, 100) + '...' : commentText

      const bodyHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${escapeHtml(commenterName)} commented on "${escapeHtml(itemTitle)}"</h2>
          <p style="color: #666;">An item you've also commented on</p>
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 0; color: #555;">${escapeHtml(preview)}</p>
          </div>
          <p>
            <a href="${itemUrl}" style="display: inline-block; background: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
              View Comment
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #888; font-size: 12px;">
            You received this email because you commented on this item and have notifications enabled.
            <a href="${BASE_URL}/profile/settings" style="color: #888;">Manage notification settings</a>
          </p>
        </div>
      `

      await sendEmail(email, subject, bodyHtml)
      notifiedUsers.add(previousUserId)
    }
    catch (err) {
      console.error(`Error sending notification to ${previousUserId}: ${err.message}`)
    }
  }

}

function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function maskEmail(email) {
  if (!email || typeof email !== 'string')
    return '[invalid]'
  const parts = email.split('@')
  if (parts.length !== 2)
    return '[invalid]'
  const name = parts[0]
  const masked = name.length > 2 ? `${name.slice(0, 2)}***` : '***'
  return `${masked}@${parts[1]}`
}

async function sendEmail(toEmail, subject, bodyHtml) {
  try {
    await sesClient.send(new SendEmailCommand({
      Source: SES_FROM_EMAIL,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: bodyHtml } },
      },
    }))
    return true
  }
  catch (err) {
    console.error(`Error sending email to ${maskEmail(toEmail)}: ${err.message}`)
    return false
  }
}

// Also export sendEmail for testing
exports.sendEmail = sendEmail
