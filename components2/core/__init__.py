"""
Core FAISS services for System 2 (AI Journalist).

Duplicated from components/core/ to maintain system isolation.
"""

from .embedding_service import EmbeddingService
from .index_service import IndexService
from .search_service import SearchService

__all__ = ['EmbeddingService', 'IndexService', 'SearchService']
