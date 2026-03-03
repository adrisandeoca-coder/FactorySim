# Contributing to FactorySim

Thanks for your interest in contributing! This guide will help you get set up and submit great pull requests.

## Prerequisites

- **Node.js 20+** and npm
- **Python 3.11+** with pip
- **Git**

## Development Setup

```bash
# Clone the repo
git clone https://github.com/adrisandeoca-coder/FactorySim.git
cd FactorySim

# Install JS dependencies
npm install

# Set up Python environment
cd python
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Run in development mode
npm run dev
```

## Project Structure

```
FactorySim/
├── electron/          # Electron main process (TypeScript)
│   ├── main.ts        # App entry point
│   ├── python-bridge.ts   # JSON-RPC bridge to Python
│   ├── ipc-handlers.ts    # IPC handler registration
│   └── database.ts        # SQLite database manager
├── src/               # React renderer (TypeScript)
│   ├── components/    # React components
│   ├── stores/        # Zustand state stores
│   ├── hooks/         # Custom React hooks
│   ├── services/      # Service layer
│   └── types/         # TypeScript type definitions
├── python/            # Simulation engine
│   └── factorysim/
│       ├── engine/    # SimPy simulation core
│       ├── kpi/       # KPI calculators (OEE, bottleneck)
│       └── api/       # JSON-RPC server
└── .github/           # CI workflows and issue templates
```

## Running Tests

```bash
# TypeScript tests
npm test

# Python tests
npm run test:python

# Linting
npm run lint

# Type checking
npm run typecheck
```

## Making Changes

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature main
   ```

2. **Make your changes** — keep PRs focused on a single concern.

3. **Run checks** before submitting:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```

4. **Open a PR** against `main` with a clear description of what and why.

## Code Style

- **TypeScript**: Strict mode enabled. Follow existing patterns.
- **Python**: Standard PEP 8 conventions.
- **Commits**: Use clear, imperative-mood messages (e.g., "Add station validation").

## Key Architecture Notes

### Snake-to-Camel Key Transform

The Python engine returns `snake_case` keys. `electron/ipc-handlers.ts` transforms them to `camelCase` via `transformKeys()` with `KEY_ALIASES`:

- `processing` becomes `busy` (via alias)
- `off_shift` becomes `offShift` (via automatic conversion)

**Rule**: TypeScript types in `src/types/index.ts` must match the **post-transform** names, not the Python originals.

### Electron Rebuild

Changes to `electron/` files require a TypeScript recompile and app restart:

```bash
npx tsc -p tsconfig.electron.json
# Then restart the Electron app
```

Vite hot-reload only covers `src/` (the React renderer).

## Reporting Issues

Please use the GitHub issue templates:
- **Bug Report** — for things that are broken
- **Feature Request** — for new ideas

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
