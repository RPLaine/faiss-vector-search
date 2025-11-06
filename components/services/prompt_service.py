"""
Prompt Service - Centralized prompt template management.

Eliminates duplicate prompt loading code and provides caching.
"""

import logging
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)


class PromptService:
    """
    Manages prompt templates for the system.
    
    Provides:
    - Centralized prompt loading
    - Template caching for performance
    - Template validation
    - Easy access for all components
    """
    
    def __init__(self, prompts_dir: str = "prompts"):
        """
        Initialize prompt service.
        
        Args:
            prompts_dir: Directory containing prompt template files
        """
        self.prompts_dir = Path(prompts_dir)
        self._cache: Dict[str, str] = {}
        
        if not self.prompts_dir.exists():
            logger.warning(f"Prompts directory not found: {self.prompts_dir}")
    
    def get_prompt(self, prompt_name: str, use_cache: bool = True) -> str:
        """
        Get prompt template by name.
        
        Args:
            prompt_name: Name of the prompt (without .txt extension)
            use_cache: Whether to use cached version
            
        Returns:
            Prompt template string
        """
        # Check cache first
        if use_cache and prompt_name in self._cache:
            return self._cache[prompt_name]
        
        # Load from file
        prompt_path = self.prompts_dir / f"{prompt_name}.txt"
        
        try:
            with open(prompt_path, 'r', encoding='utf-8') as f:
                template = f.read()
            
            # Cache the template
            self._cache[prompt_name] = template
            logger.debug(f"Loaded prompt template: {prompt_name}")
            
            return template
            
        except FileNotFoundError:
            logger.error(f"Prompt template not found: {prompt_path}")
            raise FileNotFoundError(f"Prompt template '{prompt_name}' not found at {prompt_path}")
        
        except Exception as e:
            logger.error(f"Error loading prompt template {prompt_name}: {e}")
            raise
    
    def format_prompt(self, prompt_name: str, **kwargs) -> str:
        """
        Get and format prompt template with variables.
        
        Args:
            prompt_name: Name of the prompt template
            **kwargs: Variables to format into the template
            
        Returns:
            Formatted prompt string
        """
        template = self.get_prompt(prompt_name)
        
        try:
            return template.format(**kwargs)
        except KeyError as e:
            logger.error(f"Missing variable in prompt template {prompt_name}: {e}")
            raise ValueError(f"Missing required variable for prompt '{prompt_name}': {e}")
    
    def list_available_prompts(self) -> list:
        """
        List all available prompt templates (for GUI).
        
        Returns:
            List of prompt names
        """
        if not self.prompts_dir.exists():
            return []
        
        return [p.stem for p in self.prompts_dir.glob("*.txt")]
    
    def clear_cache(self) -> None:
        """Clear the prompt cache."""
        self._cache.clear()
        logger.debug("Prompt cache cleared")
    
    def preload_all(self) -> None:
        """Preload all prompt templates into cache."""
        for prompt_name in self.list_available_prompts():
            try:
                self.get_prompt(prompt_name, use_cache=False)
            except Exception as e:
                logger.warning(f"Failed to preload prompt {prompt_name}: {e}")
        
        logger.info(f"Preloaded {len(self._cache)} prompt templates")
