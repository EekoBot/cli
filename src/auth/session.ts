/**
 * Session helper shared by every authed command.
 *
 * Loads the stored session, silently refreshes it if it's inside the refresh
 * window (and a durable token is available), and returns a STILL-VALID access
 * token — or null if there's no usable session. Centralising this avoids the
 * "refreshed-but-never-re-checked-validity" trap where an expired session with
 * no refresh token would leak an expired token into an API call or git op.
 */

import {
  loadSessionSync,
  saveSession,
  isSessionValid,
  sessionNeedsRefresh,
} from './store.js'
import { refreshSession } from './client.js'

export async function getValidAccessToken(): Promise<string | null> {
  let session = loadSessionSync()
  if (!session) return null

  if (sessionNeedsRefresh(session) && session.refresh_token) {
    const refreshed = await refreshSession(session.refresh_token)
    if (refreshed) {
      saveSession(refreshed)
      session = refreshed
    }
  }

  return isSessionValid(session) ? session.access_token : null
}
