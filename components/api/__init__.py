"""
API Package - REST API layer for JavaScript GUI integration.

Provides clean JSON-based API for frontend applications.
"""

from .rag_controller import RAGController
from .api_models import QueryRequest, QueryResponse, SystemStatus

__all__ = ['RAGController', 'QueryRequest', 'QueryResponse', 'SystemStatus']
