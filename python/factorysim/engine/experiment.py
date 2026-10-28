"""
Experiment Manager — parameter sweeps, optimization, and statistical replications.

Supports:
  - Parameter sweeps: enumerate all combinations of parameter ranges
  - Optimization: genetic algorithm to find optimal parameter values
  - Replications: run same config N times with different seeds
  - Warm-up detection: automatic steady-state detection
  - Confidence intervals: statistical analysis across replications
"""

from typing import Dict, Any, Optional, List, Tuple, Callable
from dataclasses import dataclass, field
from itertools import product as cartesian_product
import math
import copy
import time as time_module

import numpy as np


@dataclass
class ParameterRange:
    """A parameter to sweep or optimize."""
    path: str          # dot-notation path, e.g. "stations.0.cycleTime.parameters.value"
    min_val: float
    max_val: float
    step: Optional[float] = None  # for sweep; None = continuous (optimization only)
    name: Optional[str] = None    # display name

    def sweep_values(self) -> List[float]:
        """Generate discrete sweep values."""
        if self.step and self.step > 0:
            vals = []
            v = self.min_val
            while v <= self.max_val + 1e-9:
                vals.append(round(v, 10))
                v += self.step
            return vals
        # Default: 5 steps
        return [round(self.min_val + i * (self.max_val - self.min_val) / 4, 6)
                for i in range(5)]


@dataclass
class ExperimentConfig:
    """Configuration for an experiment run."""
    parameters: List[ParameterRange]
    mode: str = "sweep"           # "sweep", "optimize", "replicate"
    replications: int = 5         # per parameter combination
    base_seed: int = 42
    objective: str = "throughput"  # KPI to optimize: throughput, oee, cost, cycle_time
    objective_direction: str = "maximize"  # "maximize" or "minimize"
    warmup_fraction: float = 0.1  # fraction of duration to discard as warmup
    confidence_level: float = 0.95
    # Genetic algorithm settings
    population_size: int = 20
    generations: int = 30
    mutation_rate: float = 0.1
    crossover_rate: float = 0.7


@dataclass
class ReplicationResult:
    """Result of a single simulation replication."""
    seed: int
    kpis: Dict[str, Any]
    duration_seconds: float


@dataclass
class ExperimentResult:
    """Result of a parameter combination."""
    parameters: Dict[str, float]
    replications: List[ReplicationResult]
    mean_objective: float
    std_objective: float
    ci_lower: float
    ci_upper: float
    all_kpis: Dict[str, Any]  # aggregated KPIs


def _get_nested(obj: Any, path: str) -> Any:
    """Get a value from a nested dict using dot notation."""
    parts = path.split(".")
    current = obj
    for part in parts:
        if isinstance(current, (list, tuple)):
            current = current[int(part)]
        elif isinstance(current, dict):
            current = current[part]
        else:
            current = getattr(current, part)
    return current


def _set_nested(obj: Any, path: str, value: Any) -> None:
    """Set a value in a nested dict using dot notation."""
    parts = path.split(".")
    current = obj
    for part in parts[:-1]:
        if isinstance(current, (list, tuple)):
            current = current[int(part)]
        elif isinstance(current, dict):
            current = current[part]
        else:
            current = getattr(current, part)
    last = parts[-1]
    if isinstance(current, dict):
        current[last] = value
    elif isinstance(current, (list, tuple)):
        current[int(last)] = value
    else:
        setattr(current, last, value)


def _extract_objective(kpis: Dict[str, Any], objective: str) -> float:
    """Extract the objective value from KPIs."""
    if objective == "throughput":
        return kpis.get("throughput", {}).get("total", 0)
    elif objective == "oee":
        return kpis.get("oee", {}).get("overall", 0)
    elif objective == "cost":
        cost = kpis.get("cost", {})
        return cost.get("costPerUnit", float("inf")) if cost else float("inf")
    elif objective == "cycle_time":
        return kpis.get("cycle_time", {}).get("mean", float("inf"))
    elif objective == "energy":
        energy = kpis.get("energy", {})
        return energy.get("energyPerUnit", float("inf")) if energy else float("inf")
    return 0


