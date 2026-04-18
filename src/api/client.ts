/**
 * API Client for nexus-api
 *
 * Handles authenticated requests to the Eeko API.
 */

import { AUTH_CONFIG } from '../auth/config.js'

const DEFAULT_API_BASE = AUTH_CONFIG.api.baseUrl

interface ApiError {
  error: string
  code?: string
}

export interface MerchantComponent {
  id: string
  merchantId: string
  title: string
  description: string
  componentType: string
  githubRepoOwner: string | null
  githubRepoName: string | null
  sourceType: string
  isPublic: boolean
}

export interface CommitResult {
  ok: true
  commitSha: string
  ref: string
}

interface CommitInput {
  files: Record<string, string>
  message?: string
  ref?: string
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

  const data = await response.json()

  if (!response.ok) {
    const error = data as ApiError
    throw new Error(error.error || `API error: ${response.status}`)
  }

  return data as T
}

/**
 * Get all merchant components for the authenticated user
 */
export async function getMerchantComponents(
  token: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<MerchantComponent[]> {
  const data = await apiRequest<{ components: MerchantComponent[] }>(
    apiBase,
    '/api/merchant/components',
    token
  )
  return data.components
}

/**
 * Commit widget files to the component's Artifacts repo.
 * Server overlays the provided files merge-style — any file not in
 * `files` is left untouched at the target ref.
 */
export async function commitComponentCode(
  token: string,
  componentId: string,
  input: CommitInput,
  apiBase: string = DEFAULT_API_BASE
): Promise<CommitResult> {
  return apiRequest<CommitResult>(
    apiBase,
    `/api/merchant/components/${componentId}/commit`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(input),
    }
  )
}
