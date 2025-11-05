"""
Adaptive Optimizer - Iterative parameter optimization for RAG responses.

Uses hill-climbing and Bayesian-inspired exploration to find optimal
temperature, top_k, and similarity threshold settings.
"""

import logging
import time
from typing import Dict, List, Tuple, Optional, Callable
from dataclasses import dataclass, asdict
import copy

logger = logging.getLogger(__name__)


@dataclass
class ParameterSet:
    """Represents a set of RAG parameters to optimize."""
    temperature: float
    top_k: int
    similarity_threshold: float
    hit_target: int
    score: float = 0.0
    
    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return asdict(self)


class AdaptiveOptimizer:
    """Optimizes RAG parameters through iterative LLM evaluation."""
    
    def __init__(self, optimization_config: Dict):
        """
        Initialize optimizer.
        
        Args:
            optimization_config: Optimization configuration
        """
        self.config = optimization_config
        self.max_iterations = optimization_config.get("max_iterations", 5)
        self.early_stop_threshold = optimization_config.get("early_stop_threshold", 0.95)
        self.exploration_rate = optimization_config.get("exploration_rate", 0.3)
        
        # Parameter search spaces
        self.temperature_range = optimization_config.get("temperature_range", [0.3, 0.9])
        self.top_k_range = optimization_config.get("top_k_range", [5, 30])
        self.similarity_threshold_range = optimization_config.get("similarity_threshold_range", [0.3, 0.8])
        self.hit_target_range = optimization_config.get("hit_target_range", [2, 5])
        
        # Optimization history
        self.history: List[ParameterSet] = []
        self.best_params: Optional[ParameterSet] = None
        self.best_score = 0.0
    
    def optimize(
        self,
        question: str,
        initial_params: ParameterSet,
        evaluate_fn: Callable[[str, ParameterSet], Tuple[str, str, float]]
    ) -> Tuple[ParameterSet, List[ParameterSet]]:
        """
        Optimize parameters for a given question.
        
        Args:
            question: User question to optimize for
            initial_params: Starting parameter set
            evaluate_fn: Function that takes (question, params) and returns (response, context, score)
            
        Returns:
            Tuple of (best_params, optimization_history)
        """
        logger.info(f"🔬 Starting adaptive optimization (max {self.max_iterations} iterations)")
        
        self.history = []
        self.best_params = initial_params
        self.best_score = 0.0
        
        current_params = copy.deepcopy(initial_params)
        
        for iteration in range(1, self.max_iterations + 1):
            logger.info(f"📊 Iteration {iteration}/{self.max_iterations}")
            
            # Generate response with current parameters
            response, context, score = evaluate_fn(question, current_params)
            
            # Record this attempt
            current_params.score = score
            self.history.append(copy.deepcopy(current_params))
            
            logger.info(f"   Params: temp={current_params.temperature:.2f}, "
                       f"top_k={current_params.top_k}, "
                       f"sim_thresh={current_params.similarity_threshold:.2f}, "
                       f"hit_target={current_params.hit_target}")
            logger.info(f"   Score: {score:.3f}")
            
            # Update best if improved
            if score > self.best_score:
                self.best_score = score
                self.best_params = copy.deepcopy(current_params)
                logger.info(f"   ✨ New best score: {score:.3f}")
            
            # Early stopping if score is excellent
            if score >= self.early_stop_threshold:
                logger.info(f"🎯 Early stop: Excellent score {score:.3f} >= {self.early_stop_threshold}")
                break
            
            # Don't adjust on last iteration
            if iteration < self.max_iterations:
                # Adjust parameters based on score
                current_params = self._adjust_parameters(current_params, score, iteration)
        
        logger.info(f"✅ Optimization complete. Best score: {self.best_score:.3f}")
        
        return self.best_params, self.history
    
    def _adjust_parameters(self, params: ParameterSet, score: float, iteration: int) -> ParameterSet:
        """
        Adjust parameters based on current performance.
        
        Uses a combination of:
        - Exploitation: Refine around best known parameters
        - Exploration: Try different parameter combinations
        
        Args:
            params: Current parameter set
            score: Current score
            iteration: Current iteration number
            
        Returns:
            New parameter set to try
        """
        import random
        
        new_params = copy.deepcopy(params)
        
        # Decay exploration over time (explore more at start, exploit more at end)
        current_exploration = self.exploration_rate * (1.0 - iteration / self.max_iterations)
        explore = random.random() < current_exploration
        
        if explore:
            # EXPLORATION: Try different parameter space
            logger.info(f"   🔍 Exploring new parameter space")
            new_params.temperature = random.uniform(*self.temperature_range)
            new_params.top_k = random.randint(*self.top_k_range)
            new_params.similarity_threshold = random.uniform(*self.similarity_threshold_range)
            new_params.hit_target = random.randint(*self.hit_target_range)
        else:
            # EXPLOITATION: Refine around best/current parameters
            logger.info(f"   🎯 Refining around current parameters")
            
            # Use best params if significantly better, otherwise current
            base_params = self.best_params if self.best_params and self.best_params.score > score else params
            
            # Small adjustments
            if score < 0.5:
                # Low score: make larger adjustments
                temp_delta = random.uniform(-0.2, 0.2)
                top_k_delta = random.randint(-5, 5)
                thresh_delta = random.uniform(-0.1, 0.1)
                hit_target_delta = random.choice([-1, 0, 1])
            else:
                # High score: make smaller adjustments
                temp_delta = random.uniform(-0.1, 0.1)
                top_k_delta = random.randint(-2, 2)
                thresh_delta = random.uniform(-0.05, 0.05)
                hit_target_delta = random.choice([-1, 0, 1])
            
            new_params.temperature = self._clamp(
                base_params.temperature + temp_delta,
                *self.temperature_range
            )
            new_params.top_k = int(self._clamp(
                base_params.top_k + top_k_delta,
                *self.top_k_range
            ))
            new_params.similarity_threshold = self._clamp(
                base_params.similarity_threshold + thresh_delta,
                *self.similarity_threshold_range
            )
            new_params.hit_target = int(self._clamp(
                base_params.hit_target + hit_target_delta,
                *self.hit_target_range
            ))
        
        return new_params
    
    def _clamp(self, value: float, min_val: float, max_val: float) -> float:
        """Clamp value to range."""
        return max(min_val, min(max_val, value))
    
    def get_optimization_report(self) -> Dict:
        """
        Generate optimization report.
        
        Returns:
            Dictionary with optimization statistics and history
        """
        if not self.history:
            return {"status": "no_optimization_run"}
        
        scores = [p.score for p in self.history]
        
        return {
            "iterations": len(self.history),
            "best_score": self.best_score,
            "best_params": self.best_params.to_dict() if self.best_params else None,
            "initial_score": scores[0],
            "final_score": scores[-1],
            "improvement": scores[-1] - scores[0],
            "average_score": sum(scores) / len(scores),
            "history": [p.to_dict() for p in self.history]
        }
