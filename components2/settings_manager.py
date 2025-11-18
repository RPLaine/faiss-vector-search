"""
Settings Manager

Centralized settings management for the AI Journalist demo system.
Handles loading, validation, and persistence of LLM configuration and prompts.
"""

import logging
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class SettingsManager:
    """
    Manages system settings including LLM configuration and prompts.
    
    Settings are stored in settings.json and include:
    - LLM configuration (URL, model, temperature, headers, etc.)
    - Prompt templates (hidden_context, phase_0_planning, task_execution, task_validation)
    """
    
    # Required template variables for each prompt
    PROMPT_REQUIREMENTS = {
        "phase_0_planning": ["{agent_name}", "{agent_context}"],
        "task_execution_first": ["{agent_name}", "{goal}", "{task_name}", "{task_description}", "{expected_output}", "{context}"],
        "task_execution_sequential": ["{agent_name}", "{goal}", "{task_id}", "{task_name}", "{task_description}", "{expected_output}", "{previous_tasks_context}", "{additional_context}"],
        "task_validation": ["{task_name}", "{task_description}", "{expected_output}", "{actual_output}"],
        "hidden_context": []  # No required variables
    }
    
    def __init__(self, settings_file: str = "settings.json"):
        """
        Initialize the settings manager.
        
        Args:
            settings_file: Path to settings JSON file
        """
        self.settings_file = Path(settings_file)
        self._settings: Dict[str, Any] = {}
        self._load_settings()
    
    def _load_settings(self):
        """Load settings from file."""
        if self.settings_file.exists():
            try:
                with open(self.settings_file, 'r', encoding='utf-8') as f:
                    self._settings = json.load(f)
                logger.info(f"Loaded settings from {self.settings_file}")
            except Exception as e:
                logger.error(f"Failed to load settings: {e}")
                self._settings = self._get_default_settings()
        else:
            logger.warning(f"Settings file not found: {self.settings_file}")
            self._settings = self._get_default_settings()
            self._save_settings()
    
    def _save_settings(self):
        """Save settings to file."""
        try:
            # Create backup of existing settings
            if self.settings_file.exists():
                backup_path = self.settings_file.with_suffix('.json.backup')
                self.settings_file.rename(backup_path)
            
            with open(self.settings_file, 'w', encoding='utf-8') as f:
                json.dump(self._settings, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Saved settings to {self.settings_file}")
            
            # Remove backup after successful save
            backup_path = self.settings_file.with_suffix('.json.backup')
            if backup_path.exists():
                backup_path.unlink()
                
        except Exception as e:
            logger.error(f"Failed to save settings: {e}")
            # Restore backup if save failed
            backup_path = self.settings_file.with_suffix('.json.backup')
            if backup_path.exists():
                backup_path.rename(self.settings_file)
            raise
    
    def _get_default_settings(self) -> Dict[str, Any]:
        """
        Get default settings structure.
        
        Returns:
            Default settings dictionary
        """
        return {
            "language": "en",
            "llm": {
                "url": "http://localhost:11434/v1/chat/completions",
                "model": "qwen",
                "payload_type": "message",
                "timeout": 300,
                "max_tokens": 2000,
                "temperature": 0.3,
                "top_p": 0.90,
                "top_k": 20,
                "headers": {
                    "Content-Type": "application/json"
                }
            },
            "prompts": {
                "hidden_context": "",
                "phase_0_planning": "",
                "task_execution_first": "",
                "task_execution_sequential": "",
                "task_validation": ""
            },
            "retrieval": {
                "enabled": False,
                "embedding_model": "TurkuNLP/sbert-cased-finnish-paraphrase",
                "dimension": 768,
                "index_type": "IndexFlatIP",
                "index_path": "data2/faiss.index",
                "metadata_path": "data2/metadata.pkl",
                "hit_target": 3,
                "top_k": 10,
                "step": 0.05,
                "use_dynamic_threshold": True,
                "store_task_outputs": False,
                "max_context_length": 5000
            }
        }
    
    def get_llm_config(self) -> Dict[str, Any]:
        """
        Get LLM configuration.
        
        Returns:
            LLM configuration dictionary
        """
        return self._settings.get("llm", {}).copy()
    
    def get_prompt(self, prompt_name: str) -> str:
        """
        Get a prompt template by name.
        
        Args:
            prompt_name: Name of the prompt (e.g., 'hidden_context', 'phase_0_planning')
            
        Returns:
            Prompt template string
            
        Raises:
            KeyError: If prompt name doesn't exist
        """
        prompts = self._settings.get("prompts", {})
        if prompt_name not in prompts:
            raise KeyError(f"Prompt not found: {prompt_name}")
        return prompts[prompt_name]
    
    def get_all_prompts(self) -> Dict[str, str]:
        """
        Get all prompt templates.
        
        Returns:
            Dictionary of prompt name -> template string
        """
        return self._settings.get("prompts", {}).copy()
    
    def get_all_settings(self) -> Dict[str, Any]:
        """
        Get complete settings structure.
        
        Returns:
            Complete settings dictionary
        """
        return {
            "language": self.get_language(),
            "llm": self.get_llm_config(),
            "prompts": self.get_all_prompts(),
            "retrieval": self.get_retrieval_config()
        }
    
    def get_retrieval_config(self) -> Dict[str, Any]:
        """
        Get retrieval configuration.
        
        Returns:
            Retrieval configuration dictionary
        """
        return self._settings.get("retrieval", {}).copy()
    
    def update_retrieval_config(self, config: Dict[str, Any]) -> None:
        """
        Update retrieval configuration (supports partial updates).
        
        Args:
            config: New retrieval configuration dictionary (can be partial)
            
        Raises:
            ValueError: If configuration is invalid
        """
        # Get existing config and merge with updates
        existing = self._settings.get("retrieval", {})
        updated = existing.copy()
        updated.update(config)
        
        # Validate required fields in merged config
        required_fields = ["enabled", "embedding_model", "dimension", "index_path", "metadata_path"]
        missing_fields = [f for f in required_fields if f not in updated]
        if missing_fields:
            raise ValueError(f"Missing required retrieval config fields: {', '.join(missing_fields)}")
        
        # Validate types
        if not isinstance(updated["enabled"], bool):
            raise ValueError("enabled must be a boolean")
        
        if not isinstance(updated["dimension"], int) or updated["dimension"] <= 0:
            raise ValueError("dimension must be a positive integer")
        
        if "hit_target" in updated and (not isinstance(updated["hit_target"], int) or updated["hit_target"] <= 0):
            raise ValueError("hit_target must be a positive integer")
        
        if "top_k" in updated and (not isinstance(updated["top_k"], int) or updated["top_k"] <= 0):
            raise ValueError("top_k must be a positive integer")
        
        if "step" in updated:
            step = updated["step"]
            if not isinstance(step, (int, float)) or step <= 0 or step > 1:
                raise ValueError("step must be a number between 0 and 1")
        
        # Update settings with merged config
        self._settings["retrieval"] = updated
        self._save_settings()
        logger.info("Updated retrieval configuration")
    
    def update_llm_config(self, config: Dict[str, Any]) -> None:
        """
        Update LLM configuration.
        
        Args:
            config: New LLM configuration dictionary
            
        Raises:
            ValueError: If configuration is invalid
        """
        # Validate required fields
        required_fields = ["url", "model", "payload_type"]
        missing_fields = [f for f in required_fields if f not in config]
        if missing_fields:
            raise ValueError(f"Missing required LLM config fields: {', '.join(missing_fields)}")
        
        # Validate payload_type
        if config["payload_type"] not in ["message", "completion"]:
            raise ValueError("payload_type must be 'message' or 'completion'")
        
        # Validate numeric fields
        if "timeout" in config and not isinstance(config["timeout"], (int, float)):
            raise ValueError("timeout must be a number")
        
        if "max_tokens" in config and not isinstance(config["max_tokens"], int):
            raise ValueError("max_tokens must be an integer")
        
        if "temperature" in config:
            temp = config["temperature"]
            if not isinstance(temp, (int, float)) or temp < 0 or temp > 2:
                raise ValueError("temperature must be a number between 0 and 2")
        
        # Update settings
        self._settings["llm"] = config
        self._save_settings()
        logger.info("Updated LLM configuration")
    
    def update_prompt(self, prompt_name: str, content: str) -> None:
        """
        Update a single prompt template.
        
        Args:
            prompt_name: Name of the prompt
            content: New prompt content
            
        Raises:
            ValueError: If prompt validation fails
        """
        # Validate prompt name
        if "prompts" not in self._settings:
            self._settings["prompts"] = {}
        
        # Validate required template variables
        if prompt_name in self.PROMPT_REQUIREMENTS:
            required_vars = self.PROMPT_REQUIREMENTS[prompt_name]
            missing_vars = [v for v in required_vars if v not in content]
            if missing_vars:
                raise ValueError(
                    f"Prompt '{prompt_name}' is missing required template variables: {', '.join(missing_vars)}"
                )
        
        # Update prompt
        self._settings["prompts"][prompt_name] = content
        self._save_settings()
        logger.info(f"Updated prompt: {prompt_name}")
    
    def update_prompts(self, prompts: Dict[str, str]) -> None:
        """
        Update multiple prompt templates.
        
        Args:
            prompts: Dictionary of prompt name -> content
            
        Raises:
            ValueError: If any prompt validation fails
        """
        # Validate all prompts first
        for prompt_name, content in prompts.items():
            if prompt_name in self.PROMPT_REQUIREMENTS:
                required_vars = self.PROMPT_REQUIREMENTS[prompt_name]
                missing_vars = [v for v in required_vars if v not in content]
                if missing_vars:
                    raise ValueError(
                        f"Prompt '{prompt_name}' is missing required template variables: {', '.join(missing_vars)}"
                    )
        
        # Update all prompts
        if "prompts" not in self._settings:
            self._settings["prompts"] = {}
        
        self._settings["prompts"].update(prompts)
        self._save_settings()
        logger.info(f"Updated {len(prompts)} prompts")
    
    def reset_to_defaults(self) -> None:
        """Reset all settings to default values."""
        self._settings = self._get_default_settings()
        self._save_settings()
        logger.info("Reset settings to defaults")
    
    def reload(self) -> None:
        """Reload settings from file."""
        self._load_settings()
        logger.info("Reloaded settings from file")
    
    def get_language(self) -> str:
        """
        Get current language setting.
        
        Returns:
            Language code ('en' or 'fi')
        """
        return self._settings.get("language", "en")
    
    def update_language(self, language: str) -> None:
        """
        Update language setting.
        
        Args:
            language: Language code ('en' or 'fi')
            
        Raises:
            ValueError: If language is not supported
        """
        if language not in ["en", "fi"]:
            raise ValueError(f"Unsupported language: {language}. Supported languages: en, fi")
        
        self._settings["language"] = language
        self._save_settings()
        logger.info(f"Updated language to: {language}")
