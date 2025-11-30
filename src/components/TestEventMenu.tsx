/**
 * Interactive Test Event Menu
 *
 * Two-level navigation menu for selecting test events:
 * 1. First level: Select category (Chat, Subscriptions, etc.)
 * 2. Second level: Select specific event within category
 *
 * Navigation:
 * - Arrow keys / j/k to navigate
 * - Enter to select
 * - ESC or q to go back / cancel
 */

import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import {
  TEST_EVENT_CATEGORIES,
  type TestEventCategory,
  type TestEventDefinition,
} from '../test-events/index.js'

interface TestEventMenuProps {
  onSelect: (event: TestEventDefinition) => void
  onCancel: () => void
}

interface SelectItem {
  label: string
  value: string
}

export function TestEventMenu({ onSelect, onCancel }: TestEventMenuProps) {
  const [selectedCategory, setSelectedCategory] = useState<TestEventCategory | null>(null)

  // Handle ESC key to go back
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      if (selectedCategory) {
        setSelectedCategory(null)
      } else {
        onCancel()
      }
    }
  })

  // Category selection view
  if (!selectedCategory) {
    const categoryItems: SelectItem[] = TEST_EVENT_CATEGORIES.map((cat) => ({
      label: `${cat.label} (${cat.events.length})`,
      value: cat.id,
    }))

    const handleCategorySelect = (item: SelectItem) => {
      const category = TEST_EVENT_CATEGORIES.find((c) => c.id === item.value)
      if (category) {
        setSelectedCategory(category)
      }
    }

    return (
      <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
        <Box marginBottom={1}>
          <Text bold color="cyan">
            Select Event Category
          </Text>
        </Box>
        <SelectInput items={categoryItems} onSelect={handleCategorySelect} />
        <Box marginTop={1}>
          <Text dimColor>
            Press <Text color="yellow">Enter</Text> to select, <Text color="yellow">ESC</Text> to
            cancel
          </Text>
        </Box>
      </Box>
    )
  }

  // Event selection view (within selected category)
  const eventItems: SelectItem[] = selectedCategory.events.map((evt) => ({
    label: evt.shortcut ? `[${evt.shortcut}] ${evt.label}` : `    ${evt.label}`,
    value: evt.id,
  }))

  const handleEventSelect = (item: SelectItem) => {
    const event = selectedCategory.events.find((e) => e.id === item.value)
    if (event) {
      onSelect(event)
    }
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {selectedCategory.label}
        </Text>
      </Box>
      <SelectInput items={eventItems} onSelect={handleEventSelect} />
      <Box marginTop={1}>
        <Text dimColor>
          Press <Text color="yellow">Enter</Text> to send, <Text color="yellow">ESC</Text> to go
          back
        </Text>
      </Box>
    </Box>
  )
}
