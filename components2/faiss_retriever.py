"""
FAISS Retriever for System 2 (AI Journalist)

Handles knowledge retrieval for task context enhancement.
Integrates with workflow execution to provide relevant documents.
"""

import logging
import time
from typing import Dict, Any, Optional, Callable, List

from .core.embedding_service import EmbeddingService
from .core.index_service import IndexService
from .core.search_service import SearchService

logger = logging.getLogger(__name__)


class FaissRetriever:
    """Manages document retrieval for task context enhancement."""
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize FAISS retriever.
        
        Args:
            config: Retrieval configuration from settings
        """
        self.config = config
        self.enabled = config.get('enabled', False)
        
        if not self.enabled:
            logger.info("FAISS retrieval disabled in configuration")
            self.embedding_service = None
            self.index_service = None
            self.search_service = None
            return
        
        # Extract config values
        model_name = config.get('embedding_model', 'TurkuNLP/sbert-cased-finnish-paraphrase')
        dimension = config.get('dimension', 768)
        index_path = config.get('index_path', 'data2/faiss.index')
        metadata_path = config.get('metadata_path', 'data2/metadata.pkl')
        index_type = config.get('index_type', 'IndexFlatIP')
        
        logger.info(f"Initializing FAISS retriever (model: {model_name}, dim: {dimension})")
        
        # Initialize services
        try:
            self.embedding_service = EmbeddingService(model_name, dimension)
            self.index_service = IndexService(index_path, metadata_path, dimension, index_type)
            self.search_service = SearchService(
                self.index_service,
                self.embedding_service,
                index_type
            )
            
            # Load or create index
            self.index_service.load_or_create()
            
            logger.info(
                f"FAISS retriever initialized: "
                f"{self.index_service.get_document_count()} documents indexed"
            )
        except Exception as e:
            logger.error(f"Failed to initialize FAISS retriever: {e}", exc_info=True)
            self.embedding_service = None
            self.index_service = None
            self.search_service = None
            self.enabled = False
            # Don't raise - allow the retriever to exist but be disabled
            # This lets us initialize it later when building the index
    
    def is_available(self) -> bool:
        """Check if retrieval is available and enabled."""
        return (
            self.enabled and 
            self.index_service is not None and 
            self.index_service.is_initialized()
        )
    
    def retrieve_for_task(
        self,
        task_query: str,
        agent_context: str = "",
        hit_target: Optional[int] = None,
        top_k: Optional[int] = None,
        action_callback: Optional[Callable] = None
    ) -> Dict[str, Any]:
        """
        Retrieve relevant documents for a task.
        
        Args:
            task_query: Task description to search for
            agent_context: Additional context from agent (goal, role, etc.)
            hit_target: Desired number of documents (default from config)
            top_k: Maximum documents to search (default from config)
            action_callback: Callback for emitting WebSocket events
            
        Returns:
            Dictionary with documents, threshold info, and timing
        """
        if not self.is_available():
            logger.warning("FAISS retrieval not available, returning empty results")
            return {
                'documents': [],
                'threshold_used': None,
                'retrieval_time': 0.0,
                'threshold_stats': {'method': 'disabled'}
            }
        
        start_time = time.time()
        
        # Build enhanced query
        if agent_context:
            enhanced_query = f"{agent_context}\n\n{task_query}"
        else:
            enhanced_query = task_query
        
        # Get config values
        if hit_target is None:
            hit_target = self.config.get('hit_target', 3)
        if top_k is None:
            top_k = self.config.get('top_k', 10)
        
        step = self.config.get('step', 0.05)
        use_dynamic_threshold = self.config.get('use_dynamic_threshold', True)
        
        logger.info(
            f"Retrieving documents for task: hit_target={hit_target}, "
            f"top_k={top_k}, dynamic={use_dynamic_threshold}"
        )
        
        # Create JSON callback wrapper for action_callback
        json_callback = None
        if action_callback:
            async def wrapped_callback(event_data: Dict):
                await action_callback(event_data)
            json_callback = wrapped_callback
        
        try:
            # Perform search
            raw_results = self.search_service.search_detailed(
                query=enhanced_query,
                k=top_k,
                use_dynamic_threshold=use_dynamic_threshold,
                hit_target=hit_target,
                step=step,
                json_callback=json_callback
            )
            
            # Extract and structure results
            documents_data = raw_results.get('documents', [])
            threshold_stats = raw_results.get('threshold_stats', {})
            
            # Build document list
            documents = []
            for doc_data in documents_data:
                doc_dict = {
                    'content': doc_data.get('content', ''),
                    'score': doc_data.get('score', 0.0),
                    'filename': doc_data.get('filename', 'unknown'),
                    'type': doc_data.get('type', 'knowledge'),
                    'index': doc_data.get('index', -1)
                }
                documents.append(doc_dict)
            
            retrieval_time = time.time() - start_time
            final_threshold = threshold_stats.get('final_threshold', None)
            
            logger.info(
                f"Retrieved {len(documents)} documents "
                f"(threshold: {final_threshold}, time: {retrieval_time:.2f}s)"
            )
            
            return {
                'documents': documents,
                'threshold_used': final_threshold,
                'retrieval_time': retrieval_time,
                'threshold_stats': threshold_stats,
                'query': enhanced_query
            }
        
        except Exception as e:
            logger.error(f"Retrieval failed: {e}")
            return {
                'documents': [],
                'threshold_used': None,
                'retrieval_time': time.time() - start_time,
                'threshold_stats': {'method': 'error', 'error': str(e)},
                'error': str(e)
            }
    
    def add_task_output(
        self,
        task_output: str,
        task_metadata: Dict[str, Any],
        save: bool = True
    ) -> bool:
        """
        Add a validated task output to the knowledge base.
        
        Args:
            task_output: The task output text
            task_metadata: Metadata about the task (agent_name, task_name, goal, etc.)
            save: Whether to save index after adding
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            logger.warning("FAISS retrieval not available, cannot add task output")
            return False
        
        try:
            # Create metadata entry
            metadata_entry = {
                'content': task_output,
                'filename': f"{task_metadata.get('agent_name', 'agent')}_{task_metadata.get('task_id', 0)}.txt",
                'type': 'task_output',
                'agent_name': task_metadata.get('agent_name', ''),
                'task_name': task_metadata.get('task_name', ''),
                'goal': task_metadata.get('goal', ''),
                'timestamp': task_metadata.get('timestamp', '')
            }
            
            # Generate embedding
            embeddings = self.embedding_service.encode([task_output], normalize=True)
            
            # Add to index
            self.index_service.add_vectors(
                vectors=embeddings,
                metadata=[metadata_entry],
                save=save
            )
            
            logger.info(f"Added task output to knowledge base: {metadata_entry['filename']}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to add task output to knowledge base: {e}")
            return False
    
    def add_knowledge_documents(
        self,
        documents: List[str],
        filenames: List[str],
        doc_type: str = 'knowledge'
    ) -> bool:
        """
        Add knowledge documents to the index.
        
        Args:
            documents: List of document texts
            filenames: List of corresponding filenames
            doc_type: Type of documents (knowledge, reference, guide, etc.)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_available():
            logger.warning("FAISS retrieval not available, cannot add documents")
            return False
        
        if len(documents) != len(filenames):
            logger.error("Document count must match filename count")
            return False
        
        try:
            # Create metadata entries
            metadata_entries = [
                {
                    'content': doc,
                    'filename': filename,
                    'type': doc_type
                }
                for doc, filename in zip(documents, filenames)
            ]
            
            # Generate embeddings
            embeddings = self.embedding_service.encode(documents, normalize=True, show_progress_bar=True)
            
            # Add to index
            self.index_service.add_vectors(
                vectors=embeddings,
                metadata=metadata_entries,
                save=True
            )
            
            logger.info(f"Added {len(documents)} {doc_type} documents to knowledge base")
            return True
        
        except Exception as e:
            logger.error(f"Failed to add knowledge documents: {e}")
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the knowledge base."""
        if not self.is_available():
            return {
                'enabled': False,
                'index_exists': False,
                'num_documents': 0,
                'message': 'Retrieval not available'
            }
        
        return {
            'enabled': True,
            'index_exists': True,
            'num_documents': self.index_service.get_document_count(),
            'index_type': 'IndexFlatIP',
            'model': self.embedding_service.get_model_name(),
            'dimension': self.embedding_service.get_dimension(),
            'index_path': self.index_service.index_path,
            'config': {
                'hit_target': self.config.get('hit_target', 3),
                'top_k': self.config.get('top_k', 10),
                'step': self.config.get('step', 0.05),
                'use_dynamic_threshold': self.config.get('use_dynamic_threshold', True)
            }
        }
