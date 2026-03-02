"""
JSON-RPC Server for FactorySim.

Handles communication with Electron via stdin/stdout.
"""

import sys
import json
import traceback
from typing import Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor
import threading
import uuid

from factorysim.engine.simulation import Simulation, SimulationConfig
from factorysim.connectors.csv_connector import CSVConnector
from factorysim.kpi.oee import OEECalculator
from factorysim.kpi.bottleneck import BottleneckDetector


class JsonRpcServer:
    """
    JSON-RPC 2.0 server for handling Electron requests.

    Communicates via stdin/stdout with JSON messages.
    """

    def __init__(self):
        self.methods: Dict[str, Callable] = {}
        self.running_simulations: Dict[str, Simulation] = {}
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.lock = threading.Lock()

        self._register_methods()

    def _register_methods(self) -> None:
        """Register all available RPC methods."""
        self.methods = {
            # Simulation methods
            "run_simulation": self._run_simulation,
            "validate_model": self._validate_model,
            "stop_simulation": self._stop_simulation,
            "get_simulation_status": self._get_simulation_status,

            # Code generation
            "export_to_python": self._export_to_python,

            # Data import
            "import_csv": self._import_csv,
            "import_excel": self._import_excel,

            # KPI methods
            "calculate_kpis": self._calculate_kpis,
            "detect_bottlenecks": self._detect_bottlenecks,

            # Model validation / trace / event log
            "get_entity_traces": self._get_entity_traces,
            "get_event_log": self._get_event_log,

            # Code execution (advanced)
            "execute_code": self._execute_code,

            # System methods
            "ping": self._ping,
            "get_version": self._get_version,
        }

    def _ping(self, params: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "ok", "message": "pong"}

    def _get_version(self, params: Dict[str, Any]) -> Dict[str, Any]:
        from factorysim import __version__
        return {"version": __version__}

    def _run_simulation(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Run a simulation.

        Params:
            model: Factory model definition
            options: Simulation options (duration, seed, replications, trace_mode, etc.)
        """
        model = params.get("model", {})
        options = params.get("options", {})

        run_id = str(uuid.uuid4())[:8]

        config = SimulationConfig(
            duration=options.get("duration", 28800),
            warmup_period=options.get("warmup_period", options.get("warmupPeriod", 0)),
            seed=options.get("seed"),
            replications=options.get("replications", 1),
            trace_mode=options.get("trace_mode", options.get("traceMode", False)),
            confidence_level=options.get("confidence_level", options.get("confidenceLevel", 0.95)),
            stream_events=options.get("stream_events", options.get("streamEvents", False)),
            start_day_of_week=options.get("start_day_of_week", options.get("startDayOfWeek", 0)),
            start_hour=options.get("start_hour", options.get("startHour", 0.0)),
        )

        sim = Simulation(model, config)

        # Set up progress reporting with diagnostics
        # Also collect snapshots at thresholds to include in the result,
        # since IPC progress events are unreliable in the renderer.
        frame_thresholds = [0.10, 0.20, 0.40, 0.60, 0.80]
        diag_snapshots: list = []
        last_diag: dict = {}
        first_activity_captured = False

        def _format_sim_time(seconds: float) -> str:
            h = int(seconds) // 3600
            m = (int(seconds) % 3600) // 60
            s = int(seconds) % 60
            return f"{h:02d}:{m:02d}:{s:02d}"

        def progress_callback(progress: float, message: str):
            nonlocal last_diag, first_activity_captured
            # Gather diagnostic info for the frontend
            station_states = {}
            wip_by_station = {}
            station_utilizations = {}
            station_processed_counts = {}
            for sid, st in sim.stations.items():
                name = st.name or sid
                station_states[name] = st.state.value if hasattr(st, 'state') else "unknown"
                # Count items in process (batch_size if processing, else 0)
                if hasattr(st, 'state') and st.state.value == 'processing':
                    wip_by_station[name] = getattr(st, 'batch_size', 1) or 1
                else:
                    wip_by_station[name] = 0
                # Station utilization = (processing + setup + failed) / total time
                # Matches dashboard metric for consistent bottleneck detection
                now = sim.env.now
                if now > 0:
                    total_proc = getattr(st, 'total_processing_time', 0)
                    total_setup = getattr(st, 'total_setup_time', 0)
                    total_failed = getattr(st, 'total_failed_time', 0)
                    station_utilizations[name] = min(1.0, (total_proc + total_setup + total_failed) / now)
                # Station processed count
                station_processed_counts[name] = getattr(st, 'items_processed', 0)

            buffer_levels = {}
            batch_queue_counts = {}
            # Map input buffer IDs to their batch station's queue count
            batch_buf_extra = {}
            for sid, st in sim.stations.items():
                bq = getattr(st, 'batch_queue_count', 0)
                if getattr(st, 'batch_size', 1) > 1:
                    name = st.name or sid
                    batch_queue_counts[name] = bq
                    # Add batch queue items to the input buffer's reported level
                    if bq > 0 and st.input_buffer is not None:
                        batch_buf_extra[id(st.input_buffer)] = batch_buf_extra.get(id(st.input_buffer), 0) + bq
            for bid, buf in sim.buffers.items():
                # Skip implicit arrival buffers — internal implementation detail
                if bid.startswith('__arrival_'):
                    continue
                name = getattr(buf, 'name', bid) or bid
                level = buf.level() + batch_buf_extra.get(id(buf), 0)
                buffer_levels[name] = {"level": level, "capacity": buf.capacity}

            # Source/sink counters
            source_generated = {}
            total_generated = 0
            for src_id, src in sim.sources.items():
                name = getattr(src, 'name', src_id) or src_id
                count = getattr(src, 'total_generated', 0)
                source_generated[name] = count
                total_generated += count

            sink_exited = {}
            for snk_id, snk in sim.sinks.items():
                name = getattr(snk, 'name', snk_id) or snk_id
                sink_exited[name] = getattr(snk, 'total_exited', 0)

            diagnostics = {
                "activeProducts": len(sim.active_products),
                "completedProducts": len(sim.completed_products),
                "stationStates": station_states,
                "bufferLevels": buffer_levels,
                "simTimeSec": sim.env.now,
                "simTimeFormatted": _format_sim_time(sim.env.now),
                "wipByStation": wip_by_station,
                "totalGenerated": total_generated,
                "sourceGenerated": source_generated,
                "sinkExited": sink_exited,
                "stationUtilizations": station_utilizations,
                "stationProcessedCounts": station_processed_counts,
                "batchQueueCounts": batch_queue_counts,
            }

            last_diag = {
                "progress": progress,
                "currentTime": sim.env.now,
                "diagnostics": diagnostics,
            }

            # Adaptive "first activity" frame — capture when products first appear
            if not first_activity_captured and diagnostics["activeProducts"] > 0:
                first_activity_captured = True
                # Replace the earliest uncaptured threshold to stay within budget
                replaced = False
                for t in frame_thresholds:
                    if not any(s["threshold"] == t for s in diag_snapshots):
                        # Mark this threshold as consumed so it won't fire later
                        diag_snapshots.append({
                            "threshold": t,
                            "currentTime": sim.env.now,
                            "diagnostics": diagnostics,
                            "trigger": "first_activity",
                        })
                        replaced = True
                        break
                if not replaced:
                    # All thresholds already captured; append as extra frame
                    diag_snapshots.append({
                        "threshold": progress,
                        "currentTime": sim.env.now,
                        "diagnostics": diagnostics,
                        "trigger": "first_activity",
                    })

            # Snapshot at fixed thresholds for animation frame capture
            for t in frame_thresholds:
                if progress >= t and not any(s["threshold"] == t for s in diag_snapshots):
                    diag_snapshots.append({
                        "threshold": t,
                        "currentTime": sim.env.now,
                        "diagnostics": diagnostics,
                    })

            self._send_notification("progress", {
                "runId": run_id,
                "progress": progress,
                "currentTime": sim.env.now,
                "message": message,
                "diagnostics": diagnostics,
            })

        sim.progress_callback = progress_callback

        # Set up event streaming if enabled
        if config.stream_events:
            def event_stream_callback(event: Dict[str, Any]):
                self._send_notification("simulation_event", {
                    "runId": run_id,
                    "event": event,
                })
            sim.event_stream_callback = event_stream_callback

        with self.lock:
            self.running_simulations[run_id] = sim

        try:
            result = sim.run(run_id)
            # Always append 100% snapshot from last diagnostics
            if last_diag:
                diag_snapshots.append({
                    "threshold": 1.0,
                    "currentTime": last_diag.get("currentTime", config.duration),
                    "diagnostics": last_diag.get("diagnostics", {}),
                })
            # Fast-sim guard: warn if very few snapshots captured
            if len(diag_snapshots) < 3:
                import logging
                logging.warning(
                    f"[FrameCapture] Only {len(diag_snapshots)} diagnostic snapshots captured "
                    f"(expected 3+). Simulation may have been too fast for threshold callbacks."
                )
            result["diagSnapshots"] = diag_snapshots
            return result
        finally:
            with self.lock:
                if run_id in self.running_simulations:
                    del self.running_simulations[run_id]

    def _validate_model(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate a factory model."""
        model = params.get("model", {})
        errors = []
        warnings = []

        if not model.get("stations"):
            errors.append({
                "path": "stations",
                "message": "Model must have at least one station",
                "code": "MISSING_STATIONS",
            })

        # Validate stations
        for i, station in enumerate(model.get("stations", [])):
            if not station.get("id"):
                errors.append({
                    "path": f"stations[{i}].id",
                    "message": "Station must have an ID",
                    "code": "MISSING_ID",
                })
            if not station.get("name"):
                warnings.append({
                    "path": f"stations[{i}].name",
                    "message": "Station should have a name",
                    "code": "MISSING_NAME",
                })
            cycle_time = station.get("cycle_time") or station.get("cycleTime")
            if not cycle_time:
                errors.append({
                    "path": f"stations[{i}].cycle_time",
                    "message": "Station must have a cycle time",
                    "code": "MISSING_CYCLE_TIME",
                })

        # Validate buffers
        for i, buffer in enumerate(model.get("buffers", [])):
            if not buffer.get("id"):
                errors.append({
                    "path": f"buffers[{i}].id",
                    "message": "Buffer must have an ID",
                    "code": "MISSING_ID",
                })
            if buffer.get("capacity", 0) <= 0:
                errors.append({
                    "path": f"buffers[{i}].capacity",
                    "message": "Buffer capacity must be positive",
                    "code": "INVALID_CAPACITY",
                })

        # Validate connections
        station_ids = {s.get("id") for s in model.get("stations", [])}
        buffer_ids = {b.get("id") for b in model.get("buffers", [])}
        extra_ids = {n.get("id") for n in model.get("extraNodes", [])}
        all_ids = station_ids | buffer_ids | extra_ids

        for i, conn in enumerate(model.get("connections", [])):
            if conn.get("source") not in all_ids:
                errors.append({
                    "path": f"connections[{i}].source",
                    "message": f"Connection source '{conn.get('source')}' not found",
                    "code": "INVALID_CONNECTION",
                })
            if conn.get("target") not in all_ids:
                errors.append({
                    "path": f"connections[{i}].target",
                    "message": f"Connection target '{conn.get('target')}' not found",
                    "code": "INVALID_CONNECTION",
                })

        # Validate products
        for i, product in enumerate(model.get("products", [])):
            if not product.get("routing"):
                warnings.append({
                    "path": f"products[{i}].routing",
                    "message": "Product has no routing defined",
                    "code": "EMPTY_ROUTING",
                })
            else:
                for j, station_id in enumerate(product.get("routing", [])):
                    if station_id not in station_ids:
                        errors.append({
                            "path": f"products[{i}].routing[{j}]",
                            "message": f"Routing references unknown station '{station_id}'",
                            "code": "INVALID_ROUTING",
                        })

        # Check source-sink connectivity
        extra_nodes = model.get("extraNodes", [])
        sources = [n for n in extra_nodes if n.get("type") == "source"]
        sinks = [n for n in extra_nodes if n.get("type") == "sink"]
        if not sources:
            warnings.append({
                "path": "extraNodes",
                "message": "Model has no Source node — parts cannot enter the system",
                "code": "NO_SOURCE",
            })
        if not sinks:
            warnings.append({
                "path": "extraNodes",
                "message": "Model has no Sink node — parts cannot leave the system",
                "code": "NO_SINK",
            })

        # Check for disconnected stations
        connected_station_ids = set()
        for conn in model.get("connections", []):
            connected_station_ids.add(conn.get("source"))
            connected_station_ids.add(conn.get("target"))
        for i, station in enumerate(model.get("stations", [])):
            sid = station.get("id")
            if sid and sid not in connected_station_ids:
                warnings.append({
                    "path": f"stations[{i}]",
                    "message": f"Station '{station.get('name', sid)}' is not connected to anything",
                    "code": "DISCONNECTED_STATION",
                })

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }

    def _stop_simulation(self, params: Dict[str, Any]) -> Dict[str, Any]:
        run_id = params.get("run_id")
        with self.lock:
            sim = self.running_simulations.get(run_id)
            if sim:
                sim.stop()
                return {"status": "stopped", "run_id": run_id}
        return {"status": "not_found", "run_id": run_id}

    def _get_simulation_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        run_id = params.get("run_id")
        with self.lock:
            sim = self.running_simulations.get(run_id)
            if sim:
                return {
                    "status": "running" if sim.is_running else "completed",
                    "progress": sim.env.now / sim.config.duration if sim.config.duration > 0 else 0,
                    "currentTime": sim.env.now,
                    "eventsProcessed": len(sim.event_log),
                }
        return {"status": "not_found", "run_id": run_id}

    def _export_to_python(self, params: Dict[str, Any]) -> str:
        model = params.get("model", {})
        options = params.get("options", {})
        config = SimulationConfig(
            duration=options.get("duration", 28800),
            seed=options.get("seed", None),
        )
        sim = Simulation(model, config)
        return sim.export_to_python()

    def _import_csv(self, params: Dict[str, Any]) -> Dict[str, Any]:
        file_path = params.get("file_path")
        options = params.get("options", {})
        connector = CSVConnector()
        return connector.import_file(file_path, options)

    def _import_excel(self, params: Dict[str, Any]) -> Dict[str, Any]:
        file_path = params.get("file_path")
        options = params.get("options", {})
        connector = CSVConnector()
        return connector.import_excel(file_path, options)

    def _calculate_kpis(self, params: Dict[str, Any]) -> Dict[str, Any]:
        run_id = params.get("run_id")
        with self.lock:
            sim = self.running_simulations.get(run_id)
            if sim:
                return sim._calculate_kpis()
        return {"error": "Simulation not found"}

    def _detect_bottlenecks(self, params: Dict[str, Any]) -> Dict[str, Any]:
        run_id = params.get("run_id")
        with self.lock:
            sim = self.running_simulations.get(run_id)
            if sim:
                detector = BottleneckDetector(sim)
                return detector.detect()
        return {"error": "Simulation not found"}

    def _get_entity_traces(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get entity-level traces for model validation."""
        run_id = params.get("run_id")
        limit = params.get("limit", 100)
        with self.lock:
            sim = self.running_simulations.get(run_id)
            if sim:
                return {"traces": sim.get_entity_traces(limit)}
        return {"error": "Simulation not found"}

    def _get_event_log(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get filtered event log for inspection."""
        run_id = params.get("run_id")
        event_types = params.get("event_types")
        entity_id = params.get("entity_id")
        time_range = params.get("time_range")
        limit = params.get("limit", 500)

        with self.lock:
            sim = self.running_simulations.get(run_id)
            if sim:
                events = sim.get_event_log_filtered(
                    event_types=event_types,
                    entity_id=entity_id,
                    time_range=tuple(time_range) if time_range else None,
                    limit=limit,
                )
                return {"events": events, "total": len(sim.event_log)}
        return {"error": "Simulation not found"}

    def _execute_code(self, params: Dict[str, Any]) -> Dict[str, Any]:
        code = params.get("code", "")
        local_vars: Dict[str, Any] = {
            "Simulation": Simulation,
            "SimulationConfig": SimulationConfig,
        }
        try:
            exec(code, {"__builtins__": {}}, local_vars)
            return {"success": True, "result": local_vars.get("result")}
        except Exception as e:
            return {"success": False, "error": str(e), "traceback": traceback.format_exc()}

    def _send_notification(self, method: str, params: Any) -> None:
        notification = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
        }
        self._send_response(notification)

    def _send_response(self, response: Dict[str, Any]) -> None:
        response_str = json.dumps(response)
        sys.stdout.write(response_str + "\n")
        sys.stdout.flush()

    def handle_request(self, request_str: str) -> Optional[Dict[str, Any]]:
        try:
            request = json.loads(request_str)
        except json.JSONDecodeError as e:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32700, "message": f"Parse error: {e}"},
                "id": None,
            }

        if request.get("jsonrpc") != "2.0":
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32600, "message": "Invalid Request"},
                "id": request.get("id"),
            }

        method = request.get("method")
        params = request.get("params", {})
        request_id = request.get("id")

        if method not in self.methods:
            return {
                "jsonrpc": "2.0",
                "error": {"code": -32601, "message": f"Method not found: {method}"},
                "id": request_id,
            }

        try:
            result = self.methods[method](params)
            return {
                "jsonrpc": "2.0",
                "result": result,
                "id": request_id,
            }
        except Exception as e:
            return {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32603,
                    "message": str(e),
                    "data": traceback.format_exc(),
                },
                "id": request_id,
            }

    def run(self) -> None:
        """Run the JSON-RPC server, reading from stdin."""
        self._send_response({"type": "ready", "version": "1.0.0"})

        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            response = self.handle_request(line)
            if response:
                self._send_response(response)


def main():
    server = JsonRpcServer()
    server.run()


if __name__ == "__main__":
    main()
