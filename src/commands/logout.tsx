/**
 * eeko logout - Clear stored authentication
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import { clearSession, loadSessionSync } from '../auth/store.js'
import { signOut } from '../auth/client.js'

function LogoutUI() {
  const [email, setEmail] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function logout() {
      const session = loadSessionSync()
      if (!session) {
        setDone(true)
        setTimeout(() => process.exit(0), 100)
        return
      }

      setEmail(session.user.email)
      // Best-effort server-side sign-out (revokes the durable session).
      await signOut(session.refresh_token ?? session.access_token)
      clearSession()
      setDone(true)
      setTimeout(() => process.exit(0), 100)
    }

    logout()
  }, [])

  if (!done) {
    return (
      <Box padding={1}>
        <Text dimColor>Signing out...</Text>
      </Box>
    )
  }

  if (!email) {
    return (
      <Box padding={1}>
        <Text dimColor>Not logged in</Text>
      </Box>
    )
  }

  return (
    <Box padding={1}>
      <Text>
        <Text color="green">✓</Text> Logged out from <Text bold>{email}</Text>
      </Text>
    </Box>
  )
}

export const logoutCommand = new Command('logout')
  .description('Logout from Eeko')
  .action(() => {
    render(<LogoutUI />)
  })
