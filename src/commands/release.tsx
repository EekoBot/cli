/**
 * eeko release - Create a new release for your component
 *
 * Interactive command to create releases from GitHub tags.
 * Releases are automatically published to the marketplace.
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text, useApp } from 'ink'
import SelectInput from 'ink-select-input'
import TextInput from 'ink-text-input'
import Spinner from 'ink-spinner'
import { loadSessionSync, isSessionValid } from '../auth/store.js'
import { getGitRepoSlug } from '../utils/git.js'
import {
  getMerchantComponents,
  getUnreleasedTags,
  createRelease,
  type MerchantComponent,
  type GitHubRelease,
} from '../api/client.js'

type ReleaseState =
  | 'checking-auth'
  | 'loading-component'
  | 'loading-releases'
  | 'selecting-tag'
  | 'entering-changelog'
  | 'confirming'
  | 'creating-release'
  | 'done'
  | 'error'

function ReleaseUI() {
  const { exit } = useApp()
  const [state, setState] = useState<ReleaseState>('checking-auth')
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [repoSlug, setRepoSlug] = useState<{ owner: string; repo: string } | null>(null)
  const [component, setComponent] = useState<MerchantComponent | null>(null)
  const [githubReleases, setGithubReleases] = useState<GitHubRelease[]>([])
  const [selectedTag, setSelectedTag] = useState<GitHubRelease | null>(null)
  const [changelog, setChangelog] = useState('')
  const [createdVersion, setCreatedVersion] = useState<string | null>(null)

  // Step 1: Check auth
  useEffect(() => {
    if (state !== 'checking-auth') return

    const session = loadSessionSync()
    if (!session || !isSessionValid(session)) {
      setError('Not logged in. Run: eeko login')
      setState('error')
      return
    }

    setToken(session.access_token)

    // Check git repo
    const slug = getGitRepoSlug()
    if (!slug) {
      setError('Not a GitHub repository. Run this command from your widget directory.')
      setState('error')
      return
    }

    setRepoSlug(slug)
    setState('loading-component')
  }, [state])

  // Step 2: Load component
  useEffect(() => {
    if (state !== 'loading-component' || !token || !repoSlug) return

    async function loadComponent() {
      try {
        const components = await getMerchantComponents(token!)
        const found = components.find(
          (c) =>
            c.githubRepoOwner?.toLowerCase() === repoSlug!.owner.toLowerCase() &&
            c.githubRepoName?.toLowerCase() === repoSlug!.repo.toLowerCase()
        )

        if (!found) {
          setError(
            `No component found for ${repoSlug!.owner}/${repoSlug!.repo}. Register at merchant.eeko.app first.`
          )
          setState('error')
          return
        }

        if (found.sourceType !== 'github') {
          setError('This command only supports GitHub-sourced components.')
          setState('error')
          return
        }

        setComponent(found)
        setState('loading-releases')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load components')
        setState('error')
      }
    }

    loadComponent()
  }, [state, token, repoSlug])

  // Step 3: Load unreleased tags from API
  useEffect(() => {
    if (state !== 'loading-releases' || !token || !component) return

    async function loadReleases() {
      try {
        const tags = await getUnreleasedTags(token!, component!.id)

        if (tags.length === 0) {
          setError('No unreleased GitHub tags found. All existing tags have already been released. Create a new release on GitHub to continue.')
          setState('error')
          return
        }

        setGithubReleases(tags)
        setState('selecting-tag')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load releases')
        setState('error')
      }
    }

    loadReleases()
  }, [state, token, component])

  // Handle tag selection
  const handleTagSelect = (item: { value: string }) => {
    const release = githubReleases.find((r) => r.tagName === item.value)
    if (release) {
      setSelectedTag(release)
      setState('entering-changelog')
    }
  }

  // Handle changelog submit
  const handleChangelogSubmit = () => {
    setState('confirming')
  }

  // Handle confirmation
  const handleConfirm = (item: { value: string }) => {
    if (item.value === 'confirm') {
      setState('creating-release')
    } else if (item.value === 'back') {
      setState('selecting-tag')
      setSelectedTag(null)
      setChangelog('')
    }
  }

  // Step 4: Create release (auto-publishes to marketplace)
  useEffect(() => {
    if (state !== 'creating-release' || !token || !component || !selectedTag) return

    async function doCreateRelease() {
      try {
        // Extract version from tag (remove 'v' prefix if present)
        const version = selectedTag!.tagName.replace(/^v/, '')

        const result = await createRelease(token!, component!.id, {
          version,
          githubTag: selectedTag!.tagName,
          changelog: changelog || undefined,
          isPrerelease: selectedTag!.isPrerelease,
        })

        setCreatedVersion(result.release.version)
        setState('done')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create release'

        // If it's a duplicate/already exists error, loop back to tag selection
        if (message.toLowerCase().includes('already') || message.toLowerCase().includes('exists')) {
          // Remove the selected tag from the list and go back to selection
          setGithubReleases((prev) => prev.filter((r) => r.tagName !== selectedTag!.tagName))
          setSelectedTag(null)
          setChangelog('')
          setState('loading-releases') // Reload to get fresh list from API
        } else {
          setError(message)
          setState('error')
        }
      }
    }

    doCreateRelease()
  }, [state, token, component, selectedTag, changelog])

  // Exit after done/error
  useEffect(() => {
    if (state === 'done' || state === 'error') {
      const timer = setTimeout(() => exit(), 500)
      return () => clearTimeout(timer)
    }
  }, [state, exit])

  // Render based on state
  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Release
        </Text>
      </Box>

      {/* Error state */}
      {state === 'error' && (
        <Text color="red">{error}</Text>
      )}

      {/* Loading states */}
      {(state === 'checking-auth' || state === 'loading-component' || state === 'loading-releases') && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text>
            {' '}
            {state === 'checking-auth' && 'Checking authentication...'}
            {state === 'loading-component' && `Loading component for ${repoSlug?.owner}/${repoSlug?.repo}...`}
            {state === 'loading-releases' && 'Loading releases...'}
          </Text>
        </Box>
      )}

      {/* Tag selection */}
      {state === 'selecting-tag' && (
        <Box flexDirection="column">
          <Text>
            Component: <Text bold>{component?.title}</Text>
          </Text>
          <Box marginTop={1}>
            <Text>Select a GitHub release to publish:</Text>
          </Box>
          <Box marginTop={1}>
            <SelectInput
              items={githubReleases.map((r) => {
                const prerelease = r.isPrerelease ? ' (pre-release)' : ''
                // Only show name if it's different from the tag
                const showName = r.name && r.name !== r.tagName
                const label = showName
                  ? `${r.tagName}${prerelease} - ${r.name}`
                  : `${r.tagName}${prerelease}`
                return { label, value: r.tagName }
              })}
              onSelect={handleTagSelect}
            />
          </Box>
        </Box>
      )}

      {/* Changelog input */}
      {state === 'entering-changelog' && (
        <Box flexDirection="column">
          <Text>
            Selected: <Text bold>{selectedTag?.tagName}</Text>
          </Text>
          <Box marginTop={1}>
            <Text>Changelog (optional, press Enter to skip):</Text>
          </Box>
          <Box>
            <Text dimColor>{'> '}</Text>
            <TextInput
              value={changelog}
              onChange={setChangelog}
              onSubmit={handleChangelogSubmit}
              placeholder="Describe what's new..."
            />
          </Box>
        </Box>
      )}

      {/* Confirmation */}
      {state === 'confirming' && (
        <Box flexDirection="column">
          <Text>
            Release <Text bold>{selectedTag?.tagName}</Text> for <Text bold>{component?.title}</Text>
          </Text>
          {changelog && (
            <Box marginTop={1}>
              <Text dimColor>Changelog: {changelog}</Text>
            </Box>
          )}
          <Box marginTop={1}>
            <SelectInput
              items={[
                { label: 'Confirm and publish', value: 'confirm' },
                { label: 'Go back', value: 'back' },
              ]}
              onSelect={handleConfirm}
            />
          </Box>
        </Box>
      )}

      {/* Creating release */}
      {state === 'creating-release' && (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Creating and publishing release {selectedTag?.tagName}...</Text>
        </Box>
      )}

      {/* Done */}
      {state === 'done' && (
        <Box flexDirection="column">
          <Text color="green">
            Release v{createdVersion} created and published for {component?.title}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export const releaseCommand = new Command('release')
  .description('Create a new release for your component')
  .action(() => {
    render(<ReleaseUI />)
  })
