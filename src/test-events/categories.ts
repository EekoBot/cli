/**
 * Test Event Categories and Definitions
 *
 * Organizes test events into categories with keyboard shortcuts for quick access.
 * Used by both the dev server UI (keyboard shortcuts) and interactive menu.
 */

import type { EventType } from '@eeko/sdk'
import {
  createTwitchChatPayload,
  createYouTubeChatPayload,
  createKickChatPayload,
  createTwitchSubPayload,
  createTwitchGiftSubPayload,
  createTwitchResubPayload,
  createYouTubeMemberPayload,
  createYouTubeGiftMemberPayload,
  createKickSubPayload,
  createKickGiftSubPayload,
  createBitsPayload,
  createFollowPayload,
  createTriggerPayload,
  createMountPayload,
  createUnmountPayload,
} from './payloads.js'

export interface TestEventDefinition {
  id: string
  label: string
  shortcut?: string // keyboard shortcut (0-9)
  event: EventType
  createPayload: () => unknown
}

export interface TestEventCategory {
  id: string
  label: string
  events: TestEventDefinition[]
}

export const TEST_EVENT_CATEGORIES: TestEventCategory[] = [
  {
    id: 'chat',
    label: 'Chat Messages',
    events: [
      {
        id: 'twitch-chat',
        label: 'Twitch Chat',
        shortcut: '1',
        event: 'chat_message',
        createPayload: createTwitchChatPayload,
      },
      {
        id: 'youtube-chat',
        label: 'YouTube Chat',
        shortcut: '2',
        event: 'chat_message',
        createPayload: createYouTubeChatPayload,
      },
      {
        id: 'kick-chat',
        label: 'Kick Chat',
        shortcut: '3',
        event: 'chat_message',
        createPayload: createKickChatPayload,
      },
    ],
  },
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    events: [
      {
        id: 'twitch-sub-t1',
        label: 'Twitch Sub (T1)',
        shortcut: '4',
        event: 'subscription_event' as EventType,
        createPayload: () => createTwitchSubPayload(1),
      },
      {
        id: 'twitch-sub-t2',
        label: 'Twitch Sub (T2)',
        event: 'subscription_event' as EventType,
        createPayload: () => createTwitchSubPayload(2),
      },
      {
        id: 'twitch-sub-t3',
        label: 'Twitch Sub (T3)',
        event: 'subscription_event' as EventType,
        createPayload: () => createTwitchSubPayload(3),
      },
      {
        id: 'twitch-gift',
        label: 'Twitch Gift Sub',
        shortcut: '5',
        event: 'subscription_event' as EventType,
        createPayload: createTwitchGiftSubPayload,
      },
      {
        id: 'twitch-resub',
        label: 'Twitch Re-sub',
        event: 'subscription_event' as EventType,
        createPayload: createTwitchResubPayload,
      },
      {
        id: 'youtube-member',
        label: 'YouTube Member',
        shortcut: '6',
        event: 'subscription_event' as EventType,
        createPayload: createYouTubeMemberPayload,
      },
      {
        id: 'youtube-gift',
        label: 'YouTube Gift',
        event: 'subscription_event' as EventType,
        createPayload: createYouTubeGiftMemberPayload,
      },
      {
        id: 'kick-sub',
        label: 'Kick Sub',
        shortcut: '7',
        event: 'subscription_event' as EventType,
        createPayload: createKickSubPayload,
      },
      {
        id: 'kick-gift',
        label: 'Kick Gift Sub',
        event: 'subscription_event' as EventType,
        createPayload: createKickGiftSubPayload,
      },
    ],
  },
  {
    id: 'monetary',
    label: 'Monetary',
    events: [
      {
        id: 'bits-100',
        label: 'Twitch Bits (100)',
        shortcut: '8',
        event: 'monetary_event' as EventType,
        createPayload: () => createBitsPayload(100),
      },
      {
        id: 'bits-500',
        label: 'Twitch Bits (500)',
        event: 'monetary_event' as EventType,
        createPayload: () => createBitsPayload(500),
      },
      {
        id: 'bits-1000',
        label: 'Twitch Bits (1000)',
        event: 'monetary_event' as EventType,
        createPayload: () => createBitsPayload(1000),
      },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    events: [
      {
        id: 'follow',
        label: 'Twitch Follow',
        shortcut: '9',
        event: 'engagement_event' as EventType,
        createPayload: createFollowPayload,
      },
    ],
  },
  {
    id: 'component',
    label: 'Component',
    events: [
      {
        id: 'trigger',
        label: 'Trigger',
        shortcut: '0',
        event: 'component_trigger',
        createPayload: createTriggerPayload,
      },
      {
        id: 'mount',
        label: 'Mount',
        event: 'component_mount',
        createPayload: createMountPayload,
      },
      {
        id: 'unmount',
        label: 'Unmount',
        event: 'component_unmount',
        createPayload: createUnmountPayload,
      },
    ],
  },
]

/**
 * Get all events with shortcuts as a flat map for quick lookup
 */
export function getShortcutMap(): Map<string, TestEventDefinition> {
  const map = new Map<string, TestEventDefinition>()
  for (const category of TEST_EVENT_CATEGORIES) {
    for (const event of category.events) {
      if (event.shortcut) {
        map.set(event.shortcut, event)
      }
    }
  }
  return map
}

/**
 * Find an event by its shortcut key
 */
export function findEventByShortcut(shortcut: string): TestEventDefinition | undefined {
  for (const category of TEST_EVENT_CATEGORIES) {
    for (const event of category.events) {
      if (event.shortcut === shortcut) {
        return event
      }
    }
  }
  return undefined
}

/**
 * Get all events as a flat array
 */
export function getAllEvents(): TestEventDefinition[] {
  return TEST_EVENT_CATEGORIES.flatMap((category) => category.events)
}
