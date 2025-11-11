"""
RAG System - Orchestrator for RAG operations

Refactored to use core services for single responsibility.
This class now focuses on orchestrating services rather than implementing everything.
"""

import json
import logging
import time
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Callable

from .core import EmbeddingService, IndexService, SearchService
from .services import LLMService, PromptService, ConfigurationProvider
from .session_manager import SessionManager
from .exceptions import (
    RAGException, ConfigurationError, EmbeddingError, 
    IndexError, SearchError, LLMAPIError
)

logger = logging.getLogger(__name__)

# Lazy import to avoid circular dependencies
_QueryExecutor = None

def _get_query_executor():
    """Lazy import of QueryExecutor to avoid circular dependencies."""
    global _QueryExecutor
    if _QueryExecutor is None:
        from .execution import QueryExecutor
        _QueryExecutor = QueryExecutor
    return _QueryExecutor


class RAGSystem:
    """
    Retrieval-Augmented Generation system orchestrator.
    
    Uses service-oriented architecture:
    - EmbeddingService: Handles embedding generation
    - IndexService: Manages FAISS index
    - SearchService: Performs semantic search
    - LLMService: Handles LLM API calls
    - PromptService: Manages prompt templates
    """
    
    def __init__(self, config_path: str = "config.json", enable_session_saving: bool = True):
        """
        Initialize the RAG system.
        
        Args:
            config_path: Path to the configuration file
            enable_session_saving: Whether to enable session saving functionality
            
        Raises:
            ConfigurationError: If configuration is invalid
            EmbeddingError: If embedding model fails to load
            IndexError: If index initialization fails
        """
        # Always use config.json for reloading
        self.config_path = "config.json"
        self.config = self._load_config(config_path)
        
        # Initialize session manager if enabled
        self.session_manager = SessionManager() if enable_session_saving else None
        self.enable_session_saving = enable_session_saving
        
        # Lazy-initialized query executor for mode-based architecture
        self._query_executor = None
        
        # Cancellation checker (set by RAGController before each query)
        self.cancellation_checker: Optional[Callable[[], bool]] = None
        
        # Initialize core services
        self._init_services()
        
        # Ensure directories exist
        self.files_dir = Path("files")
        self.files_dir.mkdir(exist_ok=True)
    
    def _load_config(self, config_path: str) -> Dict:
        """
        Load configuration from JSON file.
        
        Raises:
            ConfigurationError: If config file is missing or invalid
        """
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                logger.info(f"Configuration loaded from {config_path}")
                return config
        except FileNotFoundError:
            raise ConfigurationError(f"Configuration file {config_path} not found")
        except json.JSONDecodeError as e:
            raise ConfigurationError(f"Invalid JSON in {config_path}: {e}")
    
    def reload_config(self) -> Dict:
        """
        Reload configuration from file.
        
        Returns:
            Updated configuration dictionary
        """
        logger.info(f"Reloading configuration from {self.config_path}")
        self.config = self._load_config(self.config_path)
        return self.config
    
    def _init_services(self) -> None:
        """Initialize all core services."""
        try:
            # Initialize embedding service
            self.embedding_service = EmbeddingService(
                model_name=self.config["embedding"]["model"],
                expected_dimension=self.config["embedding"]["dimension"]
            )
            
            # Initialize index service
            self.index_service = IndexService(
                index_path=self.config["index"]["save_path"],
                metadata_path=self.config["index"]["metadata_path"],
                dimension=self.config["embedding"]["dimension"],
                index_type=self.config["index"]["type"]
            )
            
            # Load or create index
            self.index_service.load_or_create()
            
            # Initialize search service
            self.search_service = SearchService(
                index_service=self.index_service,
                embedding_service=self.embedding_service,
                index_type=self.config["index"]["type"]
            )
            
            logger.info("All core services initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize services: {e}")
            raise
    
    # ==================== Index Management Methods ====================
    
    def add_documents(
        self, 
        documents: List[str], 
        save: bool = True, 
        progress_callback: Optional[Callable] = None
    ) -> None:
        """
        Add documents to the FAISS index.
        
        Args:
            documents: List of document texts to add
            save: Whether to save the index after adding documents
            progress_callback: Optional callback(current, total, message)
            
        Raises:
            EmbeddingError: If embedding generation fails
            IndexError: If adding to index fails
        """
        if not documents:
            logger.warning("No documents provided")
            return
        
        if not isinstance(documents, list):
            documents = [documents]
        
        logger.info(f"Adding {len(documents)} documents to index")
        
        try:
            # Generate embeddings with progress tracking
            all_vectors = []
            for i, doc in enumerate(documents):
                if progress_callback:
                    progress_callback(i, len(documents), f"Embedding document {i+1}/{len(documents)}")
                
                vector = self.embedding_service.encode_single(doc, normalize=True)
                all_vectors.append(vector)
            
            if progress_callback:
                progress_callback(len(documents), len(documents), "Adding vectors to index...")
            
            # Add to index
            import numpy as np
            vectors = np.array(all_vectors, dtype=np.float32)
            self.index_service.add_vectors(vectors, documents, save, progress_callback)
            
            logger.info(f"Successfully added {len(documents)} documents")
            
        except Exception as e:
            logger.error(f"Failed to add documents: {e}")
            raise
    
    def clear_index(self) -> None:
        """
        Clear the FAISS index and metadata.
        
        Raises:
            IndexError: If clearing fails
        """
        self.index_service.clear()
    
    def save_index(self) -> None:
        """
        Save FAISS index and metadata to disk.
        
        Raises:
            IndexError: If saving fails
        """
        self.index_service.save()
    
    # ==================== Search Methods ====================
    
    def search(self, query: str, k: Optional[int] = None) -> List[str]:
        """
        Search for similar documents.
        
        Args:
            query: Query text
            k: Number of documents to retrieve (defaults to config value)
            
        Returns:
            List of relevant document texts
            
        Raises:
            SearchError: If search fails
        """
        # Reload config to pick up any changes
        self.reload_config()
        
        if k is None:
            k = self.config["retrieval"]["top_k"]
        
        # Ensure k is an integer (k is guaranteed not None at this point)
        assert k is not None
        k_int: int = int(k) if not isinstance(k, int) else k
        
        # Check if dynamic threshold is enabled
        use_dynamic = "hit_target" in self.config["retrieval"]
        hit_target = self.config["retrieval"].get("hit_target") if use_dynamic else None
        step = self.config["retrieval"].get("step", 0.05)
        
        return self.search_service.search(
            query=query,
            k=k_int,
            use_dynamic_threshold=use_dynamic,
            hit_target=hit_target,
            step=step
        )
    
    def search_detailed(self, query: str, k: Optional[int] = None, progress_callback=None, json_callback=None) -> Dict:
        """
        Search for similar documents with detailed information.
        
        Args:
            query: Query text
            k: Number of documents to retrieve (defaults to config value)
            progress_callback: Optional callback for threshold progression (CLI)
            json_callback: Optional callback for JSON events (web UI)
            
        Returns:
            Dictionary containing search results, scores, and metadata
            
        Raises:
            SearchError: If search fails
        """
        # Reload config to pick up any changes
        self.reload_config()
        
        if k is None:
            k = self.config["retrieval"]["top_k"]
        
        # Ensure k is an integer (k is guaranteed not None at this point)
        assert k is not None
        k_int: int = int(k) if not isinstance(k, int) else k
        
        # Check if dynamic threshold is enabled
        use_dynamic = "hit_target" in self.config["retrieval"]
        hit_target = self.config["retrieval"].get("hit_target") if use_dynamic else None
        step = self.config["retrieval"].get("step", 0.05)
        
        # Only use fixed similarity_threshold if dynamic threshold is NOT enabled
        similarity_threshold = None if use_dynamic else self.config["retrieval"].get("similarity_threshold")
        
        return self.search_service.search_detailed(
            query=query,
            k=k_int,
            use_dynamic_threshold=use_dynamic,
            hit_target=hit_target,
            step=step,
            similarity_threshold=similarity_threshold,
            progress_callback=progress_callback,
            json_callback=json_callback
        )
    
    # ==================== Cancellation Check ====================
    
    def check_cancellation(self) -> None:
        """Check if query has been cancelled and raise exception if so."""
        if self.cancellation_checker and self.cancellation_checker():
            from components.exceptions import QueryCancelledException
            raise QueryCancelledException("Query was cancelled by user")
    
    # ==================== Query Execution ====================
    
    @property
    def query_executor(self):
        """
        Get or create QueryExecutor instance for mode-based query execution.
        
        Returns:
            QueryExecutor instance
        """
        if self._query_executor is None:
            QueryExecutor = _get_query_executor()
            self._query_executor = QueryExecutor(self.config, self)
            logger.info("Initialized QueryExecutor for mode-based queries")
        return self._query_executor
    
    def query(
        self,
        query: str,
        mode: Optional[str] = None,
        **kwargs
    ) -> Dict:
        """
        Execute query using mode-based architecture.
        
        Three modes available:
        - 'none': Direct LLM without retrieval
        - 'faiss': Dynamic retrieval with FAISS
        - 'full': Complete pipeline (retrieval + optimization + improvement)
        
        Args:
            query: User's question
            mode: Query mode ('none', 'faiss', 'full'). Uses config default if None.
            **kwargs: Mode-specific parameters
            
        Returns:
            Dictionary with response, metadata, and mode information
            
        Raises:
            RAGException: If query execution fails
        """
        result = self.query_executor.execute_query(query, mode=mode, **kwargs)
        
        # Convert QueryResult to clean dictionary format
        return {
            "query": query,
            "response": result.response,
            "processing_time": result.processing_time,
            "mode": result.mode,
            "metadata": result.metadata
        }
    
    # ==================== Session Management ====================
    
    def get_session_manager(self) -> Optional[SessionManager]:
        """Get the session manager instance."""
        return self.session_manager
    
    def create_new_session(self) -> Optional[Path]:
        """Create a new session folder."""
        if self.session_manager:
            return self.session_manager.create_session_folder()
        return None
    
    def end_session(self, queries_processed: int = 0) -> Optional[Path]:
        """End the current session and save summary."""
        if self.session_manager:
            return self.session_manager.save_session_summary(queries_processed)
        return None
    
    # ==================== Utility Methods ====================
    
    def _get_config_params(self) -> Dict:
        """Get config parameters for display."""
        return {
            "llm_model": self.config["external_llm"]["model"],
            "max_tokens": self.config["external_llm"]["max_tokens"],
            "temperature": self.config["external_llm"].get("temperature", 0.7),
            "embedding_model": self.config["embedding"]["model"],
            "dimension": self.config["embedding"]["dimension"],
            "top_k": self.config["retrieval"]["top_k"],
            "similarity_threshold": self.config["retrieval"].get("similarity_threshold", "N/A"),
            "hit_target": self.config["retrieval"].get("hit_target", "N/A"),
            "step": self.config["retrieval"].get("step", "N/A"),
            "max_context_length": self.config["retrieval"]["max_context_length"],
            "index_type": self.config["index"]["type"]
        }
    
    def get_stats(self) -> Dict:
        """Get system statistics."""
        return {
            "total_documents": self.index_service.get_document_count(),
            "embedding_model": self.config["embedding"]["model"],
            "embedding_dimension": self.config["embedding"]["dimension"],
            "index_type": self.config["index"]["type"],
            "llm_model": self.config["external_llm"]["model"]
        }

