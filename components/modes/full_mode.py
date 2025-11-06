"""
Full Mode - Complete RAG Pipeline

Full pipeline with:
1. Dynamic retrieval (adaptive threshold for hit target)
2. Temperature optimization (test multiple temperatures, select best)
3. Response improvement (iterative refinement until convergence)
"""

import time
import logging
from typing import Dict, Any

from .base_mode import BaseMode, QueryResult
from ..retrieval.dynamic_retriever import DynamicRetriever
from ..optimization import OptimizationCoordinator
from ..improvement import ImprovementCoordinator

logger = logging.getLogger(__name__)


class FullMode(BaseMode):
    """Full RAG pipeline with all optimizations enabled."""
    
    def __init__(self, config: Dict[str, Any], rag_system):
        """
        Initialize Full mode.
        
        Args:
            config: System configuration
            rag_system: RAG system instance
        """
        self.config = config
        self.rag_system = rag_system
        self.retriever = DynamicRetriever(config, rag_system)
        self.optimizer = OptimizationCoordinator(rag_system, config)
        self.improver = ImprovementCoordinator(config)
        
    def execute(self, query: str, **kwargs) -> QueryResult:
        """
        Execute full optimized pipeline.
        
        Pipeline:
        1. Dynamic retrieval with hit target
        2. Temperature optimization
        3. Response improvement with auto-stop
        
        Args:
            query: User's question
            **kwargs: Optional parameters
            
        Returns:
            QueryResult with optimized response and full metadata
        """
        start_time = time.time()
        pipeline_metadata = {}
        
        # Step 1: Dynamic Retrieval
        logger.info("Step 1/3: Dynamic retrieval")
        retrieval_result = self.retriever.retrieve(
            query=query,
            top_k=kwargs.get('top_k'),
            hit_target=kwargs.get('hit_target')
        )
        pipeline_metadata['retrieval'] = {
            'num_docs': len(retrieval_result['documents']),
            'threshold_used': retrieval_result['threshold_used'],
            'retrieval_time': retrieval_result['retrieval_time'],
            'threshold_stats': retrieval_result.get('threshold_stats')
        }
        
        # Step 2: Temperature Optimization
        logger.info("Step 2/3: Temperature optimization")
        
        # Run optimizer which internally generates responses with different temperatures
        opt_result = self.optimizer.optimize_for_query(query=query)
        
        pipeline_metadata['optimization'] = {
            'best_temperature': opt_result['best_parameters'].temperature,
            'best_score': opt_result['best_score'],
            'optimization_iterations': opt_result['iterations_completed'],
            'total_optimization_time': opt_result.get('total_time', 0),
            'temperature_history': opt_result.get('optimization_history', [])
        }
        
        initial_response = opt_result['best_response']
        best_temperature = opt_result['best_parameters'].temperature
        
        # Step 3: Response Improvement
        logger.info("Step 3/3: Response improvement")
        
        # Build context string from documents
        context_parts = []
        for doc in retrieval_result['documents']:
            text = doc.get('text', doc.get('content', ''))
            context_parts.append(text)
        context = "\n\n".join(context_parts)
        
        improvement_result = self.improver.improve_iteratively(
            question=query,
            context=context,
            initial_response=initial_response,
            initial_score=opt_result['best_score'],
            initial_reasoning=None,
            temperature=best_temperature
        )
        
        pipeline_metadata['improvement'] = {
            'iterations': improvement_result.get('iterations_completed'),
            'final_score': improvement_result.get('final_score'),
            'initial_score': opt_result['best_score'],
            'improvement_delta': improvement_result.get('final_score', 0) - opt_result['best_score'],
            'converged': 'convergence' in improvement_result.get('stopped_reason', '').lower(),
            'stopped_reason': improvement_result.get('stopped_reason', ''),
            'improvement_history': improvement_result.get('improvement_history', [])
        }
        
        final_response = improvement_result['final_response']
        processing_time = time.time() - start_time
        template_name = kwargs.get('template_name', 'base')
        
        return QueryResult(
            response=final_response,
            processing_time=processing_time,
            mode='full',
            metadata={
                'template_name': template_name,
                'num_docs_found': len(retrieval_result['documents']),
                'pipeline': pipeline_metadata,
                'total_documents': len(retrieval_result['documents']),
                'context_docs': retrieval_result['documents'],
                'optimization_applied': True,
                'improvement_applied': True
            }
        )
    
    def get_mode_name(self) -> str:
        """Return mode name."""
        return "full"
    
    def get_mode_description(self) -> str:
        """Return mode description."""
        return "Full pipeline: dynamic retrieval + temperature optimization + response improvement"
    
    def validate_config(self, config: Dict[str, Any]) -> bool:
        """
        Validate configuration for Full mode.
        
        Args:
            config: System configuration
            
        Returns:
            True if all required components are configured
        """
        has_llm = 'external_llm' in config
        has_index = 'index' in config
        has_optimization = 'optimization' in config
        has_improvement = 'improvement' in config
        
        return has_llm and has_index and has_optimization and has_improvement
