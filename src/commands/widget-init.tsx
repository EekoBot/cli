/**
 * eeko widget init — add the widget side to the project in the current
 * directory.
 *
 * Run from a project root (created by `eeko project init`): the CLI reads the
 * project-root eeko.config.json for the projectId, creates a widget attached to
 * that project (inheriting the project's owner — personal or account), clones
 * its `uc-{id}` repo into `./widget/`, scaffolds the chosen template, and writes
 * the widget dir's eeko.config.json. Author it like any widget: `eeko dev` /
 * `eeko test` → `eeko publish` → `eeko promote`.
 *
 * For a quick standalone widget without a project, use `eeko init`.
 */

import { Command, Option } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import { useInputWhenInteractive } from '../hooks/use-input-when-interactive.js'
import SelectInput from 'ink-select-input'
import Spinner from 'ink-spinner'
import path from 'path'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getValidAccessToken } from '../auth/session.js'
import { createComponent, getComponentGit } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { findProjectContext, writeEekoConfig, type ProjectContext } from '../utils/config.js'
import { writeAgentFiles } from '../utils/agent-files.js'
import { cloneRepo, checkout, stageAndCommit } from '../utils/git.js'
import {
  TEMPLATES,
  TEMPLATE_COMPONENT_TYPE,
  LEGACY_TEMPLATE_ALIASES,
  scaffoldTemplate,
  isTemplateName,
  type TemplateName,
} from '../utils/templates.js'

const WIDGET_DIRNAME = 'widget'

function packageJson(name: string): string {
  return `${JSON.stringify(
    { name, version: '0.1.0', private: true, scripts: { dev: 'eeko dev', publish: 'eeko publish' } },
    null,
    2
  )}\n`
}

interface WidgetInitOptions {
  template?: TemplateName
  type?: string
  project?: string
  apiHost?: string
}

function resolveProject(opts: WidgetInitOptions): { ctx?: ProjectContext; error?: string } {
  if (opts.project) {
    return { ctx: { projectId: opts.project, apiHost: opts.apiHost } }
  }
  const ctx = findProjectContext(process.cwd())
  if (!ctx) {
    return {
      error:
        'No project found. Run `eeko project init` here first (or pass --project <id>), or use `eeko init` for a standalone widget.',
    }
  }
  return { ctx: { ...ctx, apiHost: opts.apiHost ?? ctx.apiHost } }
}

async function createAndScaffold(
  token: string,
  ctx: ProjectContext,
  template: TemplateName,
  componentType: string,
  setStatus: (s: string) => void
): Promise<string> {
  const targetDir = path.join(process.cwd(), WIDGET_DIRNAME)
  if (existsSync(targetDir)) {
    throw new Error(`Directory ${WIDGET_DIRNAME}/ already exists — this project already has a widget side.`)
  }
  const apiBase = ctx.apiHost ?? AUTH_CONFIG.api.baseUrl
  const name = path.basename(process.cwd())

  setStatus('Creating the widget side…')
  const created = await createComponent(
    token,
    { name, componentType, projectId: ctx.projectId },
    apiBase
  )

  setStatus('Resolving git remote…')
  const info = await getComponentGit(token, created.componentId, apiBase)

  setStatus('Cloning…')
  const clone = await cloneRepo(info.remote, targetDir, info.host)
  if (clone.code !== 0) {
    throw new Error('git clone failed: ' + clone.stderr.trim())
  }
  await checkout(targetDir, info.refs.draft)

  setStatus(`Scaffolding the ${template} template…`)
  await scaffoldTemplate(template, targetDir, name)
  writeEekoConfig(targetDir, {
    componentId: created.componentId,
    projectId: ctx.projectId,
    apiHost: ctx.apiHost,
    accountId: ctx.accountId,
  })
  await writeFile(path.join(targetDir, 'package.json'), packageJson(name))
  await writeAgentFiles(targetDir)
  await stageAndCommit(targetDir, `init: scaffold ${template}`)

  setStatus('Done!')
  return targetDir
}

type Step = 'checking-auth' | 'selecting-template' | 'creating' | 'done' | 'error'

function WidgetInitUI({ initial }: { initial: WidgetInitOptions }) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('checking-auth')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [template, setTemplate] = useState<TemplateName | null>(initial.template ?? null)
  const [status, setStatus] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [ctx, setCtx] = useState<ProjectContext | null>(null)

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
      const resolved = resolveProject(initial)
      if (resolved.error || !resolved.ctx) {
        failAndExit(resolved.error ?? 'Could not resolve the project')
        return
      }
      setToken(t)
      setCtx(resolved.ctx)
      setStep(template ? 'creating' : 'selecting-template')
    })
  }, [step])

  useEffect(() => {
    if (step !== 'creating' || !token || !ctx) return
    const tmpl = template ?? initial.template
    if (!tmpl) {
      failAndExit('No template selected')
      return
    }
    createAndScaffold(token, ctx, tmpl, initial.type ?? TEMPLATE_COMPONENT_TYPE[tmpl], setStatus)
      .then((dir) => {
        setTargetDir(dir)
        setStep('done')
        setTimeout(() => exit(), 1500)
      })
      .catch((err) => failAndExit(err instanceof Error ? err.message : String(err)))
  }, [step, token, ctx, template, initial])

  const handleTemplateSelect = (item: { value: string }) => {
    if (!isTemplateName(item.value)) return
    setTemplate(item.value)
    setStep('creating')
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Add Widget Side
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

      {step === 'creating' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {status || 'Creating widget…'}</Text>
        </Box>
      )}

      {step === 'done' && (
        <Box flexDirection="column">
          <Text color="green">Created {targetDir}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Next steps:</Text>
            <Text dimColor> cd {WIDGET_DIRNAME}</Text>
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

const widgetInitCommand = new Command('init')
  .description("Add the widget side to the current directory's project")
  .option('-t, --template <name>', `Starter template: ${TEMPLATES.join(' | ')}`)
  .option('--type <componentType>', 'Component type for the new widget')
  .option('--project <id>', 'Project id to attach the widget to (defaults to the local config)')
  .addOption(new Option('--api-host <url>', 'Override the API base URL (internal/staging use)').hideHelp())
  .action((opts: { template?: string; type?: string; project?: string; apiHost?: string }) => {
    const requested =
      opts.template && opts.template in LEGACY_TEMPLATE_ALIASES
        ? LEGACY_TEMPLATE_ALIASES[opts.template]
        : opts.template
    const template = requested && isTemplateName(requested) ? requested : undefined
    if (opts.template && !template) {
      console.error(`Unknown template "${opts.template}". Options: ${TEMPLATES.join(', ')}`)
      process.exit(1)
    }
    render(
      <WidgetInitUI
        initial={{ template, type: opts.type, project: opts.project, apiHost: opts.apiHost }}
      />
    )
  })

export const widgetCommand = new Command('widget')
  .description('Author Eeko widgets (git-native)')
  .addCommand(widgetInitCommand)
