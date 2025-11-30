/**
 * Git Utilities
 *
 * Extract repository information from the current git directory.
 */

import { execSync } from 'child_process'

interface RepoSlug {
  owner: string
  repo: string
}

/**
 * Get the GitHub owner/repo from the current git directory
 * Returns null if not a git repo or no GitHub remote found
 */
export function getGitRepoSlug(): RepoSlug | null {
  try {
    // Get the remote URL
    const remoteUrl = execSync('git remote get-url origin', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    // Parse GitHub URL formats:
    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    // HTTPS (no .git): https://github.com/owner/repo

    let match: RegExpMatchArray | null = null

    // Try SSH format
    match = remoteUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/)
    if (match) {
      return { owner: match[1], repo: match[2] }
    }

    // Try HTTPS format
    match = remoteUrl.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/)
    if (match) {
      return { owner: match[1], repo: match[2] }
    }

    // Not a GitHub URL
    return null
  } catch {
    // Not a git repository or git not installed
    return null
  }
}

/**
 * Check if we're in a git repository
 */
export function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return true
  } catch {
    return false
  }
}
