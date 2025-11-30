/**
 * eeko logout - Clear stored authentication
 */

import { Command } from 'commander'
import React from 'react'
import { render, Box, Text } from 'ink'
import { clearSession, loadSessionSync } from '../auth/store.js'

function LogoutUI() {
  const session = loadSessionSync()

  if (!session) {
    setTimeout(() => process.exit(0), 100)
    return (
      <Box padding={1}>
        <Text dimColor>Not logged in</Text>
      </Box>
    )
  }

  const email = session.user.email
  clearSession()

  setTimeout(() => process.exit(0), 100)

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
