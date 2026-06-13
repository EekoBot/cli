/**
 * Asset upload client for asset-management-service (https://assets.eeko.app).
 *
 * Mirrors the merchant app's three-step presigned-URL flow
 * (`apps/merchant-react-app/src/api/assets.client.ts`):
 *   1. POST /upload/initiate  — JSON metadata → presigned R2 PUT URL + asset id
 *   2. PUT  <upload_url>       — the raw file bytes
 *   3. POST /upload/confirm/:id — verify + activate
 *
 * The CLI's identity-service JWT authenticates here exactly as it does against
 * nexus-api (the asset service verifies ES256 against the same JWKS). A
 * successfully uploaded PUBLIC asset is served at `{base}/assets/{id}/view` —
 * the exact URL the merchant UI stores in a project's thumbnail_url / gallery.
 */

import { readFileSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { basename, extname } from 'path'
import { AUTH_CONFIG } from '../auth/config.js'

const DEFAULT_ASSETS_BASE = AUTH_CONFIG.assets.baseUrl

/** Image content-types the asset service accepts (SVG is blocked server-side). */
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export type AssetVisibility = 'public' | 'private'

interface InitiateResponse {
  asset_id: string
  upload_url: string
  r2_key: string
  expires_at: number
  method: 'PUT'
  headers: Record<string, string>
}

export interface UploadedAsset {
  assetId: string
  /** Public view URL — what goes into a project's thumbnail_url / gallery. */
  url: string
}

interface AssetApiError {
  error?: string
  message?: string
}

/** Resolve a local image file's content-type from its extension, or throw. */
function imageMimeFor(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  const mime = MIME_BY_EXT[ext]
  if (!mime) {
    const allowed = Object.keys(MIME_BY_EXT).join(', ')
    throw new Error(
      ext === '.svg'
        ? 'SVG images are not allowed. Use a PNG, JPG, WebP or GIF.'
        : `Unsupported image type "${ext || filePath}". Allowed: ${allowed}.`
    )
  }
  return mime
}

async function assetRequest<T>(
  assetsBase: string,
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${assetsBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = (await response.json().catch(() => null)) as (T & AssetApiError) | null
  if (!response.ok) {
    const err = (data ?? {}) as AssetApiError
    const detail = err.error || err.message || `HTTP ${response.status}`
    if (response.status === 403) {
      throw new Error(`Storage quota exceeded — free space or upgrade your plan (${detail}).`)
    }
    throw new Error(detail)
  }
  return data as T
}

export async function initiateUpload(
  token: string,
  body: {
    filename: string
    mime_type: string
    size_bytes: number
    visibility: AssetVisibility
    sha256_hash?: string
    tags?: string[]
  },
  assetsBase: string = DEFAULT_ASSETS_BASE
): Promise<InitiateResponse> {
  return assetRequest<InitiateResponse>(assetsBase, '/upload/initiate', token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function confirmUpload(
  token: string,
  assetId: string,
  assetsBase: string = DEFAULT_ASSETS_BASE
): Promise<{ success: boolean; asset: unknown }> {
  return assetRequest(assetsBase, `/upload/confirm/${assetId}`, token, { method: 'POST' })
}

/**
 * Upload a local image file end-to-end and return its public view URL. Marketplace
 * images must be uploaded `public` so the unauthenticated view route serves them.
 */
export async function uploadAssetFile(
  token: string,
  filePath: string,
  opts: { visibility: AssetVisibility; tags?: string[] },
  assetsBase: string = DEFAULT_ASSETS_BASE
): Promise<UploadedAsset> {
  let stat
  try {
    stat = statSync(filePath)
  } catch {
    throw new Error(`File not found: ${filePath}`)
  }
  if (!stat.isFile()) throw new Error(`Not a file: ${filePath}`)

  const mime = imageMimeFor(filePath)
  const buffer = readFileSync(filePath)
  const sha256 = createHash('sha256').update(buffer).digest('hex')

  const init = await initiateUpload(
    token,
    {
      filename: basename(filePath),
      mime_type: mime,
      size_bytes: stat.size,
      visibility: opts.visibility,
      sha256_hash: sha256,
      ...(opts.tags && opts.tags.length > 0 ? { tags: opts.tags } : {}),
    },
    assetsBase
  )

  // PUT the raw bytes to the presigned URL. Pass only Content-Type from the
  // signed headers; the Buffer body sets Content-Length = size_bytes, matching
  // the signature. (No Authorization — the presigned URL carries its own auth.)
  const put = await fetch(init.upload_url, {
    method: 'PUT',
    body: new Uint8Array(buffer),
    headers: { 'Content-Type': mime },
  })
  if (!put.ok) {
    const text = await put.text().catch(() => '')
    throw new Error(`Upload failed (HTTP ${put.status})${text ? `: ${text.slice(0, 200)}` : ''}`)
  }

  await confirmUpload(token, init.asset_id, assetsBase)

  return { assetId: init.asset_id, url: `${assetsBase}/assets/${init.asset_id}/view` }
}
