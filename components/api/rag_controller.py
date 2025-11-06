"""
RAG Controller - API coordinator for GUI integration.

SIMPLIFIED ARCHITECTURE:
=======================

Three Query Modes:
1. OPTIMIZE MODE (optimize=True):
   - Dynamic retrieval with threshold adjustment
   - Temperature evaluation and optimization
   - Iterative improvement with evaluation
   - Full production pipeline

2. FAISS MODE (use_context=True, optimize=False):
   - Dynamic retrieval with threshold adjustment only
   - Single LLM call with retrieved context
   - No optimization or improvement

3. NONE MODE (use_context=False, optimize=False):
   - Direct LLM call without any context
   - No retrieval, optimization, or improvement

Action-Based Event System:
- Program performs actions (retrieval, LLM call, evaluation)
- Each action emits structured JSON data
- CLI representation: Rich formatting (panels, tables)
- App representation: Clean JSON for web UI
- Both representations get the same underlying data

"""

import logging
import time
from typing import Dict, Any, Optional, Callable
from datetime import datetime
from pathlib import Path

from ..rag_system import RAGSystem
from ..services import ConfigurationProvider, LLMService, PromptService
from .api_models import (
    QueryRequest, QueryResponse, SystemStatus, 
    OptimizationProgress, ErrorResponse, ConfigUpdate, DocumentMetadata
)

logger = logging.getLogger(__name__)


