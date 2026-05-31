/**
 * API Client for nexus-api
 *
 * Authenticated requests to the Eeko API for the user-authored widget flow.
 */

import { AUTH_CONFIG } from '../auth/config.js'

const DEFAULT_API_BASE = AUTH_CONFIG.api.baseUrl

interface ApiError {
  error: string
  code?: string
}

export interface CreateComponentResult {
  success: boolean
  componentId: string
  instance: unknown
}

export interface ComponentGitInfo {
  ok: boolean
  componentId: string
  name: string
  repoName: string
  remote: string
  host: string
  refs: { draft: string; main: string }
}

export interface ComponentSource {
  ok: boolean
  ref: string
  files: {
    html: string
    css: string
    javascript: string
    manifest: string
  }
}

export interface CommitResult {
  ok?: boolean
  success?: boolean
  sha?: string
  commitSha?: string
  ref?: string
}

export interface GitCredentials {
  ok: boolean
  username: string
  password: string
  remote: string
  host: string
  scope: 'read' | 'write'
  tokenId: string | null
  expiresAt: string
}

export interface DraftPreviewSession {
  ok: boolean
  token: string
  origin: string
  expiresAt: string
  ref: string
  ownerId: string
  widgetChannelName: string
  componentChannelName: string
}

async function apiRequest<T>(
  apiBase: string,
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${apiBase}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const error = (data ?? {}) as ApiError
    throw new Error(error.error || `API error: ${response.status}`)
  }

  return data as T
}

/**
 * Create a new user-authored widget. Provisions a `uc-{id}` Artifacts repo
 * (seeded on both `main` and `draft`) and returns its component id.
 */
export async function createComponent(
  token: string,
  input: { name: string; componentType?: string; isTriggerable?: boolean },
  apiBase: string = DEFAULT_API_BASE
): Promise<CreateComponentResult> {
  return apiRequest<CreateComponentResult>(apiBase, '/api/components', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Resolve a widget to its Artifacts git remote + refs (for wiring the local
 * git remote and the credential helper). Returns no token.
 */
export async function getComponentGit(
  token: string,
  componentId: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<ComponentGitInfo> {
  return apiRequest<ComponentGitInfo>(
    apiBase,
    `/api/components/${componentId}/git`,
    token
  )
}

/**
 * Read the widget's canonical files at a ref (default: the row's draft ref).
 */
export async function getComponentSource(
  token: string,
  componentId: string,
  ref: string | undefined,
  apiBase: string = DEFAULT_API_BASE
): Promise<ComponentSource> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  return apiRequest<ComponentSource>(
    apiBase,
    `/api/components/${componentId}/source${q}`,
    token
  )
}

/**
 * Commit canonical widget files to the draft ref (the no-git fallback to a
 * native `git push`). `files` keys must be the canonical set.
 */
export async function commitDraft(
  token: string,
  componentId: string,
  files: Record<string, string>,
  message?: string,
  ref?: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<CommitResult> {
  return apiRequest<CommitResult>(
    apiBase,
    `/api/components/${componentId}/commit-draft`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ files, message, ref }),
    }
  )
}

/**
 * Promote the draft ref to main (publish live). Server-mediated gate.
 */
export async function promoteDraft(
  token: string,
  componentId: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<CommitResult> {
  return apiRequest<CommitResult>(
    apiBase,
    `/api/components/${componentId}/promote-draft`,
    token,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

/**
 * Mint a scoped, short-lived git credential for `git clone`/`git push`.
 */
export async function mintGitCredentials(
  token: string,
  componentId: string,
  scope: 'read' | 'write',
  apiBase: string = DEFAULT_API_BASE
): Promise<GitCredentials> {
  return apiRequest<GitCredentials>(apiBase, '/api/git/credentials', token, {
    method: 'POST',
    body: JSON.stringify({ componentId, scope }),
  })
}

/**
 * Mint a draft-preview session so `eeko dev --live` can subscribe to the
 * developer's real Pusher channels for this widget.
 */
export async function mintDraftPreviewSession(
  token: string,
  input: { componentId: string; ref?: string },
  apiBase: string = DEFAULT_API_BASE
): Promise<DraftPreviewSession> {
  return apiRequest<DraftPreviewSession>(
    apiBase,
    '/api/overlay/draft-preview-session',
    token,
    { method: 'POST', body: JSON.stringify(input) }
  )
}
