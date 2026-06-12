/**
 * Local Auth Server (loopback)
 *
 * Temporary HTTP server on 127.0.0.1 that drives the identity-service
 * magic-link flow (RFC 8252 native-app loopback):
 *
 *   GET  /                 styled login page (email entry)
 *   POST /auth/send-link   requests a magic link with a /auth/bounce callback
 *   GET  /auth/callback    page that forwards the bounce's ?token/?session
 *   POST /auth/tokens       receives { token, session, error }
 *   GET  /auth/error        error page
 *
 * identity-service's /auth/bounce exchanges the better-auth session for a
 * short-lived JWT (?token=) plus a durable session token (?session=, loopback
 * origins only) and redirects back here.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'http'
import getPort from 'get-port'
import { AUTH_CONFIG } from './config.js'
import { getLoginPageHtml, getSuccessPageHtml, getErrorPageHtml } from './pages.js'
import { requestMagicLink } from './client.js'

export interface AuthCallbackResult {
  token?: string
  session?: string
  error?: string
}

interface AuthServerResult {
  port: number
  url: string
  waitForTokens: () => Promise<AuthCallbackResult>
  close: () => void
}

/**
 * Start a local HTTP server to handle the magic-link loopback flow.
 */
export async function startAuthServer(): Promise<AuthServerResult> {
  // Find an available port in the loopback range.
  const port = await getPort({
    port: Array.from(
      { length: AUTH_CONFIG.auth.redirectPortEnd - AUTH_CONFIG.auth.redirectPortStart + 1 },
      (_, i) => AUTH_CONFIG.auth.redirectPortStart + i
    ),
  })

  // RFC 8252 §8.3: use the loopback IP literal, not `localhost`.
  const baseUrl = `http://127.0.0.1:${port}`
  const redirectUrl = `${baseUrl}/auth/callback`

  let tokenResolve: ((result: AuthCallbackResult) => void) | null = null
  let tokenReject: ((error: Error) => void) | null = null

  const tokenPromise = new Promise<AuthCallbackResult>((resolve, reject) => {
    tokenResolve = resolve
    tokenReject = reject
  })

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', baseUrl)

    // Security headers
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cache-Control', 'no-store')

    // GET / — login page
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(getLoginPageHtml(AUTH_CONFIG.auth.turnstileSiteKey))
      return
    }

    // POST /auth/send-link — request a magic link
    if (req.method === 'POST' && url.pathname === '/auth/send-link') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', async () => {
        try {
          const { email, captchaToken } = JSON.parse(body)
          if (!email || typeof email !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Email is required' }))
            return
          }
          if (!captchaToken || typeof captchaToken !== 'string') {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Verification token is required' }))
            return
          }

          // better-auth's magic-link verify only sets the .eeko.app cookie; it
          // won't hand a token to a cross-origin loopback page. Wrap our
          // loopback target in identity-service's /auth/bounce, which exchanges
          // the cookie for a short JWT and appends it as ?token=.
          const callbackURL = `${AUTH_CONFIG.identity.baseUrl}/auth/bounce?to=${encodeURIComponent(
            redirectUrl
          )}`
          const { error } = await requestMagicLink(email, callbackURL, captchaToken)

          if (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: error.message }))
            return
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid request' }))
        }
      })
      return
    }

    // GET /auth/callback — page that forwards ?token/?session/?error
    if (req.method === 'GET' && url.pathname === '/auth/callback') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(getSuccessPageHtml())
      return
    }

    // POST /auth/tokens — receive the captured token/session
    if (req.method === 'POST' && url.pathname === '/auth/tokens') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk.toString()
      })
      req.on('end', () => {
        try {
          const { token, session, error } = JSON.parse(body) as AuthCallbackResult
          if (tokenResolve) tokenResolve({ token, session, error })

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true }))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Invalid request' }))
        }
      })
      return
    }

    // GET /auth/error — error page
    if (req.method === 'GET' && url.pathname === '/auth/error') {
      const errorMessage = url.searchParams.get('message') || 'Authentication failed'
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(getErrorPageHtml(errorMessage))
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  })

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve())
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
