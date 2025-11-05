"""
Optimization Configuration Manager.

Manages configuration for the adaptive optimization subsystem.
"""

import json
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class OptimizationConfig:
    """Manages optimization configuration."""
    
    DEFAULT_CONFIG = {
        "enabled": True,
        "max_iterations": 5,
        "early_stop_threshold": 0.95,
        "exploration_rate": 0.3,
        "temperature_range": [0.3, 0.9],
        "top_k_range": [5, 30],
        "similarity_threshold_range": [0.3, 0.8],
        "hit_target_range": [2, 5],
        "show_intermediate_results": False,
        "cache_evaluations": True
    }
    
    def __init__(self, config_dict: Dict[str, Any] | None = None):
        """
        Initialize optimization config.
        
        Args:
            config_dict: Configuration dictionary (uses defaults if None)
        """
        self.config = self.DEFAULT_CONFIG.copy()
        if config_dict:
            self.config.update(config_dict)
    
    def get(self, key: str, default: Any = None) -> Any:
        """Get configuration value."""
        return self.config.get(key, default)
    
    def is_enabled(self) -> bool:
        """Check if optimization is enabled."""
        return self.config.get("enabled", True)
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return self.config.copy()
    
    @classmethod
    def from_file(cls, config_path: str) -> 'OptimizationConfig':
        """
        Load optimization config from file.
        
        Args:
            config_path: Path to config.json
            
        Returns:
            OptimizationConfig instance
        """
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                optimization_config = config.get("optimization", {})
                return cls(optimization_config)
        except Exception as e:
            logger.warning(f"Could not load optimization config: {e}. Using defaults.")
            return cls()
    
    def validate(self) -> bool:
        """
        Validate configuration values.
        
        Returns:
            True if valid, False otherwise
        """
        try:
            # Check ranges are valid
            for key in ["temperature_range", "similarity_threshold_range"]:
                range_val = self.config.get(key)
                if not (isinstance(range_val, list) and len(range_val) == 2 and range_val[0] < range_val[1]):
                    logger.error(f"Invalid {key}: {range_val}")
                    return False
            
            for key in ["top_k_range", "hit_target_range"]:
                range_val = self.config.get(key)
                if not (isinstance(range_val, list) and len(range_val) == 2 and range_val[0] < range_val[1]):
                    logger.error(f"Invalid {key}: {range_val}")
                    return False
            
            # Check thresholds
            if not 0 < self.config.get("early_stop_threshold", 1.0) <= 1.0:
                logger.error(f"Invalid early_stop_threshold")
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Config validation error: {e}")
            return False
