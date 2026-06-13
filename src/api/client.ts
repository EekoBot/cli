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
  /** Present when the widget was created account-owned (the auto-attached catalog project). */
  projectId?: string
}

export interface ComponentGitInfo {
  ok: boolean
  componentId: string
  name: string
  repoName: string
  remote: string
  host: string
  refs: { draft: string; main: string }
  owner?: { kind: 'user' | 'account'; id: string }
}

export interface EekoAccount {
  id: string
  slug: string
  name: string
  approval_status?: string
}

export interface AccountProject {
  id: string
  name: string
  widget?: { id: string; name?: string; component_type?: string }
}

/**
 * Match a merchant account by id or slug. Two passes: an exact id match wins
 * over any slug collision; the slug comparison is case-insensitive.
 *
 * The `--account personal` sentinel is handled by callers BEFORE this is
 * consulted — this function never treats "personal" specially.
 */
export function matchAccount(
  accounts: EekoAccount[],
  idOrSlug: string
): EekoAccount | undefined {
  const byId = accounts.find((a) => a.id === idOrSlug)
  if (byId) return byId
  const slug = idOrSlug.toLowerCase()
  return accounts.find((a) => a.slug.toLowerCase() === slug)
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

export interface AutomationGitInfo {
  ok: boolean
  automationId: string
  name?: string
  repoName: string
  remote: string
  host: string
  refs: { draft: string; main: string }
  owner?: { kind: 'user' | 'account'; id: string }
}

export interface AutomationSource {
  ok: boolean
  sha: string
  ref: string
  /** The serialized automation.json string. */
  automation: string
}

/** A single validation problem surfaced by validate/commit-draft. */
export interface AutomationValidationIssue {
  stage: string
  field?: string
  message: string
}

export interface AutomationValidationResult {
  ok: boolean
  issues?: AutomationValidationIssue[]
}

export interface CreateAutomationResult {
  ok: boolean
  /** The BARE automation id — store as `automationId` in eeko.config.json. */
  automationId: string
  name: string
  repoName: string
  remote: string
  host: string
  refs: { draft: string; main: string }
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
  input: {
    name: string
    componentType?: string
    isTriggerable?: boolean
    /** Create the widget account-owned (membership-checked server-side). */
    ownerKind?: 'user' | 'account'
    ownerId?: string
    /**
     * Attach the widget to an existing project (inheriting its owner) instead
     * of creating a standalone widget / auto-creating a project. Set by
     * `eeko widget init`; supersedes ownerKind/ownerId server-side.
     */
    projectId?: string
  },
  apiBase: string = DEFAULT_API_BASE
): Promise<CreateComponentResult> {
  return apiRequest<CreateComponentResult>(apiBase, '/api/components', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export interface CreateProjectResult {
  ok: boolean
  project: {
    id: string
    name: string
    user_id?: string
    owner_kind?: string
    owner_id?: string
  }
}

/**
 * Create a project (the catalog/authoring container). With `accountId` it is an
 * account-owned project (membership-checked server-side); without, a personal
 * one. The widget and automation sides inherit this owner.
 */
export async function createProject(
  token: string,
  input: { name: string; description?: string; accountId?: string },
  apiBase: string = DEFAULT_API_BASE
): Promise<CreateProjectResult> {
  return apiRequest<CreateProjectResult>(apiBase, '/api/projects', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * List the merchant accounts the caller is a member of.
 */
export async function getAccounts(
  token: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<{ accounts: EekoAccount[] }> {
  return apiRequest<{ accounts: EekoAccount[] }>(apiBase, '/api/accounts', token)
}

/**
 * List an account's catalog projects. Projects carry `widget` when a
 * user-component is attached.
 */
export async function listAccountProjects(
  token: string,
  accountId: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<{ projects: AccountProject[] }> {
  return apiRequest<{ projects: AccountProject[] }>(
    apiBase,
    `/api/accounts/${accountId}/projects`,
    token
  )
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
 *
 * The target is either a widget (`{ componentId }`) or an automation
 * (`{ automationId }`); nexus-api accepts both shapes and returns the same
 * credential envelope. The credential helper resolves which one from the repo
 * prefix (`uc-` vs `au-`).
 */
export async function mintGitCredentials(
  token: string,
  target: { componentId: string } | { automationId: string },
  scope: 'read' | 'write',
  apiBase: string = DEFAULT_API_BASE
): Promise<GitCredentials> {
  return apiRequest<GitCredentials>(apiBase, '/api/git/credentials', token, {
    method: 'POST',
    body: JSON.stringify({ ...target, scope }),
  })
}

/**
 * Create a new automation. Provisions an `au-{id}` Artifacts repo (seeded on
 * both `main` and `draft`) and returns its bare automation id.
 */
export async function createAutomation(
  token: string,
  input: { name: string; projectId: string; accountId?: string },
  apiBase: string = DEFAULT_API_BASE
): Promise<CreateAutomationResult> {
  return apiRequest<CreateAutomationResult>(apiBase, '/api/automations/init', token, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

/**
 * Resolve an automation to its Artifacts git remote + refs (mirror of
 * getComponentGit). Returns no token.
 */
export async function getAutomationGit(
  token: string,
  automationId: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<AutomationGitInfo> {
  return apiRequest<AutomationGitInfo>(
    apiBase,
    `/api/automations/${automationId}/git`,
    token
  )
}

/**
 * Read the automation's canonical `automation.json` at a ref (default: the
 * row's draft ref).
 */
export async function getAutomationSource(
  token: string,
  automationId: string,
  ref: string | undefined,
  apiBase: string = DEFAULT_API_BASE
): Promise<AutomationSource> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : ''
  return apiRequest<AutomationSource>(
    apiBase,
    `/api/automations/${automationId}/source${q}`,
    token
  )
}

/**
 * Validate a parsed automation.json object against the draft pipeline without
 * committing. Returns `{ ok:false, issues }` (status 400/403) on failure — the
 * issues array is surfaced so the CLI can print field-level errors.
 */
export async function validateAutomationDraft(
  token: string,
  automationId: string,
  automation: unknown,
  apiBase: string = DEFAULT_API_BASE
): Promise<AutomationValidationResult> {
  const url = `${apiBase}/api/automations/${automationId}/validate-draft`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ automation }),
  })
  const data = (await response.json().catch(() => null)) as
    | (AutomationValidationResult & ApiError)
    | null
  if (response.ok) {
    return { ok: true, issues: data?.issues }
  }
  // 400/403 carry the structured issues — return them instead of throwing so
  // the caller can pretty-print field-level errors.
  if (data && (Array.isArray(data.issues) || data.ok === false)) {
    return { ok: false, issues: data.issues ?? [] }
  }
  throw new Error(data?.error || `API error: ${response.status}`)
}

/**
 * Commit a parsed automation.json object to the draft ref (the no-git fallback
 * to a native `git push`). Validates server-side; on failure the error body may
 * carry `issues`, which are returned for field-level reporting.
 */
export async function commitAutomationDraft(
  token: string,
  automationId: string,
  automation: unknown,
  message?: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<CommitResult & { issues?: AutomationValidationIssue[] }> {
  const url = `${apiBase}/api/automations/${automationId}/commit-draft`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ automation, message }),
  })
  const data = (await response.json().catch(() => null)) as
    | (CommitResult & { issues?: AutomationValidationIssue[] } & ApiError)
    | null
  if (!response.ok) {
    if (data && Array.isArray(data.issues)) {
      return { ok: false, issues: data.issues }
    }
    throw new Error(data?.error || `API error: ${response.status}`)
  }
  return data as CommitResult & { issues?: AutomationValidationIssue[] }
}

/**
 * Promote the automation's draft ref to main (publish live). Server-mediated
 * gate.
 */
export async function promoteAutomationDraft(
  token: string,
  automationId: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<CommitResult> {
  return apiRequest<CommitResult>(
    apiBase,
    `/api/automations/${automationId}/promote-draft`,
    token,
    { method: 'POST', body: JSON.stringify({}) }
  )
}

/**
 * Sync the automation's `config_blob` (the live source of truth) from its
 * Artifacts repo at a ref (default: draft). For an automation, "save = live" —
 * the git push alone doesn't make an edit live, so `eeko publish` calls this
 * right after pushing so the change takes effect immediately.
 */
export async function syncAutomationDraft(
  token: string,
  automationId: string,
  apiBase: string = DEFAULT_API_BASE
): Promise<{ ok: boolean; sha?: string; ref?: string }> {
  return apiRequest<{ ok: boolean; sha?: string; ref?: string }>(
    apiBase,
    `/api/automations/${automationId}/sync`,
    token,
    { method: 'POST', body: JSON.stringify({}) }
  )
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
