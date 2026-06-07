let installed = false

function isBrokenPipeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'EPIPE'
  )
}

export function installConsolePipeGuard(): void {
  if (installed) return
  installed = true

  for (const stream of [process.stdout, process.stderr]) {
    stream.on('error', (error) => {
      if (!isBrokenPipeError(error)) {
        throw error
      }
    })
  }

  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[method].bind(console)
    console[method] = (...args: unknown[]) => {
      try {
        original(...args)
      } catch (error) {
        if (!isBrokenPipeError(error)) {
          throw error
        }
      }
    }
  }
}

installConsolePipeGuard()
