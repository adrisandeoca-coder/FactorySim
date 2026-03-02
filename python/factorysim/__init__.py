"""
FactorySim - Desktop Digital Twin for Manufacturing

A SimPy-based discrete event simulation platform that stays
synchronized with your real factory floor.
"""

__version__ = "1.0.0"
__author__ = "FactorySim Team"

from factorysim.engine.simulation import Simulation
from factorysim.engine.station import Station
from factorysim.engine.buffer import Buffer
from factorysim.engine.resource import Resource, Operator
from factorysim.engine.product import Product

__all__ = [
    "Simulation",
    "Station",
    "Buffer",
    "Resource",
    "Operator",
    "Product",
]
