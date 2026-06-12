/**
 * `useInput` that no-ops when stdin has no TTY (agents, CI, piped shells).
 *
 * Ink only skips raw-mode setup on a strict `isActive === false`, and its
 * `isRawModeSupported` is `stdin.isTTY` — which is `undefined`, not `false`,
 * when headless. Without the coercion every `useInput` mount crashes the
 * whole command with "Raw mode is not supported".
 */

import { useInput, useStdin } from 'ink'

type InputHandler = Parameters<typeof useInput>[0]

export function useInputWhenInteractive(handler: InputHandler): void {
  const { isRawModeSupported } = useStdin()
  useInput(handler, { isActive: isRawModeSupported === true })
}
