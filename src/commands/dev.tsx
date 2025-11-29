/**
 * eeko dev - Start local development server
 *
 * Uses Ink for interactive CLI output showing:
 * - Server status
 * - Connected clients
 * - Recent events
 * - Interactive test event triggers
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { startDevServer, type DevServer } from '../server/vite-plugin.js'
import { createDevWebSocketServer, type DevWebSocketServer } from '../server/ws-server.js'
import type { EventType } from '@eeko/sdk'
import open from 'open'

interface DevUIProps {
  port: number
  wsPort: number
  autoOpen: boolean
}

interface EventLogEntry {
  type: string
  timestamp: Date
  preview: string
}

// Test event payloads
const TEST_EVENTS: Record<string, { event: EventType; payload: unknown }> = {
  '1': {
    event: 'component_trigger',
    payload: {
      username: 'TestUser',
      amount: 5,
      message: 'Great stream!',
      textTop: 'TestUser donated!',
      textBottom: '$5.00 - Great stream!',
    },
  },
  '2': {
    event: 'chat_message',
    payload: {
      user: {
        displayName: 'Viewer123',
        username: 'viewer123',
        color: '#ff6b6b',
      },
      message: {
        text: 'Hello from the chat!',
      },
      context: {
        platform: 'twitch',
      },
    },
  },
  '3': {
    event: 'component_update',
    payload: {
      data: {
        count: 5,
      },
    },
  },
  '4': {
    event: 'variable_updated',
    payload: {
      current: 10,
      previous: 5,
    },
  },
}

function DevUI({ port, wsPort, autoOpen }: DevUIProps) {
  const { exit } = useApp()
  const [serverStatus, setServerStatus] = useState<'starting' | 'ready' | 'error'>('starting')
  const [wsClients, setWsClients] = useState(0)
  const [events, setEvents] = useState<EventLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actualPort, setActualPort] = useState(port)
  const [actualWsPort, setActualWsPort] = useState(wsPort)

  // Refs to hold server instances for cleanup
  const wsRef = React.useRef<DevWebSocketServer | null>(null)
  const serverRef = React.useRef<DevServer | null>(null)

  // Handle keyboard input
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      wsRef.current?.close()
      serverRef.current?.close()
      exit()
    }
    if (input === 'o') {
      open(`http://localhost:${actualPort}`)
    }
    if (input === 'c') {
      setEvents([])
    }
    // Send test events with number keys
    if (TEST_EVENTS[input] && wsRef.current && serverStatus === 'ready') {
      const { event, payload } = TEST_EVENTS[input]
      wsRef.current.emitEvent(event, payload)
    }
  })

  useEffect(() => {
    let mounted = true

    async function start() {
      try {
        // Start WebSocket server (finds available port automatically)
        const ws = await createDevWebSocketServer(wsPort)
        if (!mounted) {
          ws.close()
          return
        }

        wsRef.current = ws
        setActualWsPort(ws.port)

        ws.on('client:connect', () => {
          if (mounted) setWsClients((c) => c + 1)
        })

        ws.on('client:disconnect', () => {
          if (mounted) setWsClients((c) => Math.max(0, c - 1))
        })

        ws.on('event', (event) => {
          if (mounted) {
            setEvents((prev) => [
              ...prev.slice(-9),
              {
                type: event.type,
                timestamp: new Date(),
                preview: JSON.stringify(event.payload).slice(0, 50),
              },
            ])
          }
        })

        // Start Vite dev server (finds available port automatically)
        const server = await startDevServer({
          port,
          wsPort: ws.port,
          onReady: (serverPort) => {
            if (mounted) {
              setActualPort(serverPort)
              setServerStatus('ready')
              if (autoOpen) {
                open(`http://localhost:${serverPort}`)
              }
            }
          },
        })

        if (!mounted) {
          server.close()
          ws.close()
          return
        }

        serverRef.current = server
      } catch (err) {
        console.error('[Dev] Error starting servers:', err)
        if (mounted) {
          setServerStatus('error')
          setError(err instanceof Error ? err.message : 'Unknown error')
        }
      }
    }

    start()

    return () => {
      mounted = false
      wsRef.current?.close()
      serverRef.current?.close()
    }
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Dev Server
        </Text>
      </Box>

      {/* Server Status */}
      <Box>
        {serverStatus === 'starting' && (
          <>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text color="yellow"> Starting server...</Text>
          </>
        )}
        {serverStatus === 'ready' && (
          <Text>
            <Text color="green">●</Text> Server running at{' '}
            <Text color="cyan" bold>
              http://localhost:{actualPort}
            </Text>
          </Text>
        )}
        {serverStatus === 'error' && (
          <Text color="red">✖ Error: {error}</Text>
        )}
      </Box>

      {/* WebSocket Status */}
      <Box>
        <Text>
          <Text color={wsClients > 0 ? 'green' : 'gray'}>●</Text> WebSocket:{' '}
          <Text color="cyan">{wsClients}</Text> client{wsClients !== 1 ? 's' : ''} connected
          <Text dimColor> (port {actualWsPort})</Text>
        </Text>
      </Box>

      {/* Event Log */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Recent Events:</Text>
        {events.length === 0 ? (
          <Text dimColor>  No events yet. Use `eeko test` to send events.</Text>
        ) : (
          events.map((event, i) => (
            <Text key={i} dimColor>
              {'  '}
              <Text color="yellow">{event.type}</Text>
              <Text dimColor>
                {' '}
                {event.timestamp.toLocaleTimeString()} - {event.preview}...
              </Text>
            </Text>
          ))
        )}
      </Box>

      {/* Test Events */}
      {serverStatus === 'ready' && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold color="green">► Press to send test events:</Text>
          <Box marginTop={0} flexDirection="column">
            <Text>
              {'  '}<Text color="black" backgroundColor="yellow" bold> 1 </Text>
              <Text color="white"> trigger</Text>
              <Text dimColor> (donation/follow)</Text>
            </Text>
            <Text>
              {'  '}<Text color="black" backgroundColor="yellow" bold> 2 </Text>
              <Text color="white"> chat</Text>
              <Text dimColor> (chat message)</Text>
            </Text>
            <Text>
              {'  '}<Text color="black" backgroundColor="yellow" bold> 3 </Text>
              <Text color="white"> update</Text>
              <Text dimColor> (config change)</Text>
            </Text>
            <Text>
              {'  '}<Text color="black" backgroundColor="yellow" bold> 4 </Text>
              <Text color="white"> variable</Text>
              <Text dimColor> (variable change)</Text>
            </Text>
          </Box>
        </Box>
      )}

      {/* Help */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>─────────────────────────────────────</Text>
        <Text dimColor>
          <Text color="white">o</Text> open browser{'  '}
          <Text color="white">c</Text> clear events{'  '}
          <Text color="white">q</Text> quit
        </Text>
      </Box>
    </Box>
  )
}

/**
 * Validate port number
 */
function validatePort(portStr: string, name: string): number {
  const port = parseInt(portStr, 10)

  if (isNaN(port)) {
    console.error(`Error: ${name} must be a number`)
    process.exit(1)
  }

  if (port < 1024 || port > 65535) {
    console.error(`Error: ${name} must be between 1024 and 65535`)
    process.exit(1)
  }

  return port
}

export const devCommand = new Command('dev')
  .description('Start local development server')
  .option('-p, --port <number>', 'Dev server port', '3000')
  .option('-w, --ws-port <number>', 'WebSocket event port', '9876')
  .option('--no-open', 'Do not auto-open browser')
  .action((options) => {
    const port = validatePort(options.port, 'Port')
    const wsPort = validatePort(options.wsPort, 'WebSocket port')

    render(
      <DevUI
        port={port}
        wsPort={wsPort}
        autoOpen={options.open !== false}
      />
    )
  })
