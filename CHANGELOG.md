# Changelog

All notable changes to FactorySim will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
