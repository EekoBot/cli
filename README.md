# @eeko/cli

CLI for local Eeko widget development. Build, preview, and test widgets locally before deploying.

## Quick Start (npx)

```bash
npx @eeko/cli login
npx @eeko/cli init        # pick a merchant component, scaffold a widget directory
cd my-widget
pnpm install
pnpm eeko dev             # local preview on localhost
pnpm eeko publish         # commit to your Eeko component's Artifacts repo
```

`init` writes an `eeko.config.json` tying this directory to a specific merchant component on your account. `publish` reads the four canonical files (`index.html`, `styles.css`, `script.js`, `widget.json`) and posts them to the server-mediated `/commit` endpoint — the per-repo Artifacts push token never leaves Eeko's backend.

## Installation

Add to an existing project:

```bash
pnpm add -D @eeko/cli
```

## Usage

```bash
# Create a new widget
pnpm eeko init

# Start development server
pnpm eeko dev

# Send test events (in dev mode, press 1-4 for quick tests)
pnpm eeko test trigger --username="Tester" --amount=10

# Validate before deployment
pnpm eeko build
```

## Commands

### `eeko dev`

Start the local development server with hot module replacement.

```bash
pnpm eeko dev                    # Start on default ports (3000 + 9876)
pnpm eeko dev --port 3000        # Custom Vite port
pnpm eeko dev --ws-port 9876     # Custom WebSocket port
pnpm eeko dev --no-open          # Do not auto-open browser
```

Features:
- Vite-powered HMR for instant updates
- WebSocket server for test event injection
- Automatic SDK injection into widgets
- Automatic port selection if defaults are in use

Interactive keyboard shortcuts (when server is running):
- `1` - Send trigger event (donation)
- `2` - Send chat message
- `3` - Send update event
- `4` - Send variable update
- `o` - Open browser
- `c` - Clear event log
- `q` - Quit

### `eeko test`

Send test events to preview widget behavior. The dev server must be running.

```bash
# Trigger events (donations, follows, subscriptions)
pnpm eeko test trigger --username="TestUser" --amount=5 --message="Great stream!"
pnpm eeko test trigger --type=follow --username="NewFollower"
pnpm eeko test trigger --type=subscription --username="NewSub" --tier=1 --months=3

# Chat messages
pnpm eeko test chat --message="Hello world!" --username="Viewer1"
pnpm eeko test chat --platform=youtube --username="YTViewer" --message="Hi from YouTube!"
pnpm eeko test chat --mod --message="Mod message" --username="ModUser"

# Lifecycle events
pnpm eeko test mount
pnpm eeko test unmount

# State updates
pnpm eeko test update --data='{"count": 5}'
```

### `eeko init`

Scaffold a new widget directory linked to a merchant component on your Eeko account.

```bash
pnpm eeko init
```

You'll be prompted to pick which merchant component this directory is for (fetched from your account). `init` writes:

```
my-widget/
├── eeko.config.json  # { componentId, apiHost? }
├── widget.json       # manifest
├── index.html
├── styles.css
├── script.js
└── package.json
```

Don't delete `eeko.config.json` — it's what `eeko publish` reads to know which component to commit to.

### `eeko publish`

Commit the local widget files to your component's Cloudflare Artifacts repo.

```bash
pnpm eeko publish
```

Reads `index.html`, `styles.css`, `script.js`, `widget.json` from the current directory and posts them to `${apiHost}/api/merchant/components/:componentId/commit`. Prints the commit SHA and dashboard preview URL on success.

### `eeko build`

Validate widget structure before deployment.

```bash
pnpm eeko build
```

## Widget Structure

```
my-widget/
├── eeko.config.json  # componentId tying this directory to an Eeko component
├── widget.json       # manifest (fields, globalConfig, variantConfig, behavior)
├── index.html        # widget markup (content only, no <html>/<body>)
├── styles.css        # styles
├── script.js         # SDK event handlers
└── package.json      # project dependencies
```

### index.html

Widget HTML should contain only the widget content, not a full HTML document. The dev server wraps this automatically, and production renders it directly in the overlay container.

```html
<div id="widget">
  <div class="alert-title">{title}</div>
  <div class="alert-message">{message}</div>
</div>
```

### widget.json Schema

```json
{
  "fields": [
    {
      "key": "backgroundColor",
      "label": "Background color",
      "type": "color",
      "scope": "global",
      "default": "#1a1a1a"
    }
  ],
  "globalConfig": { "backgroundColor": "#1a1a1a" },
  "variantConfig": {},
  "behavior": { "duration_ms": 5000 }
}
```

See [Widget Authoring docs](https://docs.eeko.app/docs/widget-authoring) for the full manifest reference.

### SDK Usage

```javascript
const sdk = window.eekoSDK;

// Events
sdk.on('component_trigger', (data) => {
  console.log('Triggered:', data.username, data.amount);
});

sdk.on('chat_message', (message) => {
  console.log('Chat:', message.user.displayName, message.message.text);
});

sdk.on('component_update', (data) => {
  console.log('Update:', data);
});

sdk.on('variable_update', (data) => {
  console.log('Variable:', data.current);
});

sdk.on('component_mount', () => {
  console.log('Mounted');
});

sdk.on('component_unmount', () => {
  console.log('Unmounted');
});

// State
const state = sdk.getState();
console.log('Config:', state.globalConfig);
```

## TypeScript Support

Install the [@eeko/sdk](https://github.com/EekoBot/sdk) for type definitions:

```bash
pnpm add -D @eeko/sdk
```

```typescript
import type { IEekoSDK, ComponentTriggerPayload } from '@eeko/sdk';

declare const eekoSDK: IEekoSDK;

eekoSDK.on('component_trigger', (data: ComponentTriggerPayload) => {
  console.log(data.username);
});
```

## Troubleshooting

### Port Already in Use

The CLI automatically finds available ports. To use specific ports:

```bash
pnpm eeko dev --port 3001 --ws-port 9877
```

### WebSocket Connection Failed

Ensure `eeko dev` is running before using `eeko test`.

### SDK Not Found

The SDK is automatically injected by the dev server. Check browser console for `[EekoSDK:Dev] SDK available` message.

## License

MIT
