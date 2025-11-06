"""
None Mode - Simple LLM Request

Direct LLM query without any RAG context retrieval.
Useful for general questions or testing LLM behavior.
"""

import time
import logging
from typing import Dict, Any

from .base_mode import BaseMode, QueryResult
from ..services.llm_service import LLMService
from ..services.prompt_service import PromptService

logger = logging.getLogger(__name__)


class NoneMode(BaseMode):
    """Simple LLM query mode without context retrieval."""
    
    def __init__(self, config: Dict[str, Any], rag_system=None):
        """
        Initialize None mode.
        
        Args:
            config: System configuration
            rag_system: Unused, for interface compatibility
        """
        self.config = config
        prompts_dir = config.get('prompts_dir', 'prompts')
        llm_config = config.get('external_llm', {})
        
        self.llm_service = LLMService(llm_config)
        self.prompt_service = PromptService(prompts_dir)
        
    def execute(self, query: str, **kwargs) -> QueryResult:
        """
        Execute direct LLM query without context.
        
        Args:
            query: User's question
            **kwargs: Optional parameters (template_name, temperature)
            
        Returns:
            QueryResult with LLM response
        """
        start_time = time.time()
        
        # Get template
        template_name = kwargs.get('template_name', 'direct')
        
        # Build prompt without context
        prompt = self.prompt_service.build_prompt(
            query=query,
            template_name=template_name
        )
        
        # Get temperature
        temperature = kwargs.get('temperature', self.config.get('external_llm', {}).get('temperature', 0.7))
        
        # Display prompt if UI callback is provided
        ui_callback = kwargs.get('ui_callback')
        json_callback = kwargs.get('json_callback')
        
        if ui_callback:
            ui_callback.display_llm_request(prompt, 0)  # 0 documents for none mode
        
        # Call LLM with spinner
        llm_start = time.time()
        
        if ui_callback:
            # Use spinner while waiting for response
            with ui_callback.create_llm_spinner():
                llm_response = self.llm_service.call(
                    prompt=prompt,
                    temperature=temperature,
                    action_callback=json_callback
                )
        else:
            llm_response = self.llm_service.call(
                prompt=prompt,
                temperature=temperature,
                action_callback=json_callback
            )
        
        generation_time = time.time() - llm_start
        response_text = llm_response.text
        
        # Display response immediately if UI callback is provided
        if ui_callback:
            ui_callback.display_llm_response(response_text, generation_time)
        
        processing_time = time.time() - start_time
        
        return QueryResult(
            response=response_text,
            processing_time=processing_time,
            mode='none',
            metadata={
                'template_name': template_name,
                'temperature': temperature,
                'prompt_length': len(prompt),
                'response_length': len(response_text),
                'generation_time': generation_time,
                'prompt': prompt
            }
        )
    
    def get_mode_name(self) -> str:
        """Return mode name."""
        return "none"
    
    def get_mode_description(self) -> str:
        """Return mode description."""
        return "Direct LLM query without context retrieval"
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate configuration for None mode.
        
        Args:
            config: System configuration
            
        Returns:
            True if LLM configuration is present
        """
        return 'external_llm' in config and 'url' in config['external_llm']
