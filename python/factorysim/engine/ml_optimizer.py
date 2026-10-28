"""
ML/Neural Network Surrogate Model Optimizer for FactorySim.

Uses a numpy-only multi-layer perceptron as a surrogate model to accelerate
parameter optimization. The workflow:
  1. Latin Hypercube Sampling to generate initial training data
  2. Train surrogate on (parameters -> objective) mapping
  3. Use surrogate to rapidly screen thousands of candidates
  4. Validate top candidates with actual simulations
  5. Retrain and repeat for M iterations
"""

from typing import Dict, Any, Optional, List, Tuple, Callable
from dataclasses import dataclass, field
import copy
import time as time_module
import math

import numpy as np


# ---------------------------------------------------------------------------
# Surrogate Model: numpy-only Multi-Layer Perceptron
# ---------------------------------------------------------------------------

class SurrogateModel:
    """A simple multi-layer perceptron implemented with numpy.

    Uses ReLU activations for hidden layers and a linear output layer.
    Trained with mini-batch SGD.
    """

    def __init__(
        self,
        layer_sizes: List[int],
        learning_rate: float = 0.001,
        batch_size: int = 32,
        epochs: int = 200,
        seed: int = 42,
    ):
        """Initialize the surrogate model.

        Args:
            layer_sizes: List of layer widths including input and output dims.
                         e.g. [5, 64, 32, 1] for 5 inputs, two hidden layers, 1 output.
            learning_rate: Step size for SGD.
            batch_size: Mini-batch size.
            epochs: Number of training epochs.
            seed: Random seed for weight initialization.
        """
        self.layer_sizes = layer_sizes
        self.learning_rate = learning_rate
        self.batch_size = batch_size
        self.epochs = epochs
        self.rng = np.random.default_rng(seed)

        # Xavier initialization
        self.weights: List[np.ndarray] = []
        self.biases: List[np.ndarray] = []
        for i in range(len(layer_sizes) - 1):
            fan_in = layer_sizes[i]
            fan_out = layer_sizes[i + 1]
            std = np.sqrt(2.0 / (fan_in + fan_out))
            self.weights.append(self.rng.normal(0, std, (fan_in, fan_out)))
            self.biases.append(np.zeros(fan_out))

        # Normalization parameters (set during fit)
        self._x_mean: Optional[np.ndarray] = None
        self._x_std: Optional[np.ndarray] = None
        self._y_mean: float = 0.0
        self._y_std: float = 1.0

    def _relu(self, x: np.ndarray) -> np.ndarray:
        return np.maximum(0, x)

    def _relu_deriv(self, x: np.ndarray) -> np.ndarray:
        return (x > 0).astype(float)

    def _forward(self, X: np.ndarray) -> Tuple[List[np.ndarray], List[np.ndarray]]:
        """Forward pass returning activations and pre-activations for backprop."""
        activations = [X]
        pre_activations = [X]

        current = X
        for i in range(len(self.weights)):
            z = current @ self.weights[i] + self.biases[i]
            pre_activations.append(z)
            if i < len(self.weights) - 1:
                # Hidden layer: ReLU
                current = self._relu(z)
            else:
                # Output layer: linear
                current = z
            activations.append(current)

        return activations, pre_activations

    def _backprop(
        self, X: np.ndarray, y: np.ndarray
    ) -> Tuple[List[np.ndarray], List[np.ndarray]]:
        """Compute gradients via backpropagation."""
        n = X.shape[0]
        activations, pre_activations = self._forward(X)

        # Output error (MSE gradient)
        delta = (activations[-1] - y.reshape(-1, 1)) * (2.0 / n)

        weight_grads = []
        bias_grads = []

        for i in range(len(self.weights) - 1, -1, -1):
            weight_grads.insert(0, activations[i].T @ delta)
            bias_grads.insert(0, delta.sum(axis=0))

            if i > 0:
                delta = (delta @ self.weights[i].T) * self._relu_deriv(
                    pre_activations[i]
                )

        return weight_grads, bias_grads

    def fit(self, X: np.ndarray, y: np.ndarray) -> List[float]:
        """Train the model on input-output pairs.

        Args:
            X: Input features, shape (n_samples, n_features).
            y: Target values, shape (n_samples,).

        Returns:
            List of loss values per epoch.
        """
        X = np.asarray(X, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)

        # Normalize inputs
        self._x_mean = X.mean(axis=0)
        self._x_std = X.std(axis=0)
        self._x_std[self._x_std < 1e-8] = 1.0
        X_norm = (X - self._x_mean) / self._x_std

        # Normalize outputs
        self._y_mean = float(y.mean())
        self._y_std = float(y.std())
        if self._y_std < 1e-8:
            self._y_std = 1.0
        y_norm = (y - self._y_mean) / self._y_std

        n = X_norm.shape[0]
        losses = []

        for epoch in range(self.epochs):
            # Shuffle
            indices = self.rng.permutation(n)
            X_shuffled = X_norm[indices]
            y_shuffled = y_norm[indices]

            epoch_loss = 0.0
            n_batches = 0

            for start in range(0, n, self.batch_size):
                end = min(start + self.batch_size, n)
                X_batch = X_shuffled[start:end]
                y_batch = y_shuffled[start:end]

                weight_grads, bias_grads = self._backprop(X_batch, y_batch)

                for i in range(len(self.weights)):
                    self.weights[i] -= self.learning_rate * weight_grads[i]
                    self.biases[i] -= self.learning_rate * bias_grads[i]

                # Batch loss
                pred = self._forward(X_batch)[0][-1].flatten()
                batch_loss = float(np.mean((pred - y_batch) ** 2))
                epoch_loss += batch_loss
                n_batches += 1

            losses.append(epoch_loss / max(n_batches, 1))

        return losses

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Predict target values for input features.

        Args:
            X: Input features, shape (n_samples, n_features).

        Returns:
            Predicted values, shape (n_samples,).
        """
        X = np.asarray(X, dtype=np.float64)
        if self._x_mean is not None:
            X_norm = (X - self._x_mean) / self._x_std
        else:
            X_norm = X

        activations, _ = self._forward(X_norm)
        y_norm = activations[-1].flatten()

        return y_norm * self._y_std + self._y_mean

    def score(self, X: np.ndarray, y: np.ndarray) -> float:
        """Compute the R-squared score.

        Args:
            X: Input features, shape (n_samples, n_features).
            y: True target values, shape (n_samples,).

        Returns:
            R-squared score (1.0 = perfect, 0.0 = mean predictor).
        """
        y = np.asarray(y, dtype=np.float64)
        y_pred = self.predict(X)
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - y.mean()) ** 2)
        if ss_tot < 1e-12:
            return 1.0 if ss_res < 1e-12 else 0.0
        return float(1.0 - ss_res / ss_tot)


# ---------------------------------------------------------------------------
# Latin Hypercube Sampling
# ---------------------------------------------------------------------------

def _latin_hypercube_sample(
    n_samples: int, n_dims: int, rng: np.random.Generator
) -> np.ndarray:
    """Generate Latin Hypercube samples in [0, 1]^n_dims.

    Args:
        n_samples: Number of samples to generate.
        n_dims: Number of dimensions.
        rng: Numpy random generator.

    Returns:
        Array of shape (n_samples, n_dims) with values in [0, 1].
    """
    samples = np.zeros((n_samples, n_dims))
    for d in range(n_dims):
        perm = rng.permutation(n_samples)
        for i in range(n_samples):
            samples[i, d] = (perm[i] + rng.random()) / n_samples
    return samples


# ---------------------------------------------------------------------------
# ML Optimizer
# ---------------------------------------------------------------------------

@dataclass
class MLOptimizerConfig:
    """Configuration for the ML-based optimizer."""
    iterations: int = 5             # number of surrogate-refine iterations
    initial_samples: int = 30       # LHS samples for initial training data
    surrogate_candidates: int = 5000  # candidates to screen with surrogate per iteration
    top_k: int = 5                  # top candidates to validate with real simulation
    hidden_layers: List[int] = field(default_factory=lambda: [64, 32])
    learning_rate: float = 0.001
    epochs: int = 200
    replications: int = 1           # replications per simulation evaluation
    base_seed: int = 42
    objective: str = "throughput"
    objective_direction: str = "maximize"


class MLOptimizer:
    """Neural-network surrogate model optimizer for factory simulation.

    Iteratively trains a surrogate model on simulation results and uses it
    to rapidly screen parameter candidates, validating only the most
    promising ones with actual simulations.
    """

    def __init__(self, parameter_ranges: List[Dict[str, Any]]):
        """Initialize the optimizer.

        Args:
            parameter_ranges: List of dicts with keys: path, min, max,
                              and optionally step, name.
        """
        self.parameter_ranges = parameter_ranges
        self.n_params = len(parameter_ranges)
        self.progress_callback: Optional[Callable[[float, str], None]] = None
        self._cancelled = False

    def cancel(self):
        """Cancel an in-progress optimization."""
        self._cancelled = True

    # -- public API --

    def optimize(
        self,
        model: Dict[str, Any],
        sim_options: Dict[str, Any],
        config: MLOptimizerConfig,
    ) -> Dict[str, Any]:
        """Run the surrogate-assisted optimization loop.

        Args:
            model: The base factory model dict.
            sim_options: Simulation options (duration, warmupTime, etc.).
            config: Optimizer configuration.

        Returns:
            Dict with keys: best_parameters, best_objective, surrogate_r2,
            all_evaluated, iterations_completed, total_simulations.
        """
        rng = np.random.default_rng(config.base_seed)
        seed_counter = config.base_seed

        # Collect all evaluated points
        all_X: List[np.ndarray] = []
        all_y: List[float] = []

        total_phases = config.iterations
        total_sims_estimate = (
            config.initial_samples + config.iterations * config.top_k
        )
        sims_done = 0

        # ----- Phase 1: Latin Hypercube Sampling for initial data -----
        self._report(0.0, "Phase 1: Generating initial samples via Latin Hypercube Sampling")

        lhs = _latin_hypercube_sample(config.initial_samples, self.n_params, rng)

        for i in range(config.initial_samples):
            if self._cancelled:
                break

            params_normalized = lhs[i]
            params_dict = self._decode_params(params_normalized)
            obj = self._evaluate(model, sim_options, params_dict, config, seed_counter)
            seed_counter += 1000

            all_X.append(params_normalized)
            all_y.append(obj)
            sims_done += 1

            self._report(
                sims_done / total_sims_estimate * 0.5,
                f"Phase 1: Initial sample {i + 1}/{config.initial_samples} "
                f"(objective={obj:.4f})"
            )

        if self._cancelled:
            return self._build_result(all_X, all_y, config, r2=0.0, iterations=0,
                                      total_sims=sims_done)

        # ----- Iterative surrogate loop -----
        surrogate_r2 = 0.0
        iterations_done = 0

        for iteration in range(config.iterations):
            if self._cancelled:
                break

            iter_base_progress = 0.5 + (iteration / config.iterations) * 0.5

            # Phase 2: Train surrogate
            self._report(
                iter_base_progress,
                f"Iteration {iteration + 1}/{config.iterations}: Training surrogate model"
            )

            X_train = np.array(all_X)
            y_train = np.array(all_y)

            layer_sizes = (
                [self.n_params] + list(config.hidden_layers) + [1]
            )
            surrogate = SurrogateModel(
                layer_sizes=layer_sizes,
                learning_rate=config.learning_rate,
                epochs=config.epochs,
                seed=config.base_seed + iteration,
            )
            surrogate.fit(X_train, y_train)
            surrogate_r2 = surrogate.score(X_train, y_train)

            # Phase 3: Screen candidates with surrogate
            self._report(
                iter_base_progress + 0.01,
                f"Iteration {iteration + 1}: Screening {config.surrogate_candidates} "
                f"candidates (surrogate R²={surrogate_r2:.4f})"
            )

            candidates = rng.random((config.surrogate_candidates, self.n_params))
            predicted = surrogate.predict(candidates)

            # Select top-K based on objective direction
            if config.objective_direction == "maximize":
                top_indices = np.argsort(predicted)[-config.top_k:][::-1]
            else:
                top_indices = np.argsort(predicted)[:config.top_k]

            # Phase 4: Validate top-K with real simulations
            for k_i, idx in enumerate(top_indices):
                if self._cancelled:
                    break

                params_normalized = candidates[idx]
                params_dict = self._decode_params(params_normalized)
                obj = self._evaluate(model, sim_options, params_dict, config, seed_counter)
                seed_counter += 1000

                all_X.append(params_normalized)
                all_y.append(obj)
                sims_done += 1

                step_progress = (
                    iter_base_progress
                    + (k_i + 1) / config.top_k * (0.5 / config.iterations)
                )
                self._report(
                    min(step_progress, 0.99),
                    f"Iteration {iteration + 1}: Validated candidate {k_i + 1}/{config.top_k} "
                    f"(objective={obj:.4f})"
                )

            iterations_done += 1

        # ----- Final result -----
        self._report(1.0, "Optimization complete")
        return self._build_result(
            all_X, all_y, config,
            r2=surrogate_r2,
            iterations=iterations_done,
            total_sims=sims_done,
        )

    # -- internals --

    def _decode_params(self, normalized: np.ndarray) -> Dict[str, float]:
        """Convert a [0,1]^n vector to actual parameter values."""
        params = {}
        for j, p in enumerate(self.parameter_ranges):
            min_val = p["min"]
            max_val = p["max"]
            val = min_val + normalized[j] * (max_val - min_val)
            step = p.get("step")
            if step:
                val = round(val / step) * step
            params[p["path"]] = round(val, 6)
        return params

    def _apply_params(
        self, model: Dict[str, Any], params: Dict[str, float]
    ) -> Dict[str, Any]:
        """Apply parameter values to a deep copy of the model."""
        from factorysim.engine.experiment import _set_nested

        model_copy = copy.deepcopy(model)
        for path, value in params.items():
            try:
                _set_nested(model_copy, path, value)
            except (KeyError, IndexError, TypeError):
                pass
        return model_copy

    def _evaluate(
        self,
        base_model: Dict[str, Any],
        sim_options: Dict[str, Any],
        params: Dict[str, float],
        config: MLOptimizerConfig,
        seed: int,
    ) -> float:
        """Run the actual simulation and extract the objective value."""
        from factorysim.engine.simulation import Simulation, SimulationConfig
        from factorysim.engine.experiment import _extract_objective

        modified_model = self._apply_params(base_model, params)

        objectives = []
        for rep in range(config.replications):
            sim_cfg = SimulationConfig(
                duration=sim_options.get("duration", 3600 * 8),
                seed=seed + rep,
                warmup_time=sim_options.get("warmupTime", 0),
                stream_events=False,
            )
            sim = Simulation(modified_model, sim_cfg)
            result = sim.run()
            obj = _extract_objective(result.get("kpis", {}), config.objective)
            objectives.append(obj)

        return sum(objectives) / len(objectives) if objectives else 0.0

    def _report(self, progress: float, message: str) -> None:
        """Send a progress update if a callback is registered."""
        if self.progress_callback:
            self.progress_callback(progress, message)

    def _build_result(
        self,
        all_X: List[np.ndarray],
        all_y: List[float],
        config: MLOptimizerConfig,
        r2: float,
        iterations: int,
        total_sims: int,
    ) -> Dict[str, Any]:
        """Assemble the final result dict."""
        if not all_y:
            return {
                "best_parameters": {},
                "best_objective": 0.0,
                "surrogate_r2": 0.0,
                "all_evaluated": [],
                "iterations_completed": 0,
                "total_simulations": 0,
            }

        y_arr = np.array(all_y)
        if config.objective_direction == "maximize":
            best_idx = int(np.argmax(y_arr))
        else:
            best_idx = int(np.argmin(y_arr))

        best_params_norm = all_X[best_idx]
        best_params = self._decode_params(best_params_norm)
        best_obj = all_y[best_idx]

        # All evaluated points for frontend display
        all_evaluated = []
        for x, y in zip(all_X, all_y):
            all_evaluated.append({
                "parameters": self._decode_params(x),
                "objective": round(y, 4),
            })

        return {
            "best_parameters": best_params,
            "best_objective": round(best_obj, 4),
            "surrogate_r2": round(r2, 4),
            "all_evaluated": all_evaluated,
            "iterations_completed": iterations,
            "total_simulations": total_sims,
        }
