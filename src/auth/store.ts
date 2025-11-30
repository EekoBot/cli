/**
 * Auth Session Store
 *
 * Stores and retrieves JWT session from ~/.eeko/auth.json
 */

import { homedir } from 'os'
import { join } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { AUTH_CONFIG } from './config.js'

export interface StoredSession {
  access_token: string
  refresh_token: string
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

    // Basic validation
    if (!session.access_token || !session.refresh_token || !session.user) {
      return null
    }

    return session
  } catch {
    return null
  }
}

/**
 * Save session to disk
 */
export function saveSession(session: StoredSession): void {
  ensureAuthDir()
  const path = getAuthPath()
  writeFileSync(path, JSON.stringify(session, null, 2), 'utf-8')
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
