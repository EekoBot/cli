/**
 * eeko test - Send test events to the dev server
 *
 * Examples:
 *   eeko test trigger --username="TestUser" --amount=5
 *   eeko test chat --message="Hello world!" --platform=twitch
 *   eeko test sub --platform=twitch --tier=1
 *   eeko test bits --amount=100
 *   eeko test follow
 *   eeko test all-chat
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import WebSocket from 'ws'
import type { EventType } from '@eeko/sdk'
import {
  createTwitchChatPayload,
  createYouTubeChatPayload,
  createKickChatPayload,
  createTwitchSubPayload,
  createTwitchGiftSubPayload,
  createTwitchResubPayload,
  createYouTubeMemberPayload,
  createKickSubPayload,
  createKickGiftSubPayload,
  createBitsPayload,
  createFollowPayload,
  createTriggerPayload,
  createMountPayload,
  createUnmountPayload,
  getAllTestChatPayloads,
} from '../test-events/index.js'
import { readDevDescriptor, DEV_DESCRIPTOR_FILENAME } from '../utils/dev-descriptor.js'

/**
 * Find the running dev server's WebSocket port via the .eeko-dev.json
 * descriptor `eeko dev` writes. The default port (9876) can't be assumed —
 * the dev server walks to a free port when it's taken.
 */
function resolveWsPort(): number {
  const result = readDevDescriptor()
  if (result.ok) return result.descriptor.wsPort

  const hints: Record<typeof result.reason, string> = {
    missing: `No ${DEV_DESCRIPTOR_FILENAME} in this directory. Run \`eeko dev\` first (in this widget's directory).`,
    stale: `Found ${DEV_DESCRIPTOR_FILENAME} but its dev server is no longer running. Run \`eeko dev\` first.`,
    invalid: `${DEV_DESCRIPTOR_FILENAME} is unreadable. Restart \`eeko dev\` to regenerate it.`,
  }
  console.error(`✖ ${hints[result.reason]}`)
  process.exit(1)
}

interface TestUIProps {
  eventType: EventType
  payload: unknown
  wsPort: number
}

interface MultiEventUIProps {
  events: Array<{ eventType: EventType; payload: unknown; delay?: number }>
  wsPort: number
}

function TestUI({ eventType, payload, wsPort }: TestUIProps) {
  const [status, setStatus] = useState<'connecting' | 'sending' | 'success' | 'error'>('connecting')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:${wsPort}`)
    let finished = false

    const finish = (text: string, warned: boolean) => {
      if (finished) return
      finished = true
      setStatus(warned ? 'error' : 'success')
      setMessage(text)
      setTimeout(() => {
        ws.close()
        process.exit(0)
      }, 100)
    }

    ws.on('open', () => {
      setStatus('sending')

      const eventMessage = {
        type: 'event',
        event: eventType,
        payload,
        metadata: {
          timestamp: new Date().toISOString(),
          source: 'cli',
        },
      }

      ws.send(JSON.stringify(eventMessage))
      // Wait briefly for the server's delivery ack so "sent" is honest.
      setTimeout(() => finish(`Sent ${eventType} event`, false), 500)
    })

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string; delivered?: number }
        if (msg.type === 'ack') {
          if (msg.delivered === 0) {
            finish(
              `Sent ${eventType}, but no widget is connected — open the dev server URL in a browser first`,
              true
            )
          } else {
            finish(`Sent ${eventType} event (delivered to ${msg.delivered} widget${msg.delivered === 1 ? '' : 's'})`, false)
          }
        }
      } catch {
        /* ignore non-JSON */
      }
    })

    ws.on('error', (err) => {
      setStatus('error')
      setMessage(`Failed to connect: ${err.message}. Is the dev server running?`)
      setTimeout(() => process.exit(1), 100)
    })

    return () => {
      ws.close()
    }
  }, [eventType, payload, wsPort])

  return (
    <Box padding={1}>
      {status === 'connecting' && (
        <>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Connecting to dev server...</Text>
        </>
      )}
      {status === 'sending' && (
        <>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Sending event...</Text>
        </>
      )}
      {status === 'success' && <Text color="green">✓ {message}</Text>}
      {status === 'error' && <Text color="red">✖ {message}</Text>}
    </Box>
  )
}

function MultiEventUI({ events, wsPort }: MultiEventUIProps) {
  const [status, setStatus] = useState<'connecting' | 'sending' | 'success' | 'error'>('connecting')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(0)

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:${wsPort}`)
    let lastDelivered: number | null = null

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as { type?: string; delivered?: number }
        if (msg.type === 'ack' && typeof msg.delivered === 'number') {
          lastDelivered = msg.delivered
        }
      } catch {
        /* ignore non-JSON */
      }
    })

    ws.on('open', async () => {
      setStatus('sending')

      for (let i = 0; i < events.length; i++) {
        const { eventType, payload, delay = 500 } = events[i]

        const eventMessage = {
          type: 'event',
          event: eventType,
          payload,
          metadata: {
            timestamp: new Date().toISOString(),
            source: 'cli',
          },
        }

        ws.send(JSON.stringify(eventMessage))
        setSent(i + 1)

        if (i < events.length - 1 && delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }

      // Give the final ack a moment to arrive before reporting.
      await new Promise((resolve) => setTimeout(resolve, 300))
      if (lastDelivered === 0) {
        setStatus('error')
        setMessage(
          `Sent ${events.length} events, but no widget is connected — open the dev server URL in a browser first`
        )
      } else {
        setStatus('success')
        setMessage(`Sent ${events.length} events`)
      }

      setTimeout(() => {
        ws.close()
        process.exit(0)
      }, 100)
    })

    ws.on('error', (err) => {
      setStatus('error')
      setMessage(`Failed to connect: ${err.message}. Is the dev server running?`)
      setTimeout(() => process.exit(1), 100)
    })

    return () => {
      ws.close()
    }
  }, [events, wsPort])

  return (
    <Box padding={1}>
      {status === 'connecting' && (
        <>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Connecting to dev server...</Text>
        </>
      )}
      {status === 'sending' && (
        <>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            Sending events... ({sent}/{events.length})
          </Text>
        </>
      )}
      {status === 'success' && <Text color="green">✓ {message}</Text>}
      {status === 'error' && <Text color="red">✖ {message}</Text>}
    </Box>
  )
}

