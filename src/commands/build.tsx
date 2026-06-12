/**
 * eeko build — validate the widget project locally.
 *
 * File presence + manifest schema + interactions structure + contract lint,
 * via the shared core in utils/validate-project (same @eeko/sdk primitives
 * the platform uses; nexus-api stays authoritative on commit).
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

export const buildCommand = new Command('build')
  .description('Validate the widget: files, manifest schema, interactions, contract lint')
  .option('--json', 'Emit the structured validation report on stdout')
  .action(async (opts: { json?: boolean }) => {
    if (opts.json) {
      const report = await validateProject()
      process.stdout.write(JSON.stringify(report, null, 2) + '\n')
      process.exit(report.ok ? 0 : 1)
    }
    render(<BuildUI />)
  })
