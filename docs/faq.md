# FAQ

## General

**Q: What simulation engine does FactorySim use?**
SimPy 4, a process-based discrete event simulation framework for Python.

**Q: Can I use FactorySim without Python?**
No. The simulation engine requires Python 3.11+. The UI is built with Electron/React but delegates all simulation work to the Python backend.

**Q: Where is my data stored?**
Models and scenarios are stored in an SQLite database at:
- Windows: `%APPDATA%/factorysim/factorysim.db`
- macOS: `~/Library/Application Support/factorysim/factorysim.db`
- Linux: `~/.config/factorysim/factorysim.db`

Simulation run artifacts (screenshots, event logs) are saved to a `runs/` subfolder in the same directory.

## Simulation

**Q: Why is my simulation producing zero throughput?**
Common causes:
- No Source node connected to the line
- No Sink node to collect finished products
- Products have no routing defined
- All stations are blocked due to full buffers (increase buffer capacity)

**Q: What does OEE measure?**
OEE = Availability x Performance x Quality. It measures how effectively a station is used. 100% means the station is always running at ideal speed with no defects.

**Q: How do replications work?**
Each replication runs the simulation with a different random seed. The results show confidence intervals for KPIs. More replications = narrower confidence intervals.

## Troubleshooting

**Q: The app won't start / Python bridge fails**
- Ensure Python 3.11+ is installed and accessible
- Check that `python/venv` exists with dependencies installed
- On Windows, try running `python/venv/Scripts/activate` then `pip install -r python/requirements.txt`

**Q: Changes to electron/ files aren't reflected**
Run `npx tsc -p tsconfig.electron.json` and restart the app. Vite hot-reload only covers `src/` files.

**Q: Hot reload isn't working reliably**
This is a known issue with Vite in Electron. After making changes, restart the full app with `npm run dev` to ensure the latest code is loaded.
