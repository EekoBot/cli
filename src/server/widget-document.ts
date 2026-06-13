/**
 * Widget document assembly — the local equivalent of widget-host's serve-time
 * shell. Keeps `eeko dev` byte-faithful to production by driving everything
 * from the same @eeko/sdk primitives the worker uses:
 *
 *   - resolve globalConfig/variantConfig from `widget.json` (field defaults
 *     under the manifest config), exactly like widget-bundle.ts
 *   - inject `window.__EEKO_INIT__` (real configs) + `window.__EEKO_DEV__`
 *     (WS transport) + the RUNTIME_BRIDGE_JS bridge, in that order
 *   - normalise simulated events to the `{type, context, payload}` wire
 *     envelope so the bridge's `unwrap` delivers the same shape as production
 */

import {
  buildConfigFromFields,
  mergeConfigs,
  loadManifest,
  type WidgetManifest,
} from '@eeko/sdk/template/node'
import { RUNTIME_BRIDGE_JS } from '@eeko/sdk/runtime-bridge'

export interface InitState {
  componentId: string
  userId: string
  globalConfig: Record<string, unknown>
  variantConfig: Record<string, unknown>
  /** The manifest's declarative interactions — the SDK interaction runtime
   * boots from `__EEKO_INIT__.interactions`; omitting it silently disables
   * declarative widgets in dev. */
  interactions?: unknown
  /** Runtime behavior hints (displayDuration etc.) — read by the interaction
   * runtime alongside `interactions`. */
  behavior?: Record<string, unknown>
}

/**
 * Resolve the serve-time config scopes from a manifest, mirroring widget-host:
 * field defaults (lowest priority) merged under the manifest's explicit
 * `globalConfig` / `variantConfig`. `both`-scoped fields land in both.
 */
export function resolveConfigs(manifest: WidgetManifest | null): {
  globalConfig: Record<string, unknown>
  variantConfig: Record<string, unknown>
} {
  if (!manifest) return { globalConfig: {}, variantConfig: {} }
  return {
    globalConfig: mergeConfigs(
      buildConfigFromFields(manifest.fields, 'global'),
      manifest.globalConfig
    ),
    variantConfig: mergeConfigs(
      buildConfigFromFields(manifest.fields, 'variant'),
      manifest.variantConfig
    ),
  }
}

/**
 * Load `widget.json` from the project dir and build the full init state.
 * Falls back to empty configs (with a warning) if the manifest is absent or
 * invalid, so `eeko dev` still serves the raw widget.
 */
export async function loadInitState(
  cwd: string,
  ids: { componentId: string; userId: string }
): Promise<InitState> {
  let manifest: WidgetManifest | null = null
  try {
    manifest = await loadManifest(cwd)
  } catch (err) {
    console.warn(
      '[Dev] Could not load widget.json:',
      err instanceof Error ? err.message : err
    )
  }
  const { globalConfig, variantConfig } = resolveConfigs(manifest)
  return {
    componentId: ids.componentId,
    userId: ids.userId,
    globalConfig,
    variantConfig,
    ...(manifest?.interactions ? { interactions: manifest.interactions } : {}),
    ...(manifest?.behavior ? { behavior: manifest.behavior } : {}),
  }
}

/** JSON for inline injection, `<` escaped so it can't break out of the script. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/**
 * The three head scripts that mirror widget-host's shell: seed state, dev
 * transport, then the runtime bridge (which reads both globals at boot).
 */
export function devHeadScripts(init: InitState, wsUrl: string): string {
  return [
    `<script>window.__EEKO_INIT__=${jsonForScript(init)};</script>`,
    `<script>window.__EEKO_DEV__={wsUrl:${JSON.stringify(wsUrl)}};</script>`,
    `<script>${RUNTIME_BRIDGE_JS}</script>`,
  ].join('\n  ')
}

/**
 * Normalise a simulated event payload to the `{type, context, payload}` wire
 * envelope. Production forwards this exact shape and the bridge unwraps
 * `.payload` for handlers + reads `.payload` for Phase-2 variant substitution.
 */
export function toEnvelope(
  event: string,
  raw: unknown
): { type: string; context: Record<string, unknown>; payload: unknown } {
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    // Already a full envelope.
    if ('type' in obj && 'payload' in obj) {
      return {
        type: String(obj.type ?? event),
        context: (obj.context as Record<string, unknown>) ?? {},
        payload: obj.payload,
      }
    }
    // chat_message family: the raw object IS the UnifiedMessage — it carries
    // its OWN discriminator `type` (chat_message / monetary_event /
    // subscription_event / engagement_event) and `context`. Production
    // (chat-relay) publishes the WHOLE UnifiedMessage as the envelope payload,
    // so a handler receives `msg.type` and `msg.context.platform`. Keep it
    // intact — do NOT lift its fields out (the old behaviour stripped type +
    // context, so `eeko test chat` delivered a shape production never sends).
    if (event === 'chat_message') {
      const ctx = (obj.context as Record<string, unknown>) ?? {}
      return {
        type: 'chat_message',
        context: { platform: ctx.platform, channelId: ctx.channelId },
        payload: obj,
      }
    }
    // Bare data (`component_trigger` dataPoints / mount / unmount test payloads).
    return { type: event, context: {}, payload: obj }
  }
  return { type: event, context: {}, payload: raw }
}
