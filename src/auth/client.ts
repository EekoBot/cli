/**
 * identity-service Auth Client
 *
 * Talks to Eeko's identity-service (better-auth, magic-link). Mirrors the
 * native-bridge auth flow: request a magic link with a /auth/bounce callback,
 * JWKS-verify the returned JWT (ES256), and refresh via the durable session
 * token. No third-party SDK — plain fetch + `jose`.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { AUTH_CONFIG } from './config.js'
import type { StoredSession } from './store.js'

const identityBaseUrl = AUTH_CONFIG.identity.baseUrl

// Remote JWKS set for verifying identity-service JWTs (ES256). Lazily created;
// jose caches + auto-rotates. Same key source the platform's resource servers
// use (`${identity}/.well-known/jwks.json`).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

/**
 * Decode a JWT's claims WITHOUT verifying the signature — used only to read
 * `sub`/`email`/`exp` for building the local session object. Signature
 * verification is done separately via {@link verifyToken} before any token is
 * trusted; this must never be the sole gate.
 */
function decodeJwt(token: string): {
  exp?: number
  sub?: string
  email?: string
  [key: string]: unknown
} | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '=='.slice(0, (4 - (b64.length % 4)) % 4)
    const json = Buffer.from(padded, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Build a local session object from a verified JWT.
 */
export function buildSessionFromToken(token: string): StoredSession {
  const claims = decodeJwt(token) || {}
  const exp =
    typeof claims.exp === 'number' ? claims.exp : Math.floor(Date.now() / 1000) + 60 * 60
  return {
    access_token: token,
    expires_at: exp,
    user: {
      id: typeof claims.sub === 'string' ? claims.sub : '',
      email: typeof claims.email === 'string' ? claims.email : '',
    },
  }
}

/**
 * Verify a JWT exactly like the platform's resource servers: ES256 signature
 * against identity-service's JWKS, plus issuer + audience claims. Returns the
 * verified payload, or null on failure. Retries once on a transient JWKS-fetch
 * error so a network blip doesn't reject a valid login.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${identityBaseUrl}/.well-known/jwks.json`))
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        algorithms: ['ES256'],
        issuer: identityBaseUrl,
        audience: 'authenticated',
      })
      return payload
    } catch (error) {
      const code = (error as { code?: string })?.code ?? ''
      const isTokenInvalid =
        code.startsWith('ERR_JWT') ||
        code.startsWith('ERR_JWS') ||
        code === 'ERR_JWKS_NO_MATCHING_KEY'
      if (isTokenInvalid) return null
      // Likely a transient JWKS-endpoint/network error — retry once.
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  return null
}

/**
 * Ask identity-service to email a magic link. better-auth's magic-link plugin
 * exposes `POST /api/auth/sign-in/magic-link` accepting `{ email, callbackURL }`.
 * The caller passes a callbackURL that wraps the loopback target in /auth/bounce.
 */
export async function requestMagicLink(
  email: string,
  callbackURL: string,
  captchaToken?: string
): Promise<{ error: Error | null }> {
  try {
    const res = await fetch(`${identityBaseUrl}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Cloudflare Turnstile token — identity-service's captcha plugin
        // validates this on /sign-in/magic-link when enforcement is enabled.
        ...(captchaToken ? { 'x-captcha-response': captchaToken } : {}),
      },
      body: JSON.stringify({ email, callbackURL }),
    })
    if (res.ok) return { error: null }

    // identity-service errors are `{ success:false, error:{ code, message } }`
    // or flat `{ message }` / `{ error: string }`.
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* ignore */
    }
    const rec =
      body && typeof body === 'object'
        ? (body as { message?: string; error?: string | { message?: string } })
        : null
    const nested = rec && typeof rec.error === 'object' ? rec.error : null
    const flat = typeof rec?.error === 'string' ? rec.error : undefined
    const message =
      nested?.message || rec?.message || flat || `Failed to send magic link (status ${res.status})`
    return { error: new Error(message) }
  } catch (err) {
    return {
      error: new Error(
        err instanceof Error ? err.message : 'Failed to reach identity-service'
      ),
    }
  }
}

/**
 * Silent refresh using the durable better-auth session token. Presents it as
 * `Authorization: Bearer` to `GET /api/auth/token`, which mints a fresh JWT.
 * Returns the new session (carrying the durable token forward) or null.
 */
export async function refreshSession(refreshToken: string): Promise<StoredSession | null> {
  try {
    const res = await fetch(`${identityBaseUrl}/api/auth/token`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${refreshToken}`, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = (await res.json()) as { token?: string } | null
    const newToken = body?.token
    if (!newToken) return null
    const verified = await verifyToken(newToken)
    if (!verified?.sub) return null
    const next = buildSessionFromToken(newToken)
    next.refresh_token = refreshToken
    return next
  } catch {
    return null
  }
}

/**
 * Best-effort sign-out. Prefers the durable session token (the short JWT can't
 * revoke a session). Local state is cleared regardless of the result.
 */
export async function signOut(token: string): Promise<void> {
  try {
    await fetch(`${identityBaseUrl}/api/auth/sign-out`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  } catch {
    // best-effort
  }
}
