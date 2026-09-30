"""Dependency-light client for the Sidelore node API."""

from .client import SideloreClient

__all__ = ["SideloreClient", "SideloreResearchClient"]
from .research import SideloreResearchClient
