"""
Query Executor

Unified interface for executing queries across all modes.
Used by both CLI and API endpoints.
"""

import logging
from typing import Dict, Any, Optional

from .mode_selector import ModeSelector
from ..modes.base_mode import QueryResult

logger = logging.getLogger(__name__)


class QueryExecutor:
    """Executes queries using selected mode."""
    
    def __init__(self, config: Dict[str, Any], rag_system):
        """
        Initialize query executor.
        
        Args:
            config: System configuration
            rag_system: RAG system instance
        """
        self.config = config
        self.rag_system = rag_system
        self.mode_selector = ModeSelector(config, rag_system)
        
    def execute_query(
        self,
        query: str,
        mode: Optional[str] = None,
        **kwargs
    ) -> QueryResult:
        """
        Execute a query using specified mode.
        
        Args:
            query: User's question
            mode: Mode to use ('none', 'faiss', 'full'). Uses default if None.
            **kwargs: Mode-specific parameters:
                - top_k: Max documents to retrieve
                - hit_target: Desired number of documents
                - template_name: Prompt template to use
                - max_improvement_iterations: For full mode
                
        Returns:
            QueryResult with response and metadata
            
        Raises:
            ValueError: If mode is invalid
            Exception: If query execution fails
        """
        # Reload config to pick up any changes from config.json
        # This updates the shared config dict in-place
        self.rag_system.reload_config()
        
        # Get mode instance
        try:
            mode_instance = self.mode_selector.get_mode(mode)
        except ValueError as e:
            logger.error(f"Mode selection failed: {e}")
            raise
        
        # Log execution start
        mode_name = mode_instance.get_mode_name()
        logger.info(f"Executing query in '{mode_name}' mode: {query[:50]}...")
        
        # Execute query
        try:
            result = mode_instance.execute(query, **kwargs)
            logger.info(
                f"Query completed in {result.processing_time:.2f}s "
                f"using mode '{result.mode}'"
            )
            return result
            
        except Exception as e:
            logger.error(f"Query execution failed in mode '{mode_name}': {e}")
            raise
    
    def list_modes(self) -> Dict[str, str]:
        """
        Get available modes with descriptions.
        
        Returns:
            Dictionary mapping mode names to descriptions
        """
        return self.mode_selector.list_available_modes()
    
    def validate_mode(self, mode_name: str) -> bool:
        """
        Check if a mode is available and properly configured.
        
        Args:
            mode_name: Name of mode to validate
            
        Returns:
            True if mode is usable
        """
        return self.mode_selector.validate_mode_config(mode_name)
    
    def get_default_mode(self) -> str:
        """
        Get the default query mode.
        
        Returns:
            Name of default mode
        """
        return self.mode_selector.get_default_mode_name()