def _t_critical(df: int, confidence: float) -> float:
    """Approximate t-critical value for confidence intervals.

    Uses a simple approximation for the inverse t-distribution.
    """
    # Common values
    alpha = 1 - confidence
    if df <= 0:
        return 2.0
    if df == 1:
        return {0.90: 6.314, 0.95: 12.706, 0.99: 63.657}.get(confidence, 12.706)
    if df == 2:
        return {0.90: 2.920, 0.95: 4.303, 0.99: 9.925}.get(confidence, 4.303)

    # Approximation for larger df
    z = {0.90: 1.645, 0.95: 1.960, 0.99: 2.576}.get(confidence, 1.960)
    g1 = 1 / (4 * df)
    return z * (1 + g1)


def detect_warmup(timeseries: List[float], fraction: float = 0.1) -> int:
    """Detect warmup period using the Welch method (simplified).

    Returns the index after which the system is considered in steady state.
    """
    n = len(timeseries)
    if n < 20:
        return int(n * fraction)

    # Use moving average to smooth, then find where variance stabilizes
    window = max(5, n // 20)
    smoothed = []
    for i in range(n - window + 1):
        smoothed.append(sum(timeseries[i:i + window]) / window)

    if len(smoothed) < 10:
        return int(n * fraction)

    # Find the point where the running mean stops trending
    half = len(smoothed) // 2
    first_half_mean = sum(smoothed[:half]) / half
    second_half_mean = sum(smoothed[half:]) / (len(smoothed) - half)

    # If means are similar, warmup is short
    if abs(first_half_mean - second_half_mean) < 0.05 * max(abs(first_half_mean), 1):
        return int(n * 0.05)  # minimal warmup

    # Otherwise use the configured fraction
    return int(n * fraction)


class ExperimentManager:
    """
    Manages experiment execution: parameter sweeps, optimization, and replications.
    """

    def __init__(self, base_model: Dict[str, Any], sim_config: Dict[str, Any],
                 experiment_config: ExperimentConfig):
        self.base_model = base_model
        self.sim_config = sim_config
        self.config = experiment_config
        self.results: List[ExperimentResult] = []
        self.best_result: Optional[ExperimentResult] = None
        self.progress_callback: Optional[Callable[[float, str], None]] = None
        self._cancelled = False

    def cancel(self):
        self._cancelled = True

    def run(self) -> Dict[str, Any]:
        """Run the experiment and return results."""
        if self.config.mode == "sweep":
            return self._run_sweep()
        elif self.config.mode == "optimize":
            return self._run_optimize()
        elif self.config.mode == "replicate":
            return self._run_replicate()
        else:
            raise ValueError(f"Unknown experiment mode: {self.config.mode}")

    def _run_single(self, model: Dict[str, Any], seed: int) -> ReplicationResult:
        """Run a single simulation with given model and seed."""
        from factorysim.engine.simulation import Simulation, SimulationConfig

        config = SimulationConfig(
            duration=self.sim_config.get("duration", 3600 * 8),
            seed=seed,
            warmup_time=self.sim_config.get("warmupTime", 0),
            stream_events=False,  # no streaming for batch runs
        )

        start = time_module.time()
        sim = Simulation(model, config)
        result = sim.run()
        elapsed = time_module.time() - start

        return ReplicationResult(
            seed=seed,
            kpis=result.get("kpis", {}),
            duration_seconds=elapsed,
        )

    def _run_replications(self, model: Dict[str, Any],
                          params: Dict[str, float]) -> ExperimentResult:
        """Run N replications of a single parameter combination."""
        replications = []
        objectives = []

        for i in range(self.config.replications):
            if self._cancelled:
                break
            seed = self.config.base_seed + i * 1000
            rep = self._run_single(model, seed)
            replications.append(rep)
            obj = _extract_objective(rep.kpis, self.config.objective)
            objectives.append(obj)

        if not objectives:
            return ExperimentResult(
                parameters=params, replications=replications,
                mean_objective=0, std_objective=0,
                ci_lower=0, ci_upper=0, all_kpis={},
            )

        mean_obj = sum(objectives) / len(objectives)
        n = len(objectives)

        if n > 1:
            std_obj = (sum((x - mean_obj) ** 2 for x in objectives) / (n - 1)) ** 0.5
            t_crit = _t_critical(n - 1, self.config.confidence_level)
            margin = t_crit * std_obj / (n ** 0.5)
        else:
            std_obj = 0.0
            margin = 0.0

        # Aggregate KPIs (mean across replications)
        agg_kpis = self._aggregate_kpis([r.kpis for r in replications])

        return ExperimentResult(
            parameters=params,
            replications=replications,
            mean_objective=mean_obj,
            std_objective=std_obj,
            ci_lower=mean_obj - margin,
            ci_upper=mean_obj + margin,
            all_kpis=agg_kpis,
        )

    def _aggregate_kpis(self, kpi_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate KPIs across replications (means of numeric values)."""
        if not kpi_list:
            return {}

        result = {}
        # Extract key metrics
        throughputs = [k.get("throughput", {}).get("total", 0) for k in kpi_list]
        oees = [k.get("oee", {}).get("overall", 0) for k in kpi_list]
        cycle_times = [k.get("cycle_time", {}).get("mean", 0) for k in kpi_list]

        n = len(kpi_list)
        result["throughput"] = {"mean": sum(throughputs) / n, "std": _std(throughputs)}
        result["oee"] = {"mean": sum(oees) / n, "std": _std(oees)}
        result["cycle_time"] = {"mean": sum(cycle_times) / n, "std": _std(cycle_times)}

        costs = [k.get("cost", {}).get("totalCost", 0) for k in kpi_list if k.get("cost")]
        if costs:
            result["cost"] = {"mean": sum(costs) / len(costs), "std": _std(costs)}

        return result

    def _apply_params(self, params: Dict[str, float]) -> Dict[str, Any]:
        """Apply parameter values to a copy of the base model."""
        model = copy.deepcopy(self.base_model)
        for path, value in params.items():
            try:
                _set_nested(model, path, value)
            except (KeyError, IndexError, TypeError):
                pass  # skip invalid paths
        return model

    def _run_sweep(self) -> Dict[str, Any]:
        """Run a full parameter sweep."""
        param_values = []
        param_names = []
        for p in self.config.parameters:
            param_values.append(p.sweep_values())
            param_names.append(p.path)

        combinations = list(cartesian_product(*param_values))
        total = len(combinations)

        for i, combo in enumerate(combinations):
            if self._cancelled:
                break

            params = dict(zip(param_names, combo))
            model = self._apply_params(params)

            if self.progress_callback:
                self.progress_callback(
                    (i + 1) / total,
                    f"Sweep {i + 1}/{total}: {params}"
                )

            exp_result = self._run_replications(model, params)
            self.results.append(exp_result)

            if (self.best_result is None or
                (self.config.objective_direction == "maximize" and
                 exp_result.mean_objective > self.best_result.mean_objective) or
                (self.config.objective_direction == "minimize" and
                 exp_result.mean_objective < self.best_result.mean_objective)):
                self.best_result = exp_result

        return self._format_results()

    def _run_optimize(self) -> Dict[str, Any]:
        """Run genetic algorithm optimization."""
        rng = np.random.default_rng(self.config.base_seed)
        params = self.config.parameters
        pop_size = self.config.population_size
        n_params = len(params)

        # Initialize population (normalized 0-1)
        population = rng.random((pop_size, n_params))
        best_fitness = float("-inf") if self.config.objective_direction == "maximize" else float("inf")
        best_individual = None
        total_evals = self.config.generations * pop_size

        for gen in range(self.config.generations):
            if self._cancelled:
                break

            fitness_scores = []
            for i, individual in enumerate(population):
                if self._cancelled:
                    break

                # Decode parameters
                decoded = {}
                for j, p in enumerate(params):
                    val = p.min_val + individual[j] * (p.max_val - p.min_val)
                    if p.step:
                        val = round(val / p.step) * p.step
                    decoded[p.path] = round(val, 6)

                model = self._apply_params(decoded)
                exp_result = self._run_replications(model, decoded)
                self.results.append(exp_result)
                fitness_scores.append(exp_result.mean_objective)

                eval_num = gen * pop_size + i + 1
                if self.progress_callback:
                    self.progress_callback(
                        eval_num / total_evals,
                        f"Gen {gen + 1}/{self.config.generations}, "
                        f"Eval {i + 1}/{pop_size}, "
                        f"Best: {best_fitness:.4f}"
                    )

                is_better = (
                    (self.config.objective_direction == "maximize" and
                     exp_result.mean_objective > best_fitness) or
                    (self.config.objective_direction == "minimize" and
                     exp_result.mean_objective < best_fitness)
                )
                if is_better:
                    best_fitness = exp_result.mean_objective
                    best_individual = individual.copy()
                    self.best_result = exp_result

            if self._cancelled:
                break

            # Selection (tournament)
            new_pop = []
            for _ in range(pop_size):
                i1, i2 = rng.integers(0, pop_size, 2)
                if self.config.objective_direction == "maximize":
                    winner = i1 if fitness_scores[i1] >= fitness_scores[i2] else i2
                else:
                    winner = i1 if fitness_scores[i1] <= fitness_scores[i2] else i2
                new_pop.append(population[winner].copy())

            # Crossover
            for i in range(0, pop_size - 1, 2):
                if rng.random() < self.config.crossover_rate:
                    cx_point = rng.integers(1, n_params) if n_params > 1 else 1
                    new_pop[i][cx_point:], new_pop[i + 1][cx_point:] = (
                        new_pop[i + 1][cx_point:].copy(),
                        new_pop[i][cx_point:].copy(),
                    )

            # Mutation
            for i in range(pop_size):
                for j in range(n_params):
                    if rng.random() < self.config.mutation_rate:
                        new_pop[i][j] = np.clip(
                            new_pop[i][j] + rng.normal(0, 0.1), 0, 1
                        )

            # Elitism: keep best individual
            if best_individual is not None:
                new_pop[0] = best_individual.copy()

            population = np.array(new_pop)

        return self._format_results()

    def _run_replicate(self) -> Dict[str, Any]:
        """Run replications of the base model without parameter changes."""
        exp_result = self._run_replications(self.base_model, {})
        self.results.append(exp_result)
        self.best_result = exp_result
        return self._format_results()

    def _format_results(self) -> Dict[str, Any]:
        """Format results for the frontend."""
        formatted_results = []
        for r in self.results:
            formatted_results.append({
                "parameters": r.parameters,
                "meanObjective": round(r.mean_objective, 4),
                "stdObjective": round(r.std_objective, 4),
                "ciLower": round(r.ci_lower, 4),
                "ciUpper": round(r.ci_upper, 4),
                "replications": len(r.replications),
                "kpis": r.all_kpis,
            })

        best = None
        if self.best_result:
            best = {
                "parameters": self.best_result.parameters,
                "meanObjective": round(self.best_result.mean_objective, 4),
                "ciLower": round(self.best_result.ci_lower, 4),
                "ciUpper": round(self.best_result.ci_upper, 4),
            }

        return {
            "mode": self.config.mode,
            "objective": self.config.objective,
            "direction": self.config.objective_direction,
            "totalCombinations": len(self.results),
            "replicationsPerCombo": self.config.replications,
            "confidenceLevel": self.config.confidence_level,
            "results": formatted_results,
            "best": best,
        }


def _std(values: List[float]) -> float:
    """Standard deviation of a list."""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return (sum((x - mean) ** 2 for x in values) / (len(values) - 1)) ** 0.5
