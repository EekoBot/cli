/**
 * eeko build - Validate widget structure
 *
 * Checks for required files and validates field.json schema
 */

import { Command } from 'commander'
import React, { useState, useEffect } from 'react'
import { render, Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import fs from 'fs/promises'
import path from 'path'

interface ValidationResult {
  file: string
  status: 'checking' | 'ok' | 'missing' | 'error'
  message?: string
}

const REQUIRED_FILES = ['index.html', 'style.css', 'script.js', 'field.json']

function BuildUI() {
  const [results, setResults] = useState<ValidationResult[]>(
    REQUIRED_FILES.map((file) => ({ file, status: 'checking' }))
  )
  const [done, setDone] = useState(false)
  const [hasErrors, setHasErrors] = useState(false)

  useEffect(() => {
    async function validate() {
      const newResults: ValidationResult[] = []
      let errors = false

      for (const file of REQUIRED_FILES) {
        try {
          const filePath = path.join(process.cwd(), file)
          await fs.access(filePath)

          // Additional validation for field.json
          if (file === 'field.json') {
            try {
              const content = await fs.readFile(filePath, 'utf-8')
              const json = JSON.parse(content)

              if (!json.fields || !Array.isArray(json.fields)) {
                newResults.push({
                  file,
                  status: 'error',
                  message: 'Missing or invalid "fields" array',
                })
                errors = true
                continue
              }

              newResults.push({ file, status: 'ok' })
            } catch (parseErr) {
              newResults.push({
                file,
                status: 'error',
                message: 'Invalid JSON',
              })
              errors = true
            }
          } else {
            newResults.push({ file, status: 'ok' })
          }
        } catch {
          newResults.push({ file, status: 'missing' })
          errors = true
        }
      }

      setResults(newResults)
      setHasErrors(errors)
      setDone(true)

      setTimeout(() => {
        process.exit(errors ? 1 : 0)
      }, 500)
    }

    validate()
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Eeko Widget Validation
        </Text>
      </Box>

      {results.map((result) => (
        <Box key={result.file}>
          {result.status === 'checking' && (
            <>
              <Text color="yellow">
                <Spinner type="dots" />
              </Text>
              <Text> {result.file}</Text>
            </>
          )}
          {result.status === 'ok' && (
            <Text>
              <Text color="green">✓</Text> {result.file}
            </Text>
          )}
          {result.status === 'missing' && (
            <Text>
              <Text color="red">✖</Text> {result.file}{' '}
              <Text dimColor>(missing)</Text>
            </Text>
          )}
          {result.status === 'error' && (
            <Text>
              <Text color="red">✖</Text> {result.file}{' '}
              <Text color="red">({result.message})</Text>
            </Text>
          )}
        </Box>
      ))}

      {done && (
        <Box marginTop={1}>
          {hasErrors ? (
            <Text color="red">Build validation failed</Text>
          ) : (
            <Text color="green">✓ Widget structure is valid</Text>
          )}
        </Box>
      )}
    </Box>
  )
}

export const buildCommand = new Command('build')
  .description('Validate widget structure')
  .action(() => {
    render(<BuildUI />)
  })