class RAGController:
    """
    API coordinator for RAG system - designed for GUI integration.
    
    This class provides a clean, JSON-based API that can be:
    - Called directly from Python
    - Wrapped in FastAPI/Flask endpoints
    - Exposed via WebSocket for real-time updates
    - Used by JavaScript frontend
    
    Key features:
    - No Rich/console dependencies
    - All responses are JSON-serializable
    - Progress callbacks for streaming updates
    - Thread-safe for web servers
    """
    
    def __init__(
        self, 
        config_path: str = "config.json",
        data_dir: str = "data",
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        """
        Initialize RAG controller.
        
        Args:
            config_path: Path to configuration file
            data_dir: Directory containing FAISS index
            progress_callback: Optional callback for progress updates (for GUI)
        """
        self.data_dir = data_dir
        self.progress_callback = progress_callback
        
        # Initialize configuration provider
        self.config_provider = ConfigurationProvider.from_file(config_path)
        
        # Initialize services
        self.prompt_service = PromptService()
        self.llm_service = LLMService(self.config_provider.get_llm_config())
        
        # Initialize RAG system
        self.rag_system = RAGSystem(config_path=config_path)
        
        # Lazy-load optimization and improvement coordinators
        self._optimizer = None
        self._improver = None
        
        # State tracking
        self._is_busy = False
        self._current_operation = None
        
        logger.info(f"RAG Controller initialized with data directory: {data_dir}")
    
    def _emit_progress(self, progress_data: Dict[str, Any]) -> None:
        """Emit progress update to callback (for GUI)."""
        if self.progress_callback:
            try:
                self.progress_callback(progress_data)
            except Exception as e:
                logger.warning(f"Progress callback failed: {e}")
    
    def _emit_action(self, action_data: Dict[str, Any]) -> None:
        """
        Emit action data for app representation.
        Actions represent what the program is doing, with clean JSON data.
        """
        if self.progress_callback:
            try:
                self.progress_callback(action_data)
            except Exception as e:
                logger.warning(f"Action callback failed: {e}")
    
    # Main Query API
    
    def query(self, request: QueryRequest) -> QueryResponse:
        """
        Execute RAG query with optional optimization and improvement.
        
        This method now supports mode-based queries:
        - mode='none': Direct LLM without retrieval
        - mode='faiss': Dynamic retrieval with FAISS
        - mode='full': Complete pipeline (retrieval + optimization + improvement)
        - If mode is specified, it overrides optimize/use_context flags
        
        Args:
            request: QueryRequest object with query parameters
            
        Returns:
            QueryResponse object with results
        """
        if self._is_busy:
            raise RuntimeError(f"System is busy with operation: {self._current_operation}")
        
        self._is_busy = True
        self._current_operation = "query"
        
        try:
            start_time = time.time()
            timestamp = datetime.now().isoformat()
            
            # Emit progress
            self._emit_progress({
                "type": "query_start",
                "query": request.query,
                "timestamp": timestamp,
                "mode": request.mode or self._determine_mode_from_flags(request)
            })
            
            logger.info(f"Query mode: {request.mode}, use_context: {request.use_context}, optimize: {request.optimize}")
            
            # Use new mode-based architecture if mode is specified
            if request.mode is not None:
                logger.info(f"Using mode-based query with mode: {request.mode}")
                result = self._query_with_mode(request)
            else:
                # Legacy path: use optimize and use_context flags
                # Apply parameter overrides if provided
                if request.temperature is not None:
                    self.config_provider.update_llm_temperature(request.temperature)
                if request.top_k is not None or request.similarity_threshold is not None:
                    self.config_provider.update_retrieval_params(
                        top_k=request.top_k,
                        similarity_threshold=request.similarity_threshold
                    )
                
                # Execute based on mode
                if request.optimize:
                    result = self._query_with_optimization(request)
                else:
                    result = self._query_standard(request)
                
                # Apply improvement if requested
                if request.improve and not request.optimize:
                    # Note: optimization already includes improvement
                    result = self._apply_improvement(request, result)
            
            # Emit documents found if available
            if result.get("documents") or result.get("context_docs"):
                docs = result.get("documents") or result.get("context_docs", [])
                formatted_docs = self._format_documents(docs)
                self._emit_progress({
                    "type": "documents_retrieved",
                    "message": f"📚 Retrieved {len(formatted_docs)} source documents",
                    "num_docs": len(formatted_docs),
                    "documents": formatted_docs[:3] if len(formatted_docs) > 3 else formatted_docs
                })
            
            processing_time = time.time() - start_time
            
            # Emit completion
            self._emit_progress({
                "type": "query_complete",
                "processing_time": processing_time,
                "timestamp": datetime.now().isoformat()
            })
            
            # Return QueryResponse object with all fields
            return QueryResponse(
                query=request.query,
                response=result.get("response", ""),
                processing_time=processing_time,
                num_docs_found=result.get("num_docs_found", 0),
                documents=self._format_documents(result.get("documents", result.get("context_docs", []))),
                template_used=request.template_name,
                timestamp=timestamp,
                optimization_applied=request.optimize or request.mode == 'full',
                improvement_applied=request.improve or request.mode == 'full',
                optimization_score=result.get("optimization_score"),
                improvement_iterations=result.get("improvement_iterations", 0),
                retrieval_time=result.get("retrieval_time"),
                generation_time=result.get("generation_time")
            )
            
        finally:
            self._is_busy = False
            self._current_operation = None
    
    def _determine_mode_from_flags(self, request: QueryRequest) -> str:
        """Determine mode from legacy optimize/use_context flags."""
        if request.optimize:
            return 'full'
        elif request.use_context:
            return 'faiss'
        else:
            return 'none'
    
    def _query_with_mode(self, request: QueryRequest) -> Dict[str, Any]:
        """Execute query using new mode-based architecture."""
        # Prepare kwargs for mode execution
        kwargs = {
            'template_name': request.template_name,
            'top_k': request.top_k,
            'hit_target': request.hit_target,
            'temperature': request.temperature,
            'json_callback': self._emit_progress  # Pass JSON callback for web UI events
        }
        
        # Remove None values
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        
        # Execute using mode-based system
        result = self.rag_system.query(
            query=request.query,
            mode=request.mode,
            **kwargs
        )
        
        return result
    
    def _query_standard(self, request: QueryRequest) -> Dict[str, Any]:
        """Execute standard RAG query - FAISS mode (dynamic retrieval only) or None mode (direct LLM)."""
        import time
        
        if request.use_context:
            # FAISS MODE: Dynamic retrieval + LLM
            # Step 1: Dynamic Retrieval Action
            self._emit_action({
                "action": "retrieval_start",
                "data": {
                    "query": request.query,
                    "top_k": self.config_provider.get_retrieval_top_k(),
                    "threshold": self.config_provider.get_retrieval_similarity_threshold()
                }
            })
            
            retrieval_start = time.time()
            result = self.rag_system.query(
                query=request.query,
                mode='faiss',
                template_name=request.template_name
            )
            retrieval_time = time.time() - retrieval_start
            
            # Emit retrieval results
            self._emit_action({
                "action": "retrieval_complete",
                "data": {
                    "num_docs": result.get("metadata", {}).get("total_documents", 0),
                    "documents": result.get("metadata", {}).get("documents", []),
                    "time": retrieval_time
                }
            })
            
            # Step 2: LLM Generation (handled by RAG system, which will call LLM service)
            # The LLM service will emit its own actions
            
            return result
        else:
            # NONE MODE: Direct LLM only (no context)
            # Build prompt
            prompt = self.prompt_service.format_prompt(
                request.template_name, 
                question=request.query, 
                context=""
            )
            
            # Call LLM service with action callback
            llm_response = self.llm_service.call(
                prompt=prompt,
                action_callback=self._emit_action
            )
            
            return {
                "response": llm_response.text,
                "num_docs_found": 0,
                "documents": [],
                "generation_time": llm_response.generation_time
            }
    
    def _query_with_optimization(self, request: QueryRequest) -> Dict[str, Any]:
        """Execute query with temperature optimization."""
        from ..optimization import OptimizationCoordinator
        
        if self._optimizer is None:
            self._optimizer = OptimizationCoordinator(
                self.rag_system,
                self.config_provider.get_full_config()
            )
        
        self._emit_progress({
            "type": "optimization_start",
            "message": "Starting temperature optimization..."
        })
        
        # Run optimization
        opt_result = self._optimizer.optimize_for_query(request.query)
        
        # Extract relevant data
        return {
            "response": opt_result.get("best_response", ""),
            "num_docs_found": opt_result.get("final_result", {}).get("num_docs_found", 0),
            "documents": opt_result.get("final_result", {}).get("documents", []),
            "optimization_score": opt_result.get("best_score", 0),
            "improvement_iterations": opt_result.get("improvement_iterations", 0),
            "generation_time": opt_result.get("total_time", 0)
        }
    
    def _apply_improvement(self, request: QueryRequest, result: Dict[str, Any]) -> Dict[str, Any]:
        """Apply iterative improvement to response."""
        from ..improvement import ImprovementCoordinator
        
        if self._improver is None:
            self._improver = ImprovementCoordinator(
                self.config_provider.get_full_config()
            )
        
        self._emit_progress({
            "type": "improvement_start",
            "message": "Starting iterative improvement..."
        })
        
        # Get context from documents
        docs = result.get("documents", [])
        context = "\n\n".join([
            doc if isinstance(doc, str) else doc.get("content", "")
            for doc in docs
        ])
        
        # Run improvement
        imp_result = self._improver.improve_iteratively(
            question=request.query,
            context=context,
            initial_response=result.get("response", "")
        )
        
        # Update result with improved response
        result["response"] = imp_result.get("final_response", result.get("response"))
        result["improvement_iterations"] = imp_result.get("iterations_completed", 0)
        
        return result
    
    def _format_documents(self, documents: list) -> list:
        """Format documents for API response."""
        formatted = []
        
        for doc in documents:
            if isinstance(doc, str):
                formatted.append({
                    "content": doc,
                    "score": None,
                    "filename": None
                })
            elif isinstance(doc, dict):
                formatted.append({
                    "content": doc.get("content", ""),
                    "score": doc.get("score"),
                    "filename": doc.get("filename"),
                    "file_path": doc.get("file_path")
                })
        
        return formatted
    
    def _get_config_params(self) -> dict:
        """Get configuration parameters for detailed display."""
        config = self.config_provider.get_full_config()
        stats = self.rag_system.get_stats()
        
        return {
            "llm_model": config.get("llm", {}).get("model", "N/A"),
            "max_tokens": config.get("llm", {}).get("max_tokens", "N/A"),
            "temperature": config.get("llm", {}).get("temperature", "N/A"),
            "embedding_model": config.get("embedding", {}).get("model", "N/A"),
            "dimension": config.get("embedding", {}).get("dimension", "N/A"),
            "top_k": config.get("retrieval", {}).get("top_k", "N/A"),
            "similarity_threshold": config.get("retrieval", {}).get("similarity_threshold", "N/A"),
            "max_context_length": config.get("retrieval", {}).get("max_context_length", "N/A"),
            "index_type": stats.get("index_type", "FAISS"),
            "hit_target": config.get("retrieval", {}).get("dynamic_threshold", {}).get("hit_target", "N/A"),
            "step": config.get("retrieval", {}).get("dynamic_threshold", {}).get("step", "N/A")
        }
    
    # System Status API
    
    def get_status(self) -> SystemStatus:
        """
        Get current system status (for GUI dashboard).
        
        Returns:
            SystemStatus object
        """
        stats = self.rag_system.get_stats()
        
        status = "ready"
        if self._is_busy:
            status = "busy"
        
        return SystemStatus(
            status=status,
            total_documents=stats.get("total_documents", 0),
            embedding_model=stats.get("embedding_model", ""),
            llm_model=stats.get("external_llm_model", ""),
            optimization_enabled=self.config_provider.is_optimization_enabled(),
            improvement_enabled=self.config_provider.is_improvement_enabled(),
            current_temperature=self.config_provider.get_llm_temperature(),
            current_top_k=self.config_provider.get_retrieval_top_k(),
            current_threshold=self.config_provider.get_retrieval_similarity_threshold(),
            data_directory=self.data_dir
        )
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get detailed statistics (for GUI monitoring).
        
        Returns:
            Dictionary with system statistics
        """
        return {
            "system": self.get_status().to_dict(),
            "llm": self.llm_service.get_statistics(),
            "prompts": {
                "available": self.prompt_service.list_available_prompts(),
                "cached": len(self.prompt_service._cache)
            }
        }
    
    # Configuration API
    
    def update_config(self, update: ConfigUpdate) -> SystemStatus:
        """
        Update system configuration (for GUI controls).
        
        Args:
            update: ConfigUpdate object with new values
            
        Returns:
            Updated SystemStatus
        """
        if update.temperature is not None:
            self.config_provider.update_llm_temperature(update.temperature)
        
        if any([update.top_k, update.similarity_threshold, update.hit_target]):
            self.config_provider.update_retrieval_params(
                top_k=update.top_k,
                similarity_threshold=update.similarity_threshold,
                hit_target=update.hit_target
            )
        
        if update.optimization_enabled is not None:
            self.config_provider.enable_optimization(update.optimization_enabled)
        
        if update.improvement_enabled is not None:
            self.config_provider.enable_improvement(update.improvement_enabled)
        
        logger.info(f"Configuration updated: {update.to_dict()}")
        
        return self.get_status()
    
    def get_config(self) -> Dict[str, Any]:
        """
        Get full configuration (for GUI settings panel).
        
        Returns:
            Configuration dictionary
        """
        return self.config_provider.to_dict()
    
    # Document Management API
    
    def search_documents(self, query: str, top_k: int = 10) -> list:
        """
        Search documents without generating response (for GUI preview).
        
        Args:
            query: Search query
            top_k: Number of documents to retrieve
            
        Returns:
            List of formatted documents
        """
        results = self.rag_system.search_detailed(query, k=top_k)
        return self._format_documents(results.get("documents", []))
    
    def get_document_count(self) -> int:
        """Get total document count."""
        stats = self.rag_system.get_stats()
        return stats.get("total_documents", 0)
    
    # Health Check API
    
    def health_check(self) -> Dict[str, Any]:
        """
        Perform health check (for GUI connection monitoring).
        
        Returns:
            Health status dictionary
        """
        try:
            doc_count = self.get_document_count()
            
            return {
                "status": "healthy",
                "timestamp": datetime.now().isoformat(),
                "documents_loaded": doc_count,
                "services": {
                    "rag_system": "ok",
                    "llm_service": "ok",
                    "config_provider": "ok",
                    "prompt_service": "ok"
                }
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "timestamp": datetime.now().isoformat(),
                "error": str(e)
            }
