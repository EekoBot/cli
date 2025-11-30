/**
 * API Client for nexus-api
 *
 * Handles authenticated requests to the Eeko API.
 */

import { AUTH_CONFIG } from '../auth/config.js'

const API_BASE = AUTH_CONFIG.api.baseUrl

interface ApiError {
  error: string
  code?: string
}

interface MerchantComponent {
  id: string
  merchantId: string
  title: string
  description: string
  componentType: string
  githubRepoOwner: string | null
  githubRepoName: string | null
  sourceType: string
  isPublic: boolean
  currentReleaseId: string | null
}

interface GitHubRelease {
  tagName: string
  name: string
  isPrerelease: boolean
  publishedAt: string
}

interface ComponentRelease {
  id: string
  componentId: string
  version: string
  changelog: string | null
  isPrerelease: boolean
  githubTag: string | null
  createdAt: string
}

interface CreateReleaseData {
  version: string
  githubTag: string
  changelog?: string
  isPrerelease?: boolean
}

interface MarketplaceItem {
  id: string
  component_id: string
  version: number
  version_label: string
  name: string
}

/**
 * Make an authenticated API request
 */
async function apiRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
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
  token: string
): Promise<MerchantComponent[]> {
  const data = await apiRequest<{ components: MerchantComponent[] }>(
    '/api/merchant/components',
    token
  )
  return data.components
}

/**
 * Get GitHub releases for a repository
 */
export async function getGitHubReleases(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubRelease[]> {
  const data = await apiRequest<{ releases: GitHubRelease[] }>(
    `/api/github/repos/${owner}/${repo}/releases`,
    token
  )
  return data.releases
}

/**
 * Get unreleased GitHub tags for a component
 * Returns only tags that haven't been released yet
 */
export async function getUnreleasedTags(
  token: string,
  componentId: string
): Promise<GitHubRelease[]> {
  const data = await apiRequest<{ tags: GitHubRelease[] }>(
    `/api/merchant/components/${componentId}/unreleased-tags`,
    token
  )
  return data.tags
}

/**
 * Get existing releases for a component
 */
export async function getComponentReleases(
  token: string,
  componentId: string
): Promise<ComponentRelease[]> {
  const data = await apiRequest<{ releases: ComponentRelease[]; currentReleaseId?: string }>(
    `/api/merchant/components/${componentId}/releases`,
    token
  )
  return data.releases
}

/**
 * Create a new release for a component
 */
export async function createRelease(
  token: string,
  componentId: string,
  data: CreateReleaseData
): Promise<{ release: ComponentRelease; message: string }> {
  return apiRequest<{ success: boolean; release: ComponentRelease; message: string }>(
    `/api/merchant/components/${componentId}/releases`,
    token,
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  )
}

/**
 * Publish component to marketplace
 */
export async function publishToMarketplace(
  token: string,
  componentId: string,
  changelog?: string
): Promise<{ item: MarketplaceItem; message: string }> {
  return apiRequest<{ success: boolean; item: MarketplaceItem; message: string }>(
    '/api/marketplace/publish',
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        componentId,
        changelog,
      }),
    }
  )
}

export type {
  MerchantComponent,
  GitHubRelease,
  ComponentRelease,
  CreateReleaseData,
  MarketplaceItem,
}
