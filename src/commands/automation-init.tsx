/**
 * eeko automation init — add the automation side to a project and scaffold it
 * locally.
 *
 * Run from a project root (created by `eeko project init`), or with
 * `--project <id>`: the CLI resolves the projectId, creates an `au-{id}`
 * automation on that project (inheriting the project's owner — personal or
 * account), clones it into `./automation/`, and scaffolds a minimal shell
 * `automation.json`. If the project has a sibling `widget/` side, the shell is
 * wired to fire it; otherwise it scaffolds a utility automation (no widget).
 *
 * Also supports the legacy flat layout — run from a widget dir and it clones the
 * sibling `../automation/`, wiring that widget.
 *
 * An automation is authored like a widget: edit automation.json → `eeko build`
 * (validate) → `eeko publish` (save = live; no separate promote).
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
import { loadEekoConfig, loadProjectConfig, writeEekoConfig } from '../utils/config.js'
import { writeAgentFiles } from '../utils/agent-files.js'
import { cloneRepo, checkout, stageAndCommit } from '../utils/git.js'

const AUTOMATION_FILENAME = 'automation.json'
const AUTOMATION_DIRNAME = 'automation'
const WIDGET_DIRNAME = 'widget'

/**
 * The project context an automation binds to. `projectId` is required; the
 * sibling widget's `componentId` (when the project has a widget side) wires the
 * shell's `trigger_component` action. `cloneDir` is where the `au-{id}` lands.
 */
interface ProjectContext {
  projectId: string
  componentId?: string
  accountId?: string
  apiHost?: string
  /** Directory to clone the automation into. */
  cloneDir: string
}

/** The componentId of a sibling `widget/` side under a project root, if present. */
function siblingWidgetComponentId(projectRoot: string): string | undefined {
  const widgetConfig = loadEekoConfig(path.join(projectRoot, WIDGET_DIRNAME))
  return widgetConfig?.componentId
}

/**
 * Resolve the project to attach the automation to, across three layouts:
 *   - `--project <id>`            → clone `./automation/` under cwd.
 *   - PROJECT ROOT (project init) → cwd has projectId, no artifact id; clone
 *     `./automation/`, wire any sibling `./widget/`.
 *   - LEGACY FLAT widget dir      → cwd config has componentId; clone the
 *     sibling `../automation/` and wire this widget (the pre-triad layout).
 */
function resolveProjectContext(opts: {
  project?: string
  apiHost?: string
}): { ctx?: ProjectContext; error?: string } {
  const cwd = process.cwd()

  if (opts.project) {
    return {
      ctx: {
        projectId: opts.project,
        componentId: siblingWidgetComponentId(cwd),
        apiHost: opts.apiHost,
        cloneDir: path.join(cwd, AUTOMATION_DIRNAME),
      },
    }
  }

  // Legacy flat layout: cwd IS a widget dir (its config carries componentId).
  const sideConfig = loadEekoConfig(cwd)
  if (sideConfig?.componentId && sideConfig.projectId) {
    return {
      ctx: {
        projectId: sideConfig.projectId,
        componentId: sideConfig.componentId,
        accountId: sideConfig.accountId,
        apiHost: opts.apiHost ?? sideConfig.apiHost,
        cloneDir: path.join(path.dirname(cwd), AUTOMATION_DIRNAME),
      },
    }
  }

  // Project-root layout (the triad): projectId, no artifact id.
  const projConfig = loadProjectConfig(cwd)
  if (projConfig?.projectId) {
    return {
      ctx: {
        projectId: projConfig.projectId,
        componentId: siblingWidgetComponentId(cwd),
        accountId: projConfig.accountId,
        apiHost: opts.apiHost ?? projConfig.apiHost,
        cloneDir: path.join(cwd, AUTOMATION_DIRNAME),
      },
    }
  }

  return {
    error:
      'No project found. Run `eeko automation init` from a project root (after `eeko project init`) or a widget dir, or pass --project <id>.',
  }
}

/**
 * Where to clone the automation: the context's `cloneDir`, falling back to a
 * `<slug>-automation/` sibling when that dir is already taken.
 */
function resolveTargetDir(
  ctx: ProjectContext,
  name: string
): { dir: string; sibling: boolean } {
  if (!existsSync(ctx.cloneDir)) {
    return { dir: ctx.cloneDir, sibling: true }
  }
  const slug = slugify(name)
  return { dir: path.join(path.dirname(ctx.cloneDir), `${slug}-automation`), sibling: false }
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
 * A minimal shell automation. Both forms default the trigger to `twitch_follow`
 * (the agent picks the real one via `describe_trigger`) with an empty channelId
 * (bound to the installer at install time).
 *
 *   - With a sibling widget → a `trigger_component` action pre-set to its
 *     componentId (shell validation exempts it), so the automation fires the
 *     widget.
 *   - Without a widget (a utility/automation-only project) → a `send_chat_message`
 *     placeholder action, since the shell schema requires at least one action.
 *     The agent replaces it with the real action (moderation, variable, etc.).
 */
function shellAutomation(componentId: string | undefined): string {
  const automation = componentId
    ? {
        triggers: [{ type: 'twitch_follow', channelId: '' }],
        actions: [{ type: 'trigger_component', componentId }],
      }
    : {
        triggers: [{ type: 'twitch_follow', channelId: '' }],
        actions: [{ type: 'send_chat_message', message: 'Thanks for the follow!' }],
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

/** Best-effort default name from the current project/widget directory. */
function defaultAutomationName(_ctx: ProjectContext): string {
  const base = path.basename(process.cwd())
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
  .description("Add the automation side to the current directory's project")
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
