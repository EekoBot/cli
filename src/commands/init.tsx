/**
 * eeko init — create a new widget on your account and scaffold it locally.
 *
 * Creates a user-component (provisions its `uc-{id}` Artifacts repo), clones
 * it, scaffolds the chosen starter template over the seed, commits, and writes
 * eeko.config.json — leaving a ready git repo you can `eeko dev` and
 * `eeko publish`.
 */

import { Command } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import path from 'path'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getValidAccessToken } from '../auth/session.js'
import { createComponent, getComponentGit } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { writeEekoConfig } from '../utils/config.js'
import { cloneRepo, checkout, stageAndCommit } from '../utils/git.js'
import {
  TEMPLATES,
  TEMPLATE_COMPONENT_TYPE,
  scaffoldTemplate,
  isTemplateName,
  type TemplateName,
} from '../utils/templates.js'

function sanitizeProjectName(name: string): string {
  const sanitized = name
    .replace(/[\/\\]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/^\.+/, '')
    .trim()

  if (!sanitized) {
    throw new Error('Project name cannot be empty')
  }
  if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_\-. ]*$/.test(sanitized)) {
    throw new Error('Project name contains invalid characters')
  }
  return sanitized
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-widget'
  )
}

function packageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'eeko dev',
        publish: 'eeko publish',
      },
    },
    null,
    2
  )}\n`
}

interface InitOptions {
  name?: string
  template?: TemplateName
  type?: string
  apiHost?: string
}

async function createAndScaffold(
  token: string,
  opts: { name: string; template: TemplateName; type: string; apiHost?: string },
  setStatus: (s: string) => void
): Promise<string> {
  const safeName = sanitizeProjectName(opts.name)
  const targetDir = path.join(process.cwd(), safeName)
  if (existsSync(targetDir)) {
    throw new Error(`Directory ${safeName} already exists`)
  }
  const apiBase = opts.apiHost ?? AUTH_CONFIG.api.baseUrl

  setStatus('Creating widget on your account…')
  const created = await createComponent(token, { name: safeName, componentType: opts.type }, apiBase)
  const componentId = created.componentId

  setStatus('Resolving git remote…')
  const info = await getComponentGit(token, componentId, apiBase)

  setStatus('Cloning…')
  const clone = await cloneRepo(info.remote, targetDir, info.host)
  if (clone.code !== 0) {
    throw new Error('git clone failed: ' + clone.stderr.trim())
  }
  await checkout(targetDir, info.refs.draft)

  setStatus(`Scaffolding the ${opts.template} template…`)
  await scaffoldTemplate(opts.template, targetDir, safeName)
  writeEekoConfig(targetDir, { componentId, apiHost: opts.apiHost })
  await writeFile(path.join(targetDir, 'package.json'), packageJson(safeName))
  await stageAndCommit(targetDir, `init: scaffold ${opts.template}`)

  setStatus('Done!')
  return targetDir
}

type Step = 'checking-auth' | 'selecting-template' | 'entering-name' | 'creating' | 'done' | 'error'

function InitUI({ initial }: { initial: InitOptions }) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('checking-auth')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [template, setTemplate] = useState<TemplateName | null>(initial.template ?? null)
  const [projectName, setProjectName] = useState(initial.name ?? '')
  const [status, setStatus] = useState('')
  const [targetDir, setTargetDir] = useState('')

  useInput((_input, key) => {
    if (key.escape) exit()
  })

  useEffect(() => {
    if (step !== 'checking-auth') return
    getValidAccessToken().then((t) => {
      if (!t) {
        setError('Not logged in. Run: eeko login')
        setStep('error')
        setTimeout(() => exit(), 2000)
        return
      }
      setToken(t)
      if (initial.template && initial.name) setStep('creating')
      else if (initial.template) setStep('entering-name')
      else setStep('selecting-template')
    })
  }, [step, exit])

  useEffect(() => {
    if (step !== 'creating' || !token) return
    const tmpl = template ?? initial.template
    if (!tmpl) {
      setError('No template selected')
      setStep('error')
      return
    }
    const name = projectName || slugify(tmpl)
    createAndScaffold(
      token,
      {
        name,
        template: tmpl,
        type: initial.type ?? TEMPLATE_COMPONENT_TYPE[tmpl],
        apiHost: initial.apiHost,
      },
      setStatus
    )
      .then((dir) => {
        setTargetDir(dir)
        setStep('done')
        setTimeout(() => exit(), 1500)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err))
        setStep('error')
        setTimeout(() => exit(), 3000)
      })
  }, [step, token, template, projectName, initial, exit])

  const handleTemplateSelect = (item: { value: string }) => {
    if (!isTemplateName(item.value)) return
    setTemplate(item.value)
    if (!projectName) setProjectName(item.value)
    setStep('entering-name')
  }

  const handleNameSubmit = (value: string) => {
    setProjectName(value || slugify(template ?? 'my-widget'))
    setStep('creating')
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Create Eeko Widget
        </Text>
      </Box>

      {step === 'checking-auth' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Checking authentication…</Text>
        </Box>
      )}

      {step === 'selecting-template' && (
        <Box flexDirection="column">
          <Text>Pick a starter template:</Text>
          <Box marginTop={1}>
            <SelectInput
              items={TEMPLATES.map((t) => ({ label: t, value: t }))}
              onSelect={handleTemplateSelect}
            />
          </Box>
        </Box>
      )}

      {step === 'entering-name' && (
        <Box flexDirection="column">
          <Text>
            Template: <Text color="green">{template}</Text>
          </Text>
          <Box marginTop={1}>
            <Text>Project name: </Text>
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
          <Text> {status || 'Creating project…'}</Text>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green">Created {targetDir}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Next steps:</Text>
            <Text dimColor> cd {projectName}</Text>
            <Text dimColor> eeko dev # local preview</Text>
            <Text dimColor> eeko publish # push to draft</Text>
            <Text dimColor> eeko promote # publish live</Text>
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

export const initCommand = new Command('init')
  .description('Create a new widget and scaffold it locally')
  .argument('[name]', 'Project / directory name')
  .option('-t, --template <name>', 'Starter template: alert | chat-overlay | goal-bar')
  .option('--type <componentType>', 'Component type for the new widget')
  .option('--api-host <url>', 'Override the nexus-api base URL')
  .action((name: string | undefined, opts: { template?: string; type?: string; apiHost?: string }) => {
    const template =
      opts.template && isTemplateName(opts.template) ? opts.template : undefined
    if (opts.template && !template) {
      console.error(`Unknown template "${opts.template}". Options: ${TEMPLATES.join(', ')}`)
      process.exit(1)
    }
    render(<InitUI initial={{ name, template, type: opts.type, apiHost: opts.apiHost }} />)
  })
