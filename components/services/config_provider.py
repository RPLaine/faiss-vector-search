"""
Configuration Provider - Centralized configuration management.

Provides clean access to configuration for all subsystems without duplication.
Thread-safe and suitable for web service environments.
"""

import os
import logging
from typing import Dict, Any, Optional
from pathlib import Path
import json

logger = logging.getLogger(__name__)


class ConfigurationProvider:
    """
    Centralized configuration provider for all subsystems.
    
    Eliminates configuration duplication and provides clean access patterns
    for different components. Designed to work with GUI frontends.
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize configuration provider.
        
        Args:
            config: Full system configuration dictionary
        """
        self._config = config
        self._validate_config()
    
    def _validate_config(self) -> None:
        """Validate that required configuration keys exist."""
        required_keys = ["external_llm", "embedding", "retrieval", "index"]
        for key in required_keys:
            if key not in self._config:
                logger.warning(f"Missing configuration key: {key}")
    
    @classmethod
    def from_file(cls, config_path: str = "config.json") -> 'ConfigurationProvider':
        """
        Create configuration provider from file.
        
        Args:
            config_path: Path to configuration file
            
        Returns:
            ConfigurationProvider instance
        """
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            return cls(config)
        except Exception as e:
            logger.error(f"Failed to load configuration from {config_path}: {e}")
            raise
    
    def get_full_config(self) -> Dict[str, Any]:
        """Get the complete configuration dictionary."""
        return self._config.copy()
    
    # LLM Configuration
    
    def get_llm_config(self, overrides: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Get base LLM configuration with optional overrides.
        
        Args:
            overrides: Optional dictionary to override base settings
            
        Returns:
            LLM configuration dictionary
        """
        base = self._config.get("external_llm", {}).copy()
        if overrides:
            base.update(overrides)
        return base
    
    def get_evaluator_config(self) -> Dict[str, Any]:
        """
        Get LLM configuration for response evaluation.
        
        Returns:
            Evaluator-specific LLM configuration
        """
        opt_config = self._config.get("optimization", {})
        return self.get_llm_config(opt_config.get("evaluator", {}))
    
    def get_improver_config(self) -> Dict[str, Any]:
        """
        Get LLM configuration for response improvement.
        
        Returns:
            Improver-specific LLM configuration
        """
        imp_config = self._config.get("improvement", {})
        return self.get_llm_config(imp_config.get("improver", {}))
    
    def get_llm_temperature(self) -> float:
        """Get default LLM temperature."""
        return self._config.get("external_llm", {}).get("temperature", 0.5)
    
    def get_llm_max_tokens(self) -> int:
        """Get default LLM max tokens."""
        return self._config.get("external_llm", {}).get("max_tokens", 1000)
    
    # Embedding Configuration
    
    def get_embedding_config(self) -> Dict[str, Any]:
        """Get embedding model configuration."""
        return self._config.get("embedding", {}).copy()
    
    def get_embedding_model(self) -> str:
        """Get embedding model name."""
        return self._config.get("embedding", {}).get("model", "")
    
    def get_embedding_dimension(self) -> int:
        """Get embedding dimension."""
        return self._config.get("embedding", {}).get("dimension", 768)
    
    # Retrieval Configuration
    
    def get_retrieval_config(self) -> Dict[str, Any]:
        """Get retrieval configuration."""
        return self._config.get("retrieval", {}).copy()
    
    def get_retrieval_top_k(self) -> int:
        """Get default top_k for retrieval."""
        return self._config.get("retrieval", {}).get("top_k", 10)
    
    def get_retrieval_similarity_threshold(self) -> float:
        """Get similarity threshold."""
        return self._config.get("retrieval", {}).get("similarity_threshold", 0.55)
    
    def get_retrieval_hit_target(self) -> int:
        """Get hit target."""
        return self._config.get("retrieval", {}).get("hit_target", 3)
    
    # Index Configuration
    
    def get_index_config(self) -> Dict[str, Any]:
        """Get FAISS index configuration."""
        return self._config.get("index", {}).copy()
    
    def get_index_save_path(self) -> str:
        """Get FAISS index save path."""
        return self._config.get("index", {}).get("save_path", "data/faiss.index")
    
    def get_metadata_path(self) -> str:
        """Get metadata save path."""
        return self._config.get("index", {}).get("metadata_path", "data/metadata.pkl")
    
    # Optimization Configuration
    
    def is_optimization_enabled(self) -> bool:
        """Check if optimization is enabled."""
        return self._config.get("optimization", {}).get("enabled", False)
    
    def get_optimization_config(self) -> Dict[str, Any]:
        """Get optimization configuration."""
        return self._config.get("optimization", {}).copy()
    
    def get_temperature_values(self) -> list:
        """Get temperature values to test during optimization."""
        return self._config.get("optimization", {}).get("temperature_values", [0.25, 0.5, 0.75, 1.0, 1.25])
    
    # Improvement Configuration
    
    def is_improvement_enabled(self) -> bool:
        """Check if iterative improvement is enabled."""
        return self._config.get("improvement", {}).get("enabled", False)
    
    def get_improvement_config(self) -> Dict[str, Any]:
        """Get improvement configuration."""
        return self._config.get("improvement", {}).copy()
    
    def get_target_score(self) -> float:
        """Get target score for improvement."""
        return self._config.get("improvement", {}).get("target_score", 1.0)
    
    # Update Methods (for GUI configuration changes)
    
    def update_llm_temperature(self, temperature: float) -> None:
        """Update LLM temperature (for GUI control)."""
        if "external_llm" not in self._config:
            self._config["external_llm"] = {}
        self._config["external_llm"]["temperature"] = temperature
        logger.info(f"Updated LLM temperature to {temperature}")
    
    def update_retrieval_params(self, top_k: Optional[int] = None, 
                               similarity_threshold: Optional[float] = None,
                               hit_target: Optional[int] = None) -> None:
        """Update retrieval parameters (for GUI control)."""
        if "retrieval" not in self._config:
            self._config["retrieval"] = {}
        
        if top_k is not None:
            self._config["retrieval"]["top_k"] = top_k
        if similarity_threshold is not None:
            self._config["retrieval"]["similarity_threshold"] = similarity_threshold
        if hit_target is not None:
            self._config["retrieval"]["hit_target"] = hit_target
        
        logger.info(f"Updated retrieval params: top_k={top_k}, threshold={similarity_threshold}, hit_target={hit_target}")
    
    def enable_optimization(self, enabled: bool = True) -> None:
        """Enable or disable optimization (for GUI toggle)."""
        if "optimization" not in self._config:
            self._config["optimization"] = {}
        self._config["optimization"]["enabled"] = enabled
        logger.info(f"Optimization {'enabled' if enabled else 'disabled'}")
    
    def enable_improvement(self, enabled: bool = True) -> None:
        """Enable or disable improvement (for GUI toggle)."""
        if "improvement" not in self._config:
            self._config["improvement"] = {}
        self._config["improvement"]["enabled"] = enabled
        logger.info(f"Improvement {'enabled' if enabled else 'disabled'}")
    
    def to_dict(self) -> Dict[str, Any]:
        """Export configuration as dictionary (for GUI display)."""
        return self._config.copy()
    
    def to_json(self) -> str:
        """Export configuration as JSON string (for GUI API)."""
        return json.dumps(self._config, indent=2)
    
    # Static utility methods for config file operations
    
    @staticmethod
    def save_config(config: Dict[str, Any], config_path: str) -> None:
        """
        Save configuration to file.
        
        Args:
            config: Configuration dictionary to save
            config_path: Path where to save the configuration
        """
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2)
        logger.info(f"Saved configuration to {config_path}")
    
    @staticmethod
    def create_temp_config_for_directory(data_dir: str, base_config_path: str = "config.json") -> str:
        """
        Create temporary configuration with updated paths for specific data directory.
        
        Args:
            data_dir: Target data directory for index and metadata files
            base_config_path: Base configuration file to copy from
            
        Returns:
            Path to the temporary configuration file
        """
        # Load original config
        with open(base_config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Update paths to use the specified data directory
        config["index"]["save_path"] = os.path.join(data_dir, "faiss.index")
        config["index"]["metadata_path"] = os.path.join(data_dir, "metadata.pkl")
        
        # Create temporary config file
        temp_config_path = f"temp_config_{os.getpid()}.json"
        ConfigurationProvider.save_config(config, temp_config_path)
        
        logger.info(f"Created temporary config for directory: {data_dir}")
        return temp_config_path
    
    @staticmethod
    def cleanup_temp_config(temp_config_path: str) -> None:
        """
        Remove temporary configuration file.
        
        Args:
            temp_config_path: Path to the temporary configuration file to remove
        """
        try:
            if os.path.exists(temp_config_path):
                os.remove(temp_config_path)
                logger.info(f"Cleaned up temporary config: {temp_config_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temporary config {temp_config_path}: {e}")
