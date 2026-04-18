/**
 * eeko publish — commit local widget files to the component's
 * Cloudflare Artifacts repo via the server-mediated /commit endpoint.
 */

import { Command } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import Spinner from 'ink-spinner'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { loadSessionSync, isSessionValid } from '../auth/store.js'
import { loadEekoConfig } from '../utils/config.js'
import { commitComponentCode, type CommitResult } from '../api/client.js'

type PublishState = 'preparing' | 'committing' | 'done' | 'error'

const WIDGET_FILES = ['index.html', 'styles.css', 'script.js', 'widget.json']

function readWidgetFiles(cwd: string): Record<string, string> {
  const files: Record<string, string> = {}
  const missing: string[] = []

  for (const name of WIDGET_FILES) {
    const path = join(cwd, name)
    if (!existsSync(path)) {
      missing.push(name)
      continue
    }
    files[name] = readFileSync(path, 'utf-8')
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
  const [result, setResult] = useState<CommitResult | null>(null)

  useEffect(() => {
    if (state !== 'preparing') return

    const session = loadSessionSync()
    if (!session || !isSessionValid(session)) {
      setError('Not logged in. Run: eeko login')
      setState('error')
      return
    }

    const config = loadEekoConfig()
    if (!config) {
      setError(
        'No eeko.config.json found in current directory. Run `eeko init` or add one with {"componentId": "..."}'
      )
      setState('error')
      return
    }

    let files: Record<string, string>
    try {
      files = readWidgetFiles(process.cwd())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read widget files')
      setState('error')
      return
    }

    setComponentId(config.componentId)
    setState('committing')

    const message = `eeko publish ${new Date().toISOString()}`

    commitComponentCode(
      session.access_token,
      config.componentId,
      { files, message },
      config.apiHost
    )
      .then((r) => {
        setResult(r)
        setState('done')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to publish')
        setState('error')
      })
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

      {(state === 'preparing' || state === 'committing') && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            {state === 'preparing' && 'Reading widget files...'}
            {state === 'committing' && `Committing to component ${componentId}...`}
          </Text>
        </Box>
      )}

      {state === 'done' && result && componentId && (
        <Box flexDirection="column">
          <Text color="green">Published!</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>Commit: {result.commitSha}</Text>
            <Text dimColor>Ref:    {result.ref}</Text>
            <Text dimColor>Preview: https://{componentId}.widgets.eeko.app/</Text>
          </Box>
        </Box>
      )}

      {state === 'error' && <Text color="red">{error}</Text>}
    </Box>
  )
}

export const publishCommand = new Command('publish')
  .description('Publish local widget files to your Eeko component')
  .action(() => {
    render(<PublishUI />)
  })
