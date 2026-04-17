/**
 * Vite Dev Server with SDK Injection
 *
 * Starts Vite to serve widget files with HMR
 * Wraps widget HTML in a full document for development
 * Injects the shared @eeko/sdk runtime bridge (with WebSocket dev transport)
 * Performs template variable replacement using @eeko/sdk
 */

import { createServer, type ViteDevServer } from 'vite'
import path from 'path'
import fs from 'fs'
import {
  TemplateEngine,
  loadFieldConfig,
  type FieldConfig,
} from '@eeko/sdk/template/node'
import { RUNTIME_BRIDGE_JS } from '@eeko/sdk/runtime-bridge'

export interface DevServerOptions {
  port: number
  wsPort: number
  onReady?: (actualPort: number, actualWsPort: number) => void
}

export interface DevServer {
  close: () => Promise<void>
  on: (event: string, handler: (...args: unknown[]) => void) => void
  port: number
  wsPort: number
}

/**
 * Check if HTML is a full document or just widget content
 */
function isFullHtmlDocument(html: string): boolean {
  const trimmed = html.trim().toLowerCase()
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')
}

/**
 * Wrap widget HTML content in a full document for development
 * Uses module script to import CSS so Vite can transform template variables
 */
function wrapWidgetHtml(widgetHtml: string, wsPort: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget Preview</title>
  ${devScriptTags(wsPort)}
  <script type="module">import './style.css';</script>
</head>
<body>
${widgetHtml}
  <script src="./script.js"></script>
</body>
</html>`
}

/**
 * Produce the two script tags that initialise the SDK bridge in dev mode:
 *   1. Set `window.__EEKO_DEV__` so the bridge picks the WebSocket transport.
 *   2. The bridge IIFE itself (shared with production widget-host).
 */
function devScriptTags(wsPort: number): string {
  return `<script>window.__EEKO_DEV__={wsUrl:"ws://localhost:${wsPort}"};</script>
  <script>${RUNTIME_BRIDGE_JS}</script>`
}

/**
 * Load field.json configuration if it exists
 */
async function loadTemplateConfig(cwd: string): Promise<FieldConfig | null> {
  const fieldJsonPath = path.join(cwd, 'field.json')
  if (!fs.existsSync(fieldJsonPath)) {
    return null
  }

  try {
    return await loadFieldConfig(cwd)
  } catch (err) {
    console.warn('[Dev] Failed to load field.json:', err)
    return null
  }
}

/**
 * Start the Vite dev server with SDK injection
 */
export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const { port, wsPort, onReady } = options

  // Check if widget files exist
  const cwd = process.cwd()
  const indexPath = path.join(cwd, 'index.html')
  const hasIndex = fs.existsSync(indexPath)

  if (!hasIndex) {
    console.warn('[Dev] No index.html found in current directory')
    console.warn('[Dev] Run `eeko init` to create a new widget')
  }

  // Load field.json configuration for template processing
  const fieldConfig = await loadTemplateConfig(cwd)
  const templateEngine = fieldConfig
    ? new TemplateEngine(fieldConfig.globalConfig)
    : null

  if (templateEngine) {
    console.log('[Dev] Template engine initialized with field.json config')
  }

  const server = await createServer({
    root: cwd,
    server: {
      port,
      strictPort: false, // Allow Vite to find next available port
      open: false,
    },
    plugins: [
      {
        name: 'eeko-widget-wrapper',
        transformIndexHtml(html) {
          // Process template variables in HTML
          let processedHtml = html
          if (templateEngine) {
            processedHtml = templateEngine.processHTML(html)
          }

          // Check if this is already a full HTML document
          if (isFullHtmlDocument(processedHtml)) {
            // Legacy full document - inject dev config + shared bridge into <head>
            return processedHtml.replace(
              '<head>',
              `<head>${devScriptTags(wsPort)}`
            )
          }

          // Widget content only - wrap in full document
          return wrapWidgetHtml(processedHtml, wsPort)
        },
        transform(code, id) {
          // Process template variables in CSS and JS files
          if (!templateEngine) return code

          if (id.endsWith('.css')) {
            return templateEngine.processCSS(code)
          }

          if (id.endsWith('.js') || id.endsWith('.ts')) {
            return templateEngine.processJS(code)
          }

          return code
        },
      },
    ],
    optimizeDeps: {
      exclude: [],
    },
    logLevel: 'silent', // Suppress Vite's own logging
  })

  await server.listen()

  // Get the actual port Vite is using
  const actualPort = server.config.server.port || port
  console.log(`[Vite] Server listening on port ${actualPort}`)

  // Call onReady callback with actual port
  if (onReady) {
    onReady(actualPort, wsPort)
  }

  return {
    close: () => server.close(),
    on: (event, handler) => {
      server.watcher?.on(event, handler)
    },
    port: actualPort,
    wsPort,
  }
}

