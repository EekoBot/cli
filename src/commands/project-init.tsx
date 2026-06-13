/**
 * eeko project init — create a new project (the authoring container) and
 * scaffold a local workspace for it.
 *
 * A project owns two optional, first-class sides — a widget and an automation —
 * each its own git artifact. This command creates the project (personal, or
 * account-owned with `--account`) and a parent folder holding a project-root
 * `eeko.config.json`; you then add sides into it with `eeko widget init` and
 * `eeko automation init`. The owner is set ONCE here and inherited by both sides.
 */

import { Command, Option } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import { useInputWhenInteractive } from '../hooks/use-input-when-interactive.js'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import path from 'path'
import { existsSync, mkdirSync } from 'fs'
import { getValidAccessToken } from '../auth/session.js'
import { createProject, getAccounts, matchAccount, type EekoAccount } from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { writeEekoConfig } from '../utils/config.js'
import { writeAgentFiles } from '../utils/agent-files.js'
import { registerProjectMediaCommands } from './project-media.js'

/** Reserved `--account` value that forces the personal path, even over a slug literally "personal". */
const PERSONAL_SENTINEL = 'personal'

function sanitizeProjectName(name: string): string {
  const sanitized = name
    .replace(/[\/\\]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/^\.+/, '')
    .trim()
  if (!sanitized) throw new Error('Project name cannot be empty')
  if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_\-. ]*$/.test(sanitized)) {
    throw new Error('Project name contains invalid characters')
  }
  return sanitized
}

interface ProjectInitOptions {
  name?: string
  account?: string
  apiHost?: string
}

async function createAndScaffold(
  token: string,
  opts: { name: string; accountId?: string; apiHost?: string },
  setStatus: (s: string) => void
): Promise<string> {
  const safeName = sanitizeProjectName(opts.name)
  const targetDir = path.join(process.cwd(), safeName)
  if (existsSync(targetDir)) {
    throw new Error(`Directory ${safeName} already exists`)
  }
  const apiBase = opts.apiHost ?? AUTH_CONFIG.api.baseUrl

  setStatus(opts.accountId ? 'Creating project on the merchant account…' : 'Creating project…')
  const created = await createProject(token, { name: safeName, accountId: opts.accountId }, apiBase)

  // The parent folder is a plain workspace (not a git repo); the sides cloned
  // into it are the git artifacts.
  mkdirSync(targetDir, { recursive: true })
  writeEekoConfig(targetDir, {
    projectId: created.project.id,
    accountId: opts.accountId,
    apiHost: opts.apiHost,
    name: safeName,
  })
  await writeAgentFiles(targetDir)

  setStatus('Done!')
  return targetDir
}

type Step =
  | 'checking-auth'
  | 'resolving-account'
  | 'selecting-account'
  | 'entering-name'
  | 'creating'
  | 'done'
  | 'error'

function ProjectInitUI({ initial }: { initial: ProjectInitOptions }) {
  const { exit } = useApp()
  const [step, setStep] = useState<Step>('checking-auth')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [projectName, setProjectName] = useState(initial.name ?? '')
  const [status, setStatus] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [accounts, setAccounts] = useState<EekoAccount[]>([])
  const [accountId, setAccountId] = useState<string | undefined>(undefined)
  const [accountsWarning, setAccountsWarning] = useState<string | null>(null)

  useInputWhenInteractive((_input, key) => {
    if (key.escape) exit()
  })

  const failAndExit = (message: string, delayMs = 3000) => {
    setError(message)
    setStep('error')
    process.exitCode = 1
    setTimeout(() => exit(), delayMs)
  }

  const advancePastAccount = () => {
    if (initial.name) setStep('creating')
    else setStep('entering-name')
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
  }, [step])

  useEffect(() => {
    if (step !== 'resolving-account' || !token) return
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
        setAccountsWarning('Could not check merchant accounts; creating a personal project.')
        advancePastAccount()
      })
  }, [step, token, initial])

  useEffect(() => {
    if (step !== 'creating' || !token) return
    const name = projectName || initial.name
    if (!name) {
      failAndExit('No project name')
      return
    }
    createAndScaffold(token, { name, accountId, apiHost: initial.apiHost }, setStatus)
      .then((dir) => {
        setTargetDir(dir)
        setStep('done')
        setTimeout(() => exit(), 1500)
      })
      .catch((err) => failAndExit(err instanceof Error ? err.message : String(err)))
  }, [step, token, projectName, accountId, initial])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Create Eeko Project
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
          <Text>Create this project under:</Text>
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

      {step === 'entering-name' && (
        <Box flexDirection="column">
          <Box>
            <Text>Project name: </Text>
            <TextInput
              value={projectName}
              onChange={setProjectName}
              onSubmit={(value) => {
                setProjectName(value)
                if (value.trim()) setStep('creating')
              }}
              placeholder="my-project"
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
            <Text dimColor> eeko widget init # add a widget side</Text>
            <Text dimColor> eeko automation init # add an automation side</Text>
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

const projectInitCommand = new Command('init')
  .description('Create a new project (the container for a widget and/or automation)')
  .argument('[name]', 'Project / directory name')
  .option(
    '--account <idOrSlug>',
    "Create the project under a merchant account you belong to. Pass 'personal' to force a personal project even if a merchant slug is literally 'personal'"
  )
  .addOption(new Option('--api-host <url>', 'Override the API base URL (internal/staging use)').hideHelp())
  .action((name: string | undefined, opts: { account?: string; apiHost?: string }) => {
    render(<ProjectInitUI initial={{ name, account: opts.account, apiHost: opts.apiHost }} />)
  })

export const projectCommand = new Command('project')
  .description('Author Eeko projects (a widget and/or automation, git-native)')
  .addCommand(projectInitCommand)

// `eeko project thumbnail` / `eeko project gallery` — marketplace images.
registerProjectMediaCommands(projectCommand)
