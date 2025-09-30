"""
Configuration Manager module for the FAISS-External LLM RAG system.

This module handles configuration file operations including temporary config
creation, cleanup, and configuration loading/modification.
"""

import json
import os
import tempfile
from typing import Dict, Any


class ConfigManager:
    """Manages configuration files and temporary configuration operations."""
    
    @staticmethod
    def load_config(config_path: str = "config.json") -> Dict[str, Any]:
        """
        Load configuration from file.
        
        Args:
            config_path: Path to the configuration file
            
        Returns:
            Configuration dictionary
        """
        with open(config_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
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
        config = ConfigManager.load_config(base_config_path)
        
        # Update paths to use the specified data directory
        config["index"]["save_path"] = os.path.join(data_dir, "faiss.index")
        config["index"]["metadata_path"] = os.path.join(data_dir, "metadata.pkl")
        
        # Create temporary config file
        temp_config_path = f"temp_config_{os.getpid()}.json"
        ConfigManager.save_config(config, temp_config_path)
        
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
        except Exception:
            # Silently ignore cleanup errors - not critical
            pass
    
    @staticmethod
    def update_config_paths(config: Dict[str, Any], data_dir: str) -> Dict[str, Any]:
        """
        Update configuration paths to point to specified data directory.
        
        Args:
            config: Configuration dictionary to update
            data_dir: Target data directory
            
        Returns:
            Updated configuration dictionary
        """
        updated_config = config.copy()
        
        # Update index and metadata paths
        if "index" in updated_config:
            updated_config["index"]["save_path"] = os.path.join(data_dir, "faiss.index")
            updated_config["index"]["metadata_path"] = os.path.join(data_dir, "metadata.pkl")
        
        return updated_config
    
    @staticmethod
    def validate_config(config: Dict[str, Any]) -> bool:
        """
        Validate that configuration has required fields.
        
        Args:
            config: Configuration dictionary to validate
            
        Returns:
            True if configuration is valid, False otherwise
        """
        required_fields = [
            ("index", "save_path"),
            ("index", "metadata_path"),
            ("external_llm", "api_url"),
            ("external_llm", "headers")
        ]
        
        for field_path in required_fields:
            current = config
            for field in field_path:
                if field not in current:
                    return False
                current = current[field]
        
        return True