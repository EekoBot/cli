/**
 * eeko init - Create a new widget project from GitHub templates
 *
 * Examples:
 *   eeko init                           # Interactive mode
 *   eeko init EekoBot/template-alert    # Specific repo
 *   eeko init user/custom-template      # Custom repo
 */

import { Command } from 'commander'
import React, { useState } from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import fs from 'fs/promises'
import path from 'path'
import { downloadTemplate } from 'giget'

/**
 * Sanitize project name to prevent path traversal
 */
function sanitizeProjectName(name: string): string {
  // Remove path separators and dangerous characters
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

/**
 * Validate GitHub repo format
 */
function validateRepoName(repo: string): void {
  if (!repo.includes('/') || repo.split('/').length !== 2) {
    throw new Error('Invalid repo format. Use owner/repo')
  }

  const [owner, repoName] = repo.split('/')
  const validPattern = /^[a-zA-Z0-9_-]+$/

  if (!validPattern.test(owner) || !validPattern.test(repoName)) {
    throw new Error('Invalid characters in repository name')
  }
}

interface Template {
  label: string
  value: string
  description: string
}

const TEMPLATES: Template[] = [
  {
    label: 'Blank',
    value: 'blank',
    description: 'Empty starter template',
  },
  {
    label: 'Alert',
    value: 'EekoBot/template-alert',
    description: 'Donation/follow alerts',
  },
  {
    label: 'Chat Overlay',
    value: 'EekoBot/template-chat-overlay',
    description: 'Chat messages display',
  },
  {
    label: 'Goal Bar',
    value: 'EekoBot/template-goal-bar',
    description: 'Progress bar widget',
  },
  {
    label: 'Custom',
    value: 'custom',
    description: 'Enter GitHub repo',
  },
]

type Step = 'template' | 'custom-repo' | 'name' | 'creating' | 'done' | 'error'

interface InitUIProps {
  initialRepo?: string
}

function InitUI({ initialRepo }: InitUIProps) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>(initialRepo ? 'name' : 'template')
  const [repo, setRepo] = useState(initialRepo || '')
  const [customRepo, setCustomRepo] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [targetDir, setTargetDir] = useState('')

  useInput((input, key) => {
    if (key.escape) {
      exit()
    }
  })

  const handleTemplateSelect = (item: { value: string }) => {
    if (item.value === 'custom') {
      setStep('custom-repo')
    } else {
      setRepo(item.value)
      setStep('name')
    }
  }

  const handleCustomRepoSubmit = (value: string) => {
    if (!value || !value.includes('/')) {
      setError('Invalid repo format. Use owner/repo')
      setStep('error')
      setTimeout(() => exit(), 2000)
      return
    }
    setRepo(value)
    setStep('name')
  }

  const handleNameSubmit = async (value: string) => {
    const projectName = value || 'my-widget'
    setName(projectName)
    setStep('creating')

    try {
      const dir = await createProject(repo, projectName, setStatus)
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

      {step === 'template' && (
        <Box flexDirection="column">
          <Text>Select a template:</Text>
          <Box marginTop={1}>
            <SelectInput
              items={TEMPLATES.map((t) => ({
                label: `${t.label} - ${t.description}`,
                value: t.value,
              }))}
              onSelect={handleTemplateSelect}
            />
          </Box>
        </Box>
      )}

      {step === 'custom-repo' && (
        <Box flexDirection="column">
          <Box marginTop={1}>
            <Text>GitHub repo (owner/repo): </Text>
            <TextInput
              value={customRepo}
              onChange={setCustomRepo}
              onSubmit={handleCustomRepoSubmit}
              placeholder="user/template-repo"
            />
          </Box>
        </Box>
      )}

      {step === 'name' && (
        <Box flexDirection="column">
          <Text>
            Template: <Text color="green">{repo === 'blank' ? 'Blank' : repo}</Text>
          </Text>
          <Box marginTop={1}>
            <Text>Project name: </Text>
            <TextInput
              value={name}
              onChange={setName}
              onSubmit={handleNameSubmit}
              placeholder="my-widget"
            />
          </Box>
        </Box>
      )}

      {step === 'creating' && (
        <Box flexDirection="column">
          <Box>
            <Text color="yellow">
              <Spinner type="dots" />
            </Text>
            <Text> {status || 'Creating project...'}</Text>
          </Box>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green">Created {targetDir}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Next steps:</Text>
            <Text dimColor>  cd {name}</Text>
            <Text dimColor>  pnpm install</Text>
            <Text dimColor>  pnpm eeko dev</Text>
          </Box>
        </Box>
      )}

      {step === 'error' && (
        <Text color="red">Error: {error}</Text>
      )}

      <Box marginTop={1}>
        <Text dimColor>Press Esc to cancel</Text>
      </Box>
    </Box>
  )
}

async function createProject(
  repo: string,
  name: string,
  setStatus: (s: string) => void
): Promise<string> {
  // Sanitize project name to prevent path traversal
  const safeName = sanitizeProjectName(name)
  const targetDir = path.join(process.cwd(), safeName)

  if (repo === 'blank') {
    setStatus('Creating blank template...')
    await createBlankTemplate(targetDir)
    setStatus('Done!')
    return targetDir
  }

  // Validate repo name format
  validateRepoName(repo)

  setStatus(`Cloning ${repo}...`)

  await downloadTemplate(`github:${repo}`, {
    dir: targetDir,
    force: true,
  })

  setStatus('Done!')
  return targetDir
}

async function createBlankTemplate(targetDir: string) {
  await fs.mkdir(targetDir, { recursive: true })

  // Widget HTML - just the content, no document wrapper
  // The dev server wraps this in a full HTML document
  // Production overlay injects this directly into a container
  const indexHtml = `<div id="widget">
  <div class="header">Eeko Widget</div>
  <div class="hint">Press 1-4 in terminal to send test events</div>
  <div id="events"></div>
</div>
`

  const styleCss = `* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background: #1a1a2e;
  font-family: system-ui, sans-serif;
}

#widget {
  padding: 16px;
  color: #fff;
}

.header {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 8px;
}

.hint {
  color: #888;
  margin-bottom: 16px;
}

#events {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px;
  animation: fadeIn 0.3s ease-out;
}

.event-type {
  font-weight: bold;
  color: #4ade80;
  margin-bottom: 4px;
}

.event-payload {
  font-family: monospace;
  font-size: 12px;
  color: #ccc;
  white-space: pre-wrap;
  word-break: break-all;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
`

  const scriptJs = `/**
 * Widget Script - Blank Template
 *
 * Events are displayed on screen and logged to console.
 */
(function () {
  const sdk = window.eekoSDK;
  const eventsEl = document.getElementById('events');

  if (!sdk) {
    console.error('[Widget] SDK not found');
    eventsEl.innerHTML = '<div class="event"><div class="event-type" style="color:#f87171">SDK not found</div></div>';
    return;
  }

  // Show event on screen
  function showEvent(type, payload) {
    const el = document.createElement('div');
    el.className = 'event';
    el.innerHTML = \`
      <div class="event-type">\${type}</div>
      <div class="event-payload">\${JSON.stringify(payload, null, 2)}</div>
    \`;
    eventsEl.insertBefore(el, eventsEl.firstChild);

    // Keep only last 10 events
    while (eventsEl.children.length > 10) {
      eventsEl.removeChild(eventsEl.lastChild);
    }

    console.log('[Widget] ' + type + ':', payload);
  }

  // SDK Events
  sdk.on('component_trigger', (payload) => showEvent('component_trigger', payload));
  sdk.on('chat_message', (payload) => showEvent('chat_message', payload));
  sdk.on('component_update', (payload) => showEvent('component_update', payload));
  sdk.on('variable_update', (payload) => showEvent('variable_update', payload));
  sdk.on('component_mount', () => showEvent('component_mount', {}));
  sdk.on('component_unmount', () => showEvent('component_unmount', {}));

  console.log('[Widget] Ready! Listening for events...');
})();
`

  const fieldJson = `{
  "fields": [
    {
      "key": "text",
      "label": "Text",
      "type": "text",
      "scope": "global",
      "defaultValue": "Hello!"
    }
  ]
}
`

  // Extract project name from targetDir for package.json
  const projectName = path.basename(targetDir)
  const packageJson = `{
  "name": "${projectName}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "eeko dev",
    "build": "eeko build"
  },
  "devDependencies": {
    "@eeko/cli": "^0.1.0"
  }
}
`

  await Promise.all([
    fs.writeFile(path.join(targetDir, 'index.html'), indexHtml),
    fs.writeFile(path.join(targetDir, 'style.css'), styleCss),
    fs.writeFile(path.join(targetDir, 'script.js'), scriptJs),
    fs.writeFile(path.join(targetDir, 'field.json'), fieldJson),
    fs.writeFile(path.join(targetDir, 'package.json'), packageJson),
  ])
}

export const initCommand = new Command('init')
  .description('Create a new widget project')
  .argument('[repo]', 'GitHub repo (e.g., EekoBot/template-alert)')
  .action((repo) => {
    render(<InitUI initialRepo={repo} />)
  })
