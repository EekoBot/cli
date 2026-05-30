/**
 * Auth Session Store
 *
 * Persists the identity-service session to ~/.eeko/auth.json (mode 0600).
 *
 * The durable credential is the short-lived JWT (`access_token`) delivered by
 * identity-service's /auth/bounce after a magic-link verify. `refresh_token`
 * holds the optional durable better-auth session token (loopback-only) used
 * for silent refresh; logins from before durable tokens lack it.
 */

import { homedir } from 'os'
import { join } from 'path'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  unlinkSync,
  chmodSync,
} from 'fs'
import { AUTH_CONFIG } from './config.js'

export interface StoredSession {
  access_token: string
  /** Durable better-auth session token for silent refresh (may be absent). */
  refresh_token?: string
  expires_at: number
  user: {
    id: string
    email: string
  }
}

/**
 * Get the path to the auth directory
 */
export function getAuthDir(): string {
  return join(homedir(), AUTH_CONFIG.storage.dir)
}

/**
 * Get the path to the auth file
 */
export function getAuthPath(): string {
  return join(getAuthDir(), AUTH_CONFIG.storage.file)
}

/**
 * Ensure the auth directory exists
 */
function ensureAuthDir(): void {
  const dir = getAuthDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Load session from disk (sync, no refresh)
 */
export function loadSessionSync(): StoredSession | null {
  const path = getAuthPath()

  if (!existsSync(path)) {
    return null
  }

  try {
    const data = readFileSync(path, 'utf-8')
    const session = JSON.parse(data) as StoredSession

    // Basic validation — the durable refresh_token is optional.
    if (!session.access_token || !session.user?.id) {
      return null
    }

    return session
  } catch {
    return null
  }
}

/**
 * Save session to disk (owner-only, mode 0600 — it holds a bearer token).
 */
export function saveSession(session: StoredSession): void {
  ensureAuthDir()
  const path = getAuthPath()
  writeFileSync(path, JSON.stringify(session, null, 2), { encoding: 'utf-8', mode: 0o600 })
  // writeFileSync's mode only applies on create; enforce on existing files too.
  try {
    chmodSync(path, 0o600)
  } catch {
    // best-effort (e.g. unsupported on the platform)
  }
}

/**
 * Clear session from disk
 */
export function clearSession(): void {
  const path = getAuthPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

/**
 * Check if session is valid (not expired)
 * Returns true if session has more than 5 minutes remaining
 */
export function isSessionValid(session: StoredSession): boolean {
  const bufferSeconds = 300 // 5 minutes
  const now = Date.now() / 1000
  return session.expires_at > now + bufferSeconds
}

/**
 * Check if session needs refresh (expiring within 10 minutes)
 */
export function sessionNeedsRefresh(session: StoredSession): boolean {
  const refreshBuffer = 600 // 10 minutes
  const now = Date.now() / 1000
  return session.expires_at < now + refreshBuffer
}
