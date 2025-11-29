/**
 * eeko test - Send test events to the dev server
 *
 * Examples:
 *   eeko test trigger --username="TestUser" --amount=5
 *   eeko test chat --message="Hello world!" --platform=twitch
 *   eeko test mount
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import WebSocket from 'ws'
import type {
  EventType,
  ComponentTriggerPayload,
  ChatMessagePayload,
} from '@eeko/sdk'

const WS_PORT = 9876

interface TestEventResult {
  success: boolean
  message: string
}

interface TestUIProps {
  eventType: EventType
  payload: unknown
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
      {status === 'success' && (
        <Text color="green">✓ {message}</Text>
      )}
      {status === 'error' && (
        <Text color="red">✖ {message}</Text>
      )}
    </Box>
  )
}

function buildTriggerPayload(options: Record<string, string>): ComponentTriggerPayload {
  const payload: ComponentTriggerPayload = {}

  if (options.username) payload.username = options.username
  if (options.displayName) payload.displayName = options.displayName
  if (options.amount) payload.amount = parseFloat(options.amount)
  if (options.message) payload.message = options.message
  if (options.currency) payload.currency = options.currency
  if (options.platform) payload.platform = options.platform as ComponentTriggerPayload['platform']
  if (options.tier) payload.tier = parseInt(options.tier, 10)
  if (options.months) payload.months = parseInt(options.months, 10)
  if (options.type) payload.type = options.type

  // Format amount if present
  if (payload.amount && !payload.formattedAmount) {
    const currency = payload.currency || 'USD'
    payload.formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(payload.amount)
  }

  return payload
}

function buildChatPayload(options: Record<string, string>): ChatMessagePayload {
  const platform = (options.platform || 'twitch') as ChatMessagePayload['context']['platform']
  const username = options.username || 'TestUser'

  return {
    type: 'chat_message',
    context: {
      platform,
      channelId: 'test-channel',
      channelName: 'TestChannel',
      messageId: `msg-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    user: {
      id: `user-${username}`,
      username,
      displayName: options.displayName || username,
      color: options.color || '#FF6B6B',
    },
    message: {
      text: options.message || 'Test message',
    },
    userStatus: {
      isModerator: options.mod === 'true',
      isSubscriber: options.sub === 'true',
      isVip: options.vip === 'true',
    },
  }
}

// Main test command
export const testCommand = new Command('test')
  .description('Send test events to the dev server')

// test trigger
testCommand
  .command('trigger')
  .description('Send a component trigger event (donation, follow, etc.)')
  .option('-u, --username <name>', 'Username', 'TestUser')
  .option('-d, --display-name <name>', 'Display name')
  .option('-a, --amount <number>', 'Amount for donations')
  .option('-m, --message <text>', 'Message content')
  .option('-c, --currency <code>', 'Currency code', 'USD')
  .option('-p, --platform <platform>', 'Platform (twitch, youtube, kick)', 'twitch')
  .option('-t, --type <type>', 'Event type (donation, follow, subscription)')
  .option('--tier <number>', 'Subscription tier (1, 2, 3)')
  .option('--months <number>', 'Subscription months')
  .action((options) => {
    const payload = buildTriggerPayload(options)
    render(<TestUI eventType="component_trigger" payload={payload} />)
  })

// test chat
testCommand
  .command('chat')
  .description('Send a chat message event')
  .option('-u, --username <name>', 'Username', 'TestViewer')
  .option('-d, --display-name <name>', 'Display name')
  .option('-m, --message <text>', 'Message text', 'Hello from CLI!')
  .option('-p, --platform <platform>', 'Platform', 'twitch')
  .option('--color <hex>', 'Username color', '#FF6B6B')
  .option('--mod', 'User is moderator')
  .option('--sub', 'User is subscriber')
  .option('--vip', 'User is VIP')
  .action((options) => {
    const payload = buildChatPayload(options)
    render(<TestUI eventType="chat_message" payload={payload} />)
  })

// test mount
testCommand
  .command('mount')
  .description('Send a component mount event')
  .action(() => {
    render(
      <TestUI
        eventType="component_mount"
        payload={{
          componentId: 'dev-component',
          type: 'alert',
          timestamp: Date.now(),
        }}
      />
    )
  })

// test unmount
testCommand
  .command('unmount')
  .description('Send a component unmount event')
  .action(() => {
    render(
      <TestUI
        eventType="component_unmount"
        payload={{
          componentId: 'dev-component',
          type: 'alert',
          timestamp: Date.now(),
        }}
      />
    )
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
