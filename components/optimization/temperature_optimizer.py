"""
Temperature Optimizer - Tests specific temperature values for optimal LLM performance.

Simplified optimizer that only varies temperature while keeping retrieval parameters fixed.
"""

import logging
from typing import Dict, List, Tuple, Callable
from dataclasses import dataclass, asdict
import copy

logger = logging.getLogger(__name__)


@dataclass
class ParameterSet:
    """Represents a set of RAG parameters."""
    temperature: float
    top_k: int
    similarity_threshold: float
    hit_target: int
    score: float = 0.0
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return asdict(self)


class TemperatureOptimizer:
    """Optimizes LLM temperature through systematic testing of predefined values."""
    
    def __init__(self, optimization_config: Dict):
        """
        Initialize optimizer.
        
        Args:
            optimization_config: Optimization configuration
        """
        self.config = optimization_config
        
        # Fixed temperature values to test
        self.temperature_values = optimization_config.get("temperature_values", [0.25, 0.5, 0.75, 1.0, 1.25])
        
        # Optimization tracking
        self.history: List[ParameterSet] = []
        self.best_params: ParameterSet | None = None
        self.best_score = 0.0
    
    def optimize(
        self,
        question: str,
        initial_params: ParameterSet,
        evaluate_fn: Callable[[str, ParameterSet], Tuple[str, str, float]]
    ) -> Tuple[ParameterSet, List[ParameterSet]]:
        """
        Test all temperature values to find optimal setting.
        
        Args:
            question: User question to optimize for
            initial_params: Starting parameter set (only temp will be varied)
            evaluate_fn: Function that takes (question, params) and returns (response, context, score)
            
        Returns:
            Tuple of (best_params, optimization_history)
        """
        logger.info(f"🌡️  Testing {len(self.temperature_values)} temperature values: {self.temperature_values}")
        
        self.history = []
        self.best_params = None
        self.best_score = 0.0
        
        # Test each temperature value
        for idx, temp in enumerate(self.temperature_values, 1):
            logger.info(f"📊 Test {idx}/{len(self.temperature_values)}: Temperature = {temp}")
            
            # Create parameter set with fixed retrieval params, varying temperature
            test_params = copy.deepcopy(initial_params)
            test_params.temperature = temp
            
            # Evaluate with this temperature
            response, context, score = evaluate_fn(question, test_params)
            
            # Record this attempt
            test_params.score = score
            self.history.append(copy.deepcopy(test_params))
            
            logger.info(f"   Temperature: {temp:.2f}")
            logger.info(f"   Score: {score:.3f}")
            
            # Update best if improved
            if score > self.best_score:
                self.best_score = score
                self.best_params = copy.deepcopy(test_params)
                logger.info(f"   ✨ New best score!")
        
        # Return best parameters and history
        if self.best_params is None:
            logger.warning("⚠️  No valid results, returning initial params")
            self.best_params = initial_params
            self.best_params.score = 0.0
        
        logger.info(f"🏆 Best temperature: {self.best_params.temperature:.2f} (score: {self.best_score:.3f})")
        
        return self.best_params, self.history
