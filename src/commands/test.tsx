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

const WS_PORT = 9876

interface TestUIProps {
  eventType: EventType
  payload: unknown
}

interface MultiEventUIProps {
  events: Array<{ eventType: EventType; payload: unknown; delay?: number }>
}

function TestUI({ eventType, payload }: TestUIProps) {
  const [status, setStatus] = useState<'connecting' | 'sending' | 'success' | 'error'>('connecting')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}`)

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
      setStatus('success')
      setMessage(`Sent ${eventType} event`)

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
  }, [eventType, payload])

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

function MultiEventUI({ events }: MultiEventUIProps) {
  const [status, setStatus] = useState<'connecting' | 'sending' | 'success' | 'error'>('connecting')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(0)

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:${WS_PORT}`)

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

      setStatus('success')
      setMessage(`Sent ${events.length} events`)

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
  }, [events])

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
    render(<TestUI eventType="component_trigger" payload={payload} />)
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
    render(<TestUI eventType="chat_message" payload={payload} />)
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

    render(<TestUI eventType="chat_message" payload={payload} />)
  })

// test bits
testCommand
  .command('bits')
  .description('Send a Twitch bits event')
  .option('-a, --amount <number>', 'Amount of bits', '100')
  .action((options) => {
    const amount = parseInt(options.amount, 10) || 100
    const payload = createBitsPayload(amount)
    render(<TestUI eventType="chat_message" payload={payload} />)
  })

// test follow
testCommand
  .command('follow')
  .description('Send a Twitch follow event')
  .action(() => {
    const payload = createFollowPayload()
    render(<TestUI eventType="chat_message" payload={payload} />)
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

    render(<MultiEventUI events={events} />)
  })

// test mount
testCommand
  .command('mount')
  .description('Send a component mount event')
  .action(() => {
    const payload = createMountPayload()
    render(<TestUI eventType="component_mount" payload={payload} />)
  })

// test unmount
testCommand
  .command('unmount')
  .description('Send a component unmount event')
  .action(() => {
    const payload = createUnmountPayload()
    render(<TestUI eventType="component_unmount" payload={payload} />)
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
      />
    )
  })
