"""
Base Mode Interface

Abstract base class for all query execution modes.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class QueryResult:
    """Standardized result from any query mode."""
    response: str
    processing_time: float
    mode: str
    metadata: Dict[str, Any]
    

class BaseMode(ABC):
    """Abstract base class for query execution modes."""
    
    @abstractmethod
    def execute(self, query: str, **kwargs) -> QueryResult:
        """
        Execute query in this mode.
        
        Args:
            query: User's question
            **kwargs: Mode-specific parameters
            
        Returns:
            QueryResult with response and metadata
        """
        pass
    
    @abstractmethod
    def get_mode_name(self) -> str:
        """Return the name of this mode."""
        pass
    
    @abstractmethod
    def get_mode_description(self) -> str:
        """Return description of what this mode does."""
        pass
    
    @abstractmethod
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate that configuration supports this mode.
        
        Args:
            config: System configuration
            
        Returns:
            True if configuration is valid for this mode
        """
        pass
