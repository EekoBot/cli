/**
 * WebSocket Server for Test Event Injection
 *
 * Receives events from CLI commands and broadcasts to connected widgets
 */

import { WebSocketServer, WebSocket } from 'ws'
import { EventEmitter } from 'events'
import type { EventType } from '@eeko/sdk'
import { toEnvelope, type InitState } from './widget-document.js'

export interface DevEventMessage {
  type: 'event' | 'state' | 'command'
  event?: EventType
  payload?: unknown
  state?: Record<string, unknown>
  command?: 'init' | 'reset' | 'disconnect'
  metadata?: {
    timestamp: string
    source: 'cli' | 'ui'
  }
}

/**
 * Create a WebSocket server on an available port
 */
export async function createDevWebSocketServer(
  startPort: number = 9876,
  initState?: InitState
): Promise<DevWebSocketServer> {
  const maxAttempts = 100

  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i

    try {
      const server = await new Promise<DevWebSocketServer>((resolve, reject) => {
        const wss = new WebSocketServer({ port })

        wss.once('listening', () => {
          console.log(`[WS] Server listening on port ${port}`)
          resolve(new DevWebSocketServer(wss, port, initState))
        })

        wss.once('error', (err) => {
          reject(err)
        })
      })

      return server
    } catch (err) {
      const error = err as NodeJS.ErrnoException
      if (error.code === 'EADDRINUSE') {
        console.log(`[WS] Port ${port} in use, trying ${port + 1}...`)
        continue
      }
      // Unknown error, rethrow
      throw err
    }
  }

  throw new Error(`No available port found starting from ${startPort}`)
}

export class DevWebSocketServer extends EventEmitter {
  private wss: WebSocketServer
  private clients: Set<WebSocket> = new Set()
  public readonly port: number
  private initState?: InitState

  constructor(wss: WebSocketServer, port: number, initState?: InitState) {
    super()
    this.port = port
    this.wss = wss
    this.initState = initState

    this.wss.on('error', (err) => {
      console.error('[WS] Server error:', err)
    })

    this.wss.on('connection', (ws) => {
      this.clients.add(ws)
      this.emit('client:connect', { count: this.clients.size })

      // Send initial state — real componentId/userId, but EMPTY configs: the
      // real config values are seeded by the dev server's __EEKO_INIT__
      // injection (mirrors IframeWidgetHost's eeko:init).
      this.sendToClient(ws, {
        type: 'command',
        command: 'init',
        state: {
          componentId: this.initState?.componentId ?? 'dev-component',
          userId: this.initState?.userId ?? 'dev-user',
          globalConfig: {},
          variantConfig: {},
        },
      })

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as DevEventMessage
          this.handleMessage(message, ws)
        } catch (err) {
          console.error('[WS] Failed to parse message:', err)
        }
      })

      ws.on('close', () => {
        this.clients.delete(ws)
        this.emit('client:disconnect', { count: this.clients.size })
      })

      ws.on('error', (err) => {
        console.error('[WS] Client error:', err)
        this.clients.delete(ws)
      })
    })
  }

  private handleMessage(message: DevEventMessage, _ws: WebSocket) {
    // Re-broadcast client-sent events (e.g. `eeko test` from another terminal)
    // to the widget(s), normalising to the wire envelope like emitEvent does so
    // handlers receive the same shape as production.
    if (message.type === 'event') {
      const normalised: DevEventMessage =
        message.event !== undefined
          ? { ...message, payload: toEnvelope(message.event, message.payload) }
          : message
      this.broadcast(normalised)
      this.emit('event', { type: message.event, payload: message.payload })
    }
  }

  private sendToClient(ws: WebSocket, message: DevEventMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  /**
   * Broadcast a message to all connected clients
   */
  broadcast(message: DevEventMessage) {
    const data = JSON.stringify(message)
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    })
  }

  /**
   * Emit an SDK event to all connected widgets
   */
  emitEvent(event: EventType, payload: unknown) {
    // Normalise to the `{type, context, payload}` wire envelope so the bridge's
    // unwrap delivers the same shape handlers receive in production.
    const message: DevEventMessage = {
      type: 'event',
      event,
      payload: toEnvelope(event, payload),
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'cli',
      },
    }
    this.broadcast(message)
    this.emit('event', { type: event, payload })
  }

  /**
   * Update SDK state on all connected widgets
   */
  setState(state: Record<string, unknown>) {
    this.broadcast({
      type: 'state',
      state,
    })
  }

  /**
   * Send a command to all connected widgets
   */
  sendCommand(command: 'init' | 'reset' | 'disconnect', state?: Record<string, unknown>) {
    this.broadcast({
      type: 'command',
      command,
      state,
    })
  }

  /**
   * Get number of connected clients
   */
  get clientCount(): number {
    return this.clients.size
  }

  /**
   * Close the server
   */
  close() {
    this.clients.forEach((client) => {
      client.close()
    })
    this.clients.clear()
    this.wss.close()
  }
}
