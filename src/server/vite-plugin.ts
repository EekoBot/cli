/**
 * Vite Dev Server with SDK Injection
 *
 * Serves the widget files with HMR, mirroring widget-host's serve-time shell:
 *   - Phase-1 template substitution via @eeko/sdk TemplateEngine (globals into
 *     HTML; globals+variant into CSS/JS — variant HTML tokens stay literal for
 *     the bridge's Phase-2 DOM walk)
 *   - injects `window.__EEKO_INIT__` (real configs) + `window.__EEKO_DEV__`
 *     (WebSocket transport) + the shared RUNTIME_BRIDGE_JS bridge
 */

import { createServer } from 'vite'
import path from 'path'
import fs from 'fs'
import { TemplateEngine } from '@eeko/sdk/template/node'
import { devHeadScripts, type InitState } from './widget-document.js'

export interface DevServerOptions {
  port: number
  wsPort: number
  init: InitState
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
 * Wrap widget-only HTML in a full document. The canonical `styles.css` and
 * `script.js` are referenced so Vite's `transform` hook can substitute their
 * template variables (Phase-1), matching what widget-host inlines.
 */
function wrapWidgetHtml(widgetHtml: string, headScripts: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget Preview</title>
  ${headScripts}
  <script type="module">import './styles.css';</script>
</head>
<body>
${widgetHtml}
  <script src="./script.js"></script>
</body>
</html>`
}

/**
 * Start the Vite dev server with SDK injection + Phase-1 substitution.
 */
export async function startDevServer(options: DevServerOptions): Promise<DevServer> {
  const { port, wsPort, init, onReady } = options

  const cwd = process.cwd()
  if (!fs.existsSync(path.join(cwd, 'index.html'))) {
    console.warn('[Dev] No index.html found in current directory')
    console.warn('[Dev] Run `eeko init` to create a new widget')
  }

  const wsUrl = `ws://127.0.0.1:${wsPort}`
  const headScripts = devHeadScripts(init, wsUrl)

  // Two engines mirror widget-host: globals-only for HTML (variant tokens stay
  // literal for Phase-2), globals+variant for CSS/JS.
  const htmlEngine = new TemplateEngine(init.globalConfig)
  const assetEngine = new TemplateEngine({ ...init.globalConfig, ...init.variantConfig })

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
          const processedHtml = htmlEngine.processHTML(html)

          if (isFullHtmlDocument(processedHtml)) {
            // Inject the bridge scripts into the existing <head>.
            return processedHtml.replace('<head>', `<head>\n  ${headScripts}`)
          }

          // Widget content only — wrap in a full document.
          return wrapWidgetHtml(processedHtml, headScripts)
        },
        transform(code, id) {
          if (id.endsWith('.css')) {
            return assetEngine.processCSS(code)
          }
          if (id.endsWith('.js') || id.endsWith('.ts')) {
            return assetEngine.processJS(code)
          }
          return code
        },
      },
    ],
    logLevel: 'silent', // Suppress Vite's own logging
  })

  await server.listen()

  const actualPort = server.config.server.port || port
  console.log(`[Vite] Server listening on port ${actualPort}`)

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
