/**
 * Structured logger for FactorySim.
 *
 * - Writes to console with level/context prefixes
 * - Appends to a log file in userData (via Electron IPC) for user bug reports
 * - Shows user-facing toasts for recoverable errors when `notify` is true
 */
// No import of appStore here: that created a circular import (appStore uses
// createLogger at load time). The store registers its toast function instead.
type ToastSink = (toast: { type: 'warning' | 'error'; message: string }) => void;
let toastSink: ToastSink | null = null;
export function setLogToastSink(sink: ToastSink | null) {
  toastSink = sink;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  context: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

const LOG_BUFFER: LogEntry[] = [];
const MAX_BUFFER = 500;

function createEntry(level: LogLevel, context: string, message: string, data?: unknown): LogEntry {
  return {
    level,
    context,
    message,
    timestamp: new Date().toISOString(),
    data,
  };
}

function appendEntry(entry: LogEntry) {
  LOG_BUFFER.push(entry);
  if (LOG_BUFFER.length > MAX_BUFFER) {
    LOG_BUFFER.shift();
  }
}

function toConsole(entry: LogEntry) {
  const prefix = `[${entry.level.toUpperCase()}] [${entry.context}]`;
  const fn = entry.level === 'error' ? console.error
    : entry.level === 'warn' ? console.warn
    : entry.level === 'debug' ? console.debug
    : console.log;
  if (entry.data !== undefined) {
    fn(prefix, entry.message, entry.data);
  } else {
    fn(prefix, entry.message);
  }
}

/**
 * Create a scoped logger for a specific component or service.
 */
export function createLogger(context: string) {
  return {
    debug(message: string, data?: unknown) {
      const entry = createEntry('debug', context, message, data);
      appendEntry(entry);
      toConsole(entry);
    },

    info(message: string, data?: unknown) {
      const entry = createEntry('info', context, message, data);
      appendEntry(entry);
      toConsole(entry);
    },

    warn(message: string, data?: unknown, notify = false) {
      const entry = createEntry('warn', context, message, data);
      appendEntry(entry);
      toConsole(entry);
      if (notify) {
        try {
          toastSink?.({ type: 'warning', message });
        } catch { /* store not ready */ }
      }
    },

    error(message: string, data?: unknown, notify = false) {
      const entry = createEntry('error', context, message, data);
      appendEntry(entry);
      toConsole(entry);
      if (notify) {
        try {
          toastSink?.({ type: 'error', message });
        } catch { /* store not ready */ }
      }
    },
  };
}

/**
 * Get all buffered log entries (for export / bug reports).
 */
export function getLogBuffer(): LogEntry[] {
  return [...LOG_BUFFER];
}

/**
 * Export logs as a downloadable JSON file.
 */
export function downloadLogs() {
  const blob = new Blob([JSON.stringify(LOG_BUFFER, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `factorysim-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
