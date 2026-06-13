/**
 * Auth & CLI configuration.
 *
 * Authentication is against Eeko's identity-service (better-auth, magic-link)
 * via the loopback `/auth/bounce` flow — the same mechanism the native-bridge
 * uses. All values are overridable by env var for local/staging testing.
 */

export const AUTH_CONFIG = {
  identity: {
    // identity-service base URL (JWKS + magic-link + /auth/bounce live here).
    baseUrl: (process.env.EEKO_IDENTITY_URL || 'https://identity.eeko.app').replace(/\/$/, ''),
  },
  api: {
    // nexus-api base URL — the CLI's authed REST surface.
    baseUrl: (process.env.EEKO_API_HOST || 'https://api.eeko.app').replace(/\/$/, ''),
  },
  assets: {
    // asset-management-service base URL — the public upload + view surface
    // (the merchant app hits this directly too; the identity JWT authenticates).
    baseUrl: (process.env.EEKO_ASSETS_URL || 'https://assets.eeko.app').replace(/\/$/, ''),
  },
  auth: {
    // Loopback redirect port range (RFC 8252 §7.3 / §8.3 — localhost IP literal).
    redirectPortStart: 3000,
    redirectPortEnd: 3010,
    // Cloudflare Turnstile SITE key — a public client key (like the Pusher
    // key below), the same one the web apps and native-bridge ship.
    // identity-service validates the widget's token on /sign-in/magic-link;
    // without it the magic-link send is rejected when enforcement is on.
    turnstileSiteKey: process.env.EEKO_TURNSTILE_SITE_KEY || '0x4AAAAAADUiNYSd61KjW701',
  },
  storage: {
    dir: '.eeko',
    file: 'auth.json',
  },
  pusher: {
    // Public Pusher client key (safe to embed — it's in every browser bundle).
    // Used by `eeko dev --live` to bridge the developer's real overlay events.
    key: process.env.EEKO_PUSHER_KEY || 'fa66d0a5896f8ec1394c',
    cluster: process.env.EEKO_PUSHER_CLUSTER || 'eu',
  },
}
