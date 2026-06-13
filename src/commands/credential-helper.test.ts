import { describe, it, expect } from 'vitest'
import { artifactTargetFromPath } from './credential-helper.js'

describe('artifactTargetFromPath', () => {
  it('resolves a widget (uc-) repo path to a componentId', () => {
    expect(artifactTargetFromPath('owner/uc-abc123.git')).toEqual({
      componentId: 'abc123',
    })
  })

  it('resolves an automation (au-) repo path to an automationId', () => {
    expect(artifactTargetFromPath('owner/au-xyz789.git')).toEqual({
      automationId: 'xyz789',
    })
  })

  it('handles paths without a .git suffix', () => {
    expect(artifactTargetFromPath('uc-noext')).toEqual({ componentId: 'noext' })
    expect(artifactTargetFromPath('au-noext')).toEqual({ automationId: 'noext' })
  })

  it('finds the artifact segment anywhere in the path', () => {
    expect(artifactTargetFromPath('/some/nested/path/au-deep.git')).toEqual({
      automationId: 'deep',
    })
  })

  it('returns null for an unrecognized path', () => {
    expect(artifactTargetFromPath('owner/some-other-repo.git')).toBeNull()
  })

  it('returns null for an empty/undefined path', () => {
    expect(artifactTargetFromPath(undefined)).toBeNull()
    expect(artifactTargetFromPath('')).toBeNull()
  })

  it('keeps ids that themselves contain dashes intact', () => {
    expect(artifactTargetFromPath('uc-a-b-c.git')).toEqual({ componentId: 'a-b-c' })
    expect(artifactTargetFromPath('au-a-b-c.git')).toEqual({ automationId: 'a-b-c' })
  })
})
