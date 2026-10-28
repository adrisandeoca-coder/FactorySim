// Mock window.factorySim for tests that touch Electron IPC
Object.defineProperty(window, 'factorySim', {
  value: undefined,
  writable: true,
});
