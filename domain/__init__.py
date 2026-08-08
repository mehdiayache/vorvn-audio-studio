"""Canonical Voice Studio domain model.

The legacy application stored every navigable thing in ``projects``.  New
code must enter through this package instead: Venture, Project, Series and
Production are different resources with different capabilities.
"""

from .repository import hierarchy, production_get, resource_get
from .schema import migrate

__all__ = ["hierarchy", "migrate", "production_get", "resource_get"]
