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
  const session = loadSessionSync()
  if (!session) return null

  // Fresh enough to use directly.
  if (!sessionNeedsRefresh(session)) {
    return isSessionValid(session) ? session.access_token : null
  }

  // Inside the refresh window — a SUCCESSFUL refresh is required. Without a
  // durable token, or if the refresh call fails, treat the session as expired
  // and return null so the caller prompts a re-login. We deliberately do NOT
  // fall back to the near-expiry token: a long autonomous run would otherwise
  // proceed on a token about to die and fail mid-operation.
  if (!session.refresh_token) return null
  const refreshed = await refreshSession(session.refresh_token)
  if (!refreshed) return null
  saveSession(refreshed)
  return isSessionValid(refreshed) ? refreshed.access_token : null
}
