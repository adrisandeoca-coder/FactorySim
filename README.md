# FactorySim

**Desktop Digital Twin for Manufacturing**

A SimPy-based discrete event simulation platform that stays synchronized with your real factory floor.

## Features

- **Visual Factory Builder**: Drag-and-drop interface to create factory models with stations, buffers, and connections
- **SimPy Simulation Engine**: Industry-standard discrete event simulation with configurable parameters
- **Predictive Dashboards**: Real-time OEE, throughput, bottleneck analysis, and KPI tracking
- **What-If Scenarios**: Compare production configurations and test changes without disrupting operations
- **Data Synchronization**: Connect to MES, ERP, IoT sensors, and import from CSV/Excel
- **Python Code Access**: Full scripting environment for advanced users with Monaco editor
- **Role-Based Access**: Four user personas (Operator, Analyst, Engineer, Developer) with tailored interfaces

## Technology Stack

| Component | Technology |
|-----------|------------|
| Desktop Shell | Electron 28+ |
| Frontend | React 18, TypeScript 5 |
| State Management | Zustand |
| Factory Canvas | React Flow |
| Charts | Plotly.js, D3.js |
| Code Editor | Monaco Editor |
| Simulation | Python 3.11+, SimPy 4 |
| Database | SQLite (better-sqlite3) |
| Styling | Tailwind CSS |

## Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **pip** (Python package manager)

## Installation

### 1. Clone or download the project

```bash
cd C:\Users\adris\Desktop\FactorySim
```

### 2. Install Node.js dependencies

```bash
npm install
```

### 3. Install Python dependencies

```bash
cd python
pip install -r requirements.txt
cd ..
```

### 4. Run in development mode

```bash
npm run dev
```

This will start both the React development server and Electron.

### 5. Build for production

```bash
npm run build
npm run package
```

The packaged application will be in the `release/` directory.

## Project Structure

```
FactorySim/
├── electron/               # Electron main process
│   ├── main.ts            # Main entry point
│   ├── preload.ts         # IPC bridge
│   ├── python-bridge.ts   # Python subprocess management
│   └── database.ts        # SQLite database manager
├── src/                   # React frontend
│   ├── components/
│   │   ├── layout/        # App shell, sidebar, header
│   │   ├── factory-builder/  # Visual editor
│   │   ├── dashboards/    # KPI dashboards
│   │   ├── scenarios/     # Scenario management
│   │   ├── code-editor/   # Monaco editor
│   │   └── data-sync/     # Data connectors
│   ├── stores/            # Zustand state management
│   ├── types/             # TypeScript definitions
│   └── styles/            # Tailwind CSS
├── python/                # Python simulation engine
│   ├── factorysim/
│   │   ├── engine/        # SimPy core
│   │   ├── connectors/    # Data connectors
│   │   ├── kpi/           # KPI calculations
│   │   └── api/           # JSON-RPC server
│   └── tests/
├── data/                  # Local data storage
└── resources/             # Static assets
```

## Usage

### For Operators (Dashboard Users)
1. Open the Dashboard to view current KPIs
2. Run pre-built "What If" scenarios
3. Monitor delivery forecasts and bottlenecks

### For Analysts
1. Create custom scenarios in the Scenario Manager
2. Compare multiple scenarios side-by-side
3. Export reports for stakeholder meetings

### For Engineers
1. Use the Factory Builder to configure model parameters
2. Import data from CSV/Excel files
3. Validate model accuracy against real KPIs

### For Developers
1. Access the Code Editor for full SimPy scripting
2. Create custom modules and extend the simulation
3. Configure data connectors for MES/IoT integration

## Key Concepts

### Stations
Processing workstations with configurable:
- Cycle time (constant, normal, exponential, triangular, Weibull)
- Setup time between product types
- MTBF/MTTR for reliability modeling
- Scrap rate for quality

### Buffers
Inter-station queues with:
- Capacity limits
- Queue discipline (FIFO, LIFO, Priority)
- Blocking/starving behavior

### Products
Items flowing through the factory with:
- Routing (sequence of stations)
- Arrival rate (for source generation)
- Priority levels
- Due dates

### KPIs
- **OEE**: Availability × Performance × Quality
- **Throughput**: Units per hour
- **Cycle Time**: End-to-end production time
- **WIP**: Work in progress levels
- **Bottleneck Score**: Utilization-based constraint identification

## Data Connectors

| Connector | Protocol | Use Case |
|-----------|----------|----------|
| CSV/Excel | File Import | Historical data, manual parameters |
| MES | REST API | Production orders, cycle times |
| MQTT | IoT | Real-time sensor data |
| OPC-UA | Industrial | Machine status, PLC data |

## Configuration

### Simulation Defaults
Edit in Settings or programmatically:
- Duration: 8 hours (28800 seconds)
- Warmup period: 0 seconds
- Replications: 1
- Random seed: undefined (random)

### Database Location
- Windows: `%APPDATA%/factorysim/factorysim.db`
- macOS: `~/Library/Application Support/factorysim/factorysim.db`
- Linux: `~/.config/factorysim/factorysim.db`

## API Reference

### Python Simulation API

```python
from factorysim import Simulation, SimulationConfig

# Create simulation
config = SimulationConfig(
    duration=28800,  # 8 hours
    seed=42,
)

sim = Simulation(model_dict, config)
result = sim.run()

print(f"OEE: {result['kpis']['oee']['overall']:.1%}")
print(f"Throughput: {result['kpis']['throughput']['total']} units")
```

### JSON-RPC Methods

| Method | Description |
|--------|-------------|
| `run_simulation` | Run simulation with model and options |
| `validate_model` | Validate model structure |
| `stop_simulation` | Stop running simulation |
| `export_to_python` | Generate Python code from model |
| `import_csv` | Import data from CSV file |
| `calculate_kpis` | Calculate KPIs from results |
| `detect_bottlenecks` | Identify production bottlenecks |

## License

MIT License - See LICENSE file for details.

## Support

For issues and feature requests, please visit the project repository.
