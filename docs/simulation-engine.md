# Simulation Engine

FactorySim uses [SimPy 4](https://simpy.readthedocs.io/), a process-based discrete event simulation framework in Python.

## Core Concepts

### Stations
Processing work centers. Each station has:
- **Cycle time**: Time to process one unit. Supports distributions: constant, normal, exponential, triangular, Weibull, uniform, lognormal, empirical.
- **Setup time**: Time to switch between product types.
- **MTBF/MTTR**: Mean time between failures / mean time to repair.
- **Scrap rate**: Probability of producing a defective unit.
- **Batch size**: Process multiple items at once.
- **Shifts**: Define working hours and off-shift periods.

### Buffers
Inter-station queues with:
- **Capacity**: Maximum number of items that can wait.
- **Queue discipline**: FIFO, LIFO, or Priority.
- When full, upstream stations are **blocked**.
- When empty, downstream stations are **starved**.

### Products
Items flowing through the factory:
- **Routing**: Ordered sequence of stations to visit.
- **Arrival rate**: How often new products enter the system (via Source nodes).
- **Priority**: For priority-based queue disciplines.

### Extra Nodes
- **Source**: Generates products and feeds them into the line.
- **Sink**: Collects finished products and records throughput.
- **Conveyor**: Time-delayed transport between stations.
- **Assembly**: Combines multiple input parts into one output.
- **Disassembly**: Splits one input into multiple outputs.
- **Splitter / Merge**: Route products to different paths.
- **Palletize / Depalletize**: Batch grouping and ungrouping.
- **Match Buffer**: Synchronize parts by order or batch.

## KPI Calculations

### OEE (Overall Equipment Effectiveness)
- **Availability** = (scheduled - failed - setup) / scheduled
- **Performance** = idealCycleTime x (count / batchSize) / busyTime
- **Quality** = good units / total units
- **OEE** = Availability x Performance x Quality

### Throughput
Total completed products per simulation duration. Tracked hourly and by product type.

### Utilization
Per-station time breakdown: busy, idle, setup, blocked, failed, starved, off-shift, batch wait.

### WIP (Work in Progress)
Sampled periodically during simulation. Tracks total and per-buffer levels.

## Replications
Run multiple replications with different random seeds to get confidence intervals on KPIs. Configure in Settings or simulation options.
