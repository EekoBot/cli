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
import { render, Box, Text, useApp, useInput, useStdin } from 'ink'
import Spinner from 'ink-spinner'
import { startDevServer, type DevServer } from '../server/vite-plugin.js'
import { createDevWebSocketServer, type DevWebSocketServer } from '../server/ws-server.js'
import { loadInitState } from '../server/widget-document.js'
import { startLiveBridge, type LiveBridge } from '../server/live-bridge.js'
import open from 'open'
import { TestEventMenu } from '../components/TestEventMenu.js'
import { findEventByShortcut, type TestEventDefinition } from '../test-events/index.js'
import { loadEekoConfig } from '../utils/config.js'
import { loadSessionSync } from '../auth/store.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { writeDevDescriptor, removeDevDescriptor } from '../utils/dev-descriptor.js'

interface DevUIProps {
  port: number
  wsPort: number
  autoOpen: boolean
  live: boolean
}

interface EventLogEntry {
  type: string
  timestamp: Date
  preview: string
}

function DevUI({ port, wsPort, autoOpen, live }: DevUIProps) {
  const { exit } = useApp()
  // Headless guard: agents and CI run `eeko dev` without a TTY; Ink's raw
  // mode (keyboard shortcuts) is unavailable there, but the servers must
  // still run. `eeko test` / the browser remain the event-injection paths.
  const { isRawModeSupported } = useStdin()
  const [serverStatus, setServerStatus] = useState<'starting' | 'ready' | 'error'>('starting')
  const [wsClients, setWsClients] = useState(0)
  const [events, setEvents] = useState<EventLogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actualPort, setActualPort] = useState(port)
  const [actualWsPort, setActualWsPort] = useState(wsPort)
  const [showEventMenu, setShowEventMenu] = useState(false)
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)

  // Refs to hold server instances for cleanup
  const wsRef = React.useRef<DevWebSocketServer | null>(null)
  const serverRef = React.useRef<DevServer | null>(null)
  const liveBridgeRef = React.useRef<LiveBridge | null>(null)

  // Send a test event
  const sendTestEvent = (eventDef: TestEventDefinition) => {
    if (wsRef.current && serverStatus === 'ready') {
      wsRef.current.emitEvent(eventDef.event, eventDef.createPayload())
    }
  }

  // Handle keyboard input
  useInput((input, key) => {
    // Don't handle input when menu is open (menu handles its own input)
    if (showEventMenu) return

    if (input === 'q' || (key.ctrl && input === 'c')) {
      liveBridgeRef.current?.close()
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
    // 't' opens interactive event menu
    if (input === 't' && serverStatus === 'ready') {
      setShowEventMenu(true)
      return
    }
    // Send test events with number keys (0-9)
    const eventDef = findEventByShortcut(input)
    if (eventDef && serverStatus === 'ready') {
      sendTestEvent(eventDef)
    }
    // NB: Ink reports isRawModeSupported as stdin.isTTY, which is undefined
    // (not false) when headless — and useInput only skips raw mode on a
    // strict `isActive === false`. Coerce.
  }, { isActive: isRawModeSupported === true })

  useEffect(() => {
    let mounted = true

    async function start() {
      try {
        // Resolve identity for production parity (best-effort — falls back to
        // dev placeholders if there's no eeko.config.json / session).
        const cfg = loadEekoConfig()
        const session = loadSessionSync()
        if (cfg?.accountId) setAccountId(cfg.accountId)
        const componentId = cfg?.componentId ?? 'dev-component'
        const userId = session?.user?.id ?? 'dev-user'
        const apiBase = cfg?.apiHost ?? AUTH_CONFIG.api.baseUrl
        const init = await loadInitState(process.cwd(), { componentId, userId })

        // Start WebSocket server (finds available port automatically)
        const ws = await createDevWebSocketServer(wsPort, init)
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
          init,
          onReady: (serverPort) => {
            if (mounted) {
              setActualPort(serverPort)
              setServerStatus('ready')
              // Record the actual bound ports so `eeko test` (run from
              // another terminal) finds this server even when the defaults
              // were taken and the port walk moved us.
              writeDevDescriptor(process.cwd(), {
                wsPort: ws.port,
                httpPort: serverPort,
                pid: process.pid,
                startedAt: new Date().toISOString(),
              })
              if (autoOpen) {
                open(`http://127.0.0.1:${serverPort}`)
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

        // Optional: bridge the developer's REAL Pusher events into the widget.
        if (live) {
          if (!session || !cfg) {
            if (mounted) {
              setLiveStatus('needs `eeko login` + an eeko.config.json (run from a widget dir)')
            }
          } else {
            try {
              const bridge = await startLiveBridge({
                token: session.access_token,
                componentId,
                apiBase,
                ref: 'draft',
                ws,
                onEvent: (event) => {
                  if (mounted) {
                    setEvents((prev) => [
                      ...prev.slice(-9),
                      { type: `live:${event}`, timestamp: new Date(), preview: '(live)' },
                    ])
                  }
                },
              })
              liveBridgeRef.current = bridge
              if (!mounted) {
                bridge.close()
              } else {
                setLiveStatus(`subscribed (…${bridge.channels.widget.slice(-8)})`)
              }
            } catch (err) {
              if (mounted) {
                setLiveStatus(`error: ${err instanceof Error ? err.message : 'live bridge failed'}`)
              }
            }
          }
        }
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
      removeDevDescriptor(process.cwd())
      liveBridgeRef.current?.close()
      wsRef.current?.close()
      serverRef.current?.close()
    }
  }, [])

  // Show event menu overlay
  if (showEventMenu) {
    return (
      <Box flexDirection="column" padding={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Eeko Dev Server
          </Text>
          <Text dimColor> - Test Event Menu</Text>
        </Box>
        <TestEventMenu
          onSelect={(eventDef) => {
            sendTestEvent(eventDef)
            setShowEventMenu(false)
          }}
          onCancel={() => setShowEventMenu(false)}
        />
      </Box>
    )
  }

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
        {serverStatus === 'error' && <Text color="red">✖ Error: {error}</Text>}
      </Box>

      {/* WebSocket Status */}
      <Box>
        <Text>
          <Text color={wsClients > 0 ? 'green' : 'gray'}>●</Text> WebSocket:{' '}
          <Text color="cyan">{wsClients}</Text> client{wsClients !== 1 ? 's' : ''} connected
          <Text dimColor> (port {actualWsPort})</Text>
        </Text>
      </Box>

      {/* Account ownership (when the widget is account-owned) */}
      {accountId && (
        <Box>
          <Text dimColor>account: {accountId}</Text>
        </Box>
      )}

      {/* Live Bridge Status */}
      {live && (
        <Box>
          <Text>
            <Text color={liveStatus?.startsWith('subscribed') ? 'green' : 'yellow'}>●</Text> Live
            events: <Text dimColor>{liveStatus ?? 'connecting…'}</Text>
          </Text>
        </Box>
      )}

      {/* Event Log */}
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Recent Events:</Text>
        {events.length === 0 ? (
          <Text dimColor> No events yet. Press a number key or t to send test events.</Text>
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
          <Text bold color="green">
            ► Quick test events:
          </Text>
          <Box marginTop={0} flexDirection="column">
            <Text>
              {'  '}
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                1{' '}
              </Text>
              <Text> Twitch Chat </Text>
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                4{' '}
              </Text>
              <Text> Twitch Sub </Text>
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                7{' '}
              </Text>
              <Text> Kick Sub</Text>
            </Text>
            <Text>
              {'  '}
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                2{' '}
              </Text>
              <Text> YouTube Chat</Text>
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                5{' '}
              </Text>
              <Text> Gift Sub   </Text>
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                8{' '}
              </Text>
              <Text> Bits</Text>
            </Text>
            <Text>
              {'  '}
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                3{' '}
              </Text>
              <Text> Kick Chat   </Text>
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                6{' '}
              </Text>
              <Text> YT Member  </Text>
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                9{' '}
              </Text>
              <Text> Follow</Text>
            </Text>
            <Text>
              {'  '}
              <Text color="black" backgroundColor="yellow" bold>
                {' '}
                0{' '}
              </Text>
              <Text> Trigger     </Text>
              <Text color="black" backgroundColor="cyan" bold>
                {' '}
                t{' '}
              </Text>
              <Text color="cyan"> More events...</Text>
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
  .option('--live', "Bridge your account's real Pusher events into the widget")
  .action((options) => {
    const port = validatePort(options.port, 'Port')
    const wsPort = validatePort(options.wsPort, 'WebSocket port')

    render(
      <DevUI
        port={port}
        wsPort={wsPort}
        autoOpen={options.open !== false}
        live={options.live === true}
      />
    )
  })
