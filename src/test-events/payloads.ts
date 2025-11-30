/**
 * Test Event Payload Generators
 *
 * These payloads match exactly what the merchant app sends via component-preview-panel.tsx
 * to ensure 1:1 testing parity between CLI dev server and production preview.
 */

// ============================================================================
// Chat Messages
// ============================================================================

export function createTwitchChatPayload() {
  return {
    type: 'chat_message',
    context: {
      platform: 'twitch',
      channelId: 'test-channel-123',
      messageId: `msg-twitch-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    user: {
      id: 'user-twitch-123',
      username: 'TestUser',
      displayName: 'TestUser',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=twitch',
      color: '#9146FF',
    },
    message: {
      text: 'Hello from Twitch! 👋',
      fragments: [],
    },
    userStatus: {
      badges: [
        {
          id: 'broadcaster',
          name: 'Broadcaster',
          imageUrl:
            'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1',
        },
      ],
      isBroadcaster: true,
    },
  }
}

export function createYouTubeChatPayload() {
  return {
    type: 'chat_message',
    context: {
      platform: 'youtube',
      channelId: 'test-channel-456',
      messageId: `msg-youtube-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    user: {
      id: 'user-youtube-456',
      username: 'YouTubeViewer',
      displayName: 'YouTubeViewer',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=youtube',
      color: '#FF0000',
    },
    message: {
      text: 'Hello from YouTube! 📺',
      fragments: [],
    },
    userStatus: {
      badges: [{ id: 'member', name: 'Member', imageUrl: 'https://yt3.ggpht.com/badge.png' }],
      isSubscriber: true,
    },
  }
}

export function createKickChatPayload() {
  return {
    type: 'chat_message',
    context: {
      platform: 'kick',
      channelId: 'test-channel-789',
      messageId: `msg-kick-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    user: {
      id: 'user-kick-789',
      username: 'KickUser',
      displayName: 'KickUser',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=kick',
      color: '#53FC18',
    },
    message: {
      text: 'Hello from Kick! ⚽',
      fragments: [],
    },
    userStatus: {
      badges: [],
    },
  }
}

// ============================================================================
// Twitch Subscriptions
// ============================================================================

export function createTwitchSubPayload(tier: 1 | 2 | 3 = 1) {
  return {
    type: 'subscription_event',
    subType: 'new',
    context: {
      platform: 'twitch',
      channelId: 'test-channel-twitch',
      channelName: 'TestStreamer',
      eventId: `event-twitch-tier${tier}-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    subscriber: {
      id: `user-twitch-${Date.now()}`,
      username: 'TwitchSubscriber',
      displayName: 'Twitch Subscriber',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=twitch',
    },
    subscription: {
      tier,
      tierName: `Tier ${tier}`,
      isGift: false,
      isRenewal: false,
      message: 'Love your content!',
    },
  }
}

export function createTwitchGiftSubPayload() {
  return {
    type: 'subscription_event',
    subType: 'gift',
    context: {
      platform: 'twitch',
      channelId: 'test-channel-twitch',
      channelName: 'TestStreamer',
      eventId: `event-twitch-gift-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    subscriber: {
      id: `user-twitch-${Date.now()}`,
      username: 'TwitchSubscriber',
      displayName: 'Twitch Subscriber',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=twitch',
    },
    subscription: {
      tier: 1,
      tierName: 'Tier 1',
      isGift: true,
      isRenewal: false,
    },
    gifter: {
      id: `gifter-twitch-${Date.now()}`,
      username: 'GenerousGifter',
      displayName: 'Generous Gifter',
    },
  }
}

export function createTwitchResubPayload(months: number = 12) {
  return {
    type: 'subscription_event',
    subType: 'renewal',
    context: {
      platform: 'twitch',
      channelId: 'test-channel-twitch',
      channelName: 'TestStreamer',
      eventId: `event-twitch-resub-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    subscriber: {
      id: `user-twitch-${Date.now()}`,
      username: 'TwitchSubscriber',
      displayName: 'Twitch Subscriber',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=twitch',
    },
    subscription: {
      tier: 1,
      tierName: 'Tier 1',
      isGift: false,
      isRenewal: true,
      months,
      streakMonths: months,
      message: 'Love your content!',
    },
  }
}

// ============================================================================
// YouTube Subscriptions
// ============================================================================

export function createYouTubeMemberPayload() {
  return {
    type: 'subscription_event',
    subType: 'new',
    context: {
      platform: 'youtube',
      channelId: 'test-channel-yt',
      eventId: `event-yt-member-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    subscriber: {
      id: `user-yt-${Date.now()}`,
      username: 'YouTubeMember',
      displayName: 'YouTube Member',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=youtube',
    },
    subscription: {
      tier: 'Member',
      tierName: 'Member',
      isGift: false,
      message: 'Thanks for the amazing content!',
    },
  }
}

export function createYouTubeGiftMemberPayload() {
  return {
    type: 'subscription_event',
    subType: 'gift',
    context: {
      platform: 'youtube',
      channelId: 'test-channel-yt',
      eventId: `event-yt-gift-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    subscriber: {
      id: `user-yt-${Date.now()}`,
      username: 'YouTubeMember',
      displayName: 'YouTube Member',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=youtube',
    },
    subscription: {
      tier: 'Member',
      tierName: 'Member',
      isGift: true,
    },
  }
}

// ============================================================================
// Kick Subscriptions
// ============================================================================

export function createKickSubPayload() {
  return {
    type: 'subscription_event',
    subType: 'new',
    context: {
      platform: 'kick',
      channelId: 'test-channel-kick',
      channelName: 'KickStreamer',
      eventId: `event-kick-sub-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    subscriber: {
      id: `user-kick-${Date.now()}`,
      username: 'KickSubscriber',
      displayName: 'Kick Subscriber',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=kick',
    },
    subscription: {
      tier: 1,
      tierName: 'Subscriber',
      duration: 1,
      isGift: false,
    },
  }
}

export function createKickGiftSubPayload() {
  return {
    type: 'subscription_event',
    subType: 'gift',
    context: {
      platform: 'kick',
      channelId: 'test-channel-kick',
      channelName: 'KickStreamer',
      eventId: `event-kick-gift-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    subscriber: {
      id: `user-kick-${Date.now()}`,
      username: 'KickSubscriber',
      displayName: 'Kick Subscriber',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=kick',
    },
    subscription: {
      tier: 1,
      tierName: 'Subscriber',
      duration: 1,
      isGift: true,
    },
    gifter: {
      id: `gifter-kick-${Date.now()}`,
      username: 'GenerousGifter',
      displayName: 'Generous Gifter',
    },
  }
}

// ============================================================================
// Monetary Events
// ============================================================================

export function createBitsPayload(amount: number = 100) {
  return {
    type: 'monetary_event',
    subType: 'bits',
    context: {
      platform: 'twitch',
      channelId: 'test-channel-123',
      eventId: `event-bits-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    user: {
      id: 'user-twitch-bits',
      username: 'GenerousViewer',
      displayName: 'GenerousViewer',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=generous',
      color: '#9256D9',
    },
    monetary: {
      amount,
      currency: 'USD',
      formattedAmount: `${amount} bits`,
      message: 'Great stream! Keep it up!',
    },
  }
}

// ============================================================================
// Engagement Events
// ============================================================================

export function createFollowPayload() {
  return {
    type: 'engagement_event',
    subType: 'follow',
    context: {
      platform: 'twitch',
      channelId: 'test-channel-123',
      eventId: `event-follow-${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    user: {
      id: 'user-twitch-follower',
      username: 'NewFollower',
      displayName: 'NewFollower',
      profilePictureUrl: 'https://i.pravatar.cc/150?u=follower',
    },
  }
}

// ============================================================================
// Component Events
// ============================================================================

export function createTriggerPayload(variantFields?: Record<string, unknown>) {
  return {
    componentId: 'dev-component',
    timestamp: Date.now(),
    ...variantFields,
  }
}

export function createMountPayload() {
  return {
    componentId: 'dev-component',
    type: 'alert',
    timestamp: Date.now(),
  }
}

export function createUnmountPayload() {
  return {
    componentId: 'dev-component',
    type: 'alert',
    timestamp: Date.now(),
  }
}

// ============================================================================
// Bulk Events (like "Test Chat" button in merchant)
// ============================================================================

/**
 * Returns all test events that the "Test Chat" button sends in the merchant app.
 * Includes: 3 chat messages, bits, subscription, and follow events.
 */
export function getAllTestChatPayloads() {
  return [
    createTwitchChatPayload(),
    createYouTubeChatPayload(),
    createKickChatPayload(),
    createBitsPayload(100),
    createTwitchSubPayload(1),
    createFollowPayload(),
  ]
}
