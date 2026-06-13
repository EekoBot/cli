/**
 * eeko asset upload — upload a local image to your Eeko media library.
 *
 * The lower-level primitive behind `eeko project thumbnail` / `eeko project
 * gallery`. Runs the three-step presigned upload against asset-management-service
 * and prints the asset id + its public view URL. Default visibility is private;
 * pass --public for an image you'll embed somewhere public (marketplace art).
 */

import { Command, Option } from 'commander'
import React, { useEffect, useState } from 'react'
import { render, Box, Text, useApp } from 'ink'
import Spinner from 'ink-spinner'
import { getValidAccessToken } from '../auth/session.js'
import { AUTH_CONFIG } from '../auth/config.js'
import { uploadAssetFile, type UploadedAsset } from '../api/assets.js'

interface AssetUploadOptions {
  file: string
  public?: boolean
  tag?: string[]
  assetsHost?: string
}

function AssetUploadUI({ initial }: { initial: AssetUploadOptions }) {
  const { exit } = useApp()
  const [state, setState] = useState<'working' | 'done' | 'error'>('working')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UploadedAsset | null>(null)

  const failAndExit = (message: string) => {
    setError(message)
    setState('error')
    process.exitCode = 1
    setTimeout(() => exit(), 2500)
  }

  useEffect(() => {
    if (state !== 'working') return
    getValidAccessToken().then((token) => {
      if (!token) {
        failAndExit('Not logged in. Run: eeko login')
        return
      }
      uploadAssetFile(
        token,
        initial.file,
        { visibility: initial.public ? 'public' : 'private', tags: initial.tag },
        initial.assetsHost ?? AUTH_CONFIG.assets.baseUrl
      )
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
          Eeko Asset Upload
        </Text>
      </Box>

      {state === 'working' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Uploading {initial.file}…</Text>
        </Box>
      )}

      {state === 'done' && result && (
        <Box flexDirection="column">
          <Text color="green">✓ Uploaded</Text>
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>asset id: {result.assetId}</Text>
            <Text dimColor>url: {result.url}</Text>
            {!initial.public && (
              <Text dimColor>
                (private — pass --public for an image you'll show on the marketplace)
              </Text>
            )}
          </Box>
        </Box>
      )}

      {state === 'error' && <Text color="red">Error: {error}</Text>}
    </Box>
  )
}

const assetUploadCommand = new Command('upload')
  .description('Upload a local image (PNG/JPG/WebP/GIF) to your media library')
  .argument('<file>', 'Path to the image file')
  .option('--public', 'Make the asset publicly viewable (required for marketplace images)')
  .option(
    '--tag <tag>',
    'Tag the asset (repeatable)',
    (val: string, prev: string[] = []) => [...prev, val]
  )
  .addOption(new Option('--assets-host <url>', 'Override the asset service URL').hideHelp())
  .action((file: string, opts: { public?: boolean; tag?: string[]; assetsHost?: string }) => {
    render(
      <AssetUploadUI
        initial={{ file, public: opts.public, tag: opts.tag, assetsHost: opts.assetsHost }}
      />
    )
  })

export const assetCommand = new Command('asset')
  .description('Manage your Eeko media assets')
  .addCommand(assetUploadCommand)
