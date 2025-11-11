"""
Dynamic Retriever

Handles document retrieval with adaptive thresholding.
Extracted from RAGSystem for modularity.
"""

import logging
import time
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class DynamicRetriever:
    """Manages document retrieval with dynamic threshold selection."""
    
    def __init__(self, config: Dict[str, Any], rag_system):
        """
        Initialize dynamic retriever.
        
        Args:
            config: System configuration
            rag_system: RAG system instance for accessing index
        """
        self.config = config
        self.rag_system = rag_system
        
    def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        hit_target: Optional[int] = None,
        min_threshold: float = 0.3,
        max_threshold: float = 0.95,
        ui_callback=None,
        json_callback=None
    ) -> Dict[str, Any]:
        """
        Retrieve relevant documents with dynamic thresholding.
        
        Args:
            query: Search query
            top_k: Maximum documents to retrieve from index
            hit_target: Desired number of documents after thresholding
            min_threshold: Minimum similarity threshold
            max_threshold: Maximum similarity threshold
            ui_callback: Callback for CLI display
            json_callback: Callback for JSON event emission (web UI)
            
        Returns:
            Dictionary with documents, threshold info, and timing
        """
        start_time = time.time()
        
        # Default top_k from config
        if top_k is None:
            top_k = self.config.get('retrieval', {}).get('top_k', 10)
        
        # Default hit_target from config if not specified
        if hit_target is None:
            hit_target = self.config.get('retrieval', {}).get('hit_target', 3)
        
        logger.info(f"Retrieving documents with hit_target={hit_target}, top_k={top_k}")
        
        # Emit retrieval start event for web UI
        if json_callback:
            json_callback({
                "type": "retrieval_start",
                "data": {
                    "query": query,
                    "top_k": top_k,
                    "threshold": "dynamic",
                    "hit_target": hit_target
                }
            })
        
        # Display retrieval start if UI callback provided
        if ui_callback:
            ui_callback.display_retrieval_start(hit_target)
        
        # Create progress callback for threshold attempts
        progress_callback = None
        if ui_callback and hasattr(ui_callback, 'display_threshold_attempt'):
            progress_callback = lambda threshold, hits, target: ui_callback.display_threshold_attempt(threshold, hits, target)
        
        # Get documents from RAGSystem's search_detailed method
        # This will use search_service's search_with_dynamic_threshold which already:
        # 1. Starts from threshold=1.0
        # 2. Iteratively lowers it until hit_target is reached
        # 3. Generates proper threshold_stats with progression
        raw_results = self.rag_system.search_detailed(
            query, 
            k=top_k, 
            progress_callback=progress_callback,
            json_callback=json_callback
        )
        
        # Extract document list - already filtered by dynamic threshold
        documents_data = raw_results.get('documents', [])
        threshold_stats = raw_results.get('threshold_stats', {})
        
        if not documents_data:
            logger.warning("No documents retrieved from index")
            return {
                'documents': [],
                'threshold_used': None,
                'retrieval_time': time.time() - start_time,
                'threshold_stats': threshold_stats or {'method': 'no_results'}
            }
        
        # Build structured document list from search results
        filtered_docs = []
        for doc_data in documents_data:
            doc_dict = {
                'text': doc_data.get('content', ''),
                'content': doc_data.get('content', ''),
                'similarity': doc_data.get('score', 0.0),
                'filename': doc_data.get('filename', 'Unknown'),
                'metadata': doc_data
            }
            filtered_docs.append(doc_dict)
        
        retrieval_time = time.time() - start_time
        final_threshold = threshold_stats.get('final_threshold', None)
        
        threshold_str = f"{final_threshold:.3f}" if final_threshold is not None else "N/A"
        logger.info(
            f"Retrieved {len(filtered_docs)} documents "
            f"(threshold: {threshold_str}, time: {retrieval_time:.2f}s)"
        )
        
        # Display retrieval completion if UI callback provided
        if ui_callback:
            ui_callback.display_retrieval_complete(len(filtered_docs), final_threshold, retrieval_time)
        
        # Emit retrieval complete event for web UI
        if json_callback:
            json_callback({
                "type": "retrieval_complete",
                "data": {
                    "num_docs": len(filtered_docs),
                    "time": retrieval_time,
                    "threshold_used": final_threshold,
                    "documents": [{
                        "filename": doc.get('filename', 'Unknown'),
                        "score": doc.get('similarity', 0.0),
                        "content": doc.get('text', '')[:200] + '...' if len(doc.get('text', '')) > 200 else doc.get('text', '')
                    } for doc in filtered_docs[:5]]  # Only first 5 for UI
                }
            })
        
        return {
            'documents': filtered_docs,
            'threshold_used': final_threshold,
            'retrieval_time': retrieval_time,
            'threshold_stats': threshold_stats,
            'total_candidates': len(documents_data)
        }
