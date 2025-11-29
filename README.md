# @eeko/cli

CLI for local Eeko widget development. Build, preview, and test widgets locally before deploying.

## Quick Start (npx)

Create a new widget project without installing globally:

```bash
npx @eeko/cli init
cd my-widget
pnpm install
pnpm eeko dev
```

This will:
1. Prompt you to select a template
2. Create a new directory with widget files and `package.json`
3. Install `@eeko/cli` and dependencies
4. Start the dev server with hot reload

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

Create a new widget project from a template.

```bash
pnpm eeko init                           # Interactive template selection
pnpm eeko init EekoBot/template-alert    # Clone from GitHub repo
pnpm eeko init user/custom-template      # Clone from custom repo
```

Available templates:
- `blank` - Empty starter template
- `EekoBot/template-alert` - Donation/follow alerts
- `EekoBot/template-chat-overlay` - Chat messages display
- `EekoBot/template-goal-bar` - Progress bar widget

### `eeko build`

Validate widget structure before deployment.

```bash
pnpm eeko build
```

Validates:
- Required files exist (index.html, style.css, script.js, field.json)
- field.json has valid schema with `fields` array
- All JSON files are parseable

## Widget Structure

```
my-widget/
├── index.html       # Widget markup (content only, no <html>/<body>)
├── style.css        # Styles
├── script.js        # SDK event handlers
├── field.json       # Configuration schema
└── package.json     # Project dependencies
```

### index.html

Widget HTML should contain only the widget content, not a full HTML document. The dev server wraps this automatically, and production renders it directly in the overlay container.

```html
<div id="widget">
  <div class="alert-title">{title}</div>
  <div class="alert-message">{message}</div>
</div>
```

### field.json Schema

```json
{
  "fields": [
    {
      "key": "backgroundColor",
      "label": "Background Color",
      "type": "color",
      "scope": "global",
      "defaultValue": "#1a1a1a"
    }
  ]
}
```

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
