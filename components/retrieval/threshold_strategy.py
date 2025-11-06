"""
Threshold Strategy

Determines similarity threshold based on hit target.
Implements adaptive thresholding to retrieve desired number of documents.
"""

import logging
from typing import List, Tuple, Optional
import numpy as np

logger = logging.getLogger(__name__)


class ThresholdStrategy:
    """Manages dynamic threshold selection for document retrieval."""
    
    def __init__(self, default_threshold: float = 0.5):
        """
        Initialize threshold strategy.
        
        Args:
            default_threshold: Fallback threshold if no target specified
        """
        self.default_threshold = default_threshold
        
    def calculate_threshold(
        self,
        similarities: List[float],
        hit_target: Optional[int] = None,
        min_threshold: float = 0.3,
        max_threshold: float = 0.95
    ) -> Tuple[float, dict]:
        """
        Calculate optimal threshold for hit target.
        
        Strategy:
        - If hit_target specified: Use the similarity of the Nth result
        - If no target: Use default threshold
        - Clamp between min_threshold and max_threshold
        
        Args:
            similarities: Sorted list of similarity scores (descending)
            hit_target: Desired number of documents to retrieve
            min_threshold: Minimum allowed threshold
            max_threshold: Maximum allowed threshold
            
        Returns:
            Tuple of (threshold, stats_dict)
        """
        if not similarities:
            return self.default_threshold, {'method': 'default', 'reason': 'no_similarities'}
        
        # No hit target - use default
        if hit_target is None or hit_target <= 0:
            threshold = self.default_threshold
            stats = {
                'method': 'default',
                'threshold': threshold,
                'expected_hits': self._count_above_threshold(similarities, threshold)
            }
            return threshold, stats
        
        # Hit target exceeds available results - use minimum threshold
        if hit_target > len(similarities):
            threshold = max(min_threshold, min(similarities)) if similarities else min_threshold
            stats = {
                'method': 'min_clamp',
                'requested': hit_target,
                'available': len(similarities),
                'threshold': threshold,
                'actual_hits': len(similarities)
            }
            return threshold, stats
        
        # Use Nth highest similarity as threshold
        target_similarity = similarities[hit_target - 1]
        threshold = np.clip(target_similarity, min_threshold, max_threshold)
        
        stats = {
            'method': 'hit_target',
            'requested': hit_target,
            'target_similarity': target_similarity,
            'threshold_used': threshold,
            'clamped': threshold != target_similarity,
            'actual_hits': self._count_above_threshold(similarities, threshold),
            'similarity_range': (max(similarities), min(similarities)) if similarities else (0, 0)
        }
        
        logger.debug(f"Threshold calculated: {threshold:.3f} for target {hit_target} docs")
        
        return threshold, stats
    
    @staticmethod
    def _count_above_threshold(similarities: List[float], threshold: float) -> int:
        """Count how many similarities are above threshold."""
        return sum(1 for sim in similarities if sim >= threshold)
    
    def adaptive_threshold_search(
        self,
        similarities: List[float],
        target_count: int,
        tolerance: int = 2
    ) -> float:
        """
        Binary search for threshold that yields target_count ± tolerance results.
        
        This is a more sophisticated approach for future use.
        
        Args:
            similarities: Sorted similarity scores
            target_count: Desired number of results
            tolerance: Acceptable deviation from target
            
        Returns:
            Optimal threshold
        """
        if not similarities or target_count <= 0:
            return self.default_threshold
        
        sorted_sims = sorted(similarities, reverse=True)
        
        # Simple approach: use the target_count-th value
        if target_count <= len(sorted_sims):
            return sorted_sims[target_count - 1]
        
        # Not enough results - return lowest similarity
        return sorted_sims[-1] if sorted_sims else self.default_threshold
