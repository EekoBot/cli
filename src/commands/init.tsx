/**
 * eeko init — scaffold a new widget directory linked to a merchant component.
 *
 * Writes:
 *   - eeko.config.json  (componentId)
 *   - widget.json       (manifest — fields, config defaults, behavior)
 *   - index.html
 *   - styles.css
 *   - script.js
 *   - package.json      (dev scripts convenience)
 */

import { Command } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import fs from 'fs/promises'
import path from 'path'
import { loadSessionSync, isSessionValid } from '../auth/store.js'
import { getMerchantComponents, type MerchantComponent } from '../api/client.js'
import { writeEekoConfig } from '../utils/config.js'

function sanitizeProjectName(name: string): string {
  const sanitized = name
    .replace(/[\/\\]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/^\.+/, '')
    .trim()

  if (!sanitized || sanitized.length === 0) {
    throw new Error('Project name cannot be empty')
  }

  if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_\-. ]*$/.test(sanitized)) {
    throw new Error('Project name contains invalid characters')
  }

  return sanitized
}

type Step =
  | 'checking-auth'
  | 'loading-components'
  | 'selecting-component'
  | 'entering-name'
  | 'creating'
  | 'done'
  | 'error'

function InitUI() {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('checking-auth')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [components, setComponents] = useState<MerchantComponent[]>([])
  const [selected, setSelected] = useState<MerchantComponent | null>(null)
  const [projectName, setProjectName] = useState('')
  const [status, setStatus] = useState('')
  const [targetDir, setTargetDir] = useState('')

  useInput((_input, key) => {
    if (key.escape) exit()
  })

  useEffect(() => {
    if (step !== 'checking-auth') return

    const session = loadSessionSync()
    if (!session || !isSessionValid(session)) {
      setError('Not logged in. Run: eeko login')
      setStep('error')
      setTimeout(() => exit(), 2000)
      return
    }

    setToken(session.access_token)
    setStep('loading-components')
  }, [step, exit])

  useEffect(() => {
    if (step !== 'loading-components' || !token) return

    getMerchantComponents(token)
      .then((list) => {
        if (list.length === 0) {
          setError(
            'No merchant components on this account. Create one at https://app.eeko.app first.'
          )
          setStep('error')
          setTimeout(() => exit(), 3000)
          return
        }
        setComponents(list)
        setStep('selecting-component')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load components')
        setStep('error')
        setTimeout(() => exit(), 3000)
      })
  }, [step, token, exit])

  const handleComponentSelect = (item: { value: string }) => {
    const component = components.find((c) => c.id === item.value)
    if (!component) return
    setSelected(component)
    setProjectName(slugify(component.title))
    setStep('entering-name')
  }

  const handleNameSubmit = async (value: string) => {
    const name = value || slugify(selected?.title || 'my-widget')
    setProjectName(name)
    setStep('creating')

    try {
      const dir = await scaffold(name, selected!, setStatus)
      setTargetDir(dir)
      setStep('done')
      setTimeout(() => exit(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStep('error')
      setTimeout(() => exit(), 3000)
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Create Eeko Widget
        </Text>
      </Box>

      {(step === 'checking-auth' || step === 'loading-components') && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            {step === 'checking-auth' && 'Checking authentication...'}
            {step === 'loading-components' && 'Loading your components...'}
          </Text>
        </Box>
      )}

      {step === 'selecting-component' && (
        <Box flexDirection="column">
          <Text>Which merchant component is this directory for?</Text>
          <Box marginTop={1}>
            <SelectInput
              items={components.map((c) => ({
                label: `${c.title}  ${c.id.slice(0, 8)}`,
                value: c.id,
              }))}
              onSelect={handleComponentSelect}
            />
          </Box>
        </Box>
      )}

      {step === 'entering-name' && (
        <Box flexDirection="column">
          <Text>
            Component: <Text color="green">{selected?.title}</Text>
          </Text>
          <Box marginTop={1}>
            <Text>Directory name: </Text>
            <TextInput
              value={projectName}
              onChange={setProjectName}
              onSubmit={handleNameSubmit}
              placeholder="my-widget"
            />
          </Box>
        </Box>
      )}

      {step === 'creating' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {status || 'Creating project...'}</Text>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green">Created {targetDir}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Next steps:</Text>
            <Text dimColor>  cd {projectName}</Text>
            <Text dimColor>  eeko dev      # local preview</Text>
            <Text dimColor>  eeko publish  # commit to Eeko</Text>
          </Box>
        </Box>
      )}

      {step === 'error' && <Text color="red">Error: {error}</Text>}

      <Box marginTop={1}>
        <Text dimColor>Press Esc to cancel</Text>
      </Box>
    </Box>
  )
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'my-widget'
}

async function scaffold(
  name: string,
  component: MerchantComponent,
  setStatus: (s: string) => void
): Promise<string> {
  const safeName = sanitizeProjectName(name)
  const targetDir = path.join(process.cwd(), safeName)

  setStatus(`Creating ${safeName}/...`)
  await fs.mkdir(targetDir, { recursive: true })

  writeEekoConfig(targetDir, { componentId: component.id })

  const indexHtml = `<div id="widget">
  <div class="title">{title}</div>
  <div class="message">{message}</div>
</div>
`

  const stylesCss = `* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: system-ui, sans-serif;
  color: {textColor};
}

#widget {
  padding: 16px;
  background: {backgroundColor};
  border-radius: 8px;
}

.title {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 4px;
}

.message {
  font-size: 16px;
  opacity: 0.85;
}
`

  const scriptJs = `(function () {
  const sdk = window.eekoSDK;
  if (!sdk) return;

  sdk.on('component_trigger', (data) => {
    // data fields come from your automation — see widget.json variantConfig
    console.log('[widget] triggered', data);
  });

  sdk.on('component_mount', () => {
    console.log('[widget] mounted');
  });
})();
`

  const widgetJson = `{
  "fields": [
    {
      "key": "title",
      "label": "Title",
      "type": "text",
      "scope": "variant",
      "default": "{username}"
    },
    {
      "key": "message",
      "label": "Message",
      "type": "text",
      "scope": "variant",
      "default": "just triggered the widget!"
    },
    {
      "key": "backgroundColor",
      "label": "Background color",
      "type": "color",
      "scope": "global",
      "default": "#1a1a2e"
    },
    {
      "key": "textColor",
      "label": "Text color",
      "type": "color",
      "scope": "global",
      "default": "#ffffff"
    }
  ],
  "globalConfig": {
    "backgroundColor": "#1a1a2e",
    "textColor": "#ffffff"
  },
  "variantConfig": {
    "title": "{username}",
    "message": "just triggered the widget!"
  },
  "behavior": {
    "duration_ms": 5000
  }
}
`

  const packageJson = `{
  "name": "${safeName}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "eeko dev",
    "publish:eeko": "eeko publish"
  },
  "devDependencies": {
    "@eeko/cli": "^0.4.0"
  }
}
`

  await Promise.all([
    fs.writeFile(path.join(targetDir, 'index.html'), indexHtml),
    fs.writeFile(path.join(targetDir, 'styles.css'), stylesCss),
    fs.writeFile(path.join(targetDir, 'script.js'), scriptJs),
    fs.writeFile(path.join(targetDir, 'widget.json'), widgetJson),
    fs.writeFile(path.join(targetDir, 'package.json'), packageJson),
  ])

  setStatus('Done!')
  return targetDir
}

export const initCommand = new Command('init')
  .description('Scaffold a new widget directory linked to a merchant component')
  .action(() => {
    render(<InitUI />)
  })
