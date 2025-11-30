/**
 * Local Auth Server
 *
 * Temporary HTTP server to handle OAuth redirect flow.
 * Serves login page, handles magic link request, and receives tokens.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import getPort from 'get-port'
import { AUTH_CONFIG } from './config.js'
import { getLoginPageHtml, getSuccessPageHtml, getErrorPageHtml } from './pages.js'
import { sendMagicLink } from './client.js'

interface AuthServerResult {
  port: number
  url: string
  waitForTokens: () => Promise<{ access_token: string; refresh_token: string }>
  close: () => void
}

/**
 * Start a local HTTP server to handle the OAuth flow
 */
export async function startAuthServer(): Promise<AuthServerResult> {
  // Find available port in range
  const port = await getPort({
    port: Array.from(
      { length: AUTH_CONFIG.auth.redirectPortEnd - AUTH_CONFIG.auth.redirectPortStart + 1 },
      (_, i) => AUTH_CONFIG.auth.redirectPortStart + i
    ),
  })

  const baseUrl = `http://localhost:${port}`
  const redirectUrl = `${baseUrl}/auth/confirm`

  let tokenResolve: ((tokens: { access_token: string; refresh_token: string }) => void) | null = null
  let tokenReject: ((error: Error) => void) | null = null

  const tokenPromise = new Promise<{ access_token: string; refresh_token: string }>(
    (resolve, reject) => {
      tokenResolve = resolve
      tokenReject = reject
    }
  )

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', baseUrl)

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cache-Control', 'no-store')

    // Route: GET / - Login page
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(getLoginPageHtml())
      return
    }

    // Route: POST /auth/send-link - Send magic link
    if (req.method === 'POST' && url.pathname === '/auth/send-link') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', async () => {
        try {
          const { email } = JSON.parse(body)

          if (!email || typeof email !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Email is required' }))
            return
          }

          const { error } = await sendMagicLink(email, redirectUrl)

          if (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
            return
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid request' }))
        }
      })
      return
    }

    // Route: GET /auth/confirm - Success page (Supabase redirects here with tokens in fragment)
    if (req.method === 'GET' && url.pathname === '/auth/confirm') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(getSuccessPageHtml())
      return
    }

    // Route: POST /auth/tokens - Receive tokens from success page
    if (req.method === 'POST' && url.pathname === '/auth/tokens') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        try {
          const { access_token, refresh_token } = JSON.parse(body)

          if (!access_token || !refresh_token) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Tokens are required' }))
            return
          }

          // Resolve the token promise
          if (tokenResolve) {
            tokenResolve({ access_token, refresh_token })
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid request' }))
        }
      })
      return
    }

    // Route: GET /auth/error - Error page
    if (req.method === 'GET' && url.pathname === '/auth/error') {
      const errorMessage = url.searchParams.get('message') || 'Authentication failed'
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(getErrorPageHtml(errorMessage))
      return
    }

    // 404 for all other routes
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  // Start server
  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve())
  })

  return {
    port,
    url: baseUrl,
    waitForTokens: () => tokenPromise,
    close: () => {
      server.close()
      if (tokenReject) {
        tokenReject(new Error('Server closed'))
      }
    },
  }
}
