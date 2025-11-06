"""
Core Services Package

Provides foundational services for the RAG system:
- EmbeddingService: Handles embedding model and vector generation
- IndexService: Manages FAISS index operations
- SearchService: Performs semantic search with adaptive thresholding
"""

from .embedding_service import EmbeddingService
from .index_service import IndexService
from .search_service import SearchService

__all__ = ['EmbeddingService', 'IndexService', 'SearchService']
