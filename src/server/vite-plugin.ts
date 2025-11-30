/**
 * Vite Dev Server with SDK Injection
 *
 * Starts Vite to serve widget files with HMR
 * Wraps widget HTML in a full document for development
 * Injects the LocalDevAdapter into the page
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
 */
function wrapWidgetHtml(widgetHtml: string, wsPort: number): string {
  const sdkScript = getLocalDevAdapterScript(wsPort)

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Widget Preview</title>
  <link rel="stylesheet" href="./style.css">
  <script>${sdkScript}</script>
</head>
<body>
${widgetHtml}
  <script src="./script.js"></script>
</body>
</html>`
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
            // Legacy full document - just inject SDK into <head>
            const sdkScript = getLocalDevAdapterScript(wsPort)
            return processedHtml.replace(
              '<head>',
              `<head><script>${sdkScript}</script>`
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

/**
 * Generate the LocalDevAdapter script that gets injected into the widget
 */
function getLocalDevAdapterScript(wsPort: number): string {
  return `
// Eeko Local Dev Adapter
(function() {
  const WS_URL = 'ws://localhost:${wsPort}';

  // Event type enum
  const EVENT_TYPES = [
    'component_trigger',
    'component_update',
    'component_sync',
    'component_mount',
    'component_unmount',
    'chat_message',
    'variable_updated'
  ];

  class LocalDevAdapter {
    constructor() {
      this.listeners = new Map();
      this.state = {
        componentId: 'dev-component',
        userId: 'dev-user',
        globalConfig: {},
        variantConfig: {},
      };
      this.isInitialized = false;
      this.ws = null;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 10;

      // Initialize listener maps
      EVENT_TYPES.forEach(type => {
        this.listeners.set(type, new Set());
      });

      this.connect();
    }

    connect() {
      try {
        this.ws = new WebSocket(WS_URL);

        this.ws.onopen = () => {
          console.log('[EekoSDK:Dev] Connected to dev server');
          this.reconnectAttempts = 0;
          this.isInitialized = true;
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (err) {
            console.error('[EekoSDK:Dev] Failed to parse message:', err);
          }
        };

        this.ws.onerror = (err) => {
          console.error('[EekoSDK:Dev] WebSocket error');
        };

        this.ws.onclose = () => {
          console.log('[EekoSDK:Dev] Disconnected from dev server');
          this.isInitialized = false;
          this.attemptReconnect();
        };
      } catch (err) {
        console.error('[EekoSDK:Dev] Failed to connect:', err);
        this.attemptReconnect();
      }
    }

    attemptReconnect() {
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * this.reconnectAttempts, 5000);
        console.log('[EekoSDK:Dev] Reconnecting in ' + delay + 'ms...');
        setTimeout(() => this.connect(), delay);
      }
    }

    handleMessage(message) {
      switch (message.type) {
        case 'event':
          if (message.event && message.payload !== undefined) {
            this._emit(message.event, message.payload);
          }
          break;

        case 'state':
          if (message.state) {
            this._setState(message.state);
          }
          break;

        case 'command':
          this.handleCommand(message);
          break;
      }
    }

    handleCommand(message) {
      switch (message.command) {
        case 'init':
          this._initialize(message.state || {});
          break;
        case 'reset':
          this.reset();
          break;
        case 'disconnect':
          this.ws?.close();
          break;
      }
    }

    // Public API
    on(event, handler) {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.add(handler);
        console.log('[EekoSDK:Dev] Registered listener for:', event);
      } else {
        console.warn('[EekoSDK:Dev] Unknown event type:', event);
      }
    }

    off(event, handler) {
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        console.log('[EekoSDK:Dev] Removed listener for:', event);
      }
    }

    getState() {
      return { ...this.state };
    }

    isReady() {
      return this.isInitialized && this.ws?.readyState === WebSocket.OPEN;
    }

    // Internal methods
    _emit(event, data) {
      const handlers = this.listeners.get(event);
      if (handlers && handlers.size > 0) {
        console.log('[EekoSDK:Dev] Emitting', event, 'to', handlers.size, 'listener(s)');
        handlers.forEach(handler => {
          try {
            handler(data);
          } catch (err) {
            console.error('[EekoSDK:Dev] Error in', event, 'handler:', err);
          }
        });
      }
    }

    _setState(newState) {
      this.state = { ...this.state, ...newState };
      console.log('[EekoSDK:Dev] State updated:', this.state);
    }

    _initialize(initialState) {
      this.state = { ...this.state, ...initialState };
      this.isInitialized = true;
      console.log('[EekoSDK:Dev] Initialized with state:', this.state);
    }

    reset() {
      this.listeners.forEach(handlers => handlers.clear());
      EVENT_TYPES.forEach(type => {
        this.listeners.set(type, new Set());
      });
      this.state = {
        componentId: 'dev-component',
        userId: 'dev-user',
        globalConfig: {},
        variantConfig: {},
      };
      this.isInitialized = false;
    }
  }

  // Create and expose the SDK
  window.eekoSDK = new LocalDevAdapter();
  console.log('[EekoSDK:Dev] SDK available on window.eekoSDK');
})();
`
}
