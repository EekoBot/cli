/**
 * eeko publish — push local widget changes to your draft ref.
 *
 * If the directory is a git repo wired to your Eeko remote, this stages +
 * commits any changes and `git push`es them to draft (the credential helper
 * brokers the token). Otherwise it falls back to the server-mediated
 * commit-draft endpoint. Either way the push triggers a preview refresh; run
 * `eeko promote` to publish live.
 */

import { Command } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import Spinner from 'ink-spinner'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import {
  loadSessionSync,
  isSessionValid,
  sessionNeedsRefresh,
  saveSession,
} from '../auth/store.js'
import { refreshSession } from '../auth/client.js'
import { loadEekoConfig } from '../utils/config.js'
import { commitDraft } from '../api/client.js'
import { isGitRepo, stageAndCommit, pushHead } from '../utils/git.js'

type PublishState = 'preparing' | 'publishing' | 'done' | 'error'

const WIDGET_FILES = ['index.html', 'styles.css', 'script.js', 'widget.json']

function readWidgetFiles(cwd: string): Record<string, string> {
  const files: Record<string, string> = {}
  const missing: string[] = []

  for (const name of WIDGET_FILES) {
    const filePath = join(cwd, name)
    if (!existsSync(filePath)) {
      missing.push(name)
      continue
    }
    files[name] = readFileSync(filePath, 'utf-8')
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required widget files: ${missing.join(', ')}. Run \`eeko init\` to scaffold a widget.`
    )
  }

  return files
}

function PublishUI() {
  const { exit } = useApp()
  const [state, setState] = useState<PublishState>('preparing')
  const [error, setError] = useState<string | null>(null)
  const [componentId, setComponentId] = useState<string | null>(null)
  const [detail, setDetail] = useState<string>('')

  useEffect(() => {
    if (state !== 'preparing') return

    async function run() {
      let session = loadSessionSync()
      if (session && !isSessionValid(session) && session.refresh_token) {
        const refreshed = await refreshSession(session.refresh_token)
        if (refreshed) {
          saveSession(refreshed)
          session = refreshed
        }
      }
      if (!session) {
        setError('Not logged in. Run: eeko login')
        setState('error')
        return
      }

      const config = loadEekoConfig()
      if (!config) {
        setError('No eeko.config.json found. Run `eeko init` or `eeko clone` first.')
        setState('error')
        return
      }
      setComponentId(config.componentId)

      const cwd = process.cwd()
      const message = `eeko publish ${new Date().toISOString()}`
      setState('publishing')

      try {
        if (await isGitRepo(cwd)) {
          // Native git path — push to the Artifacts remote's draft ref.
          const { committed } = await stageAndCommit(cwd, message)
          const push = await pushHead(cwd, 'origin', 'draft')
          if (push.code !== 0) {
            throw new Error(push.stderr.trim() || 'git push failed')
          }
          setDetail(committed ? 'committed + pushed to draft' : 'pushed to draft (no new changes)')
        } else {
          // No-git fallback — server-mediated commit.
          const files = readWidgetFiles(cwd)
          const r = await commitDraft(
            session.access_token,
            config.componentId,
            files,
            message,
            'draft',
            config.apiHost
          )
          setDetail(`commit ${r.sha ?? r.commitSha ?? ''} → draft`)
        }
        setState('done')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to publish')
        setState('error')
      }
    }

    run()
  }, [state])

  useEffect(() => {
    if (state === 'done' || state === 'error') {
      const timer = setTimeout(() => exit(), 500)
      return () => clearTimeout(timer)
    }
  }, [state, exit])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Publish
        </Text>
      </Box>

      {(state === 'preparing' || state === 'publishing') && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            {state === 'preparing' && 'Preparing…'}
            {state === 'publishing' && `Publishing to ${componentId}…`}
          </Text>
        </Box>
      )}

      {state === 'done' && componentId && (
        <Box flexDirection="column">
          <Text color="green">✓ Published to draft</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>{detail}</Text>
            <Text dimColor>Run `eeko promote` to publish live.</Text>
          </Box>
        </Box>
      )}

      {state === 'error' && <Text color="red">{error}</Text>}
    </Box>
  )
}

export const publishCommand = new Command('publish')
  .description('Publish local widget changes to your draft ref')
  .action(() => {
    render(<PublishUI />)
  })
