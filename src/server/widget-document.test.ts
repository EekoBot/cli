import { describe, it, expect } from 'vitest'
import { resolveConfigs, devHeadScripts, toEnvelope } from './widget-document.js'
import type { WidgetManifest } from '@eeko/sdk/template/node'

describe('toEnvelope', () => {
  it('passes through an already-shaped {type, context, payload} envelope', () => {
    const env = { type: 'component_trigger', context: { userId: 'u1' }, payload: { x: 1 } }
    expect(toEnvelope('component_trigger', env)).toEqual(env)
  })

  it('lifts data fields under payload for {type, context, ...data} test payloads', () => {
    const raw = {
      type: 'chat_message',
      context: { platform: 'twitch' },
      user: { displayName: 'Ada' },
      message: { text: 'hi' },
    }
    expect(toEnvelope('chat_message', raw)).toEqual({
      type: 'chat_message',
      context: { platform: 'twitch' },
      payload: { user: { displayName: 'Ada' }, message: { text: 'hi' } },
    })
  })

  it('wraps a bare data object as the payload, keyed by the event name', () => {
    const raw = { componentId: 'dev-component', timestamp: 123 }
    expect(toEnvelope('component_trigger', raw)).toEqual({
      type: 'component_trigger',
      context: {},
      payload: raw,
    })
  })
})

describe('resolveConfigs', () => {
  it('returns empty configs for a null manifest', () => {
    expect(resolveConfigs(null)).toEqual({ globalConfig: {}, variantConfig: {} })
  })

  it('merges field defaults under the manifest config, with both-scope in both', () => {
    const manifest: WidgetManifest = {
      name: 'X',
      componentType: 'alert',
      fields: [
        { key: 'title', label: 'Title', type: 'text', scope: 'variant', defaultValue: 'Hi' },
        { key: 'bg', label: 'BG', type: 'color', scope: 'global', defaultValue: '#000' },
        { key: 'accent', label: 'Accent', type: 'color', scope: 'both', defaultValue: '#fff' },
      ],
      globalConfig: { bg: '#111' }, // explicit overrides field default
      variantConfig: {},
    }
    const { globalConfig, variantConfig } = resolveConfigs(manifest)
    expect(globalConfig).toEqual({ bg: '#111', accent: '#fff' })
    expect(variantConfig).toEqual({ title: 'Hi', accent: '#fff' })
  })
})

describe('devHeadScripts', () => {
  const init = { componentId: 'c1', userId: 'u1', globalConfig: { a: 1 }, variantConfig: {} }

  it('injects __EEKO_INIT__, __EEKO_DEV__ and the runtime bridge', () => {
    const out = devHeadScripts(init, 'ws://127.0.0.1:9876')
    expect(out).toContain('window.__EEKO_INIT__=')
    expect(out).toContain('"componentId":"c1"')
    expect(out).toContain('window.__EEKO_DEV__={wsUrl:"ws://127.0.0.1:9876"}')
    expect(out).toContain('@eeko/sdk runtime bridge')
  })

  it('escapes < so injected JSON cannot break out of the script tag', () => {
    const out = devHeadScripts(
      { ...init, variantConfig: { html: '</script>' } },
      'ws://127.0.0.1:9876'
    )
    expect(out).not.toContain('</script><')
    expect(out).toContain('\\u003c')
  })
})
