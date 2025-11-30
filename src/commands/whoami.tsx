/**
 * eeko whoami - Show current logged in user
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import {
  loadSessionSync,
  isSessionValid,
  sessionNeedsRefresh,
  saveSession,
} from '../auth/store.js'
import { refreshSession } from '../auth/client.js'

function WhoamiUI() {
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkSession() {
      const session = loadSessionSync()

      if (!session) {
        setError('Not logged in. Run: eeko login')
        setLoading(false)
        setTimeout(() => process.exit(1), 100)
        return
      }

      // Check if session needs refresh
      if (sessionNeedsRefresh(session)) {
        try {
          const refreshed = await refreshSession(session.refresh_token)
          if (refreshed) {
            saveSession(refreshed)
            setEmail(refreshed.user.email)
            setLoading(false)
            setTimeout(() => process.exit(0), 100)
            return
          }
        } catch {
          // Refresh failed, continue with existing session if still valid
        }
      }

      // Check if session is valid
      if (!isSessionValid(session)) {
        setError('Session expired. Run: eeko login')
        setLoading(false)
        setTimeout(() => process.exit(1), 100)
        return
      }

      setEmail(session.user.email)
      setLoading(false)
      setTimeout(() => process.exit(0), 100)
    }

    checkSession()
  }, [])

  if (loading) {
    return (
      <Box padding={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text> Checking session...</Text>
      </Box>
    )
  }

  if (error) {
    return (
      <Box padding={1}>
        <Text color="yellow">{error}</Text>
      </Box>
    )
  }

  return (
    <Box padding={1}>
      <Text>
        Logged in as <Text bold color="cyan">{email}</Text>
      </Text>
    </Box>
  )
}

export const whoamiCommand = new Command('whoami')
  .description('Show current logged in user')
  .action(() => {
    render(<WhoamiUI />)
  })
