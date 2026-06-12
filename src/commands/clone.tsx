/**
 * eeko clone — clone one of your Eeko widgets into a local git repo.
 *
 * Resolves the component to its Artifacts remote, wires the credential helper,
 * clones, checks out the draft branch, and writes eeko.config.json.
 *
 * With `--account <idOrSlug>` the component id can be omitted: the CLI lists
 * the account's catalog widgets and lets you pick one.
 */

import { Command } from 'commander'
import React from 'react'
import { render, Box, Text } from 'ink'
import { useInputWhenInteractive } from '../hooks/use-input-when-interactive.js'
import SelectInput from 'ink-select-input'
import path from 'path'
import { existsSync } from 'fs'
import { getValidAccessToken } from '../auth/session.js'
import {
  getComponentGit,
  getAccounts,
  listAccountProjects,
  matchAccount,
  type AccountProject,
} from '../api/client.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { writeEekoConfig } from '../utils/config.js'
import { writeAgentFiles } from '../utils/agent-files.js'
import { cloneRepo, checkout } from '../utils/git.js'

type AccountWidgetProject = AccountProject & { widget: NonNullable<AccountProject['widget']> }

function WidgetPicker({
  accountName,
  projects,
  onSelect,
  onCancel,
}: {
  accountName: string
  projects: AccountWidgetProject[]
  onSelect: (widgetId: string) => void
  onCancel: () => void
}) {
  useInputWhenInteractive((_input, key) => {
    if (key.escape) onCancel()
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text>
        Pick a widget from <Text color="cyan">{accountName}</Text>:
      </Text>
      <Box marginTop={1}>
        <SelectInput
          items={projects.map((p) => ({
            label: `${p.widget.name ?? p.name}${p.widget.component_type ? ` (${p.widget.component_type})` : ''}`,
            value: p.widget.id,
          }))}
          onSelect={(item: { value: string }) => onSelect(item.value)}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Esc to cancel</Text>
      </Box>
    </Box>
  )
}

function pickAccountWidget(
  accountName: string,
  projects: AccountWidgetProject[]
): Promise<string | null> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <WidgetPicker
        accountName={accountName}
        projects={projects}
        onSelect={(id) => {
          unmount()
          resolve(id)
        }}
        onCancel={() => {
          unmount()
          resolve(null)
        }}
      />
    )
  })
}

export const cloneCommand = new Command('clone')
  .description('Clone one of your Eeko widgets into a local git repo')
  .argument('[componentId]', 'The widget/component id to clone (omit with --account to pick one)')
  .argument('[dir]', 'Target directory (defaults to the component id)')
  .option('--account <idOrSlug>', "Pick a widget from a merchant account's catalog")
  .option('--api-host <url>', 'Override the nexus-api base URL')
  .action(
    async (
      componentId: string | undefined,
      dir: string | undefined,
      opts: { account?: string; apiHost?: string }
    ) => {
      if (!componentId && !opts.account) {
        console.error(
          'Usage: eeko clone <componentId> [dir]  (or omit the id with --account <idOrSlug> to pick a widget)'
        )
        process.exit(1)
      }

      const token = await getValidAccessToken()
      if (!token) {
        console.error('Not logged in or session expired. Run: eeko login')
        process.exit(1)
      }
      const apiBase = opts.apiHost ?? AUTH_CONFIG.api.baseUrl

      // Resolved when the widget was picked from an account catalog — a
      // fallback for when the git endpoint doesn't report ownership.
      let pickedAccountId: string | undefined

      if (!componentId) {
        const accountIdOrSlug = opts.account
        if (!accountIdOrSlug) process.exit(1) // unreachable — guarded above

        // The Ink picker needs raw-mode stdin; fail cleanly instead of
        // letting Ink throw a raw-mode stack trace in non-TTY contexts.
        if (!process.stdin.isTTY) {
          console.error(
            'The interactive widget picker requires a TTY; pass a componentId: eeko clone <componentId> [dir]'
          )
          process.exit(1)
        }

        let accounts
        try {
          accounts = (await getAccounts(token, apiBase)).accounts
        } catch (err) {
          console.error(
            `Could not list your merchant accounts: ${err instanceof Error ? err.message : String(err)}`
          )
          process.exit(1)
        }

        const account = matchAccount(accounts, accountIdOrSlug)
        if (!account) {
          console.error(
            `No merchant account matching "${accountIdOrSlug}" (check the id/slug and that you're a member)`
          )
          process.exit(1)
        }
        pickedAccountId = account.id

        let projects
        try {
          projects = (await listAccountProjects(token, account.id, apiBase)).projects
        } catch (err) {
          console.error(
            `Could not list projects for ${account.name}: ${err instanceof Error ? err.message : String(err)}`
          )
          process.exit(1)
        }

        const withWidgets = projects.filter(
          (p): p is AccountWidgetProject => Boolean(p.widget)
        )
        if (withWidgets.length === 0) {
          console.error(`${account.name} has no widgets yet.`)
          process.exit(1)
        }

        const picked = await pickAccountWidget(account.name, withWidgets)
        if (!picked) {
          process.exit(0)
        }
        componentId = picked
      }

      let info
      try {
        info = await getComponentGit(token, componentId, apiBase)
      } catch (err) {
        console.error(
          `Could not resolve widget ${componentId}: ${err instanceof Error ? err.message : String(err)}`
        )
        process.exit(1)
      }

      const targetDir = dir ?? componentId
      if (existsSync(targetDir)) {
        console.error(`Directory ${targetDir} already exists`)
        process.exit(1)
      }

      console.log(`Cloning ${info.name} (${info.repoName})…`)
      const result = await cloneRepo(info.remote, targetDir, info.host)
      if (result.code !== 0) {
        console.error('git clone failed:\n' + result.stderr)
        process.exit(1)
      }

      // Check out the draft working branch and link the directory.
      await checkout(targetDir, info.refs.draft)
      // Trust an explicit owner from the git endpoint over the picker
      // fallback: a user-owned widget must not inherit pickedAccountId.
      const accountId = info.owner
        ? info.owner.kind === 'account'
          ? info.owner.id
          : undefined
        : pickedAccountId
      writeEekoConfig(path.resolve(targetDir), {
        componentId: info.componentId,
        apiHost: opts.apiHost,
        accountId,
      })

      // Agent-facing files: skip whatever the repo already carries (an older
      // AGENTS.md stays untouched — surface the refresh path instead).
      const agentFiles = await writeAgentFiles(path.resolve(targetDir))
      if (agentFiles.skipped.includes('AGENTS.md')) {
        console.log('  AGENTS.md already in the repo — run `eeko agents-md --force` to refresh it')
      }

      console.log(`✓ Cloned into ${targetDir} (on ${info.refs.draft})`)
      console.log(`    cd ${targetDir}`)
      console.log(`    eeko dev       # local preview`)
      console.log(`    eeko publish   # git push to draft`)
    }
  )