// Main test command
export const testCommand = new Command('test').description('Send test events to the dev server')

// test trigger
testCommand
  .command('trigger')
  .description('Send a component trigger event')
  .option('-d, --data <json>', 'Custom JSON payload', '{}')
  .action((options) => {
    let customData = {}
    try {
      customData = JSON.parse(options.data)
    } catch {
      console.error('Invalid JSON for --data')
      process.exit(1)
    }
    const payload = createTriggerPayload(customData)
    render(<TestUI eventType="component_trigger" payload={payload} wsPort={resolveWsPort()} />)
  })

// test chat
testCommand
  .command('chat')
  .description('Send a chat message event')
  .option('-p, --platform <platform>', 'Platform (twitch, youtube, kick)', 'twitch')
  .action((options) => {
    let payload
    switch (options.platform) {
      case 'youtube':
        payload = createYouTubeChatPayload()
        break
      case 'kick':
        payload = createKickChatPayload()
        break
      default:
        payload = createTwitchChatPayload()
    }
    render(<TestUI eventType="chat_message" payload={payload} wsPort={resolveWsPort()} />)
  })

// test sub - subscription events
testCommand
  .command('sub')
  .description('Send a subscription event')
  .option('-p, --platform <platform>', 'Platform (twitch, youtube, kick)', 'twitch')
  .option('-t, --tier <number>', 'Subscription tier (1, 2, 3) - Twitch only', '1')
  .option('-g, --gift', 'Gift subscription')
  .option('-r, --resub', 'Re-subscription (Twitch only)')
  .option('-m, --months <number>', 'Months subscribed (for resub)', '12')
  .action((options) => {
    let payload
    const platform = options.platform || 'twitch'

    if (platform === 'twitch') {
      if (options.gift) {
        payload = createTwitchGiftSubPayload()
      } else if (options.resub) {
        payload = createTwitchResubPayload(parseInt(options.months, 10) || 12)
      } else {
        const tier = parseInt(options.tier, 10) as 1 | 2 | 3
        payload = createTwitchSubPayload(tier || 1)
      }
    } else if (platform === 'youtube') {
      payload = createYouTubeMemberPayload()
    } else if (platform === 'kick') {
      if (options.gift) {
        payload = createKickGiftSubPayload()
      } else {
        payload = createKickSubPayload()
      }
    } else {
      payload = createTwitchSubPayload(1)
    }

    render(<TestUI eventType="chat_message" payload={payload} wsPort={resolveWsPort()} />)
  })

// test bits
testCommand
  .command('bits')
  .description('Send a Twitch bits event')
  .option('-a, --amount <number>', 'Amount of bits', '100')
  .action((options) => {
    const amount = parseInt(options.amount, 10) || 100
    const payload = createBitsPayload(amount)
    render(<TestUI eventType="chat_message" payload={payload} wsPort={resolveWsPort()} />)
  })

// test follow
testCommand
  .command('follow')
  .description('Send a Twitch follow event')
  .action(() => {
    const payload = createFollowPayload()
    render(<TestUI eventType="chat_message" payload={payload} wsPort={resolveWsPort()} />)
  })

// test all-chat - sends all test events like merchant "Test Chat" button
testCommand
  .command('all-chat')
  .description('Send all test events (chat, bits, sub, follow) with delays - like merchant Test Chat button')
  .option('-d, --delay <ms>', 'Delay between events in ms', '500')
  .action((options) => {
    const delay = parseInt(options.delay, 10) || 500
    const payloads = getAllTestChatPayloads()

    const events = payloads.map((payload) => ({
      eventType: (payload as { type: string }).type as EventType,
      payload,
      delay,
    }))

    render(<MultiEventUI events={events} wsPort={resolveWsPort()} />)
  })

// test mount
testCommand
  .command('mount')
  .description('Send a component mount event')
  .action(() => {
    const payload = createMountPayload()
    render(<TestUI eventType="component_mount" payload={payload} wsPort={resolveWsPort()} />)
  })

// test unmount
testCommand
  .command('unmount')
  .description('Send a component unmount event')
  .action(() => {
    const payload = createUnmountPayload()
    render(<TestUI eventType="component_unmount" payload={payload} wsPort={resolveWsPort()} />)
  })

// test update
testCommand
  .command('update')
  .description('Send a component update event')
  .option('-d, --data <json>', 'JSON data to send', '{}')
  .action((options) => {
    let data = {}
    try {
      data = JSON.parse(options.data)
    } catch {
      console.error('Invalid JSON for --data')
      process.exit(1)
    }

    render(
      <TestUI
        eventType="component_update"
        payload={{
          component_id: 'dev-component',
          data,
          timestamp: Date.now(),
        }}
        wsPort={resolveWsPort()}
      />
    )
  })
