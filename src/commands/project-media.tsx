/**
 * eeko project thumbnail / eeko project gallery — set a project's marketplace
 * cover image and detail-page gallery.
 *
 * Run from a project root (resolves the projectId from eeko.config.json). Each
 * image argument is either a local file (uploaded PUBLIC, then assigned) or an
 * existing public asset URL (assigned as-is). Wraps the upload primitive +
 * PATCH /api/projects/:id so the agent does upload + assign in one step.
 */

import { Command } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import Spinner from 'ink-spinner'
import { getValidAccessToken } from '../auth/session.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { findProjectContext, type ProjectContext } from '../utils/config.js'
import { uploadAssetFile } from '../api/assets.js'
import { getProject, updateProjectMedia } from '../api/client.js'

const GALLERY_MAX = 10
const URL_MAX = 500
const VIEW_URL = /\/assets\/[^/]+\/view$/

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

/**
 * Resolve one image argument to a public URL: a URL is used as-is; a local file
 * is uploaded public first. `note` collects any non-fatal warnings to surface.
 */
async function resolveImageArg(
  token: string,
  arg: string,
  assetsBase: string,
  note: (msg: string) => void
): Promise<string> {
  if (isUrl(arg)) {
    if (arg.length > URL_MAX) throw new Error(`URL exceeds ${URL_MAX} characters: ${arg}`)
    if (!VIEW_URL.test(arg)) {
      note(`"${arg}" isn't an Eeko asset view URL — it may not render on the marketplace.`)
    }
    return arg
  }
  const { url } = await uploadAssetFile(token, arg, { visibility: 'public' }, assetsBase)
  return url
}

type RunResult = { thumbnail_url?: string | null; gallery?: string[] | null }

function MediaUI({
  title,
  run,
}: {
  title: string
  run: (
    token: string,
    ctx: ProjectContext,
    setStatus: (s: string) => void,
    note: (m: string) => void
  ) => Promise<RunResult>
}) {
  const { exit } = useApp()
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  const [notes, setNotes] = useState<string[]>([])

  const failAndExit = (message: string) => {
    setError(message)
    setState('error')
    process.exitCode = 1
    setTimeout(() => exit(), 2500)
  }

  useEffect(() => {
    if (state !== 'working') return
    const note = (m: string) => setNotes((prev) => [...prev, m])
    getValidAccessToken().then((token) => {
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
      run(token, ctx, setStatus, note)
        .then((r) => {
          setResult(r)
          setState('done')
          setTimeout(() => exit(), 500)
        })
        .catch((err) => failAndExit(err instanceof Error ? err.message : String(err)))
    })
  }, [state])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {title}
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

      {notes.map((n, i) => (
        <Text key={i} dimColor>
          ⚠ {n}
        </Text>
      ))}

      {state === 'done' && result && (
        <Box flexDirection="column">
          <Text color="green">✓ Updated</Text>
          {result.thumbnail_url !== undefined && (
            <Text dimColor>thumbnail: {result.thumbnail_url ?? '(cleared)'}</Text>
          )}
          {result.gallery !== undefined && (
            <Text dimColor>
              gallery: {result.gallery ? `${result.gallery.length} image(s)` : '(cleared)'}
            </Text>
          )}
        </Box>
      )}

      {state === 'error' && <Text color="red">Error: {error}</Text>}
    </Box>
  )
}

const thumbnailCommand = new Command('thumbnail')
  .description("Set the project's marketplace thumbnail (a local image file or an asset URL)")
  .argument('[image]', 'Local image file or public asset URL')
  .option('--clear', 'Remove the thumbnail')
  .action((image: string | undefined, opts: { clear?: boolean }) => {
    if (!image && !opts.clear) {
      console.error('Provide an image file/URL, or pass --clear.')
      process.exit(1)
    }
    render(
      <MediaUI
        title="Project Thumbnail"
        run={async (token, ctx, setStatus, note) => {
          const apiBase = ctx.apiHost ?? AUTH_CONFIG.api.baseUrl
          if (opts.clear) {
            setStatus('Clearing thumbnail…')
            await updateProjectMedia(token, ctx.projectId, { thumbnail_url: null }, apiBase)
            return { thumbnail_url: null }
          }
          setStatus(isUrl(image!) ? 'Assigning thumbnail…' : 'Uploading + assigning thumbnail…')
          const url = await resolveImageArg(token, image!, AUTH_CONFIG.assets.baseUrl, note)
          await updateProjectMedia(token, ctx.projectId, { thumbnail_url: url }, apiBase)
          return { thumbnail_url: url }
        }}
      />
    )
  })

const galleryCommand = new Command('gallery')
  .description("Set the project's marketplace gallery (local image files and/or asset URLs)")
  .argument('[images...]', 'Local image files or public asset URLs (in order)')
  .option('--append', 'Add to the existing gallery instead of replacing it')
  .option('--clear', 'Remove all gallery images')
  .action((images: string[], opts: { append?: boolean; clear?: boolean }) => {
    if ((!images || images.length === 0) && !opts.clear) {
      console.error('Provide one or more image files/URLs, or pass --clear.')
      process.exit(1)
    }
    render(
      <MediaUI
        title="Project Gallery"
        run={async (token, ctx, setStatus, note) => {
          const apiBase = ctx.apiHost ?? AUTH_CONFIG.api.baseUrl
          if (opts.clear) {
            setStatus('Clearing gallery…')
            await updateProjectMedia(token, ctx.projectId, { gallery: null }, apiBase)
            return { gallery: null }
          }

          // Cap-check up front so we never upload images that won't fit.
          let existing: string[] = []
          if (opts.append) {
            setStatus('Reading current gallery…')
            const project = await getProject(token, ctx.projectId, apiBase)
            existing = Array.isArray(project.gallery) ? project.gallery : []
          }
          if (existing.length + images.length > GALLERY_MAX) {
            throw new Error(
              `Gallery holds at most ${GALLERY_MAX} images (have ${existing.length}, adding ${images.length}).`
            )
          }

          const resolved: string[] = []
          for (let i = 0; i < images.length; i++) {
            setStatus(
              isUrl(images[i])
                ? `Assigning image ${i + 1}/${images.length}…`
                : `Uploading image ${i + 1}/${images.length}…`
            )
            resolved.push(await resolveImageArg(token, images[i], AUTH_CONFIG.assets.baseUrl, note))
          }

          // Dedupe while preserving order (append concatenates onto existing).
          const gallery = [...new Set([...existing, ...resolved])].slice(0, GALLERY_MAX)
          setStatus('Saving gallery…')
          await updateProjectMedia(token, ctx.projectId, { gallery }, apiBase)
          return { gallery }
        }}
      />
    )
  })

/** Attach the media subcommands to the `eeko project` group. */
export function registerProjectMediaCommands(projectCommand: Command): void {
  projectCommand.addCommand(thumbnailCommand)
  projectCommand.addCommand(galleryCommand)
}
