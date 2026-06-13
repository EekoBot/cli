/**
 * eeko init — create a new widget on your account and scaffold it locally.
 *
 * Creates a user-component (provisions its `uc-{id}` Artifacts repo), clones
 * it, scaffolds the chosen starter template over the seed, commits, and writes
 * eeko.config.json — leaving a ready git repo you can `eeko dev` and
 * `eeko publish`.
 */

import { Command, Option } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import { useInputWhenInteractive } from '../hooks/use-input-when-interactive.js'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import path from 'path'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getValidAccessToken } from '../auth/session.js'
import {
  createComponent,
  getComponentGit,
  getAccounts,
  matchAccount,
  type EekoAccount,
} from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { writeEekoConfig } from '../utils/config.js'
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

/**
 * Reserved `--account` value that forces the personal path and skips the
 * account picker. Handled before matchAccount is ever consulted, so it wins
 * even over a merchant account whose slug is literally "personal".
 */
const PERSONAL_SENTINEL = 'personal'

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
  account?: string
}

async function createAndScaffold(
  token: string,
  opts: {
    name: string
    template: TemplateName
    type: string
    apiHost?: string
    accountId?: string
  },
  setStatus: (s: string) => void
): Promise<string> {
  const safeName = sanitizeProjectName(opts.name)
  const targetDir = path.join(process.cwd(), safeName)
  if (existsSync(targetDir)) {
    throw new Error(`Directory ${safeName} already exists`)
  }
  const apiBase = opts.apiHost ?? AUTH_CONFIG.api.baseUrl

  setStatus(
    opts.accountId ? 'Creating widget on the merchant account…' : 'Creating widget on your account…'
  )
  const created = await createComponent(
    token,
    {
      name: safeName,
      componentType: opts.type,
      ...(opts.accountId ? { ownerKind: 'account' as const, ownerId: opts.accountId } : {}),
    },
    apiBase
  )
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
  // Persist the catalog projectId (account widgets auto-attach to a project)
  // so `eeko automation init` can wire the automation side to the same project.
  writeEekoConfig(targetDir, {
    componentId,
    projectId: created.projectId,
    apiHost: opts.apiHost,
    accountId: opts.accountId,
  })
  await writeFile(path.join(targetDir, 'package.json'), packageJson(safeName))
  await writeAgentFiles(targetDir)
  await stageAndCommit(targetDir, `init: scaffold ${opts.template}`)

  setStatus('Done!')
  return targetDir
}

type Step =
  | 'checking-auth'
  | 'resolving-account'
  | 'selecting-account'
  | 'selecting-template'
  | 'entering-name'
  | 'creating'
  | 'done'
  | 'error'

function InitUI({ initial }: { initial: InitOptions }) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('checking-auth')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [template, setTemplate] = useState<TemplateName | null>(initial.template ?? null)
  const [projectName, setProjectName] = useState(initial.name ?? '')
  const [status, setStatus] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [accounts, setAccounts] = useState<EekoAccount[]>([])
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [accountsWarning, setAccountsWarning] = useState<string | null>(null)

  useInputWhenInteractive((_input, key) => {
    if (key.escape) exit()
  })

  /**
   * Show the error state and exit non-zero. Ink's `exit()` without an Error
   * resolves the process with code 0, so set exitCode explicitly.
   */
  const failAndExit = (message: string, delayMs = 3000) => {
    setError(message)
    setStep('error')
    process.exitCode = 1
    setTimeout(() => exit(), delayMs)
  }

  /** Past the account question — the pre-existing template/name flow. */
  const advancePastAccount = () => {
    if (initial.template && initial.name) setStep('creating')
    else if (initial.template) setStep('entering-name')
    else setStep('selecting-template')
  }

  useEffect(() => {
    if (step !== 'checking-auth') return
    getValidAccessToken().then((t) => {
      if (!t) {
        failAndExit('Not logged in. Run: eeko login', 2000)
        return
      }
      setToken(t)
      setStep('resolving-account')
    })
  }, [step, exit])

  useEffect(() => {
    if (step !== 'resolving-account' || !token) return
    // `--account personal` is a reserved sentinel: force the personal path
    // and skip the account picker (and the accounts fetch) entirely. Handled
    // before matchAccount so it wins even over a slug literally "personal".
    if (initial.account && initial.account.toLowerCase() === PERSONAL_SENTINEL) {
      advancePastAccount()
      return
    }
    const apiBase = initial.apiHost ?? AUTH_CONFIG.api.baseUrl
    getAccounts(token, apiBase)
      .then(({ accounts: list }) => {
        if (initial.account) {
          const match = matchAccount(list, initial.account)
          if (!match) {
            failAndExit(
              `No merchant account matching "${initial.account}" (check the id/slug and that you're a member)`
            )
            return
          }
          setAccountId(match.id)
          advancePastAccount()
        } else if (list.length >= 1) {
          setAccounts(list)
          setStep('selecting-account')
        } else {
          advancePastAccount()
        }
      })
      .catch((err) => {
        if (initial.account) {
          failAndExit(
            `Could not resolve merchant accounts: ${err instanceof Error ? err.message : String(err)}`
          )
          return
        }
        setAccountsWarning('Could not check merchant accounts; creating a personal widget.')
        advancePastAccount()
      })
  }, [step, token, initial, exit])

  useEffect(() => {
    if (step !== 'creating' || !token) return
    const tmpl = template ?? initial.template
    if (!tmpl) {
      failAndExit('No template selected')
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
        accountId,
      },
      setStatus
    )
      .then((dir) => {
        setTargetDir(dir)
        setStep('done')
        setTimeout(() => exit(), 1500)
      })
      .catch((err) => {
        failAndExit(err instanceof Error ? err.message : String(err))
      })
  }, [step, token, template, projectName, accountId, initial, exit])

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

      {step === 'resolving-account' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Checking merchant accounts…</Text>
        </Box>
      )}

      {accountsWarning && (
        <Box>
          <Text dimColor>{accountsWarning}</Text>
        </Box>
      )}

      {step === 'selecting-account' && (
        <Box flexDirection="column">
          <Text>Create this widget under:</Text>
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: 'Personal (your user)', value: '' },
                ...accounts.map((a) => ({ label: `${a.name} (${a.slug})`, value: a.id })),
              ]}
              onSelect={(item: { value: string }) => {
                if (item.value) setAccountId(item.value)
                advancePastAccount()
              }}
            />
          </Box>
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
          {accountId && (
            <Box marginTop={1}>
              <Text dimColor>
                Marketplace releases are cut in the merchant app — the CLI stops at draft/main.
              </Text>
            </Box>
          )}
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
  .option('-t, --template <name>', `Starter template: ${TEMPLATES.join(' | ')}`)
  .option('--type <componentType>', 'Component type for the new widget')
  .option(
    '--account <idOrSlug>',
    "Create the widget under a merchant account you belong to. Pass 'personal' to skip the account picker and create a personal widget — 'personal' is reserved and always means your user, even if a merchant account's slug is literally 'personal'"
  )
  .addOption(new Option('--api-host <url>', 'Override the API base URL (internal/staging use)').hideHelp())
  .action(
    (
      name: string | undefined,
      opts: { template?: string; type?: string; account?: string; apiHost?: string }
    ) => {
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
        <InitUI
          initial={{
            name,
            template,
            type: opts.type,
            apiHost: opts.apiHost,
            account: opts.account,
          }}
        />
      )
    }
  )
