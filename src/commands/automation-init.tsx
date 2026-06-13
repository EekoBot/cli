/**
 * eeko automation init — create a new automation for a project and scaffold it
 * locally, alongside the project's widget.
 *
 * Run from a project's widget directory (or with `--project <id>`): the CLI
 * reads the local eeko.config.json to learn the projectId, the widget's
 * componentId, and any owning accountId, then:
 *   1. creates an `au-{id}` automation on that project (provisions its repo),
 *   2. clones it into a sibling `../automation/` dir (or `./<name>-automation/`),
 *   3. checks out the draft ref + wires the credential helper (same path as
 *      `eeko clone`),
 *   4. scaffolds a minimal shell `automation.json` wiring the sibling widget if
 *      the repo seed is empty,
 *   5. writes the automation dir's eeko.config.json.
 *
 * An automation is authored exactly like a widget: edit automation.json →
 * `eeko build` (validate) → `eeko publish` (push to draft) → `eeko promote`.
 */

import { Command, Option } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import { useInputWhenInteractive } from '../hooks/use-input-when-interactive.js'
import Spinner from 'ink-spinner'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getValidAccessToken } from '../auth/session.js'
import { createAutomation } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { loadEekoConfig, writeEekoConfig } from '../utils/config.js'
import { writeAgentFiles } from '../utils/agent-files.js'
import { cloneRepo, checkout, stageAndCommit } from '../utils/git.js'

const AUTOMATION_FILENAME = 'automation.json'

/**
 * The project context resolved from a widget directory's eeko.config.json.
 * `projectId` is required to create an automation; the others wire the shell.
 */
interface ProjectContext {
  projectId: string
  componentId?: string
  accountId?: string
  apiHost?: string
  /** Directory the widget config was read from. */
  widgetDir: string
}

/**
 * Resolve the project context from the current (widget) directory's config, or
 * from an explicit `--project` override.
 */
function resolveProjectContext(opts: {
  project?: string
  apiHost?: string
}): { ctx?: ProjectContext; error?: string } {
  const widgetDir = process.cwd()
  const config = loadEekoConfig(widgetDir)

  const projectId = opts.project ?? config?.projectId
  if (!projectId) {
    return {
      error:
        'No projectId found. Run `eeko automation init` from a widget directory whose eeko.config.json carries a projectId, or pass --project <id>.',
    }
  }

  return {
    ctx: {
      projectId,
      componentId: config?.componentId,
      accountId: config?.accountId,
      apiHost: opts.apiHost ?? config?.apiHost,
      widgetDir,
    },
  }
}

/**
 * Where to clone the automation. In the recognizable layout (the widget lives
 * in a project dir), clone into a sibling `../automation/`. Otherwise fall back
 * to `./<name>-automation/` under the cwd and tell the user.
 */
function resolveTargetDir(
  ctx: ProjectContext,
  name: string
): { dir: string; sibling: boolean } {
  const parent = path.dirname(ctx.widgetDir)
  const sibling = path.join(parent, 'automation')
  if (!existsSync(sibling)) {
    return { dir: sibling, sibling: true }
  }
  // Sibling taken — fall back to a named dir under the cwd.
  const slug = slugify(name)
  return { dir: path.join(ctx.widgetDir, `${slug}-automation`), sibling: false }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'automation'
  )
}

/** True when the repo seed has no usable automation.json (empty/whitespace). */
function seedIsEmpty(dir: string): boolean {
  const file = path.join(dir, AUTOMATION_FILENAME)
  if (!existsSync(file)) return true
  try {
    const raw = readFileSync(file, 'utf-8').trim()
    if (!raw) return true
    const parsed = JSON.parse(raw)
    // An empty object, or a config with no triggers AND no actions (the
    // server's blank draft seed `{triggers:[],actions:[]}`), counts as empty
    // so we replace it with the wired shell scaffold.
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { triggers?: unknown; actions?: unknown }
      if (Object.keys(obj).length === 0) return true
      const noTriggers = !Array.isArray(obj.triggers) || obj.triggers.length === 0
      const noActions = !Array.isArray(obj.actions) || obj.actions.length === 0
      return noTriggers && noActions
    }
    return false
  } catch {
    // Unparseable seed — treat as empty and overwrite with the shell.
    return true
  }
}

/**
 * A minimal shell automation wiring the sibling widget. The trigger defaults to
 * `twitch_follow` (the agent picks the real one); `trigger_component` is
 * pre-set to the widget's componentId (shell validation exempts it).
 */
function shellAutomation(componentId: string | undefined): string {
  const automation = {
    triggers: [{ type: 'twitch_follow', channelId: '' }],
    actions: [
      {
        type: 'trigger_component',
        componentId: componentId ?? '',
      },
    ],
  }
  return JSON.stringify(automation, null, 2) + '\n'
}

