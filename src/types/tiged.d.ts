declare module 'tiged' {
  interface TigedOptions {
    disableCache?: boolean
    force?: boolean
    verbose?: boolean
    mode?: 'tar' | 'git'
  }

  interface TigedEmitter {
    clone(dest: string): Promise<void>
    on(event: 'info' | 'warn', callback: (info: { message: string }) => void): void
  }

  function tiged(src: string, opts?: TigedOptions): TigedEmitter
  export default tiged
}
