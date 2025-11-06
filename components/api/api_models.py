"""
API Models - Data structures for API communication.

Provides Pydantic-style models for request/response validation.
Compatible with FastAPI and can be used with vanilla Flask.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from datetime import datetime


@dataclass
class QueryRequest:
    """Request model for RAG query."""
    query: str
    use_context: bool = True
    template_name: str = "base"
    optimize: bool = False
    improve: bool = False
    mode: Optional[str] = None  # 'none', 'faiss', or 'full'
    temperature: Optional[float] = None
    top_k: Optional[int] = None
    similarity_threshold: Optional[float] = None
    hit_target: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class DocumentMetadata:
    """Metadata for a retrieved document."""
    content: str
    score: float
    filename: Optional[str] = None
    file_path: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class QueryResponse:
    """Response model for RAG query."""
    query: str
    response: str
    processing_time: float
    num_docs_found: int
    documents: List[Dict[str, Any]]
    template_used: str
    timestamp: str
    optimization_applied: bool = False
    improvement_applied: bool = False
    optimization_score: Optional[float] = None
    improvement_iterations: int = 0
    
    # Additional metadata for GUI
    retrieval_time: Optional[float] = None
    generation_time: Optional[float] = None
    evaluation_time: Optional[float] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class SystemStatus:
    """System status information."""
    status: str  # "ready", "busy", "error", "initializing"
    total_documents: int
    embedding_model: str
    llm_model: str
    optimization_enabled: bool
    improvement_enabled: bool
    current_temperature: float
    current_top_k: int
    current_threshold: float
    data_directory: str
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class OptimizationProgress:
    """Progress update during optimization."""
    iteration: int
    total_iterations: int
    current_temperature: float
    current_score: float
    best_score: float
    status: str  # "testing", "evaluating", "improving"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class ErrorResponse:
    """Error response model."""
    error: str
    error_type: str
    timestamp: str
    details: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class ConfigUpdate:
    """Configuration update request."""
    temperature: Optional[float] = None
    top_k: Optional[int] = None
    similarity_threshold: Optional[float] = None
    hit_target: Optional[int] = None
    optimization_enabled: Optional[bool] = None
    improvement_enabled: Optional[bool] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {k: v for k, v in asdict(self).items() if v is not None}
