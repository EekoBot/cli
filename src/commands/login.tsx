/**
 * eeko login - Authenticate with Eeko
 *
 * Opens browser for magic link authentication and stores JWT locally.
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import open from 'open'
import { startAuthServer } from '../auth/server.js'
import { loadSessionSync, saveSession, isSessionValid } from '../auth/store.js'
import { verifyToken, buildSessionFromToken } from '../auth/client.js'

type LoginState = 'checking' | 'starting' | 'waiting' | 'success' | 'error'

function LoginUI() {
  const [state, setState] = useState<LoginState>('checking')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    async function login() {
      // Check if already logged in
      const existing = loadSessionSync()
      if (existing && isSessionValid(existing)) {
        setEmail(existing.user.email)
        setState('success')
        setMessage('Already logged in')
        setTimeout(() => process.exit(0), 500)
        return
      }

      setState('starting')
      setMessage('Starting authentication server...')

      try {
        const { url, waitForTokens, close } = await startAuthServer()

        setMessage(`Opening browser at ${url}`)
        await open(url)

        setState('waiting')
        setMessage('Waiting for authentication... (check your browser)')

        const result = await waitForTokens()

        if (result.error) {
          throw new Error(result.error)
        }
        if (!result.token) {
          throw new Error('No authentication token received')
        }

        setMessage('Verifying session...')

        // JWKS-verify the JWT before trusting anything that landed on loopback.
        const payload = await verifyToken(result.token)
        if (!payload?.sub) {
          throw new Error('Token verification failed')
        }

        const session = buildSessionFromToken(result.token)
        if (result.session) session.refresh_token = result.session
        saveSession(session)

        setEmail(session.user.email)
        setState('success')
        setMessage('Authentication successful')
        close()

        setTimeout(() => process.exit(0), 500)
      } catch (err) {
        setState('error')
        setMessage(err instanceof Error ? err.message : 'Authentication failed')
        setTimeout(() => process.exit(1), 1000)
      }
    }

    login()
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Login
        </Text>
      </Box>

      <Box>
        {(state === 'checking' || state === 'starting' || state === 'waiting') && (
          <>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> {message}</Text>
          </>
        )}

        {state === 'success' && (
          <Text>
            <Text color="green">✓</Text> Logged in as <Text bold>{email}</Text>
          </Text>
        )}

        {state === 'error' && (
          <Text>
            <Text color="red">✖</Text> {message}
          </Text>
        )}
      </Box>
    </Box>
  )
}

export const loginCommand = new Command('login')
  .description('Login to Eeko with your email')
  .action(() => {
    render(<LoginUI />)
  })
