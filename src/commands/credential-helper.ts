/**
 * `eeko credential-helper <op>` — a git credential helper (internal).
 *
 * Wired into repo-local git config by `eeko clone` / `eeko init`. git invokes
 * it with `get` / `store` / `erase` and a key=value block on stdin. On `get`
 * we derive the artifact (component `uc-` or automation `au-`) from the
 * requested repo path, mint a short-lived write token via nexus-api, and hand
 * it to git. The token is never persisted
 * (`store` is a no-op); the developer's identity session is the only durable
 * secret.
 */

import { Command } from 'commander'
import { getValidAccessToken } from '../auth/session.js'
import { mintGitCredentials } from '../api/client.js'
import { loadEekoConfig } from '../utils/config.js'
import { AUTH_CONFIG } from '../auth/config.js'

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', () => resolve(data))
  })
}

function parseInput(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const eq = line.indexOf('=')
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1).replace(/\r$/, '')
  }
  return out
}

/**
 * The artifact a git `path` points at (sent when useHttpPath=true). Repo names
 * are `uc-{componentId}` for widgets and `au-{automationId}` for automations;
 * the path looks like `.../uc-{id}.git` or `.../au-{id}.git`.
 */
export type ArtifactTarget =
  | { componentId: string }
  | { automationId: string }

export function artifactTargetFromPath(p: string | undefined): ArtifactTarget | null {
  if (!p) return null
  const segments = p.split('/').filter(Boolean)
  for (const seg of segments) {
    const name = seg.replace(/\.git$/, '')
    if (name.startsWith('uc-')) return { componentId: name.slice(3) }
    if (name.startsWith('au-')) return { automationId: name.slice(3) }
  }
  return null
}

async function handleGet(input: Record<string, string>): Promise<void> {
  const target = artifactTargetFromPath(input.path)
  if (!target) {
    // Can't resolve which artifact — stay silent so git can fall through.
    process.exit(0)
  }

  // Returns null for an expired session with no refresh token, so we tell git
  // we have nothing (it fails cleanly) rather than handing over a dead token.
  const token = await getValidAccessToken()
  if (!token) {
    process.stderr.write('eeko: not logged in or session expired — run `eeko login`\n')
    process.exit(1)
  }

  const apiBase = loadEekoConfig()?.apiHost ?? AUTH_CONFIG.api.baseUrl
  try {
    const cred = await mintGitCredentials(token, target, 'write', apiBase)
    const expiryUnix = Math.floor(new Date(cred.expiresAt).getTime() / 1000)
    let out =
      `protocol=https\n` +
      `host=${input.host ?? cred.host}\n` +
      `username=${cred.username}\n` +
      `password=${cred.password}\n`
    if (Number.isFinite(expiryUnix)) out += `password_expiry_utc=${expiryUnix}\n`
    process.stdout.write(out)
    process.exit(0)
  } catch (err) {
    process.stderr.write(
      `eeko: failed to mint git credential: ${err instanceof Error ? err.message : String(err)}\n`
    )
    process.exit(1)
  }
}

export const credentialHelperCommand = new Command('credential-helper')
  .description('git credential helper (internal)')
  .argument('[operation]', 'get | store | erase')
  .helpOption(false)
  .action(async (operation: string | undefined) => {
    if (operation !== 'get') {
      // store / erase: nothing to persist — tokens are ephemeral, minted per get.
      process.exit(0)
    }
    const raw = await readStdin()
    await handleGet(parseInput(raw))
  })
