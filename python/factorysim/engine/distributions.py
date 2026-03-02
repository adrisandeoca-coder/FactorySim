"""
Statistical distributions for simulation parameters.

Supports constant, normal, exponential, triangular, Weibull, and empirical distributions.
"""

from typing import Dict, Any, List, Optional, Union
import math
import numpy as np
from scipy import stats
from dataclasses import dataclass


@dataclass
class DistributionConfig:
    """Configuration for a statistical distribution."""
    type: str
    parameters: Dict[str, Any]


class Distribution:
    """
    Statistical distribution wrapper for generating random variates.

    Supports:
    - constant: Fixed value
    - normal: Normal/Gaussian distribution
    - exponential: Exponential distribution
    - triangular: Triangular distribution
    - weibull: Weibull distribution
    - uniform: Uniform distribution
    - lognormal: Log-normal distribution
    - empirical: Based on observed data
    """

    def __init__(self, config: Union[DistributionConfig, Dict[str, Any]], rng: Optional[np.random.Generator] = None):
        """
        Initialize distribution from configuration.

        Args:
            config: Distribution configuration with type and parameters
            rng: NumPy random generator for reproducibility
        """
        if isinstance(config, dict):
            self.type = config.get("type", "constant")
            self.parameters = config.get("parameters", {})
        else:
            self.type = config.type
            self.parameters = config.parameters

        self.rng = rng or np.random.default_rng()
        self._validate()

    def _validate(self) -> None:
        """Validate distribution configuration."""
        validators = {
            "constant": self._validate_constant,
            "normal": self._validate_normal,
            "exponential": self._validate_exponential,
            "triangular": self._validate_triangular,
            "weibull": self._validate_weibull,
            "uniform": self._validate_uniform,
            "lognormal": self._validate_lognormal,
            "empirical": self._validate_empirical,
        }

        validator = validators.get(self.type)
        if validator is None:
            raise ValueError(f"Unknown distribution type: {self.type}")
        validator()

    def _validate_constant(self) -> None:
        if "value" not in self.parameters:
            raise ValueError("Constant distribution requires 'value' parameter")

    def _validate_normal(self) -> None:
        if "mean" not in self.parameters:
            raise ValueError("Normal distribution requires 'mean' parameter")
        if "std" not in self.parameters:
            self.parameters["std"] = 0  # Default to no variation

    def _validate_exponential(self) -> None:
        if "mean" not in self.parameters:
            raise ValueError("Exponential distribution requires 'mean' parameter")
        if self.parameters["mean"] <= 0:
            raise ValueError("Exponential mean must be positive")

    def _validate_triangular(self) -> None:
        required = ["min", "mode", "max"]
        for param in required:
            if param not in self.parameters:
                raise ValueError(f"Triangular distribution requires '{param}' parameter")
        if not (self.parameters["min"] <= self.parameters["mode"] <= self.parameters["max"]):
            raise ValueError("Triangular requires min <= mode <= max")

    def _validate_weibull(self) -> None:
        if "shape" not in self.parameters:
            raise ValueError("Weibull distribution requires 'shape' parameter")
        if "scale" not in self.parameters:
            self.parameters["scale"] = 1.0

    def _validate_uniform(self) -> None:
        if "min" not in self.parameters:
            raise ValueError("Uniform distribution requires 'min' parameter")
        if "max" not in self.parameters:
            raise ValueError("Uniform distribution requires 'max' parameter")

    def _validate_lognormal(self) -> None:
        if "mean" not in self.parameters:
            raise ValueError("Lognormal distribution requires 'mean' parameter")
        if "sigma" not in self.parameters:
            # Fall back to 'std' parameter if 'sigma' is missing
            if "std" in self.parameters:
                self.parameters["sigma"] = self.parameters["std"]
            else:
                self.parameters["sigma"] = 0.5

    def _validate_empirical(self) -> None:
        if "data" not in self.parameters:
            raise ValueError("Empirical distribution requires 'data' parameter")
        if len(self.parameters["data"]) == 0:
            raise ValueError("Empirical data cannot be empty")

    def sample(self) -> float:
        """
        Generate a random sample from the distribution.

        Returns:
            A single random value from the distribution
        """
        samplers = {
            "constant": self._sample_constant,
            "normal": self._sample_normal,
            "exponential": self._sample_exponential,
            "triangular": self._sample_triangular,
            "weibull": self._sample_weibull,
            "uniform": self._sample_uniform,
            "lognormal": self._sample_lognormal,
            "empirical": self._sample_empirical,
        }

        return samplers[self.type]()

    def _sample_constant(self) -> float:
        return float(self.parameters["value"])

    def _sample_normal(self) -> float:
        value = self.rng.normal(self.parameters["mean"], self.parameters["std"])
        # Ensure non-negative for time-based parameters
        return max(0.0, value)

    def _sample_exponential(self) -> float:
        return self.rng.exponential(self.parameters["mean"])

    def _sample_triangular(self) -> float:
        return self.rng.triangular(
            self.parameters["min"],
            self.parameters["mode"],
            self.parameters["max"]
        )

    def _sample_weibull(self) -> float:
        return self.parameters["scale"] * self.rng.weibull(self.parameters["shape"])

    def _sample_uniform(self) -> float:
        return self.rng.uniform(self.parameters["min"], self.parameters["max"])

    def _sample_lognormal(self) -> float:
        return self.rng.lognormal(self.parameters["mean"], self.parameters["sigma"])

    def _sample_empirical(self) -> float:
        return float(self.rng.choice(self.parameters["data"]))

    def mean(self) -> float:
        """Calculate the theoretical mean of the distribution."""
        means = {
            "constant": lambda: self.parameters["value"],
            "normal": lambda: self.parameters["mean"],
            "exponential": lambda: self.parameters["mean"],
            "triangular": lambda: (self.parameters["min"] + self.parameters["mode"] + self.parameters["max"]) / 3,
            "weibull": lambda: self.parameters["scale"] * math.gamma(1 + 1 / self.parameters["shape"]),
            "uniform": lambda: (self.parameters["min"] + self.parameters["max"]) / 2,
            "lognormal": lambda: np.exp(self.parameters["mean"] + self.parameters["sigma"] ** 2 / 2),
            "empirical": lambda: float(np.mean(self.parameters["data"])) if len(self.parameters.get("data", [])) > 0 else 0.0,
        }
        return float(means[self.type]())

    def std(self) -> float:
        """Calculate the theoretical standard deviation of the distribution."""
        stds = {
            "constant": lambda: 0.0,
            "normal": lambda: self.parameters["std"],
            "exponential": lambda: self.parameters["mean"],
            "triangular": lambda: np.sqrt(
                (self.parameters["min"] ** 2 + self.parameters["mode"] ** 2 + self.parameters["max"] ** 2
                 - self.parameters["min"] * self.parameters["mode"]
                 - self.parameters["min"] * self.parameters["max"]
                 - self.parameters["mode"] * self.parameters["max"]) / 18
            ),
            "weibull": lambda: self.parameters["scale"] * np.sqrt(
                math.gamma(1 + 2 / self.parameters["shape"]) - math.gamma(1 + 1 / self.parameters["shape"]) ** 2
            ),
            "uniform": lambda: (self.parameters["max"] - self.parameters["min"]) / np.sqrt(12),
            "lognormal": lambda: np.sqrt(
                (np.exp(self.parameters["sigma"] ** 2) - 1) *
                np.exp(2 * self.parameters["mean"] + self.parameters["sigma"] ** 2)
            ),
            "empirical": lambda: float(np.std(self.parameters["data"])) if len(self.parameters.get("data", [])) > 0 else 0.0,
        }
        return float(stds[self.type]())

    def to_dict(self) -> Dict[str, Any]:
        """Convert distribution to dictionary representation."""
        return {
            "type": self.type,
            "parameters": self.parameters,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any], rng: Optional[np.random.Generator] = None) -> "Distribution":
        """Create distribution from dictionary."""
        return cls(DistributionConfig(data["type"], data["parameters"]), rng)

    @classmethod
    def constant(cls, value: float, rng: Optional[np.random.Generator] = None) -> "Distribution":
        """Create a constant distribution."""
        return cls({"type": "constant", "parameters": {"value": value}}, rng)

    @classmethod
    def normal(cls, mean: float, std: float, rng: Optional[np.random.Generator] = None) -> "Distribution":
        """Create a normal distribution."""
        return cls({"type": "normal", "parameters": {"mean": mean, "std": std}}, rng)

    @classmethod
    def exponential(cls, mean: float, rng: Optional[np.random.Generator] = None) -> "Distribution":
        """Create an exponential distribution.

        Args:
            mean: Mean inter-event time (= scale parameter in NumPy).
                  This is 1/rate. For example, mean=50 means one event every 50 time units on average.
        """
        return cls({"type": "exponential", "parameters": {"mean": mean}}, rng)

    @classmethod
    def triangular(cls, min_val: float, mode: float, max_val: float, rng: Optional[np.random.Generator] = None) -> "Distribution":
        """Create a triangular distribution."""
        return cls({"type": "triangular", "parameters": {"min": min_val, "mode": mode, "max": max_val}}, rng)

    @classmethod
    def weibull(cls, shape: float, scale: float = 1.0, rng: Optional[np.random.Generator] = None) -> "Distribution":
        """Create a Weibull distribution."""
        return cls({"type": "weibull", "parameters": {"shape": shape, "scale": scale}}, rng)

    @classmethod
    def fit_to_data(cls, data: List[float], dist_type: str = "normal", rng: Optional[np.random.Generator] = None) -> "Distribution":
        """
        Fit a distribution to observed data.

        Args:
            data: List of observed values
            dist_type: Type of distribution to fit
            rng: Random generator

        Returns:
            Fitted distribution
        """
        data_array = np.array(data)

        if dist_type == "normal":
            mean, std = data_array.mean(), data_array.std()
            return cls.normal(mean, std, rng)
        elif dist_type == "exponential":
            mean = data_array.mean()
            return cls.exponential(mean, rng)
        elif dist_type == "weibull":
            shape, loc, scale = stats.weibull_min.fit(data_array, floc=0)
            return cls.weibull(shape, scale, rng)
        elif dist_type == "empirical":
            return cls({"type": "empirical", "parameters": {"data": data}}, rng)
        else:
            raise ValueError(f"Cannot fit distribution type: {dist_type}")
