"""
Dynamic Retriever

Handles document retrieval with adaptive thresholding.
Extracted from RAGSystem for modularity.
"""

import logging
import time
from typing import List, Dict, Any, Optional

from .threshold_strategy import ThresholdStrategy

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
        self.threshold_strategy = ThresholdStrategy(
            default_threshold=config.get('retrieval', {}).get('default_threshold', 0.5)
        )
        
    def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        hit_target: Optional[int] = None,
        min_threshold: float = 0.3,
        max_threshold: float = 0.95
    ) -> Dict[str, Any]:
        """
        Retrieve relevant documents with dynamic thresholding.
        
        Args:
            query: Search query
            top_k: Maximum documents to retrieve from index
            hit_target: Desired number of documents after thresholding
            min_threshold: Minimum similarity threshold
            max_threshold: Maximum similarity threshold
            
        Returns:
            Dictionary with documents, threshold info, and timing
        """
        start_time = time.time()
        
        # Default top_k from config
        if top_k is None:
            top_k = self.config.get('retrieval', {}).get('top_k', 10)
        
        logger.info(f"Retrieving up to {top_k} documents for query")
        
        # Get documents from RAGSystem's search_detailed method
        raw_results = self.rag_system.search_detailed(query, k=top_k)
        
        # Extract document list - new structure has documents as list of dicts
        documents_data = raw_results.get('documents', [])
        
        if not documents_data:
            logger.warning("No documents retrieved from index")
            return {
                'documents': [],
                'threshold_used': None,
                'retrieval_time': time.time() - start_time,
                'threshold_stats': {'method': 'no_results'}
            }
        
        # Extract similarities from document dicts
        similarities = [doc.get('score', 0.0) for doc in documents_data]
        
        # Calculate threshold
        threshold, stats = self.threshold_strategy.calculate_threshold(
            similarities=similarities,
            hit_target=hit_target,
            min_threshold=min_threshold,
            max_threshold=max_threshold
        )
        
        # Filter documents by threshold - build structured document list
        filtered_docs = []
        for doc_data in documents_data:
            score = doc_data.get('score', 0.0)
            if score >= threshold:
                # Create structured document dict
                doc_dict = {
                    'text': doc_data.get('content', ''),
                    'content': doc_data.get('content', ''),
                    'similarity': score,
                    'filename': doc_data.get('filename', 'Unknown'),
                    'metadata': doc_data
                }
                filtered_docs.append(doc_dict)
        
        retrieval_time = time.time() - start_time
        
        logger.info(
            f"Retrieved {len(filtered_docs)} documents "
            f"(threshold: {threshold:.3f}, time: {retrieval_time:.2f}s)"
        )
        
        return {
            'documents': filtered_docs,
            'threshold_used': threshold,
            'retrieval_time': retrieval_time,
            'threshold_stats': stats,
            'total_candidates': len(documents_data)
        }
