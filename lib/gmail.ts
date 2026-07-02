import { google } from 'googleapis'

// A FRESH OAuth2 client per call — never a shared module-level singleton.
// setCredentials() mutates the client, so a shared instance lets concurrent
// requests for different users clobber each other's tokens between
// setCredentials() and the actual API call (cross-user token leak).
function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

/**
 * HTML-escape untrusted text before embedding it in markup. Inbound email
 * bodies are attacker-controlled and are later rendered with
 * dangerouslySetInnerHTML, so a plain-text body containing e.g.
 * `</pre><script>...` must not break out of its wrapper.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Scopes for Gmail access
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
]

// Generate OAuth URL for user consent
export function getAuthUrl(state?: string) {
  return createOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent',
    state: state || '',
  })
}

// Exchange authorization code for tokens
export async function getTokensFromCode(code: string) {
  const { tokens } = await createOAuthClient().getToken(code)
  return tokens
}

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string) {
  const client = createOAuthClient()
  client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await client.refreshAccessToken()
  return credentials
}

// Get Gmail client with tokens
export function getGmailClient(accessToken: string, refreshToken: string) {
  const client = createOAuthClient()
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return google.gmail({ version: 'v1', auth: client })
}

// Get user's email address
export async function getUserEmail(accessToken: string) {
  const client = createOAuthClient()
  client.setCredentials({ access_token: accessToken })
  const oauth2 = google.oauth2({ version: 'v2', auth: client })
  const { data } = await oauth2.userinfo.get()
  return data.email
}

// Fetch emails from inbox
export async function fetchEmails(
  accessToken: string,
  refreshToken: string,
  options: { maxResults?: number; query?: string; pageToken?: string } = {}
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const { maxResults = 20, query = '', pageToken } = options

  const response = await gmail.users.messages.list({
    userId: 'me',
    maxResults,
    q: query,
    pageToken,
  })

  const messages = response.data.messages || []
  const nextPageToken = response.data.nextPageToken

  // Fetch full message details
  const fullMessages = await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      })
      return parseEmailMessage(detail.data)
    })
  )

  return { messages: fullMessages, nextPageToken }
}

// Fetch single email by ID
export async function fetchEmail(
  accessToken: string,
  refreshToken: string,
  messageId: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })
  return parseEmailMessage(response.data)
}

// Send email
export async function sendEmail(
  accessToken: string,
  refreshToken: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)

  // Create email in RFC 2822 format
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ]
  const email = emailLines.join('\r\n')

  // Encode to base64url
  const encodedEmail = Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail,
      threadId,
    },
  })

  return response.data
}

// Mark email as read
export async function markAsRead(
  accessToken: string,
  refreshToken: string,
  messageId: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'],
    },
  })
}

// Parse email message from Gmail API response
function parseEmailMessage(message: any) {
  const headers = message.payload?.headers || []
  const getHeader = (name: string) =>
    headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  // Get email body
  let body = ''
  
  // Helper to extract body from parts recursively
  const extractBody = (payload: any): string => {
    // Direct body data
    if (payload.body?.data) {
      const mimeType = payload.mimeType || ''
      if (mimeType === 'text/html') {
        return Buffer.from(payload.body.data, 'base64').toString('utf-8')
      }
      if (mimeType === 'text/plain') {
        return `<pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(Buffer.from(payload.body.data, 'base64').toString('utf-8'))}</pre>`
      }
    }
    
    // Check parts (multipart emails)
    if (payload.parts) {
      // First try to find HTML part
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8')
        }
        // Recurse into nested multipart
        if (part.mimeType?.startsWith('multipart/')) {
          const nested = extractBody(part)
          if (nested) return nested
        }
      }
      // Fallback to plain text
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return `<pre style="white-space: pre-wrap; font-family: inherit;">${Buffer.from(part.body.data, 'base64').toString('utf-8')}</pre>`
        }
      }
      // Try nested parts
      for (const part of payload.parts) {
        if (part.parts) {
          const nested = extractBody(part)
          if (nested) return nested
        }
      }
    }
    
    return ''
  }

  if (message.payload) {
    body = extractBody(message.payload)
  }

  // Extract attachments
  const attachments: Array<{
    id: string
    filename: string
    mimeType: string
    size: number
  }> = []

  const extractAttachments = (payload: any) => {
    // Check if this part is an attachment (has filename AND attachmentId)
    if (payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) {
      attachments.push({
        id: payload.body.attachmentId,
        filename: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0
      })
    }
    
    // Recurse into parts
    if (payload.parts) {
      for (const part of payload.parts) {
        extractAttachments(part)
      }
    }
  }

  if (message.payload) {
    extractAttachments(message.payload)
  }

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet,
    from: getHeader('From'),
    to: getHeader('To'),
    subject: getHeader('Subject'),
    date: getHeader('Date'),
    body,
    labelIds: message.labelIds || [],
    isUnread: message.labelIds?.includes('UNREAD') || false,
    attachments,
  }
}