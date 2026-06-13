/**
 * eeko publish — push local artifact changes to your draft ref.
 *
 * If the directory is a git repo wired to your Eeko remote, this stages +
 * commits any changes and `git push`es them to draft (the credential helper
 * brokers the token) — this path works for both widgets (`uc-`) and
 * automations (`au-`). Otherwise it falls back to the server-mediated
 * commit-draft endpoint (per artifact kind). Either way the push triggers a
 * preview refresh; run `eeko promote` to publish live.
 */

import { Command } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import Spinner from 'ink-spinner'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { getValidAccessToken } from '../auth/session.js'
import { artifactRef, loadEekoConfig } from '../utils/config.js'
import { commitDraft, commitAutomationDraft } from '../api/client.js'
import { isGitRepo, stageAndCommit, pushHead } from '../utils/git.js'

type PublishState = 'preparing' | 'publishing' | 'done' | 'error'

const WIDGET_FILES = ['index.html', 'styles.css', 'script.js', 'widget.json']
const AUTOMATION_FILE = 'automation.json'

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

function readAutomation(cwd: string): unknown {
  const filePath = join(cwd, AUTOMATION_FILE)
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing ${AUTOMATION_FILE}. Run \`eeko automation init\` to scaffold an automation.`
    )
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    throw new Error(`${AUTOMATION_FILE} is not valid JSON`)
  }
}

function PublishUI() {
  const { exit } = useApp()
  const [state, setState] = useState<PublishState>('preparing')
  const [error, setError] = useState<string | null>(null)
  const [artifactId, setArtifactId] = useState<string | null>(null)
  const [detail, setDetail] = useState<string>('')

  useEffect(() => {
    if (state !== 'preparing') return

    async function run() {
      const token = await getValidAccessToken()
      if (!token) {
        setError('Not logged in or session expired. Run: eeko login')
        setState('error')
        return
      }

      const config = loadEekoConfig()
      const ref = config ? artifactRef(config) : null
      if (!config || !ref) {
        setError('No eeko.config.json found. Run `eeko init`, `eeko clone`, or `eeko automation init` first.')
        setState('error')
        return
      }
      setArtifactId(ref.id)

      const cwd = process.cwd()
      const message = `eeko publish ${new Date().toISOString()}`
      setState('publishing')

      try {
        if (await isGitRepo(cwd)) {
          // Native git path — push to the Artifacts remote's draft ref. Works
          // for both `uc-` widgets and `au-` automations.
          const { committed } = await stageAndCommit(cwd, message)
          const push = await pushHead(cwd, 'origin', 'draft')
          if (push.code !== 0) {
            throw new Error(push.stderr.trim() || 'git push failed')
          }
          setDetail(committed ? 'committed + pushed to draft' : 'pushed to draft (no new changes)')
        } else if (ref.kind === 'automation') {
          // No-git fallback — server-mediated commit of automation.json.
          const automation = readAutomation(cwd)
          const r = await commitAutomationDraft(token, ref.id, automation, message, config.apiHost)
          if (r.ok === false && r.issues && r.issues.length > 0) {
            throw new Error(
              'Automation invalid:\n' +
                r.issues
                  .map((i) => `  ✖ ${i.field ? `${i.field}: ` : ''}${i.message} [${i.stage}]`)
                  .join('\n')
            )
          }
          setDetail(`commit ${r.sha ?? r.commitSha ?? ''} → draft`)
        } else {
          // No-git fallback — server-mediated commit of widget files.
          const files = readWidgetFiles(cwd)
          const r = await commitDraft(token, ref.id, files, message, 'draft', config.apiHost)
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
            {state === 'publishing' && `Publishing to ${artifactId}…`}
          </Text>
        </Box>
      )}

      {state === 'done' && artifactId && (
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
