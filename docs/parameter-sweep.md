# Parameter Sweep / Sensitivity Analysis

The Parameter Sweep feature lets you systematically vary model parameters and observe how KPIs change.

## Configuration

1. Navigate to **Param Sweep** in the sidebar
2. Select an **entity type** (station, buffer, source, etc.)
3. Choose an **entity** and **parameter** to vary
4. Set **min**, **max**, and number of **steps**
5. Add up to 3 parameters for multi-dimensional analysis

## Sweep Modes

### One-at-a-Time (OAT)
Varies one parameter at a time while keeping all others at their midpoint. Best for identifying which parameters have the most impact.

**Runs**: 1 baseline + (steps - 1) x N parameters

### Full Grid
Creates a Cartesian product of all parameter ranges. Best for understanding interactions between parameters.

**Runs**: steps^N (can get large quickly)

## Visualization

### Tornado Chart
Horizontal bars showing the KPI impact of each parameter. Parameters are sorted by impact magnitude. Great for quick sensitivity screening.

### Line Chart
Shows how the target KPI changes across each parameter's range. One line per parameter.

### Heatmap
Available when exactly 2 parameters are defined. Shows a 2D color map of KPI values across the parameter grid. Reveals interaction effects.

### Results Table
Raw data grid with all parameter values and KPI results for each run.

## Tips
- Start with OAT mode to identify the most sensitive parameters
- Use shorter simulation durations for initial exploration
- Full grid with 3+ parameters can take a long time; keep steps low (3-5)
- The target KPI dropdown controls which metric is visualized
