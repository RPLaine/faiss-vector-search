"""
Mode Selector

Determines which query mode to use based on configuration and parameters.
Provides mode instantiation and validation.
"""

import logging
from typing import Dict, Any, Optional

from ..modes.none_mode import NoneMode
from ..modes.faiss_mode import FaissMode
from ..modes.full_mode import FullMode
from ..modes.base_mode import BaseMode

logger = logging.getLogger(__name__)


class ModeSelector:
    """Selects and instantiates appropriate query mode."""
    
    # Available modes
    MODES = {
        'none': NoneMode,
        'faiss': FaissMode,
        'full': FullMode
    }
    
    def __init__(self, config: Dict[str, Any], rag_system):
        """
        Initialize mode selector.
        
        Args:
            config: System configuration
            rag_system: RAG system instance
        """
        self.config = config
        self.rag_system = rag_system
        self._mode_instances = {}
        
    def get_mode(self, mode_name: Optional[str] = None) -> BaseMode:
        """
        Get mode instance by name.
        
        Args:
            mode_name: Name of mode ('none', 'faiss', 'full')
                      If None, uses default from config
                      
        Returns:
            Instantiated mode object
            
        Raises:
            ValueError: If mode name is invalid or mode cannot be instantiated
        """
        # Use default mode from config if not specified
        if mode_name is None:
            mode_name = self.config.get('query_mode', 'faiss')
        else:
            mode_name = mode_name.lower()
        
        # Validate mode name
        if mode_name not in self.MODES:
            available = ', '.join(self.MODES.keys())
            raise ValueError(
                f"Invalid mode '{mode_name}'. Available modes: {available}"
            )
        
        # Return cached instance if available
        if mode_name in self._mode_instances:
            return self._mode_instances[mode_name]
        
        # Instantiate mode
        mode_class = self.MODES[mode_name]
        
        try:
            mode_instance = mode_class(self.config, self.rag_system)
            
            # Validate configuration
            if not mode_instance.validate_config(self.config):
                raise ValueError(
                    f"Configuration validation failed for mode '{mode_name}'"
                )
            
            # Cache instance
            self._mode_instances[mode_name] = mode_instance
            
            logger.info(f"Initialized mode: {mode_instance.get_mode_description()}")
            
            return mode_instance
            
        except Exception as e:
            logger.error(f"Failed to instantiate mode '{mode_name}': {e}")
            raise ValueError(f"Cannot instantiate mode '{mode_name}': {e}") from e
    
    def list_available_modes(self) -> Dict[str, str]:
        """
        Get all available modes with descriptions.
        
        Returns:
            Dictionary mapping mode names to descriptions
        """
        modes_info = {}
        
        for mode_name, mode_class in self.MODES.items():
            try:
                # Create temporary instance to get description
                mode = mode_class(self.config, self.rag_system)
                modes_info[mode_name] = mode.get_mode_description()
            except Exception as e:
                logger.warning(f"Cannot describe mode '{mode_name}': {e}")
                modes_info[mode_name] = f"Mode unavailable: {str(e)}"
        
        return modes_info
    
    def validate_mode_config(self, mode_name: str) -> bool:
        """
        Check if configuration supports a specific mode.
        
        Args:
            mode_name: Name of mode to validate
            
        Returns:
            True if mode can be used with current config
        """
        if mode_name not in self.MODES:
            return False
        
        try:
            mode_class = self.MODES[mode_name]
            temp_mode = mode_class(self.config, self.rag_system)
            return temp_mode.validate_config(self.config)
        except Exception as e:
            logger.debug(f"Mode '{mode_name}' validation failed: {e}")
            return False
    
    def get_default_mode_name(self) -> str:
        """
        Get the default mode from configuration.
        
        Returns:
            Name of default mode
        """
        return self.config.get('query_mode', 'faiss')
