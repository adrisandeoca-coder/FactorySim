"""
JSON-RPC Server for FactorySim.

Handles communication with Electron via stdin/stdout.
"""

import os
import sys
import json
import traceback
from typing import Dict, Any, Optional, Callable
from concurrent.futures import ThreadPoolExecutor
import threading
import uuid

from factorysim.engine.simulation import Simulation, SimulationConfig
from factorysim.engine.plugin import PluginManager
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

        # Plugin system
        plugins_dir = os.environ.get('FACTORYSIM_PLUGINS_DIR', '')
        if plugins_dir:
            self.plugin_manager = PluginManager(plugins_dir)
            self.plugin_manager.reload_all()
        else:
            self.plugin_manager = None

        self._register_methods()

    def _register_methods(self) -> None:
        """Register all available RPC methods."""
        self.methods = {
            # Simulation methods
            "run_simulation": self._run_simulation,
            "run_experiment": self._run_experiment,
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

            # MQTT connector methods
            "mqtt_connect": self._mqtt_connect,
            "mqtt_disconnect": self._mqtt_disconnect,
            "mqtt_status": self._mqtt_status,
            "mqtt_publish": self._mqtt_publish,
            "mqtt_subscribe": self._mqtt_subscribe,

            # OPC-UA connector methods
            "opcua_connect": self._opcua_connect,
            "opcua_disconnect": self._opcua_disconnect,
            "opcua_status": self._opcua_status,
            "opcua_read": self._opcua_read,
            "opcua_browse": self._opcua_browse,

            # Plugin methods
            "plugin_list": self._plugin_list,
            "plugin_enable": self._plugin_enable,
            "plugin_disable": self._plugin_disable,
            "plugin_logs": self._plugin_logs,
            "plugin_reload": self._plugin_reload,

            # ML optimization
            "ml_optimize": self._run_ml_optimize,

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
            warm_start=options.get("warm_start", options.get("warmStart")),
        )

        sim = Simulation(model, config)

        # Fire plugin pre_run hooks
        if self.plugin_manager:
            self.plugin_manager.fire_hook('on_load', sim)
            self.plugin_manager.fire_hook('pre_run', sim)

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
                # Station utilization = processing / total time
                # Matches Station.get_utilization() for consistent metrics
                now = sim.env.now
                if now > 0:
                    total_proc = getattr(st, 'total_processing_time', 0)
                    station_utilizations[name] = min(1.0, total_proc / now)
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

            # Adaptive "first activity" frame — capture when products first appear.
            # Use the actual progress as threshold instead of stealing from fixed
            # thresholds, so that the 10% slot stays accurate.
            if not first_activity_captured and diagnostics["activeProducts"] > 0:
                first_activity_captured = True
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

        # Capture initial t=0 snapshot so very fast sims still have frame data
        diag_snapshots.append({
            "threshold": 0.0,
            "currentTime": 0,
            "diagnostics": {
                "activeProducts": 0,
                "completedProducts": 0,
                "stationStates": {(st.name or sid): "idle" for sid, st in sim.stations.items()},
                "bufferLevels": {
                    (buf.name or bid): {"level": 0, "capacity": buf.capacity}
                    for bid, buf in sim.buffers.items()
                    if not bid.startswith('__arrival_')
                },
                "simTimeSec": 0,
                "simTimeFormatted": "00:00:00",
                "wipByStation": {},
                "totalGenerated": 0,
                "sourceGenerated": {},
                "sinkExited": {},
                "stationUtilizations": {},
                "stationProcessedCounts": {},
                "batchQueueCounts": {},
            },
            "trigger": "initial",
        })

        try:
            result = sim.run(run_id)
            # Always append 100% snapshot from last diagnostics
            if last_diag:
                diag_snapshots.append({
                    "threshold": 1.0,
                    "currentTime": last_diag.get("currentTime", config.duration),
                    "diagnostics": last_diag.get("diagnostics", {}),
                })

            # Backfill any thresholds missed due to fast simulations
            final_diag = last_diag.get("diagnostics", {}) if last_diag else {}
            final_time = last_diag.get("currentTime", config.duration) if last_diag else config.duration
            captured_thresholds = {s["threshold"] for s in diag_snapshots}
            for t in frame_thresholds:
                if t not in captured_thresholds:
                    diag_snapshots.append({
                        "threshold": t,
                        "currentTime": final_time,
                        "diagnostics": final_diag,
                        "trigger": "backfill",
                    })
            # Sort by threshold for consistent ordering
            diag_snapshots.sort(key=lambda s: s["threshold"])

            result["diagSnapshots"] = diag_snapshots

            # Fire plugin post_run hooks and collect custom KPIs
            if self.plugin_manager:
                custom_kpis = {}
                for d in self.plugin_manager.fire_hook('post_run', sim, result):
                    if isinstance(d, dict):
                        custom_kpis.update(d)
                for d in self.plugin_manager.fire_hook('custom_kpi', sim):
                    if isinstance(d, dict):
                        custom_kpis.update(d)
                if custom_kpis:
                    kpis = result.get("kpis", {})
                    kpis["custom"] = custom_kpis
                    result["kpis"] = kpis

            return result
        finally:
            with self.lock:
                if run_id in self.running_simulations:
                    del self.running_simulations[run_id]

    def _run_experiment(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run an experiment (parameter sweep, optimization, or replication)."""
        from factorysim.engine.experiment import (
            ExperimentManager, ExperimentConfig, ParameterRange
        )

        model = params.get("model", {})
        sim_options = params.get("sim_options", {})
        exp_config_raw = params.get("experiment_config", {})

        # Parse parameter ranges
        param_ranges = []
        for p in exp_config_raw.get("parameters", []):
            param_ranges.append(ParameterRange(
                path=p["path"],
                min_val=p.get("minVal", p.get("min", 0)),
                max_val=p.get("maxVal", p.get("max", 100)),
                step=p.get("step"),
                name=p.get("name"),
            ))

        config = ExperimentConfig(
            parameters=param_ranges,
            mode=exp_config_raw.get("mode", "sweep"),
            replications=exp_config_raw.get("replications", 5),
            base_seed=exp_config_raw.get("baseSeed", 42),
            objective=exp_config_raw.get("objective", "throughput"),
            objective_direction=exp_config_raw.get("objectiveDirection", "maximize"),
            warmup_fraction=exp_config_raw.get("warmupFraction", 0.1),
            confidence_level=exp_config_raw.get("confidenceLevel", 0.95),
            population_size=exp_config_raw.get("populationSize", 20),
            generations=exp_config_raw.get("generations", 30),
            mutation_rate=exp_config_raw.get("mutationRate", 0.1),
            crossover_rate=exp_config_raw.get("crossoverRate", 0.7),
        )

        sim_config = {
            "duration": sim_options.get("duration", 28800),
            "warmupTime": sim_options.get("warmupPeriod", sim_options.get("warmupTime", 0)),
        }

        manager = ExperimentManager(model, sim_config, config)

        # Progress callback
        def on_progress(progress: float, message: str):
            if self.event_callback:
                self.event_callback({
                    "type": "experiment_progress",
                    "progress": progress,
                    "message": message,
                })

        manager.progress_callback = on_progress

        result = manager.run()
        return {"success": True, "experiment": result}

    def _run_ml_optimize(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run ML/surrogate-model-based optimization."""
        from factorysim.engine.ml_optimizer import MLOptimizer, MLOptimizerConfig

        model = params.get("model", {})
        sim_options = params.get("sim_options", {})
        ml_config_raw = params.get("ml_config", {})

        # Parse parameter ranges
        parameter_ranges = []
        for p in ml_config_raw.get("parameterRanges", ml_config_raw.get("parameter_ranges", [])):
            parameter_ranges.append({
                "path": p["path"],
                "min": p.get("minVal", p.get("min", 0)),
                "max": p.get("maxVal", p.get("max", 100)),
                "step": p.get("step"),
                "name": p.get("name"),
            })

        config = MLOptimizerConfig(
            iterations=ml_config_raw.get("iterations", 5),
            initial_samples=ml_config_raw.get("initialSamples", ml_config_raw.get("initial_samples", 30)),
            surrogate_candidates=ml_config_raw.get("surrogateCandidates", ml_config_raw.get("surrogate_candidates", 5000)),
            top_k=ml_config_raw.get("topK", ml_config_raw.get("top_k", 5)),
            hidden_layers=ml_config_raw.get("hiddenLayers", ml_config_raw.get("hidden_layers", [64, 32])),
            learning_rate=ml_config_raw.get("learningRate", ml_config_raw.get("learning_rate", 0.001)),
            epochs=ml_config_raw.get("epochs", 200),
            replications=ml_config_raw.get("replications", 1),
            base_seed=ml_config_raw.get("baseSeed", ml_config_raw.get("base_seed", 42)),
            objective=ml_config_raw.get("objective", "throughput"),
            objective_direction=ml_config_raw.get("objectiveDirection", ml_config_raw.get("objective_direction", "maximize")),
        )

        sim_config = {
            "duration": sim_options.get("duration", 28800),
            "warmupTime": sim_options.get("warmupPeriod", sim_options.get("warmupTime", 0)),
        }

        optimizer = MLOptimizer(parameter_ranges)

        # Progress callback
        def on_progress(progress: float, message: str):
            self._send_notification("progress", {
                "type": "ml_optimize_progress",
                "progress": progress,
                "message": message,
            })

        optimizer.progress_callback = on_progress

        result = optimizer.optimize(model, sim_config, config)
        return {"success": True, "optimization": result}

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

    # ============ MQTT Connector Methods ============

    def _mqtt_connect(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Connect to an MQTT broker."""
        broker = params.get("broker", "localhost")
        port = params.get("port", 1883)
        username = params.get("username")
        password = params.get("password")
        client_id = params.get("clientId", "factorysim")
        topics = params.get("topics", ["factory/#"])

        try:
            from ..connectors.mqtt_connector import MQTTConnector, MQTTConfig

            config = MQTTConfig(
                broker=broker,
                port=port,
                username=username,
                password=password,
                client_id=client_id,
                topics=topics,
            )
            self._mqtt = MQTTConnector(config)
            result = self._mqtt.connect()

            if result.get("success"):
                return {
                    "status": "connected",
                    "broker": broker,
                    "port": port,
                    "topics": topics,
                }
            else:
                return {
                    "status": "error",
                    "error": result.get("error", "Connection failed"),
                }
        except ImportError as e:
            return {"status": "error", "error": f"MQTT library not available: {e}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def _mqtt_disconnect(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Disconnect from MQTT broker."""
        if hasattr(self, '_mqtt') and self._mqtt:
            self._mqtt.disconnect()
            self._mqtt = None
        return {"status": "disconnected"}

    def _mqtt_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get MQTT connection status and recent messages."""
        if hasattr(self, '_mqtt') and self._mqtt:
            limit = params.get("limit", 50)
            messages = self._mqtt.get_messages(max_count=limit)
            # Convert MQTTMessage dataclasses to dicts
            msg_dicts = []
            for m in messages:
                msg_dicts.append({
                    "topic": m.topic,
                    "payload": m.payload,
                    "timestamp": m.timestamp.isoformat(),
                    "qos": m.qos,
                })
            # Also include latest messages per topic
            latest = {}
            for topic, m in self._mqtt.last_messages.items():
                latest[topic] = {
                    "topic": m.topic,
                    "payload": m.payload,
                    "timestamp": m.timestamp.isoformat(),
                    "qos": m.qos,
                }
            return {
                "connected": self._mqtt.connected,
                "messageCount": len(msg_dicts),
                "messages": msg_dicts,
                "latestByTopic": latest,
                "broker": self._mqtt.config.broker,
                "port": self._mqtt.config.port,
                "topics": self._mqtt.config.topics,
            }
        return {"connected": False, "messageCount": 0, "messages": [], "latestByTopic": {}}

    def _mqtt_publish(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Publish a message to an MQTT topic."""
        if not hasattr(self, '_mqtt') or not self._mqtt or not self._mqtt.connected:
            return {"status": "error", "error": "Not connected"}

        topic = params.get("topic")
        payload = params.get("payload")
        if not topic:
            return {"status": "error", "error": "Topic is required"}

        try:
            import json as _json
            payload_str = _json.dumps(payload) if isinstance(payload, (dict, list)) else str(payload)
            self._mqtt.client.publish(topic, payload_str, qos=self._mqtt.config.qos)
            return {"status": "published", "topic": topic}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def _mqtt_subscribe(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Subscribe to additional MQTT topics."""
        if not hasattr(self, '_mqtt') or not self._mqtt or not self._mqtt.connected:
            return {"status": "error", "error": "Not connected"}

        topics = params.get("topics", [])
        results = []
        for topic in topics:
            result = self._mqtt.subscribe(topic)
            results.append(result)
            if result.get("success"):
                if topic not in self._mqtt.config.topics:
                    self._mqtt.config.topics.append(topic)
        return {"status": "ok", "results": results}

    # ---- OPC-UA connector methods ----

    def _opcua_connect(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Connect to an OPC-UA server."""
        endpoint = params.get("endpoint", "opc.tcp://localhost:4840")
        username = params.get("username")
        password = params.get("password")
        security_policy = params.get("securityPolicy")

        try:
            from ..connectors.opcua_connector import OPCUAConnector, OPCUAConfig

            config = OPCUAConfig(
                endpoint=endpoint,
                username=username,
                password=password,
                security_policy=security_policy,
            )
            self._opcua = OPCUAConnector(config)
            result = self._opcua.connect()

            if result.get("success"):
                return {
                    "status": "connected",
                    "endpoint": endpoint,
                    "serverInfo": result.get("server_info", {}),
                }
            else:
                return {
                    "status": "error",
                    "error": result.get("error", "Connection failed"),
                }
        except ImportError as e:
            return {"status": "error", "error": f"OPC-UA library not available: {e}"}
        except Exception as e:
            return {"status": "error", "error": str(e)}

    def _opcua_disconnect(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Disconnect from OPC-UA server."""
        if hasattr(self, '_opcua') and self._opcua:
            self._opcua.disconnect()
            self._opcua = None
        return {"status": "disconnected"}

    def _opcua_status(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Get OPC-UA connection status."""
        if hasattr(self, '_opcua') and self._opcua:
            return {
                "connected": self._opcua.connected,
                "endpoint": self._opcua.config.endpoint,
            }
        return {"connected": False}

    def _opcua_read(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Read OPC-UA node value(s)."""
        if not hasattr(self, '_opcua') or not self._opcua or not self._opcua.connected:
            return {"status": "error", "error": "Not connected"}

        node_id = params.get("nodeId")
        node_ids = params.get("nodeIds")

        if node_ids:
            return self._opcua.read_nodes(node_ids)
        elif node_id:
            return self._opcua.read_node(node_id)
        else:
            return {"status": "error", "error": "nodeId or nodeIds is required"}

    def _opcua_browse(self, params: Dict[str, Any]) -> Dict[str, Any]:
        """Browse OPC-UA server namespace."""
        if not hasattr(self, '_opcua') or not self._opcua or not self._opcua.connected:
            return {"status": "error", "error": "Not connected"}

        node_id = params.get("nodeId")
        return self._opcua.browse_node(node_id)

    def _plugin_list(self, params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.plugin_manager:
            return {"plugins": []}
        return {"plugins": self.plugin_manager.discover()}

    def _plugin_enable(self, params: Dict[str, Any]) -> Dict[str, Any]:
        name = params.get("name", "")
        if not self.plugin_manager:
            return {"error": "Plugin system not initialized"}
        self.plugin_manager.enable(name)
        return {"status": "ok", "name": name}

    def _plugin_disable(self, params: Dict[str, Any]) -> Dict[str, Any]:
        name = params.get("name", "")
        if not self.plugin_manager:
            return {"error": "Plugin system not initialized"}
        self.plugin_manager.disable(name)
        return {"status": "ok", "name": name}

    def _plugin_logs(self, params: Dict[str, Any]) -> Dict[str, Any]:
        name = params.get("name", "")
        if not self.plugin_manager:
            return {"logs": []}
        return {"logs": self.plugin_manager.get_logs(name)}

    def _plugin_reload(self, params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.plugin_manager:
            return {"error": "Plugin system not initialized"}
        self.plugin_manager.reload_all()
        return {"status": "ok", "plugins": self.plugin_manager.discover()}

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
