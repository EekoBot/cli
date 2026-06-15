/**
 * eeko project release — cut a marketplace release of the current project.
 *
 * Calls the existing release endpoint: it freeze-forks the project's widget /
 * automation at their current `main`, snapshots the config + metadata + images,
 * and creates a versioned listing in `draft` (NOT public). `--submit` advances
 * it into review; on a solo account that fast-forwards to the Eeko admin queue.
 * The final approve-to-live is always an Eeko admin — never the CLI.
 *
 * Owner-controlled: an agent should run this only when explicitly asked.
 */

import { Command, Option } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import Spinner from 'ink-spinner'
import { getValidAccessToken } from '../auth/session.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { findProjectContext } from '../utils/config.js'
import { createListing, advanceListing } from '../api/client.js'

const SEMVER = /^\d+\.\d+\.\d+$/

interface ReleaseOptions {
  version?: string
  changelog: string
  submit?: boolean
  private?: boolean
  apiHost?: string
}

interface ReleaseResult {
  versionLabel: string
  listingId: string
  state: string
  submitted: boolean
  isPrivate: boolean
}

function ReleaseUI({ initial }: { initial: ReleaseOptions }) {
  const { exit } = useApp()
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReleaseResult | null>(null)

  const failAndExit = (message: string) => {
    setError(message)
    setState('error')
    process.exitCode = 1
    setTimeout(() => exit(), 3000)
  }

  useEffect(() => {
    if (state !== 'working') return
    getValidAccessToken().then(async (token) => {
      if (!token) {
        failAndExit('Not logged in. Run: eeko login')
        return
      }
      const ctx = findProjectContext(process.cwd())
      if (!ctx) {
        failAndExit(
          'Not inside an Eeko project directory (no eeko.config.json with a projectId). Run `eeko project init` first.'
        )
        return
      }
      if (!ctx.accountId) {
        failAndExit(
          'Releases need an account-owned project. This looks like a personal project — create it with `eeko project init --account <slug>`.'
        )
        return
      }
      const apiBase = ctx.apiHost ?? AUTH_CONFIG.api.baseUrl
      const isPrivate = !!initial.private
      try {
        setStatus(isPrivate ? 'Publishing privately…' : `Cutting release v${initial.version}…`)
        const { listing } = await createListing(
          token,
          isPrivate
            ? { projectId: ctx.projectId, listingKind: 'private', changelog: initial.changelog }
            : {
                projectId: ctx.projectId,
                versionLabel: initial.version,
                changelog: initial.changelog,
              },
          apiBase
        )
        let finalState = listing.approval_state
        // Private releases publish straight to grantees — there is no review to
        // submit to, so --submit is a no-op for them.
        if (initial.submit && !isPrivate) {
          setStatus('Submitting for review…')
          const adv = await advanceListing(token, listing.id, 'submit_internal', apiBase)
          finalState = adv.approval_state ?? adv.state ?? finalState
        }
        setResult({
          // Private listings carry no semver label — fall back to the integer version.
          versionLabel: listing.version_label ?? String(listing.version),
          listingId: listing.id,
          state: finalState,
          submitted: !!initial.submit && !isPrivate,
          isPrivate,
        })
        setState('done')
        setTimeout(() => exit(), 500)
      } catch (err) {
        failAndExit(err instanceof Error ? err.message : String(err))
      }
    })
  }, [state])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Project Release
        </Text>
      </Box>

      {state === 'working' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> {status || 'Working…'}</Text>
        </Box>
      )}

      {state === 'done' && result && (
        <Box flexDirection="column">
          <Text color="green">
            ✓{' '}
            {result.isPrivate
              ? `Published privately (v${result.versionLabel})`
              : `Release v${result.versionLabel} ${result.submitted ? 'submitted for review' : 'created'}`}
          </Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>listing: {result.listingId}</Text>
            <Text dimColor>state: {result.state}</Text>
            <Text dimColor>
              {result.isPrivate
                ? 'Live for people you share it with. Invite them by email in the merchant app (Share access) — until then no one can see it.'
                : result.submitted
                  ? 'An Eeko admin reviews and approves it before it goes live.'
                  : 'Draft — not public. Re-run with --submit to send it for review, or submit it in the merchant app.'}
            </Text>
          </Box>
        </Box>
      )}

      {state === 'error' && <Text color="red">Error: {error}</Text>}
    </Box>
  )
}

export const releaseCommand = new Command('release')
  .description(
    'Cut a release of this project — public marketplace (default) or --private to share directly'
  )
  // Version is a POSITIONAL argument, not `--version`: a `--version` option here
  // collides with the CLI's global `--version` flag (commander prints the CLI
  // version and exits), so `release --version 1.0.0` silently no-ops. Optional
  // because a private release auto-increments an integer version server-side and
  // carries no semver label.
  .argument('[version]', 'Release version (semver), e.g. 1.0.0 — required for marketplace, ignored with --private')
  .requiredOption('--changelog <text>', 'What changed in this release (shown on the listing / opt-in update prompt)')
  .option(
    '--private',
    'Publish privately (skips Eeko review) — shared by email in the merchant app, never listed on the marketplace'
  )
  .option('--submit', 'Also submit the release for review (marketplace only; ignored with --private)')
  .addOption(new Option('--api-host <url>', 'Override the API base URL (internal/staging use)').hideHelp())
  .action(
    (
      version: string | undefined,
      opts: { changelog: string; submit?: boolean; private?: boolean; apiHost?: string }
    ) => {
      // A marketplace release needs a semver label; a private release does not
      // (the integer version auto-increments), so the positional is optional and
      // ignored with --private.
      if (!opts.private) {
        if (!version) {
          console.error(
            'A version is required for a marketplace release, e.g. `eeko project release 1.0.0 --changelog "…"`. To share privately instead, pass --private.'
          )
          process.exit(1)
        }
        if (!SEMVER.test(version)) {
          console.error(`Invalid version "${version}". Use semver, e.g. 1.0.0`)
          process.exit(1)
        }
      }
      if (!opts.changelog.trim()) {
        console.error('--changelog must not be empty.')
        process.exit(1)
      }
      render(
        <ReleaseUI
          initial={{
            version,
            changelog: opts.changelog,
            submit: opts.submit,
            private: opts.private,
            apiHost: opts.apiHost,
          }}
        />
      )
    }
  )
