/**
 * eeko build — validate the artifact in the current directory locally.
 *
 * Widget dirs: file presence + manifest schema + interactions structure +
 * contract lint, via the shared core in utils/validate-project (same @eeko/sdk
 * primitives the platform uses).
 *
 * Automation dirs: parse automation.json and POST it to nexus-api's
 * validate-draft endpoint, printing any field-level issues. nexus-api stays
 * authoritative on commit either way.
 *
 * `--json` emits the structured report on stdout (no UI) — the surface agents
 * iterate against.
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import {
  validateProject,
  CANONICAL_FILES,
  type ProjectValidation,
} from '../utils/validate-project.js'
import {
  validateAutomation,
  type AutomationValidation,
} from '../utils/validate-automation.js'
import { artifactRef, loadEekoConfig } from '../utils/config.js'

function BuildUI() {
  const [report, setReport] = useState<ProjectValidation | null>(null)

  useEffect(() => {
    validateProject().then((result) => {
      setReport(result)
      setTimeout(() => process.exit(result.ok ? 0 : 1), 500)
    })
  }, [])

  if (!report) {
    return (
      <Box padding={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text> Validating…</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Widget Validation
        </Text>
      </Box>

      {CANONICAL_FILES.map((file) => (
        <Box key={file}>
          {report.files.missing.includes(file) ? (
            <Text>
              <Text color="red">✖</Text> {file} <Text dimColor>(missing)</Text>
            </Text>
          ) : (
            <Text>
              <Text color="green">✓</Text> {file}
            </Text>
          )}
        </Box>
      ))}

      {!report.manifest.ok &&
        report.manifest.errors.map((err, i) => (
          <Text key={`m${i}`} color="red">
            ✖ manifest: {err}
          </Text>
        ))}

      {report.interactions && !report.interactions.ok &&
        report.interactions.errors.map((err, i) => (
          <Text key={`i${i}`} color="red">
            ✖ interactions: {err}
          </Text>
        ))}

      {report.lint.errors.map((issue, i) => (
        <Text key={`le${i}`} color="red">
          ✖ {issue.file}: {issue.message} <Text dimColor>[{issue.rule}]</Text>
        </Text>
      ))}

      {report.lint.warnings.map((issue, i) => (
        <Text key={`lw${i}`} color="yellow">
          ⚠ {issue.file}: {issue.message} <Text dimColor>[{issue.rule}]</Text>
        </Text>
      ))}

      <Box marginTop={1}>
        {report.ok ? (
          <Text color="green">✓ Widget is valid</Text>
        ) : (
          <Text color="red">Build validation failed</Text>
        )}
      </Box>
    </Box>
  )
}

function AutomationBuildUI() {
  const [report, setReport] = useState<AutomationValidation | null>(null)

  useEffect(() => {
    validateAutomation().then((result) => {
      setReport(result)
      setTimeout(() => process.exit(result.ok ? 0 : 1), 500)
    })
  }, [])

  if (!report) {
    return (
      <Box padding={1}>
        <Text color="yellow">
          <Spinner type="dots" />
        </Text>
        <Text> Validating automation…</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Automation Validation
        </Text>
      </Box>

      {report.issues.map((issue, i) => (
        <Text key={`a${i}`} color="red">
          ✖ {issue.field ? `${issue.field}: ` : ''}
          {issue.message} <Text dimColor>[{issue.stage}]</Text>
        </Text>
      ))}

      <Box marginTop={1}>
        {report.ok ? (
          <Text color="green">✓ Automation is valid</Text>
        ) : (
          <Text color="red">Automation validation failed</Text>
        )}
      </Box>
    </Box>
  )
}

export const buildCommand = new Command('build')
  .description('Validate the artifact: widget files/manifest/lint, or automation.json')
  .option('--json', 'Emit the structured validation report on stdout')
  .action(async (opts: { json?: boolean }) => {
    const ref = artifactRef(loadEekoConfig() ?? {})

    if (ref?.kind === 'automation') {
      if (opts.json) {
        const report = await validateAutomation()
        process.stdout.write(JSON.stringify(report, null, 2) + '\n')
        process.exit(report.ok ? 0 : 1)
      }
      render(<AutomationBuildUI />)
      return
    }

    if (opts.json) {
      const report = await validateProject()
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
      process.exit(report.ok ? 0 : 1)
    }
    render(<BuildUI />)
  })
