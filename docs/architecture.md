# Architecture

## System Overview

```
┌────────────────────────────────────┐
│         Electron Main Process      │
│  ┌──────────┐  ┌────────────────┐  │
│  │  IPC      │  │  Python Bridge │──────► Python SimPy Engine
│  │  Handlers │  │  (JSON-RPC)    │  │     (stdin/stdout)
│  └──────────┘  └────────────────┘  │
│  ┌──────────┐  ┌────────────────┐  │
│  │  SQLite   │  │  Preload       │  │
│  │  Database │  │  (contextBridge)│ │
│  └──────────┘  └────────────────┘  │
└────────────────────────────────────┘
         │              │
         ▼              ▼
┌────────────────────────────────────┐
│        React Renderer Process      │
│  ┌──────────┐  ┌────────────────┐  │
│  │  Zustand  │  │  React Flow    │  │
│  │  Stores   │  │  (Canvas)      │  │
│  └──────────┘  └────────────────┘  │
│  ┌──────────┐  ┌────────────────┐  │
│  │  Plotly   │  │  Monaco Editor │  │
│  │  Charts   │  │  (Code)        │  │
│  └──────────┘  └────────────────┘  │
└────────────────────────────────────┘
```

## Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop shell | Electron 28+ | Native app container |
| Frontend | React 18 + TypeScript 5 | UI components |
| State | Zustand | Reactive state management |
| Canvas | React Flow | Factory visual editor |
| Charts | Plotly.js | KPI visualization |
| Code editor | Monaco Editor | Python scripting |
| Simulation | Python 3.11 + SimPy 4 | Discrete event simulation |
| Database | SQLite (better-sqlite3) | Model/scenario storage |
| Styling | Tailwind CSS | Utility-first CSS |

## Communication Flow

1. **User action** in React triggers a Zustand store action
2. Store calls `window.factorySim.*` (exposed via Electron preload)
3. Preload bridge sends IPC message to main process
4. Main process IPC handler calls PythonBridge JSON-RPC
5. Python server processes request and returns result
6. Result flows back through the stack to the React component

## Key Patterns

### Snake-to-Camel Transform
Python returns `snake_case` keys. `ipc-handlers.ts` transforms them to `camelCase` via `transformKeys()`. TypeScript types must match post-transform names.

### Plugin System
Plugins are Python files in `userData/plugins/`. The `PluginManager` discovers and loads them. Hooks fire at simulation lifecycle points: `pre_run`, `post_run`, `on_event`, `custom_kpi`.

### Scenario Overrides
The `applyOverrides()` function in `scenarioModelBuilder.ts` creates modified model clones for what-if analysis. Parameter sweeps reuse this mechanism.
