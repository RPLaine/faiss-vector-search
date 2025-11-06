"""
Search Service

Performs semantic search operations with adaptive thresholding.
Extracted from RAGSystem for single responsibility.
"""

import logging
from typing import List, Dict, Tuple, Optional, Callable
import numpy as np

from ..exceptions import SearchError
from .index_service import IndexService
from .embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class SearchService:
    """Manages semantic search with dynamic threshold adjustment."""
    
    def __init__(
        self,
        index_service: IndexService,
        embedding_service: EmbeddingService,
        index_type: str = "IndexFlatIP"
    ):
        """
        Initialize search service.
        
        Args:
            index_service: Index service instance
            embedding_service: Embedding service instance
            index_type: Type of FAISS index (affects similarity calculation)
        """
        self.index_service = index_service
        self.embedding_service = embedding_service
        self.index_type = index_type
        self.is_inner_product = (index_type == "IndexFlatIP")
    
    def search_with_dynamic_threshold(
        self,
        query_vector: np.ndarray,
        k: int,
        hit_target: int = 3,
        step: float = 0.05,
        initial_threshold: float = 1.0,
        progress_callback=None
    ) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """
        Perform FAISS search with dynamic similarity threshold adjustment.
        Starts from threshold=1.0 and gradually lowers it by 'step' until hit_target is reached.
        
        Args:
            query_vector: Query embedding vector (shape: [1, dimension])
            k: Number of results to retrieve from FAISS
            hit_target: Target number of documents to return
            step: Threshold decrement step
            initial_threshold: Starting threshold value
            
        Returns:
            Tuple of (distances, indices, threshold_stats)
            
        Raises:
            SearchError: If search fails
        """
        try:
            # Perform initial FAISS search
            distances_all, indices_all = self.index_service.search(query_vector, k)
            
            logger.info(
                f"Dynamic threshold search: target={hit_target}, step={step}, "
                f"raw_results={len(indices_all[0])}"
            )
            
            # Track threshold progression
            threshold_progression = []
            
            # Try progressively lower thresholds
            current_threshold = initial_threshold
            best_distances: Optional[np.ndarray] = None
            best_indices: Optional[np.ndarray] = None
            best_count = 0
            final_threshold = current_threshold
            
            while current_threshold >= 0.0:
                # Filter results by current threshold
                filtered_distances = []
                filtered_indices = []
                
                for distance, idx in zip(distances_all[0], indices_all[0]):
                    if idx != -1:  # Valid index
                        # Calculate similarity based on index type
                        if self.is_inner_product:
                            similarity = float(distance)
                        else:
                            similarity = 1.0 / (1.0 + distance)
                        
                        if similarity >= current_threshold:
                            filtered_distances.append(distance)
                            filtered_indices.append(idx)
                
                result_count = len(filtered_indices)
                
                # Record this threshold attempt
                threshold_progression.append({
                    "threshold": round(current_threshold, 3),
                    "hits": result_count,
                    "target_reached": result_count >= hit_target
                })
                
                # Display progress if callback provided
                if progress_callback:
                    progress_callback(current_threshold, result_count, hit_target)
                
                logger.debug(f"Threshold {current_threshold:.3f}: {result_count} documents")
                
                # Check if we've met the hit target
                if result_count >= hit_target:
                    best_distances = np.array([filtered_distances], dtype=np.float32)
                    best_indices = np.array([filtered_indices], dtype=np.int64)
                    best_count = result_count
                    final_threshold = current_threshold
                    logger.info(
                        f"Hit target reached at threshold={current_threshold:.3f} "
                        f"with {result_count} documents"
                    )
                    break
                
                # Keep track of best result so far
                if result_count > best_count:
                    best_distances = np.array([filtered_distances], dtype=np.float32)
                    best_indices = np.array([filtered_indices], dtype=np.int64)
                    best_count = result_count
                    final_threshold = current_threshold
                
                # Lower threshold
                current_threshold -= step
            
            # Prepare stats
            threshold_stats = {
                "hit_target": hit_target,
                "step": step,
                "final_threshold": round(final_threshold, 3),
                "final_hits": best_count,
                "target_reached": best_count >= hit_target,
                "attempts": len(threshold_progression),
                "progression": threshold_progression
            }
            
            # If we never reached hit_target, return the best we found
            if best_distances is None or best_indices is None or best_count < hit_target:
                logger.warning(
                    f"Could not reach hit_target={hit_target}. "
                    f"Returning {best_count} documents at lowest threshold"
                )
                if best_distances is None or best_indices is None:
                    # Return empty results
                    return (
                        np.array([[]], dtype=np.float32),
                        np.array([[]], dtype=np.int64),
                        threshold_stats
                    )
            
            return best_distances, best_indices, threshold_stats
        
        except Exception as e:
            logger.error(f"Dynamic threshold search failed: {e}")
            raise SearchError(f"Dynamic threshold search failed: {e}") from e
    
    def search(
        self,
        query: str,
        k: int,
        use_dynamic_threshold: bool = False,
        hit_target: Optional[int] = None,
        step: float = 0.05
    ) -> List[str]:
        """
        Search for similar documents.
        
        Args:
            query: Query text
            k: Number of documents to retrieve
            use_dynamic_threshold: Whether to use dynamic threshold adjustment
            hit_target: Target number of documents (for dynamic threshold)
            step: Threshold step (for dynamic threshold)
            
        Returns:
            List of relevant document texts
            
        Raises:
            SearchError: If search fails
        """
        try:
            # Generate query embedding
            query_vector = self.embedding_service.encode_single(query, normalize=True)
            query_vector = query_vector.reshape(1, -1)
            
            # Perform search
            if use_dynamic_threshold and hit_target is not None:
                logger.info(
                    f"🎯 DYNAMIC THRESHOLD MODE - hit_target={hit_target}, step={step}"
                )
                distances, indices, _ = self.search_with_dynamic_threshold(
                    query_vector, k, hit_target, step
                )
            else:
                logger.info("📌 FIXED THRESHOLD MODE")
                distances, indices = self.index_service.search(query_vector, k)
            
            # Extract documents from results
            results = []
            for idx in indices[0]:
                if idx != -1:  # Valid index
                    # Extract content from metadata
                    metadata_item = self.index_service.metadata[idx]
                    if isinstance(metadata_item, dict):
                        content = metadata_item.get('content', str(metadata_item))
                    else:
                        content = metadata_item
                    results.append(content)
            
            logger.info(f"Retrieved {len(results)} documents for query")
            return results
        
        except Exception as e:
            logger.error(f"Search failed: {e}")
            raise SearchError(f"Search failed: {e}") from e
    
    def search_detailed(
        self,
        query: str,
        k: int,
        use_dynamic_threshold: bool = False,
        hit_target: Optional[int] = None,
        step: float = 0.05,
        similarity_threshold: Optional[float] = None,
        progress_callback: Optional[Callable[[float, int, int], None]] = None
    ) -> Dict:
        """
        Search for similar documents with detailed information.
        
        Args:
            query: Query text
            k: Number of documents to retrieve
            use_dynamic_threshold: Whether to use dynamic threshold adjustment
            hit_target: Target number of documents (for dynamic threshold)
            step: Threshold step (for dynamic threshold)
            similarity_threshold: Minimum similarity for fixed threshold mode
            
        Returns:
            Dictionary containing search results, scores, and metadata
            
        Raises:
            SearchError: If search fails
        """
        try:
            # Generate query embedding
            query_vector = self.embedding_service.encode_single(query, normalize=True)
            query_vector = query_vector.reshape(1, -1)
            
            # Perform search
            threshold_stats = None
            if use_dynamic_threshold and hit_target is not None:
                distances, indices, threshold_stats = self.search_with_dynamic_threshold(
                    query_vector, k, hit_target, step, progress_callback=progress_callback
                )
            else:
                distances, indices = self.index_service.search(query_vector, k)
            
            # Process results
            documents = []
            for distance, idx in zip(distances[0], indices[0]):
                if idx != -1:  # Valid index
                    # Calculate similarity
                    if self.is_inner_product:
                        similarity = float(distance)
                    else:
                        similarity = 1.0 / (1.0 + distance)
                    
                    # Apply similarity threshold if specified
                    if similarity_threshold is not None and similarity < similarity_threshold:
                        continue
                    
                    # Extract metadata
                    metadata_item = self.index_service.metadata[idx]
                    if isinstance(metadata_item, dict):
                        content = metadata_item.get('content', str(metadata_item))
                        filename = metadata_item.get('filename', 'unknown')
                    else:
                        content = metadata_item
                        filename = 'unknown'
                    
                    documents.append({
                        'content': content,
                        'score': float(similarity),
                        'filename': filename,
                        'index': int(idx)
                    })
            
            result = {
                'query': query,
                'documents': documents,
                'num_found': len(documents),
                'total_in_index': self.index_service.get_document_count()
            }
            
            if threshold_stats:
                result['threshold_stats'] = threshold_stats
            
            return result
        
        except Exception as e:
            logger.error(f"Detailed search failed: {e}")
            raise SearchError(f"Detailed search failed: {e}") from e
    
    def calculate_similarity(self, distance: float) -> float:
        """
        Calculate similarity score from distance.
        
        Args:
            distance: Distance value from FAISS
            
        Returns:
            Similarity score (0.0 to 1.0)
        """
        if self.is_inner_product:
            return float(distance)
        else:
            return 1.0 / (1.0 + distance)
