/**
 * Structured logger for Electron main process.
 * Mirrors the renderer logger API but without store dependencies.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function createLogger(context: string) {
  const prefix = (level: LogLevel) => `[${level.toUpperCase()}] [${context}]`;

  return {
    debug(message: string, data?: unknown) {
      if (data !== undefined) console.debug(prefix('debug'), message, data);
      else console.debug(prefix('debug'), message);
    },
    info(message: string, data?: unknown) {
      if (data !== undefined) console.log(prefix('info'), message, data);
      else console.log(prefix('info'), message);
    },
    warn(message: string, data?: unknown) {
      if (data !== undefined) console.warn(prefix('warn'), message, data);
      else console.warn(prefix('warn'), message);
    },
    error(message: string, data?: unknown) {
      if (data !== undefined) console.error(prefix('error'), message, data);
      else console.error(prefix('error'), message);
    },
  };
}
