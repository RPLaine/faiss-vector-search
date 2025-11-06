"""
FAISS Mode - Dynamic Retrieval

Query mode with dynamic threshold-based context retrieval.
Retrieves relevant documents from FAISS index with adaptive thresholding.
"""

import time
import logging
from typing import Dict, Any, Optional

from .base_mode import BaseMode, QueryResult
from ..retrieval.dynamic_retriever import DynamicRetriever
from ..services.llm_service import LLMService
from ..services.prompt_service import PromptService

logger = logging.getLogger(__name__)


class FaissMode(BaseMode):
    """FAISS query mode with dynamic context retrieval."""
    
    def __init__(self, config: Dict[str, Any], rag_system):
        """
        Initialize FAISS mode.
        
        Args:
            config: System configuration
            rag_system: RAG system instance for document retrieval
        """
        self.config = config
        self.rag_system = rag_system
        
        # Get service configs
        prompts_dir = config.get('prompts_dir', 'prompts')
        llm_config = config.get('external_llm', {})
        
        # Initialize services
        self.retriever = DynamicRetriever(config, rag_system)
        self.llm_service = LLMService(llm_config)
        self.prompt_service = PromptService(prompts_dir)
        
    def execute(self, query: str, **kwargs) -> QueryResult:
        """
        Execute query with dynamic retrieval.
        
        Args:
            query: User's question
            **kwargs: Optional parameters (template_name, top_k, hit_target)
            
        Returns:
            QueryResult with LLM response and retrieval metadata
        """
        start_time = time.time()
        
        # Get UI callback if provided
        ui_callback = kwargs.get('ui_callback')
        
        # Dynamic retrieval
        retrieval_result = self.retriever.retrieve(
            query=query,
            top_k=kwargs.get('top_k'),
            hit_target=kwargs.get('hit_target'),
            ui_callback=ui_callback
        )
        
        # Build prompt with context
        template_name = kwargs.get('template_name', 'base')
        prompt = self.prompt_service.build_prompt_with_context(
            query=query,
            context_docs=retrieval_result['documents'],
            template_name=template_name
        )
        
        # Display prompt if UI callback is provided
        if ui_callback:
            ui_callback.display_llm_request(prompt, len(retrieval_result['documents']))
        
        # Generate response with spinner
        temperature = kwargs.get('temperature', self.config.get('external_llm', {}).get('temperature', 0.7))
        
        if ui_callback:
            # Use spinner while waiting for response
            with ui_callback.create_llm_spinner():
                llm_response = self.llm_service.call(prompt, temperature)
        else:
            llm_response = self.llm_service.call(prompt, temperature)
        
        # Display response immediately if UI callback is provided
        if ui_callback:
            ui_callback.display_llm_response(llm_response.text, llm_response.generation_time)
        
        processing_time = time.time() - start_time
        
        return QueryResult(
            response=llm_response.text,
            processing_time=processing_time,
            mode='faiss',
            metadata={
                'template_name': template_name,
                'temperature': temperature,
                'num_docs_found': len(retrieval_result['documents']),
                'retrieval_time': retrieval_result['retrieval_time'],
                'threshold_used': retrieval_result['threshold_used'],
                'threshold_stats': retrieval_result.get('threshold_stats'),
                'generation_time': llm_response.generation_time,
                'context_docs': retrieval_result['documents'],
                'total_documents': len(retrieval_result['documents']),
                'prompt': prompt  # Add prompt for display
            }
        )
    
    def get_mode_name(self) -> str:
        """Return mode name."""
        return "faiss"
    
    def get_mode_description(self) -> str:
        """Return mode description."""
        return "Dynamic context retrieval with FAISS vector search"
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate configuration for FAISS mode.
        
        Args:
            config: System configuration
            
        Returns:
            True if both LLM and index configuration are present
        """
        has_llm = 'external_llm' in config
        has_index = 'index' in config and 'save_path' in config['index']
        return has_llm and has_index
