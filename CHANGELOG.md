# Changelog

All notable changes to FactorySim will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-10-26

### Added
- **Simple mode** (on by default, switch in the sidebar) — a guided *Build → Run → Compare* workflow for production engineers. Expert tools (code editor, plugins, hierarchy, experiments, parameter sweep, data sync, orders, 3D world) move under a collapsible "Advanced tools" section; nothing is removed.
- **Plain-language results summary** — "Your line produced 408 parts in 8 hours — about 51 per hour", the bottleneck station and what to try, with a link straight to that station in the builder.
- **Essential-elements palette** in Simple mode: Source, Station, Buffer, Conveyor, Inspection, Assembly, Operator, Sink (one click each).
- **Guided empty dashboard** that tells a new user what to do next.
- **Engine verification suite** (`python/tests/test_verification.py`) against exact queueing results: M/M/1 time in system, two-station blocking throughput (B+2)/(B+3), seed reproducibility. See `VERIFICATION.md`.
- **`arrivals_throttled` warning** when arrivals are held back by a full first buffer (previously silent lost demand).
- **Self-contained Windows Python** bundled in the installer (`scripts/prepare-python-runtime.py`) — end users no longer need Python installed.

### Fixed
- **Multi-replication results were inflated**: in-flight products of replication *k* were counted as completions of replication *k+1*. Replications are now also reproducible run-to-run.
- **Throughput and cycle time counted parts created after warm-up instead of parts leaving after warm-up**, undercounting throughput in congested lines.
- **Long runs hung** (O(n²) cycle-time statistics); a 100,000 s run went from >10 min to ~17 s.
- **Replication seeds overlapped** between adjacent seeds; `seed = 0` silently became 42.
- **Throughput card always showed "+12%"** (hard-coded value).
- Bottleneck panel captions contradicted their own thresholds.
- OEE, throughput and waterfall charts overflowed their cards; unreadable loss labels; "−-0.0%" labels.
- Builder toolbar wrapped into four rows; dashboard header controls wrapped and clipped.
- `npm run build` failed on 8 TypeScript errors; one frontend test suite never ran (circular import between logger and app store).
- Installer shipped the developer's Python venv (worked only on PCs with the same Python at the same path), twice; installer size 319 MB → 196 MB.

### Changed
- Bundled IBM Plex fonts locally (no Google Fonts request; works offline).
- One colour palette across tokens and Tailwind classes; readable sidebar contrast.
- Five export buttons merged into one Export menu; run settings grouped.
- Packaging config consolidated into `electron-builder.yml`; Windows installer builds from any OS.

## [1.1.0] - 2026-03-06

### Added
- **Parameter Sweep / Sensitivity Analysis** — define parameter ranges on any station, buffer, or source property and batch-run simulations across the grid. Supports one-at-a-time (OAT) and full grid modes. Visualize results with tornado charts, line charts, heatmaps, and data tables.
- **Plugin API for Custom Logic** — extend the simulation engine with Python plugins that hook into lifecycle events (`pre_run`, `post_run`, `on_event`, `custom_kpi`). Plugin manager UI for discovery, enable/disable, and log viewing. Example plugin included.
- **Expanded Documentation** — comprehensive `docs/` folder covering getting started, simulation engine internals, parameter sweep guide, plugin development guide, architecture overview, and FAQ.
- **GitHub Actions Release Workflow** — automated CI/CD pipeline for building and publishing Windows (.exe), macOS (.dmg), and Linux (.AppImage/.deb) installers on tag push.
- **Enhanced Issue Templates** — added model info section to bug report template.

## [1.0.0] - 2026-03-03

### Added
- **Visual Factory Builder** — drag-and-drop interface with stations, buffers, sources, sinks, and connections
- **SimPy Simulation Engine** — discrete event simulation with configurable cycle times, distributions, batch processing, shift schedules, and failure modes
- **Predictive Dashboards** — OEE breakdown, throughput tracking, bottleneck heatmap, utilization charts, WIP trends, and quality/scrap analysis
- **Live Simulation View** — real-time animated factory floor with station states, buffer levels, and product flow visualization
- **What-If Scenarios** — 10 pre-built quick scenarios (machine failure, demand increase, add shift, reduce batch, quality drop, slower cycle, bigger buffers, supply disruption, preventive maintenance, speed boost) plus custom scenario builder with parameter overrides
- **Scenario Comparison** — side-by-side KPI comparison with radar charts and delta analysis
- **Order Management** — production order tracking with auto-generation, priority scheduling, due date predictions, and WIP order support
- **Product Types & Routing** — multi-product support with per-product cycle times and custom routing paths
- **Resource/Operator Modeling** — shared operators with capacity constraints and utilization tracking
- **Extra Nodes** — source, sink, and depalletizer nodes for complex material flow
- **Python Code Export** — full SimPy model code generation with Monaco editor
- **Data Sync** — Excel/CSV import and export with template generation
- **Run Artifacts** — automatic saving of model snapshots, screenshots, KPI summaries, and event logs per simulation run
- **Settings** — configurable simulation duration, warm-up period, random seed, and trace mode
- **Colorblind-accessible utilization chart** with distinct SVG patterns per category
- **Context-aware quick scenarios** — scenarios sorted by relevance to current model
- **Near-full buffer indicators** — amber badge at 90%+ capacity across all zoom levels
- **Warm-up period annotation** on the simulation progress bar
- **Model diff view** in code editor — structural comparison against last run
- **Relative timestamps** in data sync connector display