interface InitOptions {
  name?: string
  project?: string
  apiHost?: string
}

async function createAndClone(
  token: string,
  initial: InitOptions,
  setStatus: (s: string) => void
): Promise<{ dir: string; sibling: boolean; automationId: string }> {
  const resolved = resolveProjectContext(initial)
  if (resolved.error || !resolved.ctx) {
    throw new Error(resolved.error ?? 'Could not resolve the project')
  }
  const ctx = resolved.ctx
  const apiBase = ctx.apiHost ?? AUTH_CONFIG.api.baseUrl

  const name = initial.name ?? defaultAutomationName(ctx)

  setStatus('Creating automation on the project…')
  const created = await createAutomation(
    token,
    { name, projectId: ctx.projectId, accountId: ctx.accountId },
    apiBase
  )

  const { dir, sibling } = resolveTargetDir(ctx, created.name ?? name)
  if (existsSync(dir)) {
    throw new Error(`Directory ${dir} already exists`)
  }

  setStatus('Cloning…')
  const clone = await cloneRepo(created.remote, dir, created.host)
  if (clone.code !== 0) {
    throw new Error('git clone failed: ' + clone.stderr.trim())
  }
  await checkout(dir, created.refs.draft)

  // Scaffold the shell only when the repo seed is empty.
  if (seedIsEmpty(dir)) {
    setStatus('Scaffolding automation.json…')
    await writeFile(path.join(dir, AUTOMATION_FILENAME), shellAutomation(ctx.componentId))
  }

  writeEekoConfig(dir, {
    automationId: created.automationId,
    projectId: ctx.projectId,
    accountId: ctx.accountId,
    apiHost: initial.apiHost,
  })
  await writeAgentFiles(dir)
  await stageAndCommit(dir, 'init: scaffold automation')

  setStatus('Done!')
  return { dir, sibling, automationId: created.automationId }
}

/** Best-effort default name from the widget config / dir. */
function defaultAutomationName(ctx: ProjectContext): string {
  const base = path.basename(ctx.widgetDir)
  return `${base} automation`
}

type Step = 'checking-auth' | 'creating' | 'done' | 'error'

function AutomationInitUI({ initial }: { initial: InitOptions }) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('checking-auth')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<{
    dir: string
    sibling: boolean
    automationId: string
  } | null>(null)

  useInputWhenInteractive((_input, key) => {
    if (key.escape) exit()
  })

  const failAndExit = (message: string, delayMs = 3000) => {
    setError(message)
    setStep('error')
    process.exitCode = 1
    setTimeout(() => exit(), delayMs)
  }

  useEffect(() => {
    if (step !== 'checking-auth') return
    getValidAccessToken().then((t) => {
      if (!t) {
        failAndExit('Not logged in. Run: eeko login', 2000)
        return
      }
      setStep('creating')
      createAndClone(t, initial, setStatus)
        .then((r) => {
          setResult(r)
          setStep('done')
          setTimeout(() => exit(), 1500)
        })
        .catch((err) => failAndExit(err instanceof Error ? err.message : String(err)))
    })
  }, [step])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Create Eeko Automation
        </Text>
      </Box>

      {(step === 'checking-auth' || step === 'creating') && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {status || 'Checking authentication…'}</Text>
        </Box>
      )}

      {step === 'done' && result && (
        <Box flexDirection="column">
          <Text color="green">Created automation {result.automationId}</Text>
          <Text dimColor>{result.dir}</Text>
          {!result.sibling && (
            <Box marginTop={1}>
              <Text dimColor>
                A sibling ../automation/ already existed, so it was cloned next to
                your widget instead.
              </Text>
            </Box>
          )}
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Next steps:</Text>
            <Text dimColor> cd {result.dir}</Text>
            <Text dimColor> # edit {AUTOMATION_FILENAME}</Text>
            <Text dimColor> eeko build # validate</Text>
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

const automationInitCommand = new Command('init')
  .description("Create a new automation for this widget's project and scaffold it locally")
  .option('--name <name>', 'Automation name (defaults to the project/widget name + " automation")')
  .option('--project <id>', 'Project id to attach the automation to (defaults to the local config)')
  .addOption(
    new Option('--api-host <url>', 'Override the API base URL (internal/staging use)').hideHelp()
  )
  .action((opts: { name?: string; project?: string; apiHost?: string }) => {
    render(
      <AutomationInitUI
        initial={{ name: opts.name, project: opts.project, apiHost: opts.apiHost }}
      />
    )
  })

export const automationCommand = new Command('automation')
  .description('Author Eeko automations (git-native, like widgets)')
  .addCommand(automationInitCommand)
