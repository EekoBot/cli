/**
 * .eeko-dev.json — runtime descriptor for a running `eeko dev` server.
 *
 * Written by `eeko dev` once its ports are bound (both the Vite HTTP server
 * and the WebSocket event server walk to a free port when the default is
 * taken, so the actual ports are only known at runtime). Read by `eeko test`
 * to find the WebSocket server. Removed on clean shutdown; a stale file from
 * a crashed server is detected via the recorded pid.
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'

export interface DevDescriptor {
  wsPort: number
  httpPort: number
  pid: number
  startedAt: string
}

export const DEV_DESCRIPTOR_FILENAME = '.eeko-dev.json'

export function writeDevDescriptor(cwd: string, descriptor: DevDescriptor): void {
  const path = join(cwd, DEV_DESCRIPTOR_FILENAME)
  writeFileSync(path, JSON.stringify(descriptor, null, 2) + '\n', 'utf-8')
}

export function removeDevDescriptor(cwd: string): void {
  const path = join(cwd, DEV_DESCRIPTOR_FILENAME)
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {
    // Best-effort: a failed cleanup just leaves a stale file, which readers
    // detect via the pid check.
  }
}

export type DevDescriptorResult =
  | { ok: true; descriptor: DevDescriptor }
  | { ok: false; reason: 'missing' | 'invalid' | 'stale' }

/**
 * Read and validate the descriptor for the given directory. `stale` means the
 * file exists but the recorded process is no longer running.
 */
export function readDevDescriptor(cwd: string = process.cwd()): DevDescriptorResult {
  const path = join(cwd, DEV_DESCRIPTOR_FILENAME)
  if (!existsSync(path)) return { ok: false, reason: 'missing' }

  let parsed: Partial<DevDescriptor>
  try {
    parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<DevDescriptor>
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  if (
    typeof parsed.wsPort !== 'number' ||
    typeof parsed.httpPort !== 'number' ||
    typeof parsed.pid !== 'number' ||
    typeof parsed.startedAt !== 'string'
  ) {
    return { ok: false, reason: 'invalid' }
  }

  if (!isProcessAlive(parsed.pid)) return { ok: false, reason: 'stale' }

  return {
    ok: true,
    descriptor: {
      wsPort: parsed.wsPort,
      httpPort: parsed.httpPort,
      pid: parsed.pid,
      startedAt: parsed.startedAt,
    },
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    // EPERM means the process exists but isn't ours — still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}
