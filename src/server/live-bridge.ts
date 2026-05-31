/**
 * Live event bridge for `eeko dev --live`.
 *
 * Mints a draft-preview session to learn the developer's opaque Pusher channel
 * names, subscribes to them, and forwards each `{type, context, payload}`
 * envelope into the dev WebSocket — exactly as IframeWidgetHost forwards them
 * to the production iframe. The channels are PUBLIC (`public-widget-*` /
 * `public-component-*`), so once the names are known no token is needed to
 * stay subscribed.
 */

import Pusher from 'pusher-js'
import type { EventType } from '@eeko/sdk'
import { AUTH_CONFIG } from '../auth/config.js'
import { mintDraftPreviewSession } from '../api/client.js'
import type { DevWebSocketServer } from './ws-server.js'

// Local routing constant — @eeko/event-contracts is workspace-only and not
// importable by this standalone CLI. Component-targeted events ride the
// per-component channel; broadcasts ride the per-user widget channel.
const COMPONENT_EVENTS: EventType[] = [
  'component_trigger',
  'component_update',
  'component_dismiss',
  'component_sync',
]
const WIDGET_BROADCAST_EVENTS: EventType[] = ['chat_message', 'variable_updated']

export interface LiveBridge {
  channels: { widget: string; component: string }
  close: () => void
}

export async function startLiveBridge(opts: {
  token: string
  componentId: string
  apiBase: string
  ref?: string
  ws: DevWebSocketServer
  onEvent?: (event: string) => void
  onReload?: () => void
}): Promise<LiveBridge> {
  const { token, componentId, apiBase, ref, ws, onEvent, onReload } = opts

  const session = await mintDraftPreviewSession(token, { componentId, ref: ref ?? 'draft' }, apiBase)

  const pusher = new Pusher(AUTH_CONFIG.pusher.key, { cluster: AUTH_CONFIG.pusher.cluster })
  const widgetChannel = pusher.subscribe(session.widgetChannelName)
  const componentChannel = pusher.subscribe(session.componentChannelName)

  // emitEvent normalises to the wire envelope; the Pusher data is already one,
  // and toEnvelope is idempotent, so this matches production exactly.
  for (const event of COMPONENT_EVENTS) {
    componentChannel.bind(event, (data: unknown) => {
      ws.emitEvent(event, data)
      onEvent?.(event)
    })
  }
  for (const event of WIDGET_BROADCAST_EVENTS) {
    widgetChannel.bind(event, (data: unknown) => {
      ws.emitEvent(event, data)
      onEvent?.(event)
    })
  }
  // widget_updated is parent-only in production (iframe reload). Locally the
  // author's bytes are on disk, so there's nothing to re-fetch — just surface it.
  widgetChannel.bind('widget_updated', () => {
    onReload?.()
  })

  return {
    channels: { widget: session.widgetChannelName, component: session.componentChannelName },
    close: () => {
      try {
        pusher.unsubscribe(session.widgetChannelName)
        pusher.unsubscribe(session.componentChannelName)
        pusher.disconnect()
      } catch {
        // ignore
      }
    },
  }
}
