"""
Custom Exception Hierarchy for RAG System

Provides specific exception types for better error handling and debugging.
"""


class RAGException(Exception):
    """Base exception for all RAG system errors."""
    pass


class ConfigurationError(RAGException):
    """Raised when configuration is invalid or missing."""
    pass


class EmbeddingError(RAGException):
    """Raised when embedding generation fails."""
    pass


class IndexError(RAGException):
    """Raised when FAISS index operations fail."""
    pass


class IndexNotFoundError(IndexError):
    """Raised when FAISS index file is not found."""
    pass


class SearchError(RAGException):
    """Raised when search operations fail."""
    pass


class LLMAPIError(RAGException):
    """Raised when LLM API calls fail."""
    pass


class SessionError(RAGException):
    """Raised when session management fails."""
    pass


class DocumentProcessingError(RAGException):
    """Raised when document processing fails."""
    pass


class QueryCancelledException(RAGException):
    """Raised when a query is cancelled by user."""
    pass
