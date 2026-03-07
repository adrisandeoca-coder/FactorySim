# Getting Started with FactorySim

## Installation

### Prerequisites
- **Node.js 18+** and npm
- **Python 3.11+** with pip
- **Git**

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/adrisandeoca-coder/FactorySim.git
cd FactorySim

# 2. Install Node.js dependencies
npm install

# 3. Set up Python environment
cd python
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cd ..

# 4. Start in development mode
npm run dev
```

## Your First Model

1. **Open the Factory Builder** from the sidebar
2. **Add a Source** node — this generates parts entering your factory
3. **Add Stations** — these represent work centers with cycle times
4. **Add Buffers** between stations — these are queues/storage areas
5. **Add a Sink** — this collects finished products
6. **Connect nodes** by dragging from output handles to input handles
7. **Add a Product** with a routing through your stations

## Running a Simulation

1. Navigate to the **Dashboard**
2. Click **Run Simulation**
3. View real-time KPIs: OEE, throughput, utilization, WIP

## Key Pages

| Page | Purpose |
|------|---------|
| Dashboard | Run simulations and view KPI results |
| Factory Builder | Visual drag-and-drop model editor |
| Scenarios | Create what-if comparisons |
| Orders | Manage production orders and delivery predictions |
| Code Editor | Write custom SimPy Python code |
| Data Sync | Import CSV/Excel data, configure connectors |
| Param Sweep | Sensitivity analysis across parameter ranges |
| Plugins | Extend simulation with custom Python logic |
| Settings | Configure simulation defaults and preferences |

## Building for Production

```bash
npm run build
npm run package
```

The packaged installer will be in the `release/` directory.
