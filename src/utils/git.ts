/**
 * Thin git helpers for the "Eeko is your git remote" flow.
 *
 * Credentials are brokered by the `eeko credential-helper` subcommand, wired
 * into repo-local git config so `git clone` / `git push` against an Artifacts
 * repo authenticate transparently with short-lived tokens.
 */

import { spawn } from 'child_process'

export interface GitResult {
  code: number
  stdout: string
  stderr: string
}

export function runGit(args: string[], opts: { cwd?: string } = {}): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd: opts.cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: String(err) }))
  })
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const r = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd })
  return r.code === 0 && r.stdout.trim() === 'true'
}

/** Single-quote a string for safe interpolation into git's `!`-shell helper. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

/**
 * The git credential-helper invocation that brokers tokens via this CLI.
 * Uses the absolute node + script path so it resolves regardless of PATH
 * (global install, local, or npx).
 */
function credentialHelperInvocation(): string {
  const script = process.argv[1] ?? 'eeko'
  return `!${shq(process.execPath)} ${shq(script)} credential-helper`
}

/** The repo-local credential config args for an Artifacts host. */
function credentialConfigArgs(host: string): string[][] {
  const key = `credential.https://${host}`
  return [
    [`${key}.helper`, credentialHelperInvocation()],
    // useHttpPath makes git send the repo path (uc-<id>.git) to the helper so
    // it can derive the componentId.
    [`${key}.useHttpPath`, 'true'],
  ]
}

/** Persist the credential helper into a repo's local git config. */
export async function configureCredentialHelper(cwd: string, host: string): Promise<void> {
  for (const [name, value] of credentialConfigArgs(host)) {
    await runGit(['config', '--local', name, value], { cwd })
  }
}

/**
 * Clone an Artifacts repo, wiring the credential helper transiently for the
 * clone itself (no repo exists yet to hold config) and persisting it after.
 */
export async function cloneRepo(remote: string, dir: string, host: string): Promise<GitResult> {
  const inlineConfig = credentialConfigArgs(host).flatMap(([name, value]) => [
    '-c',
    `${name}=${value}`,
  ])
  const result = await runGit([...inlineConfig, 'clone', remote, dir])
  if (result.code === 0) {
    await configureCredentialHelper(dir, host)
  }
  return result
}

export async function checkout(cwd: string, ref: string): Promise<GitResult> {
  return runGit(['checkout', ref], { cwd })
}

/** Stage everything and commit if there's anything to commit. */
export async function stageAndCommit(
  cwd: string,
  message: string,
  author = { name: 'eeko', email: 'cli@eeko.app' }
): Promise<{ committed: boolean; result: GitResult }> {
  await runGit(['add', '-A'], { cwd })
  // `git diff --cached --quiet` exits 1 when there are staged changes.
  const staged = await runGit(['diff', '--cached', '--quiet'], { cwd })
  if (staged.code === 0) {
    return { committed: false, result: staged }
  }
  const result = await runGit(
    [
      '-c',
      `user.name=${author.name}`,
      '-c',
      `user.email=${author.email}`,
      'commit',
      '-m',
      message,
    ],
    { cwd }
  )
  return { committed: result.code === 0, result }
}

/** Push the current HEAD to a remote ref (e.g. `draft`). */
export async function pushHead(cwd: string, remote: string, ref: string): Promise<GitResult> {
  return runGit(['push', remote, `HEAD:${ref}`], { cwd })
}
