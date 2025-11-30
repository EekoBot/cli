/**
 * Supabase Auth Client
 *
 * Lightweight wrapper around Supabase SDK for CLI authentication.
 * Uses direct SDK calls - no React dependencies.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AUTH_CONFIG } from './config.js'

let supabaseClient: SupabaseClient | null = null

/**
 * Get or create the Supabase client instance
 */
export function getAuthClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(
      AUTH_CONFIG.supabase.url,
      AUTH_CONFIG.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    )
  }
  return supabaseClient
}

/**
 * Send magic link to email
 */
export async function sendMagicLink(
  email: string,
  redirectUrl: string
): Promise<{ error: Error | null }> {
  const client = getAuthClient()

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectUrl,
    },
  })

  return { error: error ? new Error(error.message) : null }
}

/**
 * Refresh an expired session using refresh token
 */
export async function refreshSession(refreshToken: string): Promise<{
  access_token: string
  refresh_token: string
  expires_at: number
  user: { id: string; email: string }
} | null> {
  const client = getAuthClient()

  const { data, error } = await client.auth.refreshSession({
    refresh_token: refreshToken,
  })

  if (error || !data.session || !data.user) {
    return null
  }

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
    },
  }
}

/**
 * Get user info from access token
 */
export async function getUser(accessToken: string): Promise<{
  id: string
  email: string
} | null> {
  const client = getAuthClient()

  const { data, error } = await client.auth.getUser(accessToken)

  if (error || !data.user) {
    return null
  }

  return {
    id: data.user.id,
    email: data.user.email ?? '',
  }
}
